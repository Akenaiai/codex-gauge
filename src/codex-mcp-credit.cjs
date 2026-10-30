'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {entriesToml,hash}=require('./catalog.cjs');
const {Rpc,findCli}=require('./cli.cjs');
const {value}=require('./credit-model.cjs');
async function readOnlyMcp(serverName,allowed,read,{home=os.homedir(),rpcFactory=()=>new Rpc(findCli())}={}){
  let entries;
  try{entries=entriesToml(fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8'));}catch{throw new Error('cli_missing');}
  if(!entries.some(e=>e.kind==='mcp'&&e.name===serverName&&e.enabled))throw new Error('login_required');
  const mcp=Object.fromEntries(entries.filter(e=>e.kind==='mcp').map(e=>[e.name,{enabled:e.name===serverName&&e.enabled}]));
  const plugins=Object.fromEntries(entries.filter(e=>e.kind==='plugin').map(e=>[e.name,{enabled:false}]));
  const rpc=rpcFactory();rpc.start();
  try{
    await rpc.call('initialize',{clientInfo:{name:'codex_gauge_credits',version:'0.3.0'},capabilities:{experimentalApi:true}});rpc.notify('initialized');
    // An ephemeral, non-inference context: no turn/start, messages, persisted
    // user chat, or arbitrary MCP tool calls. Other MCPs/plugins are disabled
    // only in this context, never in the user's config.
    const result=await rpc.call('thread/start',{ephemeral:true,cwd:os.tmpdir(),config:{mcp_servers:mcp,plugins}},60000);
    const threadId=result?.thread?.id;if(typeof threadId!=='string')throw new Error('invalid_response');
    let server;const deadline=Date.now()+40000;
    do{
      const status=await rpc.call('mcpServerStatus/list',{threadId,serverName,detail:'toolsAndAuthOnly'},45000);
      server=status.data?.find(s=>s.name===serverName);
      if(server?.runtimeStatus==='connected'&&Object.keys(server.tools||{}).length)break;
      if(['authenticationRequired','disabled','failed','cancelled'].includes(server?.runtimeStatus))break;
      await new Promise(resolve=>setTimeout(resolve,600));
    }while(Date.now()<deadline);
    if(server?.runtimeStatus!=='connected'||!allowed.every(tool=>server.tools?.[tool])){const error=new Error(server?.runtimeStatus==='authenticationRequired'||server?.authStatus==='notLoggedIn'?'login_required':'query_failed');error.connectionState={auth:server?.authStatus||'unknown',runtime:server?.runtimeStatus||'unknown'};throw error;}
    const call=async tool=>{
      if(!allowed.includes(tool))throw new Error('query_failed');
      const response=await rpc.call('mcpServer/tool/call',{threadId,server:serverName,tool,arguments:{}},45000);
      if(response.isError)throw new Error('query_failed');
      if(response.structuredContent)return response.structuredContent;
      try{return JSON.parse(response.content.find(c=>c.type==='text').text);}catch{throw new Error('invalid_response');}
    };
    return await read(call);
  }finally{rpc.stop();}
}
async function lovart(options){return readOnlyMcp('lovart',['get_credits'],async call=>{const data=await call('get_credits');if(data.credits==null)throw new Error('invalid_response');return[{provider:'lovart',scope:'codex-mcp:lovart',account:'Codex OAuth',source:'mcp',identityVerified:false,fetchedAt:Date.now(),pools:[{id:'effective',label:'可用积分',labelEn:'Available credits',amount:value(data.credits),unit:'credits'}]}];},options);}
function sunoRecord(profile,usage,after){
  const handle=p=>typeof p?.handle==='string'&&p.handle.trim()&&p.handle.length<=100?p.handle.trim():null;
  const identity=handle(profile);if(!identity||identity!==handle(after))throw new Error('account_changed');
  const s=usage?.suno_account;if(!s||s.credits_remaining==null)throw new Error('invalid_response');
  // The subscription renewal is a billing boundary, not a credit-expiry/grant assertion.
  const billing=typeof s.renews_on==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s.renews_on)?Date.parse(s.renews_on):null;
  const pools=[{id:'song_credits',label:'歌曲生成积分',labelEn:'Song-generation credits',amount:value(s.credits_remaining),unit:'credits',resource:'music',periodEnd:Number.isSafeInteger(billing)&&billing>0?billing:null}];
  if(s.download_credits_remaining!=null)pools.push({id:'download_credits',label:'下载额度',labelEn:'Download credits',amount:value(s.download_credits_remaining),unit:'credits',resource:'downloads'});
  return{provider:'suno',scope:'codex-mcp:suno:'+hash(identity),account:'Suno MCP',source:'mcp',identityVerified:false,fetchedAt:Date.now(),pools};
}
async function suno(options){return readOnlyMcp('suno',['account-me','account-usage'],async call=>{const before=await call('account-me'),usage=await call('account-usage'),after=await call('account-me');return[sunoRecord(before,usage,after)];},options);}
module.exports={lovart,suno,sunoRecord};
