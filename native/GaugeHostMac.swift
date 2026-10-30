import AppKit
import ApplicationServices
import Darwin

// Read-only geometry adapter. Never reads AXValue, chat text or credentials.
let profileLabels: Set<String> = ["Open profile menu", "Open personal profile menu", "打开个人资料菜单", "開啟個人檔案選單", "Open settings", "打开设置", "開啟設定"]
func isUpdateLabel(_ label: String) -> Bool {
    let exact: Set<String> = ["Update available", "Updates available", "有可用更新", "有可用更新項目", "Update", "更新", "Restart to update", "重新启动以更新", "重新啟動以更新", "Downloading", "正在下载", "正在下載", "下載中", "Installing", "正在安装", "正在安裝"]
    return exact.contains(label) || ["Downloading ", "正在下载 ", "正在下載 "].contains { label.hasPrefix($0) && label.hasSuffix("%") }
}
// Only a nearby control in the same horizontal profile lane may displace it.
func updateAnchorTop(profile: CGRect, updates: [CGRect], window: CGRect) -> CGFloat {
    updates.filter {
        window.contains($0) && $0.width >= 12 && $0.height >= 12 && $0.height <= 120 &&
        $0.minY < profile.minY && $0.maxY <= profile.minY + 2 && profile.minY - $0.minY <= 200 &&
        $0.maxX > profile.minX && $0.minX < profile.maxX
    }.map(\.minY).min() ?? profile.minY
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}
func rect(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size),
          point.x.isFinite, point.y.isFinite, size.width > 0, size.height > 0 else { return nil }
    return CGRect(origin: point, size: size)
}
func children(_ element: AXUIElement) -> [AXUIElement] { attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] }
func visibleUpdateRect(_ element: AXUIElement) -> CGRect? {
    if attribute(element, "AXHidden") as? Bool == true { return nil }
    guard elementAttribute(element, kAXParentAttribute) != nil else { return nil }
    let labels = [kAXDescriptionAttribute, kAXTitleAttribute, kAXHelpAttribute].compactMap { attribute(element, $0) as? String }
    return labels.contains(where: isUpdateLabel) ? rect(element) : nil
}
func findUpdateControl(profile: AXUIElement, profileRect: CGRect, window: CGRect) -> AXUIElement? {
    var ancestor = elementAttribute(profile, kAXParentAttribute), column: AXUIElement?
    // Match the navigation ancestor, not a global "Update" elsewhere in a chat.
    for _ in 0..<8 {
        guard let item = ancestor else { break }
        if attribute(item, kAXRoleAttribute) as? String == kAXWindowRole { break }
        if let r = rect(item), window.contains(r), r.contains(profileRect),
           r.width <= min(400, window.width / 2), r.height >= profileRect.height + 16 { column = item }
        ancestor = elementAttribute(item, kAXParentAttribute)
    }
    guard let column else { return nil }
    var queue = [column], visited = 0, found: AXUIElement?, top = profileRect.minY
    let deadline = Date().addingTimeInterval(0.06)
    while !queue.isEmpty && visited < 400 && Date() < deadline {
        // Footer controls are at the end; visit them first and skip text bodies.
        let item = queue.removeLast(); visited += 1
        let role = attribute(item, kAXRoleAttribute) as? String ?? ""
        if [kAXTextAreaRole, kAXTextFieldRole, kAXStaticTextRole].contains(role) { continue }
        if [kAXButtonRole, kAXMenuButtonRole, kAXProgressIndicatorRole, kAXGroupRole].contains(role),
           let r = visibleUpdateRect(item) {
            let candidate = updateAnchorTop(profile: profileRect, updates: [r], window: window)
            if candidate < top { top = candidate; found = item }
        }
        queue.append(contentsOf: children(item))
    }
    return found
}
func validProfile(_ r: CGRect, _ window: CGRect) -> Bool {
    window.contains(r) && r.width >= 12 && r.width <= min(400, window.width / 2) &&
        r.height >= 12 && r.height <= 100 && r.midX < window.minX + window.width / 2 && r.midY > window.midY
}
func anchorRect(_ button: AXUIElement) -> CGRect? {
    guard let bounds = rect(button) else { return nil }
    // A wide footer button can expose the actual avatar as an image child.
    var queue = children(button), count = 0
    while !queue.isEmpty && count < 40 {
        let item = queue.removeFirst(); count += 1
        if attribute(item, kAXRoleAttribute) as? String == kAXImageRole,
           let image = rect(item), bounds.contains(image), (16...56).contains(image.width),
           abs(image.width - image.height) < 4 { return image }
        queue.append(contentsOf: children(item))
    }
    return bounds
}
func findProfile(_ window: AXUIElement, _ bounds: CGRect, queue: inout [AXUIElement], visited: inout Int) -> AXUIElement? {
    if queue.isEmpty && visited == 0 { queue = [window] }
    let deadline = Date().addingTimeInterval(0.06)
    while !queue.isEmpty && visited < 8000 && Date() < deadline {
        let item = queue.removeLast(); visited += 1
        let role = attribute(item, kAXRoleAttribute) as? String ?? ""
        if [kAXTextAreaRole, kAXTextFieldRole, kAXStaticTextRole].contains(role) { continue }
        if role == kAXButtonRole || role == kAXMenuButtonRole || role == kAXPopUpButtonRole {
            let labels = [kAXDescriptionAttribute, kAXTitleAttribute, kAXHelpAttribute].compactMap { attribute(item, $0) as? String }
            if labels.contains(where: profileLabels.contains), let r = rect(item), validProfile(r, bounds) { return item }
        }
        queue.append(contentsOf: children(item).reversed())
    }
    if visited >= 8000 { queue.removeAll() }
    return nil
}

