import AppKit
import Foundation

// Native companion; workspace events plus a two-second local fallback, no model calls.
final class Follow {
    let workspace = NSWorkspace.shared
    let hostID: String
    let gaugeURL: URL
    let statusURL: URL
    let pauseURL: URL
    var observers: [NSObjectProtocol] = []
    var watchdog: Timer?
    var launching = false
    var hostGeneration = 0
    var previousHosts: Set<pid_t> = []
    var launchAttempts = 0

    init(hostID: String, gaugeURL: URL, statusURL: URL, pauseURL: URL) {
        self.hostID = hostID
        self.gaugeURL = gaugeURL.standardizedFileURL
        self.statusURL = statusURL
        self.pauseURL = pauseURL
    }

    var hosts: [NSRunningApplication] {
        NSRunningApplication.runningApplications(withBundleIdentifier: hostID).filter { !$0.isTerminated }
    }

    var gauges: [NSRunningApplication] {
        workspace.runningApplications.filter {
            !$0.isTerminated && $0.bundleURL?.standardizedFileURL == gaugeURL
        }
    }

    func status(_ action: String) {
        let value: [String: Any] = ["updatedAt": ISO8601DateFormatter().string(from: Date()),
                                  "hostRunning": !hosts.isEmpty, "gaugeRunning": !gauges.isEmpty,
                                  "action": action, "launchAttempts": launchAttempts, "hostPids": hosts.map(\.processIdentifier).sorted()]
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
            try? data.write(to: statusURL, options: .atomic)
        }
    }

    func reconcile() {
        let current = Set(hosts.map(\.processIdentifier))
        if current != previousHosts {
            previousHosts = current
            hostGeneration += 1
            launchAttempts = 0
        }
        let paused = (try? Data(contentsOf: pauseURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let pausedPids = Set((paused?["hostPids"] as? [Int32]) ?? [])
        if !current.isEmpty && current == pausedPids { status("paused"); return }
        if current.isEmpty {
            closeGauge()
        } else if gauges.isEmpty && !launching && launchAttempts == 0 {
            launchGauge()
        } else {
            status("watching")
        }
    }

    func launchGauge() {
        guard !hosts.isEmpty, gauges.isEmpty, !launching, launchAttempts < 3 else { return }
        launchAttempts += 1
        launching = true
        let generation = hostGeneration
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
        workspace.openApplication(at: gaugeURL, configuration: configuration) { _, error in
            DispatchQueue.main.async {
                self.launching = false
                if self.hosts.isEmpty { self.closeGauge(); return }
                self.status(error == nil ? "started" : "launch_failed")
                if error != nil && generation == self.hostGeneration && self.launchAttempts < 3 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                        if generation == self.hostGeneration { self.launchGauge() }
                    }
                }
            }
        }
        status("starting")
    }

    func closeGauge() {
        let running = gauges
        for app in running { _ = app.terminate() }
        status(running.isEmpty ? "idle" : "stopping")
        guard !running.isEmpty else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            guard self.hosts.isEmpty else { return }
            // Only the captured Gauge instances may be stopped, never Codex.
            for app in running where !app.isTerminated { _ = app.forceTerminate() }
            self.status("stopped")
        }
    }

    func start() {
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
            observers.append(workspace.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { notification in
                guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      app.bundleIdentifier == self.hostID || app.bundleURL?.standardizedFileURL == self.gaugeURL else { return }
                self.reconcile()
            })
        }
        watchdog = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in self.reconcile() }
        reconcile()
    }
}

func argument(_ name: String, _ fallback: String) -> String {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return fallback }
    return CommandLine.arguments[index + 1]
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let follow = Follow(hostID: argument("--host-id", "com.openai.codex"),
                    gaugeURL: URL(fileURLWithPath: argument("--gauge-path", "/Applications/Codex Gauge.app")),
                    statusURL: URL(fileURLWithPath: argument("--status-path", NSHomeDirectory() + "/Library/Application Support/Codex Gauge/follow-status.json")),
                    pauseURL: URL(fileURLWithPath: argument("--pause-file", NSHomeDirectory() + "/Library/Application Support/Codex Gauge/follow-pause.json")))
follow.start()
RunLoop.main.run()
