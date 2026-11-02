const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const asar=require('@electron/asar');
const {verifyPackage}=require('../scripts/verify-package.cjs');

test('staged MCP starts and answers tools/list with the current dependency graph',async()=>{
  await require('../scripts/prepare-package.cjs').default();
  const root=path.resolve('.local/package-resources');
  const result=spawnSync(process.execPath,[path.join(root,'mcp/scripts/gauge-mcp.cjs')],{
    input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n',encoding:'utf8',timeout:5000
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).result.tools.length,3);
  const config=require('../package.json').build;
  assert.ok(config.extraResources.some(x=>x.to==='browser-extension'));
  assert.ok(config.mac.extraResources.some(x=>x.to==='browser-extension'));
  assert.ok(config.extraResources.every(x=>!x.from.startsWith('src/')),'shared app files must not be excluded from ASAR');
});

test('packaging gate rejects missing new MCP modules and browser assets on both platforms',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-package-gate-'));
  const app=path.join(root,'app');const resources=path.join(root,'resources');
  fs.mkdirSync(path.join(app,'src/ui'),{recursive:true});fs.mkdirSync(resources);
  for(const file of ['src/main.cjs','src/preload.cjs','src/ui/index.html','src/ui/credits.html','src/ui/credits.js'])fs.writeFileSync(path.join(app,file),'');
  await asar.createPackage(app,path.join(resources,'app.asar'));
  for(const platform of ['darwin','win32'])assert.throws(()=>verifyPackage(resources,platform),error=>{
    assert.match(error.message,/mcp\/src\/credit-user-dates.cjs/);
    assert.match(error.message,/mcp\/src\/ui\/credit-cadence.js/);
    assert.match(error.message,/browser-extension\/manifest.json/);
    assert.ok(error.message.includes(platform==='darwin'?'native/GaugeHostMac.node':'native/GaugeHost.exe'));
    return true;
  });
});
