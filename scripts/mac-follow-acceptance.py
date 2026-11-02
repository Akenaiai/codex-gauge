"""Isolated native application lifecycle acceptance; never stops real Codex."""
import json
import os
from pathlib import Path
import plistlib
import signal
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[1]
(root / ".local").mkdir(exist_ok=True)
work = Path(tempfile.mkdtemp(prefix="acceptance-", dir=root / ".local"))
fixture = work / "Fixture.swift"
fixture.write_text("import AppKit\nlet app = NSApplication.shared\napp.setActivationPolicy(.accessory)\napp.finishLaunching()\napp.run()\n")
binary = work / "Fixture"
subprocess.run(["/usr/bin/swiftc", str(fixture), "-o", str(binary)], check=True)
host_id = "com.aken.gauge-follow.acceptance.host." + work.name


def bundle(name, bundle_id):
    app = work / (name + ".app")
    executable = app / "Contents/MacOS/Fixture"
    executable.parent.mkdir(parents=True)
    executable.write_bytes(binary.read_bytes())
    executable.chmod(0o755)
    with (app / "Contents/Info.plist").open("wb") as stream:
        plistlib.dump({"CFBundleIdentifier": bundle_id, "CFBundleExecutable": "Fixture",
                       "CFBundleName": name, "CFBundlePackageType": "APPL", "LSUIElement": True}, stream)
    return app, str(executable)


host, host_exe = bundle("Host", host_id)
gauge, gauge_exe = bundle("Gauge", "com.aken.gauge-follow.acceptance.gauge." + work.name)


def pids(executable):
    lines = subprocess.check_output(["/bin/ps", "-axo", "pid=,comm="], text=True).splitlines()
    return [int(line.strip().split(None, 1)[0]) for line in lines
            if len(line.strip().split(None, 1)) == 2 and line.strip().split(None, 1)[1] == executable]


def wait_for(predicate, label, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.2)
    raise AssertionError(label)


def launch(app):
    subprocess.run(["/usr/bin/open", "-g", "-a", str(app)], check=True, timeout=10)


def stop(executable):
    for pid in pids(executable):
        os.kill(pid, signal.SIGTERM)


helper = None
results = []
try:
    status = work / "status.json"
    helper = subprocess.Popen([str(root / "native/bin/GaugeFollowMac"), "--host-id", host_id,
                               "--gauge-path", str(gauge), "--status-path", str(status), "--pause-file", str(work / "pause.json")],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wait_for(status.exists, "helper readiness")
    assert not pids(gauge_exe)
    results.append("Host absent: Gauge stays stopped")
    for cycle in range(2):
        launch(host)
        wait_for(lambda: bool(pids(gauge_exe)), "Gauge did not follow host launch")
        assert len(pids(gauge_exe)) == 1
        results.append(f"Cycle {cycle + 1}: host launch starts one Gauge")
        stop(host_exe)
        wait_for(lambda: not pids(gauge_exe), "Gauge did not exit with host")
        results.append(f"Cycle {cycle + 1}: host exit stops Gauge")
    helper.terminate()
    helper.wait(timeout=5)
    helper = None
    launch(host)
    wait_for(lambda: bool(pids(host_exe)), "host readiness")
    helper = subprocess.Popen([str(root / "native/bin/GaugeFollowMac"), "--host-id", host_id,
                               "--gauge-path", str(gauge), "--status-path", str(status), "--pause-file", str(work / "pause.json")],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wait_for(lambda: bool(pids(gauge_exe)), "existing host startup")
    results.append("Helper restart: detects existing host and starts Gauge")
    (work / "pause.json").write_text(json.dumps({"hostPids": pids(host_exe)}))
    stop(gauge_exe)
    wait_for(lambda: not pids(gauge_exe), "manual Gauge quit")
    helper.terminate(); helper.wait(timeout=5)
    helper = subprocess.Popen([str(root / "native/bin/GaugeFollowMac"), "--host-id", host_id,
                               "--gauge-path", str(gauge), "--status-path", str(status), "--pause-file", str(work / "pause.json")],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wait_for(lambda: status.exists() and json.loads(status.read_text()).get("action") == "paused", "pause survives helper restart")
    assert not pids(gauge_exe)
    results.append("Manual quit pause survives helper restart")
    stop(host_exe)
    wait_for(lambda: not pids(host_exe), "host exit after pause")
    launch(host)
    wait_for(lambda: bool(pids(gauge_exe)), "new host resumes Gauge")
    results.append("New host session resumes paused Gauge")
    stop(host_exe)
    wait_for(lambda: not pids(gauge_exe), "final Gauge exit")
    report = {"passed": True, "checks": results, "scope": "isolated native fixture apps"}
    (root / ".local/mac-follow-acceptance.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
except Exception:
    if status.exists():
        print("Last helper status:", status.read_text(), flush=True)
    raise
finally:
    if helper is not None:
        helper.terminate()
        helper.wait(timeout=5)
    stop(host_exe)
    stop(gauge_exe)
