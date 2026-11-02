'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {hash}=require('./catalog.cjs');
const PROVIDERS=['tapnow','ideogram'],MAX_BODY=8192;
function extensionId(key){return crypto.createHash('sha256').update(Buffer.from(key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));}
function browserRecord(data,clientRef,now=Date.now()){
 if(!data||!PROVIDERS.includes(data.provider)||typeof data.amount!=='number'||!Number.isFinite(data.amount)||data.amount<0||data.amount>1e12||typeof data.marker!=='string'||!data.marker.trim()||data.marker.length>100||!Number.isSafeInteger(data.observedAt)||data.observedAt>now+5000||now-data.observedAt>30000)throw Error('invalid_response');
 const marker=data.marker.trim();return{provider:data.provider,scope:'browser:'+clientRef+':'+hash(marker),account:marker,source:'browser',identityVerified:false,fetchedAt:data.observedAt,pools:[{id:'effective',amount:data.amount,unit:'credits',label:data.provider==='tapnow'?'网页显示 Tapies':'网页显示积分',labelEn:data.provider==='tapnow'?'Tapies shown on page':'Credits shown on page'}]};
}
class BrowserLink extends EventEmitter{
 constructor(directory,storage,{extensionKey,receive,paused=()=>false,now=()=>Date.now()}={}){
  super();this.directory=directory;this.storage=storage;this.receive=receive;this.paused=paused;this.now=now;this.origin='chrome-extension://'+extensionId(extensionKey);this.boot=crypto.randomBytes(24).toString('base64url');this.lastSeen=0;this.providers={};this.pending=new Map();this.server=null;this.key=null;this.error=null;this.suspended=false;this.wasPaused=!!paused();
  try{this.profile=JSON.parse(fs.readFileSync(path.join(directory,'browser-link.json'),'utf8'));if(this.profile.version!==1||typeof this.profile.enabled!=='boolean'||typeof this.profile.cipher!=='string'||!Number.isInteger(this.profile.port))throw Error();}catch(e){if(e.code!=='ENOENT')this.error='storage_failed';this.profile={version:1,enabled:false,port:0,cipher:null,clientRef:null};}
 }
 state(){const connected=!this.suspended&&!!this.server&&this.lastSeen>this.now()-75000;return{enabled:!!this.server,paired:!!this.profile.clientRef,connected,error:this.error,extensionId:this.origin.slice(19),providers:Object.fromEntries(PROVIDERS.map(id=>[id,{configured:this.providers[id]?.configured===true,connected,error:this.providers[id]?.error||null,readAt:this.providers[id]?.readAt||null}]))};}
 cancel(provider,error){const p=this.pending.get(provider);if(p){clearTimeout(p.timer);this.pending.delete(provider);p.reject(Error(error));}}
 rotate(){this.boot=crypto.randomBytes(24).toString('base64url');for(const id of PROVIDERS)this.cancel(id,'browser_offline');}
 syncPause(){const paused=!!this.paused();if(paused!==this.wasPaused){this.wasPaused=paused;this.rotate();}}
 suspend(){this.suspended=true;this.rotate();this.lastSeen=0;for(const id of PROVIDERS)if(this.providers[id]?.configured)this.emit('unavailable',id,'browser_offline');this.emit('state');}
 resume(){this.suspended=false;this.rotate();this.emit('state');}
 save(){try{fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,'browser-link.json'),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.profile),{mode:0o600});fs.renameSync(temp,file);}catch{throw Error('storage_failed');}}
 async enable(){
  if(this.server)return;if(this.error)throw Error(this.error);if(!this.storage?.isEncryptionAvailable()||this.storage.getSelectedStorageBackend?.()==='basic_text')throw Error('credential_storage_failed');
  const prior={...this.profile};try{
   this.key=this.profile.cipher?this.storage.decryptString(Buffer.from(this.profile.cipher,'base64')):crypto.randomBytes(32).toString('base64url');
   if(!/^[A-Za-z0-9_-]{43}$/.test(this.key))throw Error('credential_storage_failed');
   const server=http.createServer((req,res)=>this.handle(req,res));server.requestTimeout=10000;server.headersTimeout=5000;server.keepAliveTimeout=1000;server.on('error',()=>{});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.profile.port||0,'127.0.0.1',resolve);});this.server=server;
   Object.assign(this.profile,{enabled:true,port:server.address().port,cipher:this.storage.encryptString(this.key).toString('base64')});this.save();this.health=setInterval(()=>{if(this.lastSeen&&this.now()-this.lastSeen>75000){this.lastSeen=0;for(const id of PROVIDERS)this.emit('unavailable',id,'browser_offline');this.emit('state');}},15000);this.emit('state');
  }catch(e){this.server?.close();this.server=null;this.key=null;this.profile=prior;throw Error(['storage_failed','credential_storage_failed'].includes(e.message)?e.message:'browser_link_unavailable');}
 }
 async start(){if(this.profile.enabled)try{await this.enable();}catch(e){this.error=e.message;this.emit('state');}}
 async pairingCode(){await this.enable();return JSON.stringify({version:1,endpoint:'http://127.0.0.1:'+this.profile.port,token:this.key});}
 async resetPairing(){await this.enable();const prior={...this.profile},key=crypto.randomBytes(32).toString('base64url'),cipher=this.storage.encryptString(key).toString('base64');this.profile={...this.profile,cipher,clientRef:null};try{this.save();}catch(e){this.profile=prior;throw e;}this.key=key;this.rotate();this.lastSeen=0;for(const id of PROVIDERS)if(this.providers[id]?.configured)this.emit('unavailable',id,'browser_offline');this.providers={};this.emit('state');return this.pairingCode();}
 disable(){const prior={...this.profile};this.profile.enabled=false;try{this.save();}catch(e){this.profile=prior;throw e;}this.close();for(const id of PROVIDERS)if(this.providers[id]?.configured)this.emit('unavailable',id,'browser_offline');this.emit('state');}
 close(){clearInterval(this.health);this.server?.closeAllConnections();this.server?.close();this.server=null;this.key=null;this.lastSeen=0;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('browser_offline'));}this.pending.clear();}
 requestRead(provider,{manual=false}={}){
  this.syncPause();if(this.suspended||this.wasPaused&&!manual)return Promise.reject(Error('browser_offline'));
  const state=this.state();if(!PROVIDERS.includes(provider)||!state.enabled||!state.paired||!state.connected||!state.providers[provider].configured)return Promise.reject(Error('browser_setup_required'));
  if(this.pending.has(provider)){const p=this.pending.get(provider);if(manual)p.command.manual=true;return p.promise;}
  const command={id:crypto.randomBytes(16).toString('hex'),provider,manual:manual===true};let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});
  const timer=setTimeout(()=>{this.pending.delete(provider);reject(Error('timeout'));},90000);this.pending.set(provider,{command,promise,resolve,reject,timer});return promise;
 }
 async handle(req,res){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':this.origin,'Vary':'Origin'});res.end(JSON.stringify(data));};
  const origin=req.headers.origin;if(req.headers.host!=='127.0.0.1:'+this.profile.port||origin&&origin!==this.origin)return send(403,{error:'forbidden'});
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':this.origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Codex-Gauge','Access-Control-Allow-Private-Network':'true','Vary':'Origin'});return res.end();}
  const expected=Buffer.from('Bearer '+this.key),actual=Buffer.from(String(req.headers.authorization||''));
  if(req.method!=='POST'||!this.key||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected)||req.headers['x-codex-gauge']!=='1'||req.headers['content-type']!=='application/json')return send(401,{error:'unauthorized'});
  if(!['/v1/poll','/v1/reading','/v1/failure'].includes(req.url))return send(404,{error:'not_found'});
  const authorizedKey=this.key,authorizedEpoch=this.boot,authorizedServer=this.server;
  try{
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)return send(413,{error:'too_large'});chunks.push(chunk);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   this.syncPause();if(!this.server||this.server!==authorizedServer||this.key!==authorizedKey||this.boot!==authorizedEpoch)return send(409,{error:'reconnect'});
   const allowed=req.url==='/v1/poll'?['clientId','configured','manualProvider','refreshProvider']:req.url==='/v1/reading'?['clientId','boot','provider','amount','marker','observedAt','commandId']:['clientId','boot','provider','error','commandId'];
   if(!data||Array.isArray(data)||Object.keys(data).some(k=>!allowed.includes(k))||!/^[a-f0-9-]{36}$/.test(data.clientId||''))throw Error('invalid_response');
   const ref=hash(data.clientId);if(this.profile.clientRef&&ref!==this.profile.clientRef)return send(403,{error:'wrong_client'});
   if(req.url==='/v1/poll'){
    if(!Array.isArray(data.configured)||data.configured.some(id=>!PROVIDERS.includes(id))||data.configured.length>2)throw Error('invalid_response');
    if(data.manualProvider!=null&&(!PROVIDERS.includes(data.manualProvider)||!data.configured.includes(data.manualProvider)))throw Error('invalid_response');
    if(data.refreshProvider!=null&&(data.refreshProvider!=='tapnow'||!data.configured.includes(data.refreshProvider)))throw Error('invalid_response');
    if(!this.profile.clientRef){this.profile.clientRef=ref;try{this.save();}catch(e){this.profile.clientRef=null;throw e;}}const priorConnected=this.lastSeen>this.now()-75000;this.lastSeen=this.now();
    for(const id of PROVIDERS){const old=this.providers[id]?.configured;this.providers[id]={...this.providers[id],configured:data.configured.includes(id)};if(old&&!data.configured.includes(id)){this.cancel(id,'page_closed');this.emit('unavailable',id,'page_closed');}else if(!old&&data.configured.includes(id)||!priorConnected&&data.configured.includes(id))this.emit('connected',id);}
    if(data.manualProvider)this.requestRead(data.manualProvider,{manual:true}).catch(()=>{});
    if(data.refreshProvider&&!this.wasPaused&&!this.suspended){const p=this.providers[data.refreshProvider];if(!p.requestedAt||this.now()-p.requestedAt>=30000){p.requestedAt=this.now();this.requestRead(data.refreshProvider).catch(()=>{});}}
    this.emit('state');return send(200,{boot:this.boot,paused:this.suspended||this.wasPaused,commands:this.suspended?[]:[...this.pending.values()].map(p=>p.command).filter(c=>!this.wasPaused||c.manual)});
   }
   if(!this.profile.clientRef||data.boot!==this.boot)return send(409,{error:'reconnect'});
   if(!PROVIDERS.includes(data.provider))throw Error('invalid_response');this.lastSeen=this.now();
   const pending=this.pending.get(data.provider);if(!data.commandId||data.commandId!==pending?.command.id||this.suspended||this.wasPaused&&!pending.command.manual)return send(409,{error:'stale_command'});
   if(req.url==='/v1/failure'){
    const error=['login_required','page_closed','selection_changed','browser_offline'].includes(data.error)?data.error:'invalid_response';this.providers[data.provider]={...this.providers[data.provider],error};this.emit('unavailable',data.provider,error);if(pending){clearTimeout(pending.timer);this.pending.delete(data.provider);pending.reject(Error(error));}this.emit('state');return send(200,{ok:true});
   }
   const previousAt=this.providers[data.provider]?.readAt||0;if(data.observedAt<=previousAt)return send(409,{error:'old_reading'});
   const record=browserRecord(data,ref,this.now());await this.receive(record,{manual:pending.command.manual});this.providers[data.provider]={...this.providers[data.provider],configured:true,error:null,readAt:record.fetchedAt};if(pending){clearTimeout(pending.timer);this.pending.delete(data.provider);pending.resolve([record]);}this.emit('state');return send(200,{ok:true});
  }catch(e){return send(e.message==='storage_failed'?503:400,{error:'invalid_reading'});}
 }
}
module.exports={BrowserLink,browserRecord,extensionId};
