const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const child = spawn(path.join(__dirname, '../native/bin/GaugeHost.exe'), [String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
const timer = setTimeout(() => { child.kill(); console.error('Host observer timeout'); process.exit(1); }, 15000);
createInterface({ input: child.stdout }).on('line', line => {
  const state = JSON.parse(line);
  if (!state.anchored) return;
  clearTimeout(timer); child.kill();
  console.log(JSON.stringify({ exists: !!state.exists, anchored: !!state.anchored, minimized: !!state.minimized,
    validGeometry: state.anchored && state.x >= state.left && state.x <= state.left + state.width && state.y >= state.top }, null, 2));
  process.exit(state.anchored ? 0 : 1);
});
