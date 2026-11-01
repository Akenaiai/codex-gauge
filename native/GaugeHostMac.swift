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
// An incomplete AX read is unknown, never evidence that a visible update vanished.
func updateAttribute(_ element: AXUIElement, _ name: String, reliable: inout Bool) -> CFTypeRef? {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    if status != .success && status != .attributeUnsupported && status != .noValue { reliable = false }
    return status == .success ? value : nil
}
func visibleUpdateRect(_ element: AXUIElement, reliable: inout Bool) -> CGRect? {
    if updateAttribute(element, "AXHidden", reliable: &reliable) as? Bool == true { return nil }
    guard updateAttribute(element, kAXParentAttribute, reliable: &reliable) != nil else { return nil }
    let labels = [kAXDescriptionAttribute, kAXTitleAttribute, kAXHelpAttribute].compactMap {
        updateAttribute(element, $0, reliable: &reliable) as? String
    }
    guard labels.contains(where: isUpdateLabel) else { return nil }
    guard let r = rect(element) else { reliable = false; return nil }
    return r
}
struct UpdateSearch {
    var queue: [AXUIElement] = []
    var visited = 0
    var found: AXUIElement?
    var top = CGFloat.greatestFiniteMagnitude
    var reliable = true
    mutating func step(profile: AXUIElement, profileRect: CGRect, window: CGRect) -> (AXUIElement?, Bool) {
        if queue.isEmpty && visited == 0 {
            var ancestor = elementAttribute(profile, kAXParentAttribute), column: AXUIElement?
            for _ in 0..<8 {
                guard let item = ancestor else { break }
                if attribute(item, kAXRoleAttribute) as? String == kAXWindowRole { break }
                if let r = rect(item), window.contains(r), r.contains(profileRect),
                   r.width <= min(400, window.width / 2), r.height >= profileRect.height + 16 { column = item }
                ancestor = elementAttribute(item, kAXParentAttribute)
            }
            guard let column else { return (nil, false) }
            queue = [column]
        }
        let deadline = ProcessInfo.processInfo.systemUptime + 0.06
        while !queue.isEmpty && visited < 2000 && ProcessInfo.processInfo.systemUptime < deadline {
            let item = queue.removeLast(); visited += 1
            let role = updateAttribute(item, kAXRoleAttribute, reliable: &reliable) as? String ?? ""
            if [kAXTextAreaRole, kAXTextFieldRole, kAXStaticTextRole].contains(role) { continue }
            if [kAXButtonRole, kAXMenuButtonRole, kAXProgressIndicatorRole, kAXGroupRole].contains(role),
               let r = visibleUpdateRect(item, reliable: &reliable) {
                let candidate = updateAnchorTop(profile: profileRect, updates: [r], window: window)
                if candidate < profileRect.minY && candidate < top { top = candidate; found = item }
            }
            let nested = updateAttribute(item, kAXChildrenAttribute, reliable: &reliable) as? [AXUIElement] ?? []
            queue.append(contentsOf: nested)
        }
        let result = (found, queue.isEmpty && reliable)
        // Preserve unfinished work across timer ticks; a node limit is also unknown.
        if queue.isEmpty || visited >= 2000 { self = UpdateSearch() }
        return result
    }
}
struct UpdateAvoidance {
    var clearance: CGFloat = 0
    var absentSince: TimeInterval?
    var misses = 0
    mutating func observe(gap: CGFloat?, complete: Bool, now: TimeInterval) {
        if let gap, gap > 0 {
            clearance = max(clearance, gap); absentSince = nil; misses = 0
        } else if complete {
            if absentSince == nil { absentSince = now }
            misses += 1
            if misses >= 3 && now - absentSince! >= 1.5 { self = UpdateAvoidance() }
        } else {
            // Interrupted/failed scans cannot confirm a continuous absence.
            absentSince = nil; misses = 0
        }
    }
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
    var updateSearch = UpdateSearch()
    var updateAvoidance = UpdateAvoidance()
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
            updateSearch = UpdateSearch(); updateAvoidance = UpdateAvoidance()
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
            updateSearch = UpdateSearch(); updateAvoidance = UpdateAvoidance()
            scanQueue.removeAll(); scanVisited = 0
            subscribe(app, window)
        }
        // AX positions are global, top-left-origin logical points, as Electron expects.
        // No Retina multiplication or primary-screen y-axis inversion is needed.
        if lastBounds?.size != bounds.size {
            cachedProfile = nil; nextScan = .distantPast; scanQueue.removeAll(); scanVisited = 0
            cachedUpdate = nil; nextUpdateScan = .distantPast
            updateSearch = UpdateSearch()
        }
        lastBounds = bounds
        if Date() >= nextScan {
            let found = findProfile(window, bounds, queue: &scanQueue, visited: &scanVisited)
            if let found { cachedProfile = found }
            if found != nil || scanQueue.isEmpty {
                nextScan = Date().addingTimeInterval(2); scanQueue.removeAll(); scanVisited = 0
            }
        }
        var result: [String: Any] = ["exists": true, "foreground": active, "minimized": false, "anchored": false, "reason": "profile_unavailable"]
        if let button = cachedProfile, let r = rect(button), validProfile(r, bounds), let anchor = anchorRect(button) {
            let now = ProcessInfo.processInfo.systemUptime
            let profileTop = min(r.minY, anchor.minY)
            var liveReliable = true
            let live = cachedUpdate.flatMap { visibleUpdateRect($0, reliable: &liveReliable) }
            let liveTop = updateAnchorTop(profile: r, updates: live.map { [$0] } ?? [], window: bounds)
            if liveTop < profileTop { updateAvoidance.observe(gap: profileTop - liveTop, complete: false, now: now) }
            if Date() >= nextUpdateScan {
                let (found, complete) = updateSearch.step(profile: button, profileRect: r, window: bounds)
                var reliable = true
                let foundRect = found.flatMap { visibleUpdateRect($0, reliable: &reliable) }
                let foundTop = updateAnchorTop(profile: r, updates: foundRect.map { [$0] } ?? [], window: bounds)
                if foundRect != nil { cachedUpdate = found }
                let gap = min(foundTop, liveTop) < profileTop ? profileTop - min(foundTop, liveTop) : nil
                updateAvoidance.observe(gap: gap, complete: complete && reliable, now: now)
                nextUpdateScan = Date().addingTimeInterval(updateSearch.visited == 0 ? 0.5 : 0.15)
            }
            // Keep a measured clearance relative to the live avatar, never a desktop coordinate.
            let top = profileTop - updateAvoidance.clearance
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
    var hold = UpdateAvoidance()
    hold.observe(gap: 50, complete: true, now: 0)
    for i in 1...20 {
        hold.observe(gap: nil, complete: false, now: Double(i) * 0.15)
        precondition(hold.clearance == 50) // partial scan / AX failure cannot lower the badge
    }
    hold.observe(gap: nil, complete: true, now: 4)
    hold.observe(gap: 50, complete: true, now: 4.5)
    precondition(hold.clearance == 50 && hold.misses == 0)
    hold.observe(gap: 35, complete: true, now: 5)
    precondition(hold.clearance == 50) // progress label / layout transitions keep clearance
    hold.observe(gap: 70, complete: true, now: 5.5)
    precondition(hold.clearance == 70)
    hold.observe(gap: nil, complete: true, now: 6)
    hold.observe(gap: nil, complete: true, now: 6.5)
    hold.observe(gap: nil, complete: false, now: 7)
    hold.observe(gap: nil, complete: true, now: 7.5)
    precondition(hold.clearance == 70) // unknown scan interrupts confirmed absence
    hold.observe(gap: nil, complete: true, now: 8)
    hold.observe(gap: nil, complete: true, now: 9)
    precondition(hold.clearance == 0) // only a sustained, complete absence restores placement
    hold.observe(gap: 50, complete: true, now: 10)
    precondition(p.minY - hold.clearance == 770)
    precondition(p.offsetBy(dx: 1200, dy: -100).minY - hold.clearance == 670)
    hold = UpdateAvoidance()
    precondition(hold.clearance == 0) // a different window starts independently
    print("Mac geometry, update avoidance, transient AX loss, confirmed removal and movement checks passed; no application UI accessed.")
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
