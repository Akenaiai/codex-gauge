using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Automation;

class CursorUsage {
  delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

  static bool IsCursor(IntPtr window) {
    uint pid; GetWindowThreadProcessId(window, out pid);
    try {
      using (var process = Process.GetProcessById((int)pid))
        return process.ProcessName.Equals("Cursor", StringComparison.OrdinalIgnoreCase);
    } catch { return false; }
  }

  static double? ReadRange(AutomationElement root, string name) {
    var bars = root.FindAll(TreeScope.Descendants, new AndCondition(
      new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ProgressBar),
      new PropertyCondition(AutomationElement.NameProperty, name)));
    object pattern;
    if (bars.Count != 1 || !bars[0].TryGetCurrentPattern(RangeValuePattern.Pattern, out pattern)) return null;
    var range = ((RangeValuePattern)pattern).Current;
    return range.Minimum == 0 && range.Maximum == 100 && range.Value >= 0 && range.Value <= 100 ? (double?)range.Value : null;
  }

  static string ReadResetDate(AutomationElement root) {
    const string prefix = "Usage limits reset on ";
    var texts = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
    foreach (AutomationElement item in texts) {
      var name = item.Current.Name;
      if (name == null || !name.StartsWith(prefix, StringComparison.Ordinal)) continue;
      var date = Regex.Match(name.Substring(prefix.Length), @"^(\d{1,2}月\d{1,2}日|[A-Za-z]{3,9} \d{1,2}(?:, \d{4})?|\d{1,2} [A-Za-z]{3,9}(?: \d{4})?)(?: \([^)]*\))?$");
      if (date.Success) return date.Groups[1].Value;
    }
    return "";
  }

  static string ReadWindow(IntPtr window) {
    try {
      var root = AutomationElement.FromHandle(window);
      var heading = root.FindFirst(TreeScope.Descendants, new AndCondition(
        new PropertyCondition(AutomationElement.NameProperty, "Plan & Usage"),
        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text)));
      if (heading == null || heading.Current.IsOffscreen) return null;
      var cursor = ReadRange(root, "Cursor Models");
      var other = ReadRange(root, "Other Models");
      if (!cursor.HasValue && !other.HasValue) return null;
      string resetDate = ReadResetDate(root);
      return "{\"status\":\"ready\",\"cursorUsed\":" + Format(cursor) +
        ",\"otherUsed\":" + Format(other) + ",\"resetDate\":\"" + resetDate + "\"}";
    } catch { return null; }
  }

  static string Format(double? value) {
    return value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : "null";
  }

  [STAThread] static void Main() {
    Console.OutputEncoding = new UTF8Encoding(false);
    var windows = new List<IntPtr>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
      if (IsWindowVisible(hwnd) && IsCursor(hwnd)) windows.Add(hwnd);
      return true;
    }, IntPtr.Zero);
    string reading = null;
    foreach (var window in windows) {
      if (IsIconic(window)) continue;
      var current = ReadWindow(window);
      if (current == null) continue;
      if (reading != null) { Console.WriteLine("{\"status\":\"multiple\"}"); return; }
      reading = current;
    }
    Console.WriteLine(reading ?? (windows.Count == 0 ? "{\"status\":\"closed\"}" : "{\"status\":\"usage_hidden\"}"));
  }
}
