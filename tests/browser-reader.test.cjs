const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../browser-extension/reader.js'),'utf8');
function page({amount='12,345',marker='Sample team',duplicate=false,hidden=false,url='https://app.tapnow.ai/home',changeOnOpen=false,changeAfter=Infinity}={}){
 let opened=false,clicks=0;const queried=[];
 const element=(text,attributes={})=>({innerText:text,isContentEditable:false,parentElement:null,matches:()=>false,closest:()=>null,getBoundingClientRect:()=>({width:hidden?0:100,height:24}),getAttribute:name=>attributes[name]||null});
 const team=element(marker,{title:marker}),balance=element(amount),menu=element('',{ });let markerReads=0;team.getAttribute=name=>name==='title'?(changeOnOpen&&opened||++markerReads>=changeAfter?'Other team':marker):null;menu.getAttribute=name=>name==='aria-expanded'?String(opened):null;menu.click=()=>{opened=true;clicks++;};
 const document={querySelectorAll(selector){queried.push(selector);if(selector==='[data-testid="common-nav-user-menu"]')return[menu];if(selector==='[data-testid="common-nav-user-menu"] [title]')return marker?[team]:[];if(selector==='[data-testid="common-nav-user-menu-dropdown"] [data-testid="common-nav-user-menu-balance-quota-card"] > div:first-child > div:first-child > span:first-of-type')return opened?(duplicate?[balance,balance]:[balance]):[];throw Error('Reader accessed an unrelated page location');}};
 const context=vm.createContext({document,location:new URL(url),setTimeout:fn=>setImmediate(fn),getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});vm.runInContext(script,context);
 return{read:()=>context.gaugeTapNowRead(false),get clicks(){return clicks;},queried};
}
test('TapNow reopens only its account menu and reads the balance row, preserving an explicit zero',async()=>{
 for(const amount of ['12,345','0']){const p=page({amount});const r=await p.read();assert.equal(r.balance,amount);assert.equal(r.marker,'Sample team');assert.equal(p.clicks,1);assert.ok(p.queried.every(s=>s.includes('common-nav-user-menu')));}
});
test('TapNow does not fall back to unrelated prices or counters when its balance is unavailable',async()=>{
 for(const options of [{amount:'—'},{amount:'1.2k'},{amount:'10/100'},{amount:'$9'},{duplicate:true},{hidden:true},{marker:''}])await assert.rejects(page(options).read(),/selection_changed/);
});
test('the fixed TapNow menu reader refuses other origins and working-canvas pages',async()=>{
 for(const url of ['https://example.com/home','https://app.tapnow.ai/canvas/private','https://app.tapnow.ai/home?canvas=1']){const p=page({url});await assert.rejects(p.read(),/page_closed/);assert.equal(p.queried.length,0);assert.equal(p.clicks,0);}
});
test('a team change during menu opening or balance settling discards that reading',async()=>{
 for(const options of [{changeOnOpen:true},{changeAfter:3}])await assert.rejects(page(options).read(),/selection_changed/);
});
