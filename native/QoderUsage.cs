using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Automation;

class QoderUsage {
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

  static bool IsQoder(IntPtr window) {
    uint pid;
    GetWindowThreadProcessId(window, out pid);
    try {
      using (var process = Process.GetProcessById((int)pid))
        return process.ProcessName.Equals("Qoder", StringComparison.OrdinalIgnoreCase);
    } catch { return false; }
  }

  static List<string> ReadWindow(IntPtr window) {
    var root = AutomationElement.FromHandle(window);
    var type = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window);
    var name = new OrCondition(
      new PropertyCondition(AutomationElement.NameProperty, "我的用量"),
      new PropertyCondition(AutomationElement.NameProperty, "My usage", PropertyConditionFlags.IgnoreCase));
    var dialog = root.FindFirst(TreeScope.Descendants, new AndCondition(type, name));
    if (dialog == null || dialog.Current.IsOffscreen) return null;

    var labels = new List<string>();
    foreach (AutomationElement item in dialog.FindAll(TreeScope.Descendants,
      new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text))) {
      var text = item.Current.Name;
      if (!String.IsNullOrWhiteSpace(text) && text.Length <= 120) labels.Add(text);
      if (labels.Count >= 96) break;
    }
    return labels;
  }

  [STAThread] static void Main() {
    Console.OutputEncoding = new UTF8Encoding(false);
    var windows = new List<IntPtr>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
      if (IsWindowVisible(hwnd) && IsQoder(hwnd)) windows.Add(hwnd);
      return true;
    }, IntPtr.Zero);

    List<string> reading = null;
    bool failed = false;
    foreach (var window in windows) {
      if (IsIconic(window)) continue;
      try {
        var current = ReadWindow(window);
        if (current == null) continue;
        if (reading != null) { Console.WriteLine("{\"status\":\"multiple\"}"); return; }
        reading = current;
      } catch { failed = true; }
    }
    if (reading != null && !failed) {
      Console.WriteLine(new JavaScriptSerializer().Serialize(new { status = "ready", labels = reading }));
      return;
    }
    var status = failed ? "unavailable" : windows.Count == 0 ? "closed" : "usage_hidden";
    Console.WriteLine("{\"status\":\"" + status + "\"}");
  }
}