final class HostObserver {
    let parent: pid_t
    let bundleID: String
    var cachedProfile: AXUIElement?
    var cachedWindow: AXUIElement?
    var cachedUpdate: AXUIElement?
    var nextUpdateScan = Date.distantPast
    var lastBounds: CGRect?
    var nextScan = Date.distantPast
    var pid: pid_t = 0
    var preparedPID: pid_t = 0
    var prepareRetry = Date.distantPast
    var scanQueue: [AXUIElement] = []
    var scanVisited = 0
    var axObserver: AXObserver?
    var output = ""
    init(parent: pid_t, bundleID: String) { self.parent = parent; self.bundleID = bundleID }
    func emit(_ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let line = String(data: data, encoding: .utf8) else { return }
        // Heartbeat is needed for the Electron stale-geometry watchdog.
        output = line
        #if !GAUGE_NODE_LIBRARY
        print(line); fflush(stdout)
        #endif
    }
    func subscribe(_ app: AXUIElement, _ window: AXUIElement) {
        if let old = axObserver { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(old), .commonModes) }
        var observer: AXObserver?
        let callback: AXObserverCallback = { _, _, _, context in
            guard let context else { return }
            let owner = Unmanaged<HostObserver>.fromOpaque(context).takeUnretainedValue()
            owner.tick()
        }
        guard AXObserverCreate(pid, callback, &observer) == .success, let observer else { return }
        axObserver = observer
        let context = Unmanaged.passUnretained(self).toOpaque()
        for name in [kAXMovedNotification, kAXResizedNotification, kAXWindowMiniaturizedNotification, kAXWindowDeminiaturizedNotification] {
            AXObserverAddNotification(observer, window, name as CFString, context)
        }
        AXObserverAddNotification(observer, app, kAXFocusedWindowChangedNotification as CFString, context)
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
    }
    deinit {
        if let old = axObserver { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(old), .commonModes) }
    }
    func tick() {
        if kill(parent, 0) != 0 { exit(0) }
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).filter { !$0.isTerminated }
        guard let running = apps.first(where: { $0.isActive }) ?? apps.first else {
            cachedWindow = nil; cachedProfile = nil; cachedUpdate = nil; pid = 0
            emit(["exists": false, "reason": "host_closed"]); return
        }
        let app = AXUIElementCreateApplication(running.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 0.12)
        // Use the result of an actual, OS-enforced role query instead of a
        // cached preflight flag. No UI text/value is requested by this probe.
        var applicationRole: CFTypeRef?
        let permissionProbe = AXUIElementCopyAttributeValue(app, kAXRoleAttribute as CFString, &applicationRole)
        if permissionProbe == .apiDisabled {
            emit(["exists": true, "anchored": false, "accessibilityRequired": true, "reason": "permission"]); return
        }
        let foreground = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let active = foreground == running.processIdentifier || foreground == parent
        if !active || running.isHidden {
            emit(["exists": true, "anchored": false, "foreground": false, "reason": "background"]); return
        }
        // Electron's documented opt-in materializes its otherwise lazy AX tree.
        // Do not use AXEnhancedUserInterface / VoiceOver emulation.
        if preparedPID != running.processIdentifier && Date() >= prepareRetry {
            let result = AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
            if result == .success { preparedPID = running.processIdentifier }
            prepareRetry = Date().addingTimeInterval(5)
        }
        let window = elementAttribute(app, kAXFocusedWindowAttribute) ?? elementAttribute(app, kAXMainWindowAttribute)
        guard let window, let bounds = rect(window) else {
            cachedProfile = nil; emit(["exists": true, "anchored": false, "foreground": active, "reason": "window_unavailable"]); return
        }
        if attribute(window, kAXMinimizedAttribute) as? Bool == true {
            emit(["exists": true, "anchored": false, "foreground": active, "minimized": true, "reason": "minimized"]); return
        }
        let changed = pid != running.processIdentifier || cachedWindow == nil || !CFEqual(cachedWindow!, window)
        if changed {
            pid = running.processIdentifier; cachedWindow = window; cachedProfile = nil; nextScan = .distantPast
            cachedUpdate = nil; nextUpdateScan = .distantPast
            scanQueue.removeAll(); scanVisited = 0
            subscribe(app, window)
        }
        // AX positions are global, top-left-origin logical points, as Electron expects.
        // No Retina multiplication or primary-screen y-axis inversion is needed.
        if lastBounds?.size != bounds.size {
            cachedProfile = nil; nextScan = .distantPast; scanQueue.removeAll(); scanVisited = 0
            cachedUpdate = nil; nextUpdateScan = .distantPast
        }
        lastBounds = bounds
        if Date() >= nextScan {
            cachedProfile = findProfile(window, bounds, queue: &scanQueue, visited: &scanVisited)
            if cachedProfile != nil || scanQueue.isEmpty {
                nextScan = Date().addingTimeInterval(2); scanQueue.removeAll(); scanVisited = 0
            }
        }
        var result: [String: Any] = ["exists": true, "foreground": active, "minimized": false, "anchored": false, "reason": "profile_unavailable"]
        if let button = cachedProfile, let r = rect(button), validProfile(r, bounds), let anchor = anchorRect(button) {
            if Date() >= nextUpdateScan {
                cachedUpdate = findUpdateControl(profile: button, profileRect: r, window: bounds)
                nextUpdateScan = Date().addingTimeInterval(0.5)
            }
            // Read cached geometry live; disappearance/hidden/disabled AX objects
            // restore the profile anchor without retaining a stale fixed offset.
            let updates = cachedUpdate.flatMap(visibleUpdateRect).map { [$0] } ?? []
            let profileTop = min(r.minY, anchor.minY)
            let top = min(profileTop, updateAnchorTop(profile: r, updates: updates, window: bounds))
            result["anchored"] = true; result["x"] = anchor.midX; result["y"] = top
            result["avoidingUpdate"] = top < profileTop
            result["reason"] = "attached"
        } else if cachedProfile != nil {
            cachedProfile = nil; nextScan = .distantPast; scanQueue.removeAll(); scanVisited = 0
        }
        emit(result)
    }
}

