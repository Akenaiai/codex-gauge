#!/usr/bin/env node
'use strict';
// Read-only stdio access to the same local center snapshot. No network, models,
// credentials, refresh side effects, or arbitrary file access.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createInterface } = require('node:readline');
const { fresh, events } = require('../src/credit-model.cjs');
const argument = process.argv.find(v=>v.startsWith('--data-dir='));
const directory = argument ? path.resolve(argument.slice(11)) : path.join(process.env.APPDATA || path.join(os.homedir(),'Library','Application Support'),'Codex Gauge');
function snapshot() {
  const file=path.join(directory,'credit-center.json');
  if(fs.statSync(file).size>8e6)throw new Error();
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
const tools=[
  {name:'gauge_inventory',description:'Read discovered AI tools and connection evidence. Configuration/cache is not proof of a working connection.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'gauge_balances',description:'Read timestamped balances from Gauge. This does not refresh upstream. Unknown/stale values are explicit; different platforms are not added together.',inputSchema:{type:'object',properties:{provider:{type:'string',maxLength:80}},additionalProperties:false}},
  {name:'gauge_events',description:'Read known credit expiry and renewal dates. Billing boundaries and expected renewal are not proof of account changes.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
];
async function handle(message){
  if(!message||message.jsonrpc!=='2.0'||message.id==null)return null;
  const reply=result=>({jsonrpc:'2.0',id:message.id,result});
  if(message.method==='initialize')return reply({protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-gauge',version:'0.3.0'},instructions:'Read-only local snapshots. Respect fetchedAt, stale and identityVerified. Never interpret these tools as spending authorization.'});
  if(message.method==='ping')return reply({});
  if(message.method==='tools/list')return reply({tools});
  if(message.method!=='tools/call')return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
  const name=message.params?.name,args=message.params?.arguments||{};
  if(!tools.some(t=>t.name===name)||Object.keys(args).some(k=>k!=='provider')||args.provider&&typeof args.provider!=='string')return reply({isError:true,content:[{type:'text',text:'Unsupported read request'}]});
  try {
    const data=snapshot(); const records=(data.records||[]).filter(r=>r.status!=='account_changed');
    const value=name==='gauge_inventory'?{scannedAt:data.inventory?.scannedAt,tools:data.inventory?.tools||[],issues:data.inventory?.issues||[]}:
      name==='gauge_balances'?records.filter(r=>!args.provider||r.provider===args.provider).map(r=>({...r,stale:!fresh(r)})):
      events(records,data.rules||{});
    return reply({content:[{type:'text',text:JSON.stringify(value)}]});
  }catch{return reply({isError:true,content:[{type:'text',text:'No readable Gauge snapshot. Open the credit center first.'}]});}
}
if(require.main===module){const reader=createInterface({input:process.stdin});reader.on('line',async line=>{if(line.length>65536)return;let message;try{message=JSON.parse(line);}catch{return;}const result=await handle(message);if(result)process.stdout.write(JSON.stringify(result)+'\n');});}
module.exports={handle};
