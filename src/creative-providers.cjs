'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {Rpc,findCli}=require('./cli.cjs'),{entriesToml,canonical,findExecutable,hash}=require('./catalog.cjs');
const {value}=require('./credit-model.cjs'),{readOnlyMcp}=require('./codex-mcp-credit.cjs');
const {parseString}=require('./credit-credentials.cjs');
const rationale='Read-only credit balance refresh for Codex Gauge; no generation, purchases or workspace changes.';
function payload(result){
  if(result?.isError||result?.ok===false)throw Error('query_failed');
  if(result?.structuredContent)return result.structuredContent;
  if(Array.isArray(result?.content)){try{return JSON.parse(result.content.find(c=>c.type==='text').text);}catch{throw Error('invalid_response');}}
  return result;
}
function identity(input){const x=input?.user_id??input?.user?.id??input?.id;return typeof x==='string'&&x.length>0&&x.length<180||Number.isSafeInteger(x)&&x>0?String(x):null;}
function amount(input,keys){for(const k of keys)if(input?.[k]!=null){const n=value(input[k]);if(n!=null)return n;}throw Error('invalid_response');}
function recraftRecord(before,after,server='recraft'){
  const a=identity(before),b=identity(after);if(a!==b)throw Error('account_changed');
  // Only explicit credit fields from the hosted subscription MCP are accepted.
  const n=amount(after,['credits','credits_balance']);
  return{provider:'recraft',scope:'recraft-mcp:'+hash(server)+':'+(b?hash(b):'unverified'),account:'Recraft MCP',identityVerified:!!b,source:'mcp',fetchedAt:Date.now(),pools:[{id:'effective',amount:n,unit:'credits',resource:'image',label:'会员可用积分',labelEn:'Subscription credits'}]};
}
async function recraft(options={}){
  const home=options.home||os.homedir();let entries=[],config='';try{config=fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8');entries=entriesToml(config);}catch{}
  const names=entries.filter(e=>e.kind==='mcp'&&e.enabled&&canonical(e.name)==='recraft').map(e=>e.name);
  if(names.length!==1)throw Error(names.length?'invalid_response':'login_required');
  // The API-key/local MCP bills API units, independently of Studio subscriptions.
  let section=null,url=null;for(const line of config.split(/\r?\n/)){
    if(/^\s*\[/.test(line)){const m=line.match(/^\s*\[mcp_servers\.(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\.\]\s]+))\]\s*(?:#.*)?$/);section=m&&(m[1]||m[2]||m[3]);}
    else if(section===names[0]&&/^\s*url\s*=/.test(line))url=parseString(line.slice(line.indexOf('=')+1));
  }
  if(url!=='https://mcp.recraft.ai/mcp')throw Error('query_failed');
  return readOnlyMcp(names[0],['get_user'],async call=>[recraftRecord(await call('get_user'),await call('get_user'),names[0])],options);
}
function runwayRecord(before,after,link){
  const team=x=>typeof x?.team?.id==='string'||Number.isSafeInteger(x?.team?.id)?String(x.team.id):null;
  if(before?.authenticated!==true||after?.authenticated!==true)throw Error('login_required');
  const id=team(before);if(!id||id!==team(after))throw Error('account_changed');
  const c=after.credits;if(!c||c.unlimited!==false)throw Error('invalid_response');
  const total=amount(c,['total']),plan=amount(c,['plan']),purchased=amount(c,['purchased']);
  if(Math.abs(total-plan-purchased)>0.000001)throw Error('invalid_balance');
  return{provider:'runway',scope:'runway-mcp:'+hash(link)+':'+hash(id),connectionRef:hash(link),account:typeof after.team.name==='string'?after.team.name.slice(0,100):'Runway MCP',identityVerified:true,source:'mcp',fetchedAt:Date.now(),pools:[
    {id:'effective',amount:total,unit:'credits',label:'可用积分合计',labelEn:'Available credits'},
    {id:'subscription',amount:plan,unit:'credits',poolType:'subscription',label:'套餐积分',labelEn:'Plan credits'},
    {id:'purchased',amount:purchased,unit:'credits',poolType:'purchased',label:'购买积分',labelEn:'Purchased credits'}]};
}
function runwayLinks(tool){
  const schema=tool?.inputSchema||tool?.input_schema,field=schema?.properties?.link_id;if(!field)throw Error('invalid_response');
  const values=Array.isArray(field.enum)?field.enum:[...(String(field.description||'').matchAll(/"link_id"\s*:\s*"(link_[a-f0-9]{32})"/g))].map(m=>m[1]);
  const links=[...new Set(values)];if(!links.length||links.length>10||links.some(v=>!/^link_[a-f0-9]{32}$/.test(v)))throw Error('invalid_response');return links;
}
async function runway({home=os.homedir(),rpcFactory=()=>new Rpc(findCli())}={}){
  let entries;try{entries=entriesToml(fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8'));}catch{throw Error('cli_missing');}
  const rpc=rpcFactory();rpc.start();try{
    await rpc.call('initialize',{clientInfo:{name:'codex_gauge_credits',version:'0.3.12'},capabilities:{experimentalApi:true}});rpc.notify('initialized');
    // Use the committed installed snapshot; app/list is a different discovery endpoint.
    const apps=await rpc.call('app/installed',{forceRefresh:false},20000),app=apps.apps?.find(a=>a.runtimeName==='Runway'&&a.enabled&&a.callable);
    if(!app||typeof app.id!=='string')throw Error('login_required');
    const plugins=Object.fromEntries(entries.filter(e=>e.kind==='plugin').map(e=>[e.name,{enabled:false}]));
    // Connector and plugin ids use the same public app suffix, not account credentials.
    if(/^asdk_app_[a-f0-9]{32}$/.test(app.id))plugins[app.id.replace(/^asdk_/,'')+'@openai-curated-remote']={enabled:true};
    const result=await rpc.call('thread/start',{ephemeral:true,cwd:os.tmpdir(),config:{mcp_servers:Object.fromEntries(entries.filter(e=>e.kind==='mcp').map(e=>[e.name,{enabled:false}])),plugins,features:{apps:true},apps:{_default:{enabled:false},[app.id]:{enabled:true}}}},45000);
    const threadId=result.thread?.id;if(typeof threadId!=='string')throw Error('invalid_response');
    const status=await rpc.call('mcpServerStatus/list',{threadId,serverName:'codex_apps',detail:'toolsAndAuthOnly',limit:100},45000),server=status.data?.find(s=>s.name==='codex_apps');
    if(server?.runtimeStatus!=='connected')throw Error(server?.authStatus==='notLoggedIn'?'login_required':'query_failed');
    const tool=server.tools?.runway_whoami;if(!tool)throw Error('query_failed');
    const rows=[];let failure='login_required';
    for(const link of runwayLinks(tool))try{
      const call=async()=>payload(await rpc.call('mcpServer/tool/call',{threadId,server:'codex_apps',tool:'runway_whoami',arguments:{link_id:link,rationale}},30000));
      rows.push(runwayRecord(await call(),await call(),link));
    }catch(e){failure=['login_required','invalid_response','invalid_balance','account_changed','timeout'].includes(e.message)?e.message:'query_failed';}
    if(!rows.length)throw Error(failure);return rows;
  }finally{rpc.stop();}
}
function klingLaunch(options={}){
  const exe=findExecutable('kling',options);if(!exe)throw Error('cli_missing');if(!/\.(?:cmd|ps1|bat)$/i.test(exe))return{executable:exe,prefix:[]};
  const file=path.join(path.dirname(exe),'node_modules/@klingai/cli-cn/dist/cli.js');if(!fs.existsSync(file))throw Error('cli_missing');
  return{executable:process.execPath,prefix:[file]};
}
function klingRead(launch,{env=process.env}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(launch.executable,[...launch.prefix,'account','--quiet'],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],cwd:os.tmpdir()});let out='',err='',done=false;
    const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);child.kill();error?reject(Error(error)):resolve(data);};
    const timer=setTimeout(()=>finish('timeout'),25000);
    child.stdout.on('data',b=>{out+=b;if(Buffer.byteLength(out)>2e6)finish('invalid_response');});child.stderr.on('data',b=>{if(err.length<16000)err+=b;});
    child.once('error',()=>finish('cli_missing'));child.once('exit',code=>{
      if(code!==0)return finish(/invalid_grant|登录|refresh token|unauthorized|not.*logged/i.test(err)?'login_required':'query_failed');
      try{const r=JSON.parse(out);if(r.ok!==true)throw Error();finish(null,payload(r.body));}catch{finish('invalid_response');}
    });
  });
}
function klingRecord(before,after){
  const a=identity(before),b=identity(after);if(a!==b)throw Error('account_changed');
  const n=amount(after,['available_credits','available_points','credits']);
  return{provider:'kling',scope:'kling-cli:'+(b?hash(b):'unverified'),account:'Kling CLI',identityVerified:!!b,source:'cli',fetchedAt:Date.now(),pools:[{id:'effective',amount:n,unit:'credits',resource:'video',label:'个人空间付费灵感值',labelEn:'Personal paid credits'}]};
}
async function kling(options={}){const launch=klingLaunch(options),read=options.klingRead||klingRead;return[klingRecord(await read(launch,options),await read(launch,options))];}
module.exports={runway,runwayRecord,runwayLinks,recraft,recraftRecord,kling,klingRecord,klingLaunch,klingRead};
