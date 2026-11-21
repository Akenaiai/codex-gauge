// Read-only Windows host observer. The profile-name discovery approach is
// informed by returnk/codex-usage-badge (MIT); see THIRD_PARTY_NOTICES.md.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

class GaugeHost {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct Message {
    public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam;
    public uint Time; public Point Position; public uint Private;
  }
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  delegate IntPtr MouseProc(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, MouseProc callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern int GetMessage(out Message message, IntPtr hwnd, uint min, uint max);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  static IntPtr panelWindow, badgeWindow;
  static int dismissRequested;
  static readonly MouseProc mouseProc = ObserveMouse;
  static int parent;
  static IntPtr host = IntPtr.Zero;
  static AutomationElement avatar;
  static RECT previous;
  static DateTime nextScan = DateTime.MinValue;
  static bool IsCodex(uint pid) {
    try {
      using (Process p = Process.GetProcessById((int)pid)) {
        string name = p.ProcessName;
        if (name.Equals("Codex", StringComparison.OrdinalIgnoreCase)) return true;
        if (!name.Equals("ChatGPT", StringComparison.OrdinalIgnoreCase)) return false;
        string path = p.MainModule.FileName;
        return path.IndexOf("OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) >= 0 ||
          path.IndexOf("\\OpenAI\\Codex\\", StringComparison.OrdinalIgnoreCase) >= 0;
      }
    } catch { return false; }
  }
  static IntPtr FindHost() {
    IntPtr foreground = GetForegroundWindow(), found = IntPtr.Zero, current = IntPtr.Zero;
    EnumWindows(delegate(IntPtr window, IntPtr data) {
      if (!IsWindowVisible(window)) return true;
      RECT rect; GetWindowRect(window, out rect);
      if (!IsIconic(window) && (rect.Right - rect.Left < 280 || rect.Bottom - rect.Top < 200)) return true;
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (!IsCodex(pid)) return true;
      if (found == IntPtr.Zero) found = window;
      if (window == host) current = window;
      if (window == foreground) { found = window; current = IntPtr.Zero; return false; }
      return true;
    }, IntPtr.Zero);
    return current != IntPtr.Zero ? current : found;
  }
  static void FindAvatar() {
    avatar = null;
    try {
      AutomationElement root = AutomationElement.FromHandle(host);
      string[] names = { "打开个人资料菜单", "Open profile menu", "Open personal profile menu" };
      foreach (string name in names) {
        Condition condition = new AndCondition(new PropertyCondition(AutomationElement.NameProperty, name),
          new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
        AutomationElementCollection all = root.FindAll(TreeScope.Descendants, condition);
        foreach (AutomationElement element in all) {
          var r = element.Current.BoundingRectangle;
          if (!element.Current.IsOffscreen && r.Width > 0 && r.Left < previous.Left + (previous.Right - previous.Left) / 2 &&
              r.Top > previous.Top + (previous.Bottom - previous.Top) / 2) { avatar = element; return; }
        }
      }
    } catch { avatar = null; }
  }
  static bool Contains(IntPtr window, Point p) {
    RECT bounds;
    return IsWindowVisible(window) && GetWindowRect(window, out bounds) &&
      p.X >= bounds.Left && p.X < bounds.Right && p.Y >= bounds.Top && p.Y < bounds.Bottom;
  }
  static IntPtr ObserveMouse(int code, IntPtr message, IntPtr data) {
    int id = message.ToInt32();
    // Only button-down events matter. No positions, buttons or input history leave this process.
    if (code >= 0 && (id == 0x201 || id == 0x204 || id == 0x207 || id == 0x20B) && IsWindowVisible(panelWindow)) {
      var point = (Point)Marshal.PtrToStructure(data, typeof(Point));
      if (!Contains(panelWindow, point) && !Contains(badgeWindow, point)) Interlocked.Exchange(ref dismissRequested, 1);
    }
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  static void WatchOutsideClicks() {
    if (SetWindowsHookEx(14, mouseProc, GetModuleHandle(null), 0) == IntPtr.Zero) return;
    Message message;
    while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { }
  }
  [STAThread] static void Main(string[] args) {
    if (args.Length == 0 || !Int32.TryParse(args[0], out parent)) return;
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
    long panelHandle, badgeHandle;
    if (args.Length == 3 && Int64.TryParse(args[1], out panelHandle) && Int64.TryParse(args[2], out badgeHandle)) {
      panelWindow = new IntPtr(panelHandle); badgeWindow = new IntPtr(badgeHandle);
      new Thread(WatchOutsideClicks) { IsBackground = true }.Start();
    }
    while (true) {
      try { if (Process.GetProcessById(parent).HasExited) return; } catch { return; }
      if (Interlocked.Exchange(ref dismissRequested, 0) != 0) Console.WriteLine("{\"dismissPanel\":true}");
      try { Observe(); } catch { Console.WriteLine("{\"exists\":false,\"error\":true}"); }
      Console.Out.Flush(); Thread.Sleep(250);
    }
  }
  static void Observe() {
    IntPtr next = FindHost();
    if (next != host) { host = next; avatar = null; nextScan = DateTime.MinValue; }
    if (host == IntPtr.Zero) { Console.WriteLine("{\"exists\":false}"); return; }
    uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
    bool foreground = GetForegroundWindow() == host || foregroundPid == parent;
    bool minimized = IsIconic(host);
    RECT rect; GetWindowRect(host, out rect);
    bool resized = rect.Right - rect.Left != previous.Right - previous.Left || rect.Bottom - rect.Top != previous.Bottom - previous.Top;
    previous = rect;
    if (!minimized && (DateTime.UtcNow >= nextScan || resized)) { FindAvatar(); nextScan = DateTime.UtcNow.AddSeconds(3); }
    int x = 0, y = 0; bool anchored = false;
    if (!minimized && avatar != null) {
      try {
        var r = avatar.Current.BoundingRectangle;
        if (!avatar.Current.IsOffscreen && r.Width > 0) {
          x = (int)Math.Round(r.Left + r.Width / 2); y = (int)Math.Round(r.Top); anchored = true;
          // Stay above an optional update button in the same navigation rail.
          var column = TreeWalker.RawViewWalker.GetParent(avatar);
          for (int i = 0; i < 5 && column != null; i++, column = TreeWalker.RawViewWalker.GetParent(column)) {
            var c = column.Current.BoundingRectangle;
            if (c.Width < r.Width || c.Width > 130 || c.Height < 150) continue;
            foreach (string label in new string[] { "有可用更新", "Update available", "Updates available" }) {
              var update = column.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.NameProperty, label));
              if (update != null && !update.Current.IsOffscreen && update.Current.BoundingRectangle.Top < y)
                y = (int)update.Current.BoundingRectangle.Top;
            }
            break;
          }
        }
      } catch { avatar = null; }
    }
    Console.WriteLine("{\"exists\":true,\"foreground\":" + (foreground ? "true" : "false") +
      ",\"minimized\":" + (minimized ? "true" : "false") + ",\"anchored\":" + (anchored ? "true" : "false") +
      ",\"x\":" + x + ",\"y\":" + y + ",\"left\":" + rect.Left + ",\"top\":" + rect.Top +
      ",\"width\":" + (rect.Right - rect.Left) + ",\"height\":" + (rect.Bottom - rect.Top) + "}");
  }
}


