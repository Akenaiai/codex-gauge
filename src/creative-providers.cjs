'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {entriesToml,canonical,findExecutable,hash}=require('./catalog.cjs');
const {value}=require('./credit-model.cjs'),{readOnlyMcp}=require('./codex-mcp-credit.cjs');
const {parseString}=require('./credit-credentials.cjs');
function payload(result){
  if(result?.isError||result?.ok===false)throw Error('query_failed');
  if(result?.structuredContent)return result.structuredContent;
  if(Array.isArray(result?.content)){try{return JSON.parse(result.content.find(c=>c.type==='text').text);}catch{throw Error('invalid_response');}}
  return result;
}
function identity(input){const x=input?.userId??input?.user_id??input?.user?.id??input?.id;return typeof x==='string'&&x.length>0&&x.length<180||Number.isSafeInteger(x)&&x>0?String(x):null;}
function amount(input,keys){for(const k of keys)if(input?.[k]!=null){const n=value(input[k]);if(n!=null)return n;}throw Error('invalid_response');}
function recraftRecord(before,after,server='recraft'){
  const a=identity(before),b=identity(after);if(a!==b)throw Error('account_changed');
  // Only explicit credit fields from the hosted subscription MCP are accepted.
  const n=amount(after,['credits','credits_balance']);
  return{provider:'recraft',scope:'recraft-mcp:'+hash(server)+':'+(b?hash(b):'unverified'),account:'Recraft MCP'+(typeof after.plan==='string'?' · '+after.plan.slice(0,50):''),identityVerified:!!b,source:'mcp',fetchedAt:Date.now(),pools:[{id:'effective',amount:n,unit:'credits',resource:'image',label:'账户可用积分',labelEn:'Account credits'}]};
}
function officialServer(provider,url,options={}){
  const home=options.home||os.homedir();let entries=[],config='';try{config=fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8');entries=entriesToml(config);}catch{}
  const names=entries.filter(e=>e.kind==='mcp'&&e.enabled&&canonical(e.name)===provider).map(e=>e.name);
  if(names.length!==1)throw Error(names.length?'invalid_response':'login_required');
  let section=null,actual=null;for(const line of config.split(/\r?\n/)){
    if(/^\s*\[/.test(line)){const m=line.match(/^\s*\[mcp_servers\.(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\.\]\s]+))\]\s*(?:#.*)?$/);section=m&&(m[1]||m[2]||m[3]);}
    else if(section===names[0]&&/^\s*url\s*=/.test(line))actual=parseString(line.slice(line.indexOf('=')+1));
  }
  if(actual!==url)throw Error('query_failed');return names[0];
}
function recraftResponse(result){
  if(result?.isError)throw Error('query_failed');
  if(result?.structuredContent!=null)throw Error('invalid_response');
  const texts=(result?.content||[]).filter(c=>c.type==='text').map(c=>c.text);
  if(texts.length!==1||result.content.length!==1)throw Error('invalid_response');
  // The official hosted server currently returns a human-readable personal-account summary.
  // Select only the explicitly active account, never another account's listed balance.
  const text=texts.join('\n'),id=text.match(/^User ID:\s*(\S{1,180})\s*$/m)?.[1];
  const number='((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
  const active=text.match(new RegExp('^Active account: your personal account\\. You have '+number+' credits left there\\.\\s*$','m'));
  const account=text.match(new RegExp('^- Personal account: '+number+' credits, plan ([A-Za-z0-9][A-Za-z0-9 _+-]{0,48}) \\(active\\)\\s*$','m'));
  if(!id||!active||!account||active[1].replaceAll(',','')!==account[1].replaceAll(',',''))throw Error('invalid_response');
  return{id:id+':personal',credits:value(active[1].replaceAll(',','')),plan:account[2]};
}
async function recraft(options={}){
  const server=officialServer('recraft','https://mcp.recraft.ai/mcp',options);
  return readOnlyMcp(server,['get_user'],async call=>[recraftRecord(await call('get_user'),await call('get_user'),server)],{...options,decodeResponse:recraftResponse});
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
async function runway(options={}){
  const server=officialServer('runway','https://mcp.runwayml.com/mcp',options);
  return readOnlyMcp(server,['whoami'],async call=>[runwayRecord(await call('whoami'),await call('whoami'),'codex-mcp:'+server)],options);
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
function klingRecord(before,after,source='cli',server='kling'){
  const a=identity(before),b=identity(after);if(a!==b)throw Error('account_changed');
  const n=amount(after,['availableRemainCredits','available_credits','available_points','credits']),plan=typeof after.membershipTypeDescription==='string'?after.membershipTypeDescription.slice(0,50):'';
  return{provider:'kling',scope:'kling-'+source+':'+hash(server)+':'+(b?hash(b):'unverified'),account:(source==='mcp'?'Kling MCP':'Kling CLI')+(plan?' · '+plan:''),identityVerified:!!b,source,fetchedAt:Date.now(),pools:[{id:'effective',amount:n,unit:'credits',resource:'video',label:'个人空间付费灵感值',labelEn:'Personal paid credits'}]};
}
async function kling(options={}){
  let server;try{server=officialServer('kling','https://klingai.com/mcp',options);}catch(e){if(e.message!=='login_required')throw e;const launch=klingLaunch(options),read=options.klingRead||klingRead;return[klingRecord(await read(launch,options),await read(launch,options))];}
  return readOnlyMcp(server,['query_membership_and_credits'],async call=>[klingRecord(await call('query_membership_and_credits'),await call('query_membership_and_credits'),'mcp',server)],options);
}
module.exports={runway,runwayRecord,recraft,recraftRecord,recraftResponse,officialServer,kling,klingRecord,klingLaunch,klingRead};
