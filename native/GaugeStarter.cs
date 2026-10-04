// Per-user Windows companion launcher. No credentials, shell scripts or model calls.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

class GaugeStarter {
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint length, uint flags);
  static readonly string Sid = WindowsIdentity.GetCurrent().User.Value;
  static readonly string TaskName = "Codex Gauge Follow - " + Sid;
  static readonly string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Codex Gauge");
  static readonly string PauseFile = Path.Combine(Data, "follow-pause.txt");
  static readonly int Session = Process.GetCurrentProcess().SessionId;
  static readonly string Self = Assembly.GetExecutingAssembly().Location;
  static string settingsError = "";

  static dynamic Folder() {
    dynamic service = Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service"));
    service.Connect(); return service.GetFolder("\\");
  }
  static dynamic Existing(dynamic folder) {
    try { return folder.GetTask(TaskName); }
    catch (FileNotFoundException) { return null; }
    catch (COMException e) { if ((uint)e.ErrorCode == 0x80070002 || (uint)e.ErrorCode == 0x8004130F) return null; throw; }
  }
  static string Quote(string value) { return "\"" + value + "\""; }
  static string SettingsSource() {
    // A child launched from the MSIX Codex app can see redirected AppData.
    // Resolve the file actually opened, so a normal Windows task can migrate it.
    string file = Path.Combine(Data, "settings.json");
    if (!File.Exists(file)) return file;
    using (var stream = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
      var buffer = new StringBuilder(32768);
      uint length = GetFinalPathNameByHandle(stream.SafeFileHandle, buffer, (uint)buffer.Capacity, 0);
      if (length == 0 || length >= buffer.Capacity) throw new IOException("Cannot resolve settings source");
      string resolved = buffer.ToString();
      return resolved.StartsWith("\\\\?\\") ? resolved.Substring(4) : resolved;
    }
  }
  static void Enable(string executable) {
    executable = Path.GetFullPath(executable);
    if (!File.Exists(executable) || Path.GetFileName(executable) != "Codex Gauge.exe") throw new ArgumentException("Invalid gauge executable");
    dynamic folder = Folder(); dynamic current = Existing(folder);
    string arguments = "--watch " + Quote(executable) + " --settings-source " + Quote(SettingsSource());
    if (current == null || current.Definition.Actions.Item(1).Path != Self || current.Definition.Actions.Item(1).Arguments != arguments) {
      if (current != null && current.State == 4) {
        current.Stop(0);
        for (int i = 0; i < 30 && current.State == 4; i++) Thread.Sleep(100);
      }
      dynamic service = Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service")); service.Connect();
      dynamic definition = service.NewTask(0);
      definition.RegistrationInfo.Description = "Launch Codex Gauge when the current user's Codex desktop is open. No model requests.";
      definition.Principal.UserId = Sid; definition.Principal.LogonType = 3; definition.Principal.RunLevel = 0;
      definition.Settings.Enabled = true; definition.Settings.Hidden = false;
      definition.Settings.DisallowStartIfOnBatteries = false; definition.Settings.StopIfGoingOnBatteries = false;
      definition.Settings.ExecutionTimeLimit = "PT0S"; definition.Settings.MultipleInstances = 2;
      definition.Settings.StartWhenAvailable = true;
      definition.Settings.RestartInterval = "PT1M"; definition.Settings.RestartCount = 3;
      dynamic login = definition.Triggers.Create(9); login.UserId = Sid;
      dynamic recovery = definition.Triggers.Create(1);
      recovery.StartBoundary = DateTime.Now.AddSeconds(10).ToString("yyyy-MM-dd'T'HH:mm:ss");
      recovery.Repetition.Interval = "PT1M";
      dynamic action = definition.Actions.Create(0); action.Path = Self; action.Arguments = arguments;
      action.WorkingDirectory = Path.GetDirectoryName(executable);
      current = folder.RegisterTaskDefinition(TaskName, definition, 6, Sid, null, 3, null);
    }
    current.Enabled = true;
    if (current.State != 4) current.Run(null);
  }
  static void Disable(bool remove) {
    dynamic folder = Folder(); dynamic task = Existing(folder);
    if (task == null) return;
    task.Enabled = false; task.Stop(0);
    foreach (var process in Process.GetProcessesByName("GaugeStarter")) {
      using (process) {
        try {
          if (process.Id != Process.GetCurrentProcess().Id && process.SessionId == Session && String.Equals(process.MainModule.FileName, Self, StringComparison.OrdinalIgnoreCase))
            if (!process.WaitForExit(5000)) throw new IOException("Launcher is still stopping");
        } catch (InvalidOperationException) { }
      }
    }
    if (remove) folder.DeleteTask(TaskName, 0);
  }
  static HashSet<string> Hosts() {
    var ids = new HashSet<uint>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
      if (IsWindowVisible(hwnd)) { uint id; GetWindowThreadProcessId(hwnd, out id); ids.Add(id); }
      return true;
    }, IntPtr.Zero);
    var result = new HashSet<string>();
    foreach (uint id in ids) {
      try { using (var p = Process.GetProcessById((int)id)) {
        if (p.SessionId != Session || (!p.ProcessName.Equals("ChatGPT", StringComparison.OrdinalIgnoreCase) && !p.ProcessName.Equals("Codex", StringComparison.OrdinalIgnoreCase))) continue;
        string path = p.MainModule.FileName;
        if (path.IndexOf("\\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) < 0 && path.IndexOf("\\OpenAI\\Codex\\", StringComparison.OrdinalIgnoreCase) < 0) continue;
        result.Add(id + ":" + p.StartTime.ToUniversalTime().Ticks);
      } } catch { }
    }
    return result;
  }
  static bool Enabled() {
    try {
      var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(Data, "settings.json")));
      var settings = (Dictionary<string, object>)data["settings"];
      settingsError = "";
      return settings.ContainsKey("autostart") && settings["autostart"] is bool && (bool)settings["autostart"];
    } catch (Exception e) { settingsError = e.GetType().Name; return false; }
  }
  static bool Running(string executable) {
    foreach (var p in Process.GetProcessesByName("Codex Gauge")) {
      using (p) { try { if (p.SessionId == Session && String.Equals(p.MainModule.FileName, executable, StringComparison.OrdinalIgnoreCase)) return true; } catch { } }
    }
    return false;
  }
  static void Watch(string executable, string source) {
    bool created;
    using (var mutex = new Mutex(true, "Local\\CodexGaugeFollow-" + Sid, out created)) {
      if (!created) return;
      string destination = Path.Combine(Data, "settings.json");
      if (!File.Exists(destination) && File.Exists(source) && Path.GetFileName(source) == "settings.json" && Path.GetFileName(Path.GetDirectoryName(source)) == "Codex Gauge") {
        // Import only when there is no normal-profile file. Never overwrite it.
        var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(source));
        if (!(data["settings"] is Dictionary<string, object>)) throw new InvalidDataException("Invalid settings source");
        Directory.CreateDirectory(Data); File.Copy(source, destination, false);
      }
      DateTime retryAt = DateTime.MinValue;
      string lastStatus = "", launchResult = "idle";
      while (File.Exists(executable)) {
        bool enabled = Enabled();
        int hostCount = 0; bool running = false, pausedHost = false;
        if (enabled) {
          var hosts = Hosts();
          hostCount = hosts.Count; running = Running(executable);
          var paused = new HashSet<string>();
          try { if (File.Exists(PauseFile)) paused.UnionWith(File.ReadAllLines(PauseFile)); } catch { }
          pausedHost = hosts.Count > 0 && hosts.All(h => paused.Contains(h));
          if (hosts.Any(h => !paused.Contains(h)) && !running && DateTime.UtcNow >= retryAt) {
            retryAt = DateTime.UtcNow.AddSeconds(30);
            try { using (var child = Process.Start(new ProcessStartInfo(executable, "--follow-codex") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(executable) })) {
              launchResult = child.WaitForExit(750) ? "exit_" + child.ExitCode : "started";
            } } catch (Exception e) { launchResult = e.GetType().Name; }
          }
        }
        string status = new JavaScriptSerializer().Serialize(new { enabled = enabled, settingsError = settingsError, hostCount = hostCount, gaugeRunning = running, paused = pausedHost, launchResult = launchResult });
        if (status != lastStatus) {
          try { Directory.CreateDirectory(Data); File.WriteAllText(Path.Combine(Data, "follow-status.json"), status); lastStatus = status; } catch { }
        }
        Thread.Sleep(2000);
      }
    }
  }
  static int Main(string[] args) {
    try {
      if (args.Length == 2 && args[0] == "--enable") Enable(args[1]);
      else if (args.Length == 4 && args[0] == "--watch" && args[2] == "--settings-source") Watch(Path.GetFullPath(args[1]), Path.GetFullPath(args[3]));
      else if (args.Length == 1 && args[0] == "--disable") Disable(true);
      else if (args.Length == 1 && args[0] == "--stop") Disable(false);
      else if (args.Length == 1 && args[0] == "--pause") { Directory.CreateDirectory(Data); File.WriteAllLines(PauseFile, Hosts()); }
      else if (args.Length == 1 && args[0] == "--resume") { if (File.Exists(PauseFile)) File.WriteAllText(PauseFile, ""); }
      else if (args.Length == 1 && args[0] == "--probe") Console.WriteLine("{\"hostCount\":" + Hosts().Count + ",\"enabled\":" + (Enabled() ? "true" : "false") + "}");
      else return 2;
      return 0;
    } catch (Exception e) { Console.Error.WriteLine("Gauge startup operation failed: " + e.GetType().Name); return 1; }
  }
}
