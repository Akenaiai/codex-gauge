'use strict';
const fs = require('node:fs');
const path = require('node:path');

// electron-builder removes extraResources sources from the app archive.
// Stage shared files separately so both the desktop app and external MCP keep them.
exports.default = async function preparePackage() {
  const root = path.resolve(__dirname, '..');
  const stage = path.join(root, '.local/package-resources');
  const copies = [
    ['scripts/gauge-mcp.cjs', 'mcp/scripts/gauge-mcp.cjs'],
    ...['catalog.cjs', 'credit-model.cjs', 'credit-policies.cjs', 'credit-date-observations.cjs'].map(name => ['src/' + name, 'mcp/src/' + name]),
    ['src/relay-credit-bridge.py', 'adapters/relay-credit-bridge.py']
  ];
  for (const [source, destination] of copies) {
    const target = path.join(stage, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, source), target);
  }
};
