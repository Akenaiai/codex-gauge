'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {entriesToml}=require('./catalog.cjs');
const {Rpc,findCli}=require('./cli.cjs');
const {value}=require('./credit-model.cjs');
async function lovart({home=os.homedir(),rpcFactory=()=>new Rpc(findCli())}={}){
  let entries;
  try{entries=entriesToml(fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8'));}catch{throw new Error('cli_missing');}
  if(!entries.some(e=>e.kind==='mcp'&&e.name==='lovart'&&e.enabled))throw new Error('login_required');
  const mcp=Object.fromEntries(entries.filter(e=>e.kind==='mcp').map(e=>[e.name,{enabled:e.name==='lovart'&&e.enabled}]));
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
      const status=await rpc.call('mcpServerStatus/list',{threadId,serverName:'lovart',detail:'toolsAndAuthOnly'},45000);
      server=status.data?.find(s=>s.name==='lovart');
      if(server?.runtimeStatus==='connected'&&server.tools?.get_credits)break;
      if(['authenticationRequired','disabled','failed','cancelled'].includes(server?.runtimeStatus))break;
      await new Promise(resolve=>setTimeout(resolve,600));
    }while(Date.now()<deadline);
    if(server?.runtimeStatus!=='connected'||!server.tools?.get_credits){const error=new Error(server?.runtimeStatus==='authenticationRequired'||server?.authStatus==='notLoggedIn'?'login_required':'query_failed');error.connectionState={auth:server?.authStatus||'unknown',runtime:server?.runtimeStatus||'unknown'};throw error;}
    const response=await rpc.call('mcpServer/tool/call',{threadId,server:'lovart',tool:'get_credits',arguments:{}},45000);
    if(response.isError)throw new Error('query_failed');
    let data=response.structuredContent;
    if(!data)try{data=JSON.parse(response.content.find(c=>c.type==='text').text);}catch{throw new Error('invalid_response');}
    if(data.credits==null)throw new Error('invalid_response');
    return[{provider:'lovart',scope:'codex-mcp:lovart',account:'Codex OAuth',source:'mcp',identityVerified:false,fetchedAt:Date.now(),
      pools:[{id:'effective',label:'可用积分',labelEn:'Available credits',amount:value(data.credits),unit:'credits'}]}];
  }finally{rpc.stop();}
}
module.exports={lovart};
