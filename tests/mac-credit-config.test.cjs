const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configuredKey } = require('../src/credit-credentials.cjs');
test('Mac Claude Desktop configuration uses Application Support; Windows keeps AppData', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-platform-config-'));
  for (const [platform, directory, value] of [
    ['darwin', 'Library/Application Support', 'mac-fixture-credential'],
    ['win32', 'AppData/Roaming', 'windows-fixture-credential']
  ]) {
    const file = path.join(home, directory, 'Claude/claude_desktop_config.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { tavily: { env: { TAVILY_API_KEY: value } } } }));
    assert.equal(configuredKey('tavily', { home, env: {}, platform }).key, value);
  }
  assert.equal(configuredKey('tavily', { home, env: {}, platform: 'darwin' }).key, 'mac-fixture-credential');
});
