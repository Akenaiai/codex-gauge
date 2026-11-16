'use strict';
const {hash}=require('./catalog.cjs');
const {fresh}=require('./credit-model.cjs');
const {readOnlyMcp}=require('./codex-mcp-credit.cjs');
const {officialServer}=require('./creative-providers.cjs');
const ENDPOINT='https://mcp.tapnow.ai/api/agent-gateway/mcp/general/mcp';
function tapnowRecord(data,server='tapnow',now=Date.now()){
  if(data?.kind!=='tapnow.tapies_balance.v1'||data.unit!=='tapies')throw Error('invalid_response');
  const amounts=[data.spendable_tapies,data.wallet?.available,data.wallet?.on_hold,data.wallet?.total];
  if(amounts.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e12))throw Error('invalid_balance');
  const [spendable,available,held,total]=amounts;
  if(spendable>available+1e-6||Math.abs(available+held-total)>1e-6)throw Error('invalid_balance');
  // The response contains no stable user/team identity or credit-batch expiry.
  // Do not infer either from plan names, billing dates, or a previous browser marker.
  return{provider:'tapnow',scope:'tapnow-mcp:'+hash(server),account:'TapNow MCP',source:'mcp',identityVerified:false,fetchedAt:now,
    pools:[{id:'effective',amount:spendable,unit:'credits',label:'可支配 Tapies',labelEn:'Spendable Tapies'}]};
}
async function tapnow(options={}){
  const server=officialServer('tapnow',ENDPOINT,options);
  return readOnlyMcp(server,['get_tapies_balance'],async call=>[tapnowRecord(await call('get_tapies_balance'),server)],options);
}
function visibleRecords(records,now=Date.now()){
  const automatic=records.filter(r=>r.provider==='tapnow'&&['mcp','browser'].includes(r.source)&&r.status!=='account_changed');
  const selected=automatic.find(r=>r.source==='mcp'&&fresh(r,now))||automatic.find(r=>r.source==='browser'&&fresh(r,now))||automatic.slice().sort((a,b)=>b.fetchedAt-a.fetchedAt)[0];
  // Retain raw history, but never present two unverified sources as additive wallets.
  return records.filter(r=>r.provider!=='tapnow'||!['mcp','browser'].includes(r.source)||r===selected);
}
module.exports={ENDPOINT,tapnow,tapnowRecord,visibleRecords};
