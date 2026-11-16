const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const api=require('../src/tapnow-credit.cjs'),{CreditCenter}=require('../src/credit-center.cjs'),{cleanRecord}=require('../src/credit-model.cjs'),{accessFor}=require('../src/connection-capabilities.cjs');
const data=(amount=12)=>({kind:'tapnow.tapies_balance.v1',unit:'tapies',wallet:{available:20,on_hold:3,total:23},spendable_tapies:amount,limited_by:'member_limit',plan:{name:'Sample',current_period_end:'2030-01-01T00:00:00Z'}});
function fixture(browserAvailable=false){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-tapnow-'));const browser={enabled:browserAvailable,paired:browserAvailable,connected:browserAvailable,providers:{tapnow:{configured:browserAvailable}}};const c=new CreditCenter(dir,{home:dir,env:{PATH:''},browserState:()=>browser});c.ensureTool('tapnow');c.componentProbe={platform:'win32',checks:{codex_cli:true},mcp:{tapnow:true},api:{}};return{c,browser};}
const page=()=>cleanRecord({provider:'tapnow',scope:'sample-browser-team',account:'Sample team',source:'browser',identityVerified:false,fetchedAt:Date.now(),pools:[{id:'effective',amount:20,unit:'credits'}]});
test('TapNow displays spendable rather than wallet total or member allowance; zero remains valid and dates stay unknown',()=>{
 for(const n of [0,12,20]){const r=cleanRecord(api.tapnowRecord(data(n)));assert.equal(r.pools.length,1);assert.equal(r.pools[0].amount,n);assert.equal(r.identityVerified,false);assert.equal(r.pools[0].expiresAt,null);assert.equal(r.pools[0].periodEnd,null);assert.equal(r.source,'mcp');}
 for(const extra of [{kind:'wrong'},{unit:'usd'},{spendable_tapies:null},{spendable_tapies:'12'},{spendable_tapies:NaN},{spendable_tapies:-1},{spendable_tapies:21},{wallet:{available:20,on_hold:3,total:20}}])assert.throws(()=>api.tapnowRecord({...data(),...extra}),/invalid_response|invalid_balance/);
});
test('the adapter uses only the official configured server and the free balance method',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-tapnow-rpc-'));fs.mkdirSync(path.join(home,'.codex'));fs.writeFileSync(path.join(home,'.codex/config.toml'),'[mcp_servers.tapnow]\nurl="'+api.ENDPOINT+'"');const calls=[];
 const rpc={start(){},stop(){},notify(){},async call(method,args){calls.push({method,args});if(method==='thread/start')return{thread:{id:'synthetic'}};if(method==='mcpServerStatus/list')return{data:[{name:'tapnow',runtimeStatus:'connected',tools:{get_tapies_balance:{}}}]};if(method==='mcpServer/tool/call')return{structuredContent:data()};return{};}};
 const rows=await api.tapnow({home,rpcFactory:()=>rpc});assert.equal(rows[0].pools[0].amount,12);assert.deepEqual(calls.filter(c=>c.method==='mcpServer/tool/call').map(c=>c.args.tool),['get_tapies_balance']);assert.equal(calls.some(c=>c.method==='turn/start'),false);assert.equal(calls.find(c=>c.method==='thread/start').args.ephemeral,true);
 fs.writeFileSync(path.join(home,'.codex/config.toml'),'[mcp_servers.tapnow]\nurl="https://wrong.invalid/mcp"');await assert.rejects(api.tapnow({home,rpcFactory:()=>assert.fail('wrong server')}),/query_failed/);
});
test('MCP is available with a closed browser; absent MCP retains the paired-page route',()=>{
 const{c,browser}=fixture();assert.equal(c.access({id:'tapnow',connections:[]}).query.route,'codex_mcp');assert.equal(c.access({id:'tapnow',connections:[]}).query.canAttempt,true);
 const probe={platform:'win32',checks:{},mcp:{},api:{}};Object.assign(browser,{enabled:true,paired:true,connected:true});browser.providers.tapnow.configured=true;
 assert.equal(accessFor({id:'tapnow',connections:[]},{probe,browser}).query.route,'browser');assert.equal(accessFor({id:'tapnow',connections:[]},{probe,browser}).query.canAttempt,true);
});
test('a fresh MCP reading wins over browser observations and page closure without erasing history',async()=>{
 const{c}=fixture(),prior=api.tapnow;c.put(page(),false);
 try{api.tapnow=async()=>[api.tapnowRecord(data())];await c.query('tapnow');assert.equal(c.statuses.tapnow,'ready');assert.equal(c.records.find(r=>r.source==='browser').status,'offline');c.acceptBrowserReading({...page(),scope:'other-browser',identityVerified:false});c.browserUnavailable('tapnow','page_closed');const rows=c.state().tools.find(t=>t.id==='tapnow').records;assert.equal(rows.length,1);assert.equal(rows[0].source,'mcp');assert.equal(rows[0].pools[0].amount,12);assert.equal(c.statuses.tapnow,'ready');assert.equal(c.records.some(r=>r.source==='browser'),true);assert.equal(c.state().records.filter(r=>r.provider==='tapnow').length,1);}
 finally{api.tapnow=prior;}
});
test('MCP failure falls back only to an already available page, then recovery selects MCP without adding both',async()=>{
 const{c}=fixture(true),prior=api.tapnow;let reads=0;c.put(cleanRecord(api.tapnowRecord(data())),false);c.options.browserRefresh=async()=>{reads++;return[page()];};
 try{api.tapnow=async()=>{throw Error('timeout');};await c.query('tapnow');assert.equal(reads,1);assert.equal(c.state().records.find(r=>r.provider==='tapnow').source,'browser');api.tapnow=async()=>[api.tapnowRecord(data(0))];await c.query('tapnow');assert.equal(c.state().records.filter(r=>r.provider==='tapnow').length,1);assert.equal(c.state().records.find(r=>r.provider==='tapnow').pools[0].amount,0);assert.equal(c.records.some(r=>r.source==='browser'),true);}
 finally{api.tapnow=prior;}
});
test('failure with no page retains a stale amount and timestamp; stopped requests cannot apply late data',async()=>{
 const{c}=fixture(),prior=api.tapnow;c.put(cleanRecord(api.tapnowRecord(data())),false);const at=c.records[0].fetchedAt;
 try{api.tapnow=async()=>{throw Error('timeout');};await c.query('tapnow');assert.equal(c.records[0].pools[0].amount,12);assert.equal(c.records[0].fetchedAt,at);assert.equal(c.records[0].status,'offline');let resolve;api.tapnow=()=>new Promise(r=>resolve=r);const pending=c.query('tapnow');c.stop();resolve([api.tapnowRecord(data(0))]);await pending;assert.equal(c.records[0].pools[0].amount,12);}
 finally{api.tapnow=prior;}
});
