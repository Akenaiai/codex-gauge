const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../browser-extension/reader.js'),'utf8');
function page({amount='12,345',marker='Sample team',duplicate=false,hidden=false,url='https://app.tapnow.ai/home',changeOnOpen=false,changeAfter=Infinity}={}){
 let opened=false,clicks=0;const queried=[],listeners=new Map();
 const element=(text,attributes={})=>({innerText:text,isConnected:true,isContentEditable:false,parentElement:null,matches:()=>false,closest:()=>null,getBoundingClientRect:()=>({width:hidden?0:100,height:24}),getAttribute:name=>attributes[name]||null});
 const team=element(marker,{title:marker}),balance=element(amount),menu=element('',{ });let markerReads=0;team.getAttribute=name=>name==='title'?(changeOnOpen&&opened||++markerReads>=changeAfter?'Other team':marker):null;menu.getAttribute=name=>name==='aria-expanded'?String(opened):null;menu.click=()=>{opened=!opened;clicks++;};
 const document={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);},createElement(){queried.push('createElement');throw Error('Unexpected DOM write');},querySelector(selector){queried.push(selector);return selector==='#balance'?balance:team;},querySelectorAll(selector){queried.push(selector);if(selector==='[data-testid="common-nav-user-menu"]')return[menu];if(selector==='[data-testid="common-nav-user-menu"] [title]')return marker?[team]:[];if(selector==='[data-testid="common-nav-user-menu-dropdown"] [data-testid="common-nav-user-menu-balance-quota-card"] > div:first-child > div:first-child > span:first-of-type')return opened?(duplicate?[balance,balance]:[balance]):[];throw Error('Reader accessed an unrelated page location');}};
 const context=vm.createContext({document,location:new URL(url),setTimeout:fn=>setImmediate(fn),getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});vm.runInContext(script,context);
 return{step:(anchor=null,deadline=Date.now()+55000,key)=>context.gaugeTapNowStep(anchor,deadline,key),finish:key=>context.gaugeTapNowFinish(key),input:()=>listeners.get('pointerdown')?.({isTrusted:true}),get opened(){return opened;},get listeners(){return listeners.size;},genericExpired:()=>context.gaugeRead({balance:'#unread',marker:'#unread'},false,Date.now()-1),generic:()=>context.gaugeRead({balance:'#balance',marker:'#marker'},true,Date.now()+55000,'https://ideogram.ai/'),pick:()=>context.gaugePick('balance',{},Date.now()+55000,'https://ideogram.ai/'),navigate:url=>{context.location=new URL(url);},get clicks(){return clicks;},queried};
}
test('TapNow reopens only its account menu and reads the balance row, preserving an explicit zero',async()=>{
 for(const amount of ['12,345','0']){const p=page({amount}),first=p.step();assert.equal(first.pending,true);assert.equal(first.marker,'Sample team');const r=p.step(first.marker);assert.equal(r.balance,amount);assert.equal(r.marker,'Sample team');assert.equal(p.clicks,1);assert.ok(p.queried.every(s=>s.includes('common-nav-user-menu')));assert.equal(r?.then,undefined);}
});
test('TapNow does not fall back to unrelated prices or counters when its balance is unavailable',async()=>{
 for(const options of [{amount:'—'},{amount:'1.2k'},{amount:'10/100'},{amount:'$9'},{duplicate:true},{hidden:true},{marker:''}]){const p=page(options),first=p.step(),next=p.step(first.marker||null);assert.equal(next.pending,true);assert.equal(next.balance,undefined);}
});
test('the fixed TapNow menu reader refuses other origins and working-canvas pages',async()=>{
 for(const url of ['https://example.com/home','https://app.tapnow.ai/canvas/private','https://app.tapnow.ai/home?canvas=1']){const p=page({url});assert.throws(()=>p.step(),/page_closed/);assert.equal(p.queried.length,0);assert.equal(p.clicks,0);}
});
test('a team change during menu opening or balance settling discards that reading',async()=>{
 for(const options of [{changeOnOpen:true},{changeAfter:3}]){const p=page(options),first=p.step();assert.throws(()=>{p.step(first.marker);p.step(first.marker);},/selection_changed/);}
});
test('late injected reads stop before accessing any page fields or opening the menu',async()=>{
 const p=page();assert.equal(p.step(null,Date.now()-1).expired,true);assert.equal((await p.genericExpired()).expired,true);assert.equal(p.clicks,0);assert.equal(p.queried.length,0);
});
test('selected-field reading and picking refuse a canvas before touching its DOM',async()=>{
 for(const action of ['generic','pick']){const p=page({url:'https://ideogram.ai/canvas/private'});await assert.rejects(p[action](),/page_closed/);assert.equal(p.queried.length,0);}
});
test('navigation during selected-field settling is rejected before reading the new page',async()=>{
 const p=page({url:'https://ideogram.ai/'}),reading=p.generic();p.navigate('https://ideogram.ai/canvas/private');await assert.rejects(reading,/page_closed/);assert.equal(p.queried.length,0);
});

test('temporary account menus are restored without closing a menu the user took over',()=>{
 const p=page(),first=p.step(null,Date.now()+55000,'read-one');p.step(first.marker,Date.now()+55000,'read-one');p.finish('read-one');assert.equal(p.opened,false);assert.equal(p.listeners,0);
 const u=page();u.step(null,Date.now()+55000,'read-two');u.input();assert.throws(()=>u.step('Sample team',Date.now()+55000,'read-two'),/selection_changed/);u.finish('read-two');assert.equal(u.opened,true);assert.equal(u.listeners,0);
 const existing=page();existing.step();existing.step(null,Date.now()+55000,'read-three');existing.finish('read-three');assert.equal(existing.opened,true);
});
