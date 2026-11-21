using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

internal static class DevinUsage
{
    private const string ReadyPrompt = "Ask Devin to build features, fix bugs, or work on your code";
    private static readonly Regex FirstColumn = new Regex(@"\x1b\[[0-9]+;1H");
    private static readonly Regex TerminalCodes = new Regex(@"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))");
    private static readonly Regex UsageBlock = new Regex(
        @"(?m)^ *Usage *\r?\n(?<quota>(?: *(?:Daily|Weekly|Extra usage balance) +[^\r\n]+\r?\n)+)");
    private static readonly Regex SessionSection = new Regex(@"(?m)^ *(?:No usage yet in this session\.|(?:Current )?Session(?: usage)?\b|● )", RegexOptions.IgnoreCase);

    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Length != 1 || !Path.IsPathRooted(args[0]) || !File.Exists(args[0])) return 1;
        string directory = null;
        try
        {
            directory = Path.Combine(Path.GetTempPath(), "gauge-devin-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            var configHome = Path.Combine(directory, "devin");
            Directory.CreateDirectory(configHome);
            var config = Path.Combine(configHome, "config.json");
            File.WriteAllText(config, "{\"read_config_from\":{\"agents_standard\":false,\"cursor\":false,\"windsurf\":false," +
                "\"claude\":false,\"copilot\":false,\"codex\":false,\"kiro\":false,\"opencode\":false,\"zed\":false,\"cloud\":false}}");
            Environment.SetEnvironmentVariable("DEVIN_CONFIG_HOME", directory);
            Environment.SetEnvironmentVariable("DEVIN_API_KEY", null);
            var command = new StringBuilder("\"" + args[0] + "\" --config \"" + config + "\" --respect-workspace-trust false");
            using (var terminal = new Terminal(args[0], command, directory))
            {
                var welcome = terminal.WaitFor(text => text.Contains(ReadyPrompt) || SignedOut(text), 8000);
                if (SignedOut(welcome)) { Console.WriteLine("login_required"); return 0; }
                if (welcome == null) return 1;
                terminal.ClearOutput();
                terminal.Write("/usage");
                if (terminal.WaitFor(text => text.Contains("/usage"), 1500) == null) return 1;
                terminal.ClearOutput();
                terminal.Write("\r");
                var result = terminal.WaitFor(text =>
                {
                    var block = UsageBlock.Match(text);
                    return block.Success && SessionSection.IsMatch(text, block.Index + block.Length);
                }, 8500);
                if (result == null) return 1;
                Console.Write(UsageBlock.Match(result).Groups["quota"].Value);
            }
            return 0;
        }
        catch { return 1; }
        finally
        {
            if (directory != null)
            {
                try
                {
                    Directory.Delete(directory, true);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
    }

    private static bool SignedOut(string text)
    {
        return text != null && (text.IndexOf("How would you like to log in?", StringComparison.OrdinalIgnoreCase) >= 0 ||
            text.IndexOf("Not logged in", StringComparison.OrdinalIgnoreCase) >= 0);
    }

    private sealed class Terminal : IDisposable
    {
        private readonly StringBuilder output = new StringBuilder();
        private FileStream input;
        private IntPtr console, process;
        private volatile bool finished;

        public Terminal(string application, StringBuilder command, string directory)
        {
            SafeFileHandle fromHost = null, toApp = null, fromApp = null, toHost = null;
            IntPtr attributes = IntPtr.Zero;
            bool initialized = false;
            try
            {
                Require(CreatePipe(out toApp, out fromHost, IntPtr.Zero, 0));
                Require(CreatePipe(out toHost, out fromApp, IntPtr.Zero, 0));
                Require(CreatePseudoConsole(new Coord { columns = 140, rows = 34 }, toApp, fromApp, 0, out console) == 0);
                toApp.Dispose();
                fromApp.Dispose();
                var reader = new StreamReader(new FileStream(toHost, FileAccess.Read), Encoding.UTF8);
                toHost = null;
                new Thread(() => ReadOutput(reader)) { IsBackground = true }.Start();
                input = new FileStream(fromHost, FileAccess.Write);
                fromHost = null;

                IntPtr size = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
                attributes = Marshal.AllocHGlobal(size);
                Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref size));
                initialized = true;
                Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x00020016), console, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
                var startup = new StartupEx { cb = Marshal.SizeOf(typeof(StartupEx)), attributes = attributes };
                ProcessInfo info;
                // The CLI must get the pseudoconsole's streams, not the helper's pipe to Gauge.
                var handles = new[] { GetStdHandle(-10), GetStdHandle(-11), GetStdHandle(-12) };
                try
                {
                    for (int i = 0; i < handles.Length; i++) Require(SetStdHandle(-10 - i, IntPtr.Zero));
                    Require(CreateProcess(application, command, IntPtr.Zero, IntPtr.Zero, false, 0x00080000,
                        IntPtr.Zero, directory, ref startup, out info));
                }
                finally
                {
                    for (int i = 0; i < handles.Length; i++) SetStdHandle(-10 - i, handles[i]);
                }
                process = info.process;
                CloseHandle(info.thread);
            }
            catch { Dispose(); throw; }
            finally
            {
                if (initialized) DeleteProcThreadAttributeList(attributes);
                if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                foreach (var pipe in new[] { fromHost, toApp, fromApp, toHost }) if (pipe != null) pipe.Dispose();
            }
        }

        private void ReadOutput(StreamReader reader)
        {
            using (reader)
            {
                try
                {
                    var buffer = new char[4096];
                    int count;
                    while ((count = reader.Read(buffer, 0, buffer.Length)) != 0)
                    {
                        lock (output)
                        {
                            output.Append(buffer, 0, count);
                            if (output.Length > 65536) output.Remove(0, output.Length - 65536);
                        }
                    }
                }
                catch (IOException) { }
                finally { finished = true; }
            }
        }

        public string WaitFor(Func<string, bool> match, int timeout)
        {
            var timer = Stopwatch.StartNew();
            do
            {
                string frame;
                lock (output) frame = output.ToString();
                frame = TerminalCodes.Replace(FirstColumn.Replace(frame, "\n"), "");
                if (match(frame)) return frame;
                if (finished) break;
                Thread.Sleep(40);
            } while (timer.ElapsedMilliseconds < timeout);
            return null;
        }

        public void ClearOutput() { lock (output) output.Clear(); }

        public void Write(string text)
        {
            var bytes = Encoding.ASCII.GetBytes(text);
            input.Write(bytes, 0, bytes.Length);
            input.Flush();
        }

        public void Dispose()
        {
            if (input != null) input.Dispose();
            if (console != IntPtr.Zero) ClosePseudoConsole(console);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }

    private static void Require(bool ok) { if (!ok) throw new System.ComponentModel.Win32Exception(); }
    [StructLayout(LayoutKind.Sequential)] private struct Coord { public short columns, rows; }
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] private struct StartupEx
    {
        public int cb;
        public IntPtr reserved, desktop, title;
        public uint x, y, width, height, columns, rows, attributesUnused, flags;
        public ushort show, reservedBytes;
        public IntPtr reservedData, stdin, stdout, stderr, attributes;
    }

    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CreatePipe(out SafeFileHandle read, out SafeFileHandle write, IntPtr security, uint size);
    [DllImport("kernel32.dll")] private static extern int CreatePseudoConsole(Coord size, SafeFileHandle input, SafeFileHandle output, uint flags, out IntPtr console);
    [DllImport("kernel32.dll")] private static extern void ClosePseudoConsole(IntPtr console);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcess(string app, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string directory, ref StartupEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] private static extern IntPtr GetStdHandle(int handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetStdHandle(int handle, IntPtr value);
}
