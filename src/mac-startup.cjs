'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const LABEL = 'com.aken.codex-gauge.follow';
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
function plistFor(args) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array>${args.map(a => `<string>${xml(a)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>60</integer><key>LimitLoadToSessionType</key><string>Aqua</string><key>ProcessType</key><string>Background</string></dict></plist>\n`;
}
function createMacStartup(app, root, run = execFile, options = {}) {
  const home = options.home || os.homedir();
  const uid = options.uid ?? process.getuid();
  const data = app.getPath('userData');
  const helper = path.join(options.resourcesPath || process.resourcesPath || root, app.isPackaged ? 'native' : 'native/bin', 'GaugeFollowMac');
  const gauge = options.gaugePath || path.resolve(path.dirname(app.getPath('exe')), '../..');
  const target = path.join(home, 'Library/LaunchAgents', LABEL + '.plist');
  const service = `gui/${uid}/${LABEL}`;
  const status = path.join(data, 'follow-status.json'), pauseFile = path.join(data, 'follow-pause.json');
  const command = args => new Promise((resolve, reject) => run('/bin/launchctl', args, { timeout: 15000 }, error => error ? reject(error) : resolve()));
  const loaded = async () => { try { await command(['print', service]); return true; } catch { return false; } };
  function existing() {
    if (!fs.existsSync(target)) return null;
    const previous = fs.readFileSync(target, 'utf8');
    if (!previous.includes(`<string>${LABEL}</string>`) || !/<string>[^<]*(?:\/GaugeFollowMac|\/codex-gauge-follow)<\/string>/.test(previous)) throw new Error('startup_entry_conflict');
    return previous;
  }
  function backup(previous) {
    if (previous === null) return;
    const directory = path.join(data, 'startup-backups'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `follow-${Date.now()}-${process.hrtime.bigint()}.plist`), previous, { mode: 0o600 });
  }
  function write(value) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.tmp', value, { mode: 0o644 }); fs.renameSync(target + '.tmp', target);
  }
  return {
    async set(enabled) {
      const previous = existing();
      if (!enabled && previous === null) return;
      if (enabled && !fs.existsSync(helper)) throw new Error('startup_helper_missing');
      const wasLoaded = await loaded(); backup(previous);
      if (wasLoaded) await command(['bootout', service]);
      let bootstrapped = false;
      try {
        if (enabled) {
          fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(pauseFile, '{"hostPids":[]}\n', { mode: 0o600 });
          write(plistFor([helper, '--gauge-path', gauge, '--status-path', status, '--pause-file', pauseFile]));
          await command(['enable', service]);
          await command(['bootstrap', `gui/${uid}`, target]); bootstrapped = true;
          app.setLoginItemSettings({ openAtLogin: false });
        } else {
          // Preserve a recoverable copy outside LaunchAgents, so login cannot reload it.
          const directory = path.join(data, 'startup-backups'); fs.mkdirSync(directory, { recursive: true });
          fs.renameSync(target, path.join(directory, `disabled-${Date.now()}-${process.hrtime.bigint()}.plist`));
          app.setLoginItemSettings({ openAtLogin: false });
        }
      } catch (error) {
        if (bootstrapped) try { await command(['bootout', service]); } catch { }
        if (previous !== null) write(previous);
        else if (fs.existsSync(target)) {
          const directory = path.join(data, 'startup-backups'); fs.mkdirSync(directory, { recursive: true });
          fs.renameSync(target, path.join(directory, `failed-${Date.now()}.plist`));
        }
        if (wasLoaded && previous !== null) try { await command(['bootstrap', `gui/${uid}`, target]); } catch { }
        throw error;
      }
    },
    pause() {
      let pids = [];
      try { pids = JSON.parse(fs.readFileSync(status, 'utf8')).hostPids.filter(n => Number.isInteger(n) && n > 0); } catch { }
      if (!pids.length) throw new Error('startup_state_unavailable');
      fs.mkdirSync(data, { recursive: true });
      fs.writeFileSync(pauseFile, JSON.stringify({ hostPids: pids }), { mode: 0o600 });
    }
  };
}
module.exports = { createMacStartup, plistFor, LABEL };