#if GAUGE_NODE_LIBRARY
private var nodeHostObserver: HostObserver?
@_cdecl("gauge_host_read")
public func gaugeHostRead(_ parent: Int32) -> UnsafeMutablePointer<CChar>? {
    if nodeHostObserver == nil { nodeHostObserver = HostObserver(parent: parent, bundleID: "com.openai.codex") }
    nodeHostObserver!.tick()
    return strdup(nodeHostObserver!.output)
}
@_cdecl("gauge_host_stop")
public func gaugeHostStop() { nodeHostObserver = nil }
#else
@main
struct GaugeHostMain {
static func main() {
if CommandLine.arguments.contains("--self-test") {
    precondition(validProfile(CGRect(x: -1180, y: 760, width: 40, height: 40), CGRect(x: -1200, y: 100, width: 1000, height: 800)))
    precondition(!validProfile(CGRect(x: 100, y: 100, width: 40, height: 40), CGRect(x: 0, y: 0, width: 1000, height: 800)))
    precondition(!validProfile(CGRect(x: 900, y: 750, width: 40, height: 40), CGRect(x: 0, y: 0, width: 1000, height: 800)))
    precondition(profileLabels.contains("打开个人资料菜单"))
    let w = CGRect(x: -1200, y: 100, width: 1000, height: 800)
    let p = CGRect(x: -1180, y: 820, width: 40, height: 40)
    let u = CGRect(x: -1180, y: 770, width: 40, height: 36)
    precondition(updateAnchorTop(profile: p, updates: [u], window: w) == 770)
    precondition(updateAnchorTop(profile: p, updates: [], window: w) == 820)
    precondition(updateAnchorTop(profile: p, updates: [u.offsetBy(dx: 300, dy: 0)], window: w) == 820)
    precondition(updateAnchorTop(profile: p, updates: [u.offsetBy(dx: 0, dy: 100)], window: w) == 820)
    precondition(updateAnchorTop(profile: p, updates: [u.offsetBy(dx: 0, dy: -300)], window: w) == 820)
    precondition(updateAnchorTop(profile: p.offsetBy(dx: 1200, dy: -100), updates: [u.offsetBy(dx: 1200, dy: -100)], window: w.offsetBy(dx: 1200, dy: -100)) == 670)
    precondition(isUpdateLabel("有可用更新") && isUpdateLabel("Downloading 42%") && isUpdateLabel("正在下载 42%"))
    precondition(!isUpdateLabel("Update available: remote CLI"))
    print("Mac geometry, update avoidance, removal, movement and label checks passed; no application UI accessed.")
    exit(0)
}
guard CommandLine.arguments.count == 2, let parent = pid_t(CommandLine.arguments[1]) else { exit(2) }
let observer = HostObserver(parent: parent, bundleID: "com.openai.codex")
let observerApplication = NSApplication.shared
observerApplication.setActivationPolicy(.prohibited)
let timer = Timer(timeInterval: 0.15, repeats: true) { _ in observer.tick() }
RunLoop.main.add(timer, forMode: .common)
observer.tick()
RunLoop.main.run()
}
}
#endif
