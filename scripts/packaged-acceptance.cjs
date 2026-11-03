// Run against an unpacked Windows distribution. All profiles are synthetic and isolated.
// Usage: node scripts/packaged-acceptance.cjs <exe> <new-evidence-directory>
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const asar=require('@electron/asar');
const exe=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
if(fs.existsSync(out))throw Error('Evidence directory must be new');fs.mkdirSync(out,{recursive:true});
const extracted=path.join(out,'extracted');asar.extractAll(path.join(path.dirname(exe),'resources/app.asar'),extracted);
const {CreditCenter}=require(path.join(extracted,'src/credit-center.cjs'));
const {cleanRecord}=require(path.join(extracted,'src/credit-model.cjs'));
const delay=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],children=[];
function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(pending.has(x.id)){const p=pending.get(x.id);pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result);}};return {ws,call:(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));})};}
async function launch(name,centerFlag=false){
 const home=path.join(out,name,'home'),data=path.join(home,'roaming','codex-gauge');fs.mkdirSync(home,{recursive:true});
 const env={};for(const k of ['SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{HOME:home,USERPROFILE:home,APPDATA:path.join(home,'roaming'),LOCALAPPDATA:path.join(home,'local'),PATH:path.join(home,'no-tools')});
 const portFile=path.join(data,'DevToolsActivePort');if(fs.existsSync(portFile))fs.unlinkSync(portFile);
 const log=fs.openSync(path.join(out,name,'process.log'),'a');
 const child=spawn(exe,['--remote-debugging-port=0',`--user-data-dir=${data}`,...(centerFlag?['--credit-center']:[])],{env,windowsHide:true,stdio:['ignore',log,log]});children.push(child);fs.closeSync(log);
 let port;for(let i=0;i<150;i++){const f=path.join(data,'DevToolsActivePort');if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split('\n')[0]);break;}if(child.exitCode!==null)throw Error('Packaged process exited early');await delay(100);}
 if(!port)throw Error('No packaged debugger');
 let targets=[];for(let i=0;i<100;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();}catch{}if(targets.some(t=>t.url.endsWith('/credits.html')))break;await delay(100);}
 const target=targets.find(t=>t.url.endsWith('/credits.html'));if(!target)throw Error('No production center');
 check(target.url.includes('app.asar'),'Production UI loaded from app.asar: '+name);
 const client=await connect(target.webSocketDebuggerUrl);
 async function js(expression){const x=await client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw Error(x.exceptionDetails.text+' '+JSON.stringify(x.exceptionDetails.exception));return x.result.value;}
 for(let i=0;i<100;i++){if(await js('!!document.querySelector("#connections-dialog") && !!window.creditCenter'))break;await delay(100);}await delay(350);
 const click=async sel=>{await js(`document.querySelector(${JSON.stringify(sel)}).click()`);await delay(180);};
 const state=()=>js('window.creditCenter.state()');
 async function screenshot(label){const r=await client.call('Page.captureScreenshot');fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(r.data,'base64'));}
 async function stop(){try{await js('window.close()');}catch{}client.ws.close();for(let i=0;i<60&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null)child.kill();await delay(300);}
 return {home,data,js,click,state,screenshot,stop,targets,client};
}
async function main(){
 let a=await launch('blank');let s=await a.state();
 check(s.tools.length===0&&s.records.length===0,'Blank profile inherits no developer accounts, inventory or readings');
 check(await a.js('document.querySelector("#connections-dialog").open'),'First run opens wizard without center flag or CLI');
 await a.click('[data-follow=runway]');await a.click('[data-flow=next]');
 check(await a.js('!!document.querySelector("[data-flow=native-connect]")&&document.querySelector("[data-flow=query]").disabled'),'Independent OAuth offered without tools; query waits for authorization');
 await a.screenshot('packaged-connect-zh');await a.stop();
 a=await launch('blank');s=await a.state();check(s.connectionPreferences.step==='connect'&&s.connectionPreferences.activeProvider==='runway','Interrupted selection and step survive packaged restart');
 await a.click('[data-flow=next]');await a.click('[data-flow=done]');s=await a.state();
 check(s.onboardingCompleted&&s.records.length===0,'Skip membership completes wizard without fabricated quota');
 check(await a.js('document.querySelectorAll(".overview-row.unknown").length===1'),'Chosen unconnected platform is unknown, not zero');
 await a.click('[data-action=onboarding]');await a.click('[data-follow=runway]');await a.click('[data-flow=later]');await a.stop();
 a=await launch('blank',true);s=await a.state();check(s.tools.find(t=>t.id==='runway').followed===false,'Explicit hiding survives packaged restart');check(await a.js('document.querySelectorAll(".overview-row").length===0'),'Hidden platform stays off overview');await a.stop();
 // Construct legacy-shaped data using packaged model, not any real user files.
 const home=path.join(out,'legacy','home'),data=path.join(home,'roaming','codex-gauge');fs.mkdirSync(data,{recursive:true});
 const c=new CreditCenter(data,{home,env:{PATH:''}});c.rescan();
 for(const [provider,amount,status] of [['runway',0,'ready'],['suno',9,'offline'],['minimax',null,'ready']]){c.ensureTool(provider);c.put(cleanRecord({provider,scope:'synthetic-account',account:'Synthetic acceptance',source:'api',identityVerified:true,fetchedAt:Date.now(),status,pools:[{id:'effective',amount,unit:'credits'}]}),false);}
 const record=c.records.find(r=>r.provider==='runway');c.setRule(record.id+'/effective',{notify:false});c.setUserDate({provider:'runway',recordId:record.id,poolId:'effective',account:'Synthetic acceptance',label:'Credits',poolType:'subscription',expiryDate:'2030-01-31',monthlyDay:2,notify:true});c.persist();
 const file=path.join(data,'credit-center.json'),legacy=JSON.parse(fs.readFileSync(file));delete legacy.connectionPreferences;delete legacy.onboardingCompleted;legacy.records.find(r=>r.provider==='suno').status='offline';fs.writeFileSync(file,JSON.stringify(legacy));
 const settings={language:'en',theme:'dark',autostart:false,notifications:false,resetNews:false,resetReminders:false};fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({settings,ledger:{'synthetic-reminder':true}}));
 // Disabled synthetic pairing reference: no secret decryption or real extension connection.
 const pair=path.join(data,'browser-link.json');fs.writeFileSync(pair,JSON.stringify({version:1,enabled:false,port:0,cipher:'synthetic-unused',clientRef:'synthetic-client'}));const pairHash=hash(pair);
 a=await launch('legacy',true);s=await a.state();
 check(s.onboardingCompleted&&!await a.js('document.querySelector("#connections-dialog").open'),'Legacy upgrade does not reopen first-run wizard');
 check(s.language==='en'&&s.dark,'Legacy language and theme retained');
 check(s.records.some(r=>r.id===record.id)&&s.tools.find(t=>t.id==='runway').userDates.some(d=>d.recordId===record.id),'Legacy account and date references retained');
 check(s.records.find(r=>r.provider==='runway').pools[0].amount===0,'Legitimate zero retained');
 check(s.records.find(r=>r.provider==='suno').pools[0].amount===9&&s.records.find(r=>r.provider==='suno').status!=='ready','Failed old amount retained with non-ready status');
 check(s.records.find(r=>r.provider==='minimax').pools[0].amount===null,'Unknown amount remains unknown');
 check(s.rules[record.id+'/effective'].notify===false,'Per-pool reminder choice retained');
 await a.screenshot('packaged-legacy-en');
 const badge=a.targets.find(t=>t.url.includes('/index.html'));check(!!badge,'Original badge renderer is present');{const b=await connect(badge.webSocketDebuggerUrl);const r=await b.call('Runtime.evaluate',{expression:'window.gauge.state()',awaitPromise:true,returnByValue:true});check(['cli_missing','offline','connecting'].includes(r.result.value.status),'Original badge handles absent Codex CLI');b.ws.close();}
 await a.stop();check(hash(pair)===pairHash,'Browser pairing reference preserved byte-for-byte');const stored=JSON.parse(fs.readFileSync(path.join(data,'settings.json')));check(stored.ledger['synthetic-reminder']===true&&stored.settings.language==='en'&&stored.settings.autostart===false,'Original badge settings and reminder ledger preserved');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,exeSha256:hash(exe),asarSha256:hash(path.join(path.dirname(exe),'resources/app.asar')),scope:'Actual packaged main/preload/UI; empty tool PATH and synthetic legacy profile on Windows host. No provider OAuth, paid requests, physical clean-machine install, OS installer execution or Mac validation.'},null,2));console.log(JSON.stringify({passed:checks.length}));
}
main().catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack);console.error(e.message);process.exitCode=1;}).finally(()=>{for(const c of children)if(c.exitCode===null)c.kill();});
