'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { scan, providers, canonical, hash } = require('./catalog.cjs');
const { CreditStore } = require('./credit-store.cjs');
const { cleanRecord, fresh, validateRule, events, expiryAlerts, recoveryAlerts, renewalAlerts } = require('./credit-model.cjs');
const adapters = require('./credit-adapters.cjs');
const {configuredKey}=require('./credit-credentials.cjs');
const {policyFor,enrichSchedules}=require('./credit-policies.cjs');
const {cleanObservations,observationEvents,observationAlerts,applyMonthlyRules,validateMonthlyRule}=require('./credit-date-observations.cjs');
const {validateUserDate,cleanUserDates,activeUserDates,userDateEvents,userDateAlerts}=require('./credit-user-dates.cjs');
const errors = ['cli_missing','login_required','account_changed','timeout','query_failed','invalid_response','invalid_balance','rate_limited','relay_unavailable','storage_failed','credential_storage_failed','invalid_credential'];
const safeError = e => errors.includes(e?.message) ? e.message : 'query_failed';
class CreditCenter extends EventEmitter {
  constructor(directory, options = {}) {
    super(); const existingInstallation=['credit-center.json','settings.json'].some(file=>fs.existsSync(path.join(directory,file)));this.store = new CreditStore(directory); this.options = options; this.busy = new Set(); this.statuses = {}; this.stopped = false; this.generation = 0;
    this.providerEpoch=new Map();this.queryRuns=new Map();this.connectRuns=new Map();this.connecting=new Set();
    const data = this.store.data;
    this.records = [];
    this.dateObservations=cleanObservations(data.dateObservations);
    this.userDates=cleanUserDates(data.userDates);
    this.onboardingCompleted=data.onboardingCompleted===true||data.onboardingCompleted==null&&(existingInstallation||data.records.length>0||this.dateObservations.length>0);
    this.monthlySchedules={};
    for(const [key,rule]of Object.entries(data.monthlySchedules||{}))if(this.dateObservations.some(o=>['lovart','xyq','jimeng'].includes(o.provider)&&o.items.some(p=>key===o.id+'/'+p.id&&['monthly','subscription'].includes(p.id)&&p.kind!=='never')))try{this.monthlySchedules[key]=validateMonthlyRule(rule);}catch{}
    for (const r of Array.isArray(data.records) ? data.records : []) try {
      if (r.id !== r.provider + ':' + r.scope || !/^[a-f0-9]{20}$/.test(r.scope)) continue;
      const clean = cleanRecord({ ...r, scope: r.scope });
      this.records.push(enrichSchedules({ ...clean, id: r.id, scope: r.scope, status: ['ready','offline','account_changed','stale'].includes(r.status) ? r.status : 'offline', error: r.error ? 'query_failed' : null }));
    } catch { }
    this.customTools = data.customTools && typeof data.customTools === 'object' && !Array.isArray(data.customTools) ? data.customTools : {};
    this.rules = {};
    this.snapshotBindings={};
    for(const [hostId,apiId]of Object.entries(data.snapshotBindings||{}))if(this.records.some(r=>r.id===hostId&&r.source==='host')&&this.records.some(r=>r.id===apiId&&r.source==='api'))this.snapshotBindings[hostId]=apiId;
    for (const [key, rule] of Object.entries(data.rules || {})) if (this.records.some(r => r.pools.some(p => key === r.id + '/' + p.id))) try { this.rules[key] = validateRule(rule); } catch { }
    this.notices = Array.isArray(data.notices) ? data.notices.filter(e => (e?.kind === 'recovered'||e?.kind==='check_renewal'&&e.source==='policy') && Number.isFinite(e.at) && e.at > Date.now() - 7 * 86400000).slice(-100) : [];
    this.inventory = data.inventory && Array.isArray(data.inventory.tools) && data.inventory.tools.every(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&Array.isArray(t.connections)&&t.connections.every(c=>c&&typeof c.kind==='string'&&typeof c.source==='string'&&typeof c.label==='string')) ? data.inventory : { tools: [], sources: [], issues: [], scannedAt: null };
    for(const r of this.dateObservations)this.ensureObservationTool(r.provider);
    this.enabled = data.enabled !== false; this.reminders = data.reminders !== false;
  }
  persist() {
    Object.assign(this.store.data, { records: this.records, dateObservations:this.dateObservations,userDates:this.userDates,onboardingCompleted:this.onboardingCompleted,monthlySchedules:this.monthlySchedules,rules: this.rules, notices: this.notices, inventory: this.inventory, customTools:this.customTools,snapshotBindings:this.snapshotBindings, enabled: this.enabled, reminders: this.reminders });
    try { this.store.save(); } catch { this.store.error = 'storage_failed'; }
  }
  state() {
    const tools = this.inventory.tools.map(t => ({ ...t, adapter: ['codex','xyq','jimeng','firecrawl','deepseek','kimi','minimax','zai','lovart','tavily'].includes(t.id),policy:policyFor(t.id),canConnect:['firecrawl','tavily','deepseek'].includes(t.id),
      queryReady:t.id==='codex'?this.records.some(r=>r.provider==='codex'&&fresh(r)):['kimi','minimax','zai'].includes(t.id)?this.inventory.tools.some(t=>t.id==='agent-relay'):t.connections.some(c=>c.enabled&&(['installed','credential_reference'].includes(c.evidence)||t.id==='lovart'&&c.kind==='mcp'&&c.evidence==='configured')),
      userDates:activeUserDates(this.userDates.filter(o=>o.provider===t.id),this.records),recordedDates:userDateEvents(this.userDates.filter(o=>o.provider===t.id),this.records),
      dateObservations:applyMonthlyRules(this.dateObservations.filter(o=>o.provider===t.id),this.monthlySchedules),webDates:observationEvents(this.dateObservations.filter(o=>o.provider===t.id),Date.now(),this.monthlySchedules),querying: this.busy.has(t.id)||this.connecting.has(t.id) || ['kimi','minimax','zai'].includes(t.id) && this.busy.has('relay'), queryStatus: this.statuses[t.id] || null,
      records: this.records.filter(r => r.provider === t.id && r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r), rules: Object.fromEntries(Object.entries(this.rules).filter(([key]) => key.startsWith(r.id + '/'))) })) }));
    return { ...this.inventory, tools, onboardingCompleted:this.onboardingCompleted,enabled: this.enabled, reminders: this.reminders, busy: this.busy.size > 0||this.connecting.size>0,
      records: this.records.filter(r => r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r) })), rules: this.rules,
      events: [...events(this.records.filter(r => r.status !== 'account_changed'), this.rules),...observationEvents(this.dateObservations,Date.now(),this.monthlySchedules),...userDateEvents(this.userDates,this.records), ...this.notices].sort((a,b) => a.at-b.at),
      storageError: this.store.error, revision: this.store.data.revision };
  }
  rescan() {
    this.inventory = scan({ ...this.options, hostTools: this.store.hostInventory() });
    for(const id of ['firecrawl','tavily','deepseek'])if(configuredKey(id,this.options)||this.options.hasCredential?.(id)){this.ensureTool(id);const tool=this.inventory.tools.find(t=>t.id===id);if(!tool.connections.some(c=>c.evidence==='credential_reference'))tool.connections.push({kind:'api',source:'Existing local credential',label:id,enabled:true,evidence:'credential_reference'});}
    for (const row of this.records) this.ensureTool(row.provider);
    for(const row of this.userDates)this.ensureUserDateTool(row.provider);
    this.loadImports(); this.persist(); this.emit('state'); return this.state();
  }
  ensureTool(id) {
    if (!this.inventory.tools.some(t => t.id === id)) { const p = providers[id]; this.inventory.tools.push({ id, name: this.customTools[id]?.name || p?.name || id, category: p?.category || '其他工具', categoryEn: p?.categoryEn || 'Other tools', connections: [{ kind: 'api', source: 'Credit source', label: id, enabled: true, evidence: 'observed' }] }); }
  }
  loadImports() {
    const previous=JSON.stringify(this.dateObservations);
    this.dateObservations=cleanObservations([...this.dateObservations,...this.store.dateObservations()]);
    for(const r of this.dateObservations)this.ensureObservationTool(r.provider);
    if(previous!==JSON.stringify(this.dateObservations))this.persist();
    for (const input of this.store.imports().records || []) try {
      const r = cleanRecord({ ...input, source: 'host' });
      if(this.snapshotBindings[r.id]&&this.records.some(v=>v.id===this.snapshotBindings[r.id]&&v.status!=='account_changed'))continue;
      const old = this.records.find(v => v.id === r.id);
      if (old && old.fetchedAt >= r.fetchedAt) continue;
      this.put(r, false); this.ensureTool(r.provider);
    } catch { }
  }
  ensureObservationTool(id){const existing=this.inventory.tools.some(t=>t.id===id);this.ensureTool(id);const t=this.inventory.tools.find(t=>t.id===id);if(!existing)t.connections=[];if(!t.connections.some(c=>c.evidence==='web_observation'))t.connections.push({kind:'web',source:'Recorded account page',label:id,enabled:true,evidence:'web_observation'});}
  ensureUserDateTool(id){const existing=this.inventory.tools.some(t=>t.id===id);this.ensureTool(id);const tool=this.inventory.tools.find(t=>t.id===id);if(!existing)tool.connections=[];if(!tool.connections.some(c=>c.evidence==='user_dates'))tool.connections.push({kind:'manual',source:'User dates',label:id,enabled:true,evidence:'user_dates'});}
  completeOnboarding(){const old=this.onboardingCompleted;this.onboardingCompleted=true;this.persist();if(this.store.error){this.onboardingCompleted=old;this.store.data.onboardingCompleted=old;throw Error('storage_failed');}this.emit('state');}
  setUserDate(input){
    if(!input||!this.inventory.tools.some(t=>t.id===input.provider))throw Error('invalid_dates');
    const previous=this.userDates.find(row=>input.id?row.id===input.id:input.recordId&&row.recordId===input.recordId&&row.poolId===input.poolId);
    if(input.id&&!previous)throw Error('invalid_dates');
    const clean=validateUserDate({...input,anchorDate:previous?.monthlyDay===input.monthlyDay?previous.anchorDate:null});
    if(clean.recordId){const r=this.records.find(r=>r.id===clean.recordId&&r.provider===clean.provider&&r.status!=='account_changed'&&r.identityVerified),p=r?.pools.find(p=>p.id===clean.poolId);
      if(!p||p.unit==='cards'||p.entitlement==='not_in_plan')throw Error('identity_unverified');
      if(clean.monthlyDay&&(p.expiryStatus==='never'||/purchased|daily/i.test(p.id)))throw Error('invalid_dates');
      clean.account=r.account||clean.account;
    }
    const old=this.userDates.slice(),row={...clean,id:previous?.id||hash(require('node:crypto').randomUUID()),updatedAt:Date.now()};
    if(!previous&&old.length>=250)throw Error('invalid_dates');
    this.userDates=[...old.filter(r=>r.id!==row.id),row];this.persist();
    if(this.store.error){this.userDates=old;this.store.data.userDates=old;this.emit('state');throw Error('storage_failed');}this.emit('state');return row.id;
  }
  removeUserDate(id){const old=this.userDates;if(!old.some(r=>r.id===id))throw Error('invalid_dates');this.userDates=old.filter(r=>r.id!==id);this.persist();if(this.store.error){this.userDates=old;this.store.data.userDates=old;throw Error('storage_failed');}this.emit('state');}
  setMonthlyRule(observationId,itemId,rule){
    const o=this.dateObservations.find(o=>o.id===observationId),p=o?.items.find(p=>p.id===itemId);
    if(!o||!['lovart','xyq','jimeng'].includes(o.provider)||!p||!['monthly','subscription'].includes(p.id)||p.kind==='never')throw Error('invalid_monthly_rule');
    const key=o.id+'/'+p.id,previous={...this.monthlySchedules};this.monthlySchedules[key]=validateMonthlyRule(rule);this.persist();
    if(this.store.error){this.monthlySchedules=previous;this.emit('state');throw Error('storage_failed');}this.emit('state');
  }
  put(record, notify = true) {
    record=enrichSchedules(record);
    const previous = this.records.find(r => r.id === record.id);
    if (previous && previous.fetchedAt > record.fetchedAt) return;
    // Local CLI adapters represent one current login. Never remind for its old account.
    if (['cli','relay','api'].includes(record.source)) for (const old of this.records) if (old.provider === record.provider && old.source === record.source && old.id !== record.id) old.status = 'account_changed';
    const recovered = notify && previous ? recoveryAlerts(previous, record) : [];
    this.records = [...this.records.filter(r => r.id !== record.id), record].slice(-250);
    for (const event of recovered) {
      if (!this.notices.some(n => n.key === event.key)) this.notices.push(event);
      if (this.reminders && this.rules[event.recordId+'/'+event.poolId]?.notify !== false) this.emit('alert', event);
    }
    this.notices = this.notices.filter(e => e.at > Date.now() - 7*86400000).slice(-100);
  }
  updateCodex(state, accountKey) {
    if (!state.snapshot || !accountKey) {
      for (const r of this.records.filter(r => r.provider === 'codex')) r.status = state.status === 'account_changed' || state.status === 'login_required' ? 'account_changed' : 'offline';
      this.emit('state'); return;
    }
    if (state.status !== 'ready') { for (const r of this.records.filter(r => r.provider === 'codex')) r.status = 'offline'; this.emit('state'); return; }
    const s = state.snapshot;
    try {
      const pools = s.windows.map(w => ({ id: 'window.' + w.minutes, label: w.minutes === 10080 ? '本周额度' : w.minutes === 300 ? '5 小时额度' : w.minutes + ' 分钟周期',
        labelEn: w.minutes === 10080 ? 'Weekly quota' : w.minutes === 300 ? '5-hour quota' : w.minutes + '-minute window', amount: w.remaining, unit: 'percent', resetsAt: w.resetsAt }));
      for (const c of s.credits) pools.push({ id: 'card.' + c.key, label: '重置卡', labelEn: 'Reset credit', amount: 1, unit: 'cards', expiresAt: c.expiresAt });
      this.put(cleanRecord({ provider:'codex', scope:accountKey, account:'Codex', identityVerified:true, source:'codex', fetchedAt:s.fetchedAt, pools }));
      for (const old of this.records) if (old.provider === 'codex' && old.id !== 'codex:' + require('./catalog.cjs').hash(accountKey)) old.status = 'account_changed';
      this.ensureTool('codex'); this.persist(); this.emit('state');
    } catch { }
  }
  async query(id) {
    if (this.stopped || this.busy.has(id)) return;
    const generation=this.generation,epoch=this.providerEpoch.get(id)||0,run=Symbol();this.queryRuns.set(id,run);
    this.busy.add(id); this.statuses[id] = 'querying'; this.emit('state');
    try {
      let rows;
      if (id === 'xyq') rows = await adapters.xyq(this.options);
      else if(id==='lovart')rows=await require('./codex-mcp-credit.cjs').lovart(this.options);
      else if (id === 'jimeng') rows = await adapters.jimeng(this.options);
      else if (id === 'relay') rows = await adapters.relay(this.options);
      else if (['firecrawl','deepseek','tavily'].includes(id)) rows = await adapters.securedApiBalance(id, this.options);
      else return;
      if (this.stopped || generation!==this.generation||epoch!==(this.providerEpoch.get(id)||0)) return;
      for (const input of rows) {
        this.ensureTool(input.provider);
        if (!input.pools.length) { this.statuses[input.provider] = 'query_failed'; for(const old of this.records)if(old.provider===input.provider&&old.source==='relay'){old.status='offline';old.error='query_failed';} continue; }
        const r = cleanRecord(input);
        if (input.reportedStatus && input.reportedStatus !== 'ready') { r.status = 'stale'; r.error = 'query_failed'; }
        this.put(r); this.statuses[r.provider] = r.status;
      }
      this.statuses[id] = 'ready';
    } catch (e) {
      if (this.stopped || generation!==this.generation||epoch!==(this.providerEpoch.get(id)||0)) return;
      const error = safeError(e); this.statuses[id] = error;
      for (const r of this.records) if ((r.provider === id || id === 'relay' && r.source === 'relay') && r.source !== 'host') {
        r.status = ['login_required','account_changed'].includes(error) ? 'account_changed' : 'offline'; r.error = error;
      }
    } finally { if(generation===this.generation&&this.queryRuns.get(id)===run){this.queryRuns.delete(id);this.busy.delete(id); this.persist(); this.emit('state');} }
  }
  async refresh(id, { manual=false } = {}) {
    if(this.stopped || !manual&&!this.enabled)return;
    const generation=this.generation;
    this.loadImports();
    const ids = id ? [id] : ['xyq','jimeng','relay','firecrawl','deepseek','lovart','tavily'].filter(x => {
      if(x==='relay')return this.inventory.tools.some(t=>t.id==='agent-relay');
      return this.inventory.tools.some(t=>t.id===x && t.connections.some(c=> c.enabled &&
        (['installed','credential_reference'].includes(c.evidence) || x==='lovart' && c.kind==='mcp' && c.evidence==='configured')));
    });
    // Limit concurrent upstream reads. Each query has a separate bounded timeout.
    for (let i=0; i<ids.length; i+=3) {
      if(this.stopped||generation!==this.generation||!manual&&!this.enabled)break;
      await Promise.allSettled(ids.slice(i,i+3).map(x => this.query(x)));
    }
    if(generation===this.generation){this.persist();this.emit('state');}
  }
  setRule(key, input) {
    if (!this.records.some(r => r.pools.some(p => key === r.id + '/' + p.id))) throw new Error('invalid_rule');
    const record=this.records.find(r=>key.startsWith(r.id+'/'));
    if(record?.provider==='codex')throw new Error('codex_settings_in_gauge');
    if(['relay','cli','mcp'].includes(record?.source)&&!record.identityVerified)throw new Error('identity_unverified');
    const rule = validateRule(input), old = this.rules[key]; this.rules[key] = rule; this.persist();
    if (this.store.error) { if(old)this.rules[key]=old;else delete this.rules[key];this.emit('state');throw new Error('storage_failed'); }
    this.emit('state');
  }
  async connect(provider,key,{replaceRecordId=null}={}){
    if(!['firecrawl','tavily','deepseek'].includes(provider)||typeof key!=='string')throw new Error('invalid_credential');
    if(replaceRecordId&&!this.records.some(r=>r.id===replaceRecordId&&r.provider===provider&&r.source==='host'))throw new Error('invalid_account');
    if(this.store.error)throw new Error('storage_failed');
    const generation=this.generation,attempt=Symbol();this.connectRuns.set(provider,attempt);this.connecting.add(provider);this.emit('state');
    try{
      const rows=await adapters.apiBalance(provider,key.trim()),verified=rows.map(row=>cleanRecord(row));
      if(this.stopped||generation!==this.generation||this.connectRuns.get(provider)!==attempt)throw new Error('query_failed');
      if(!this.options.saveCredential)throw new Error('credential_storage_failed');
      const old={records:structuredClone(this.records),inventory:structuredClone(this.inventory),notices:structuredClone(this.notices),bindings:structuredClone(this.snapshotBindings),data:structuredClone(this.store.data),status:this.statuses[provider]};
      let undo,saved=false;
      try{
        undo=this.options.saveCredential(provider,key.trim());saved=true;
        this.providerEpoch.set(provider,(this.providerEpoch.get(provider)||0)+1);this.queryRuns.delete(provider);this.busy.delete(provider);
        for(const r of verified)this.put(r,false);this.ensureTool(provider);this.statuses[provider]='ready';
        if(replaceRecordId){this.snapshotBindings[replaceRecordId]=verified[0].id;const replaced=this.records.find(r=>r.id===replaceRecordId);if(replaced)replaced.status='account_changed';}
        const tool=this.inventory.tools.find(t=>t.id===provider);if(!tool.connections.some(c=>c.evidence==='credential_reference'))tool.connections.push({kind:'api',source:'Encrypted local credential',label:provider,enabled:true,evidence:'credential_reference'});
        this.persist();if(this.store.error)throw new Error('storage_failed');
      }catch(error){
        if(saved){try{if(typeof undo!=='function')throw Error();undo();}catch{this.emit('state');throw new Error('credential_commit_partial');}}
        this.records=old.records;this.inventory=old.inventory;this.notices=old.notices;this.snapshotBindings=old.bindings;this.store.data=old.data;
        if(old.status===undefined)delete this.statuses[provider];else this.statuses[provider]=old.status;
        this.emit('state');throw error;
      }
    }finally{if(this.connectRuns.get(provider)===attempt){this.connectRuns.delete(provider);this.connecting.delete(provider);this.emit('state');}}
  }
  setPreferences({ enabled = this.enabled, reminders = this.reminders }) {
    const oldEnabled=this.enabled,oldReminders=this.reminders;
    this.enabled = enabled === true; this.reminders = reminders === true; this.persist();
    if(this.store.error){this.enabled=oldEnabled;this.reminders=oldReminders;this.emit('state');throw new Error('storage_failed');}
    if(oldEnabled&&!this.enabled){this.generation++;this.busy.clear();}
    if(!oldEnabled&&this.enabled)this.refresh();
    this.emit('state');
  }
  addManual(input) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.account !== 'string' || !input.account.trim() || input.account.length > 80) throw new Error('invalid_account');
    const provider = input.provider && this.inventory.tools.some(t => t.id === input.provider) ? input.provider : 'manual-' + hash(input.name.trim());
    const record = cleanRecord({ provider, scope:'manual:'+input.account.trim(), identityVerified:false, account:input.account.trim(), source:'manual', fetchedAt:Date.now(),
      pools:[{id:'manual',label:'本人记录',labelEn:'Manual reading',amount:input.amount,unit:input.unit}] });
    const previousRecords=this.records.slice(),previousInventory=structuredClone(this.inventory),previousCustom=structuredClone(this.customTools);
    this.ensureTool(provider); const tool = this.inventory.tools.find(t => t.id === provider);
    if (provider.startsWith('manual-')) { this.customTools[provider]={name:input.name.trim()};tool.name = input.name.trim(); tool.category = '本人补充'; tool.categoryEn = 'Manually added'; }
    this.put(record, false); this.persist();
    if(this.store.error){this.records=previousRecords;this.inventory=previousInventory;this.customTools=previousCustom;this.emit('state');throw new Error('storage_failed');}
    this.emit('state');
  }
  tick() {
    if (this.stopped || !this.enabled) return;
    this.loadImports();
    if (this.reminders) for (const alert of expiryAlerts(this.records.filter(r => r.provider !== 'codex' && r.status !== 'account_changed'), this.rules)) this.emit('alert', alert);
    if (this.reminders) for (const alert of renewalAlerts(this.records.filter(r => r.provider !== 'codex' && r.status !== 'account_changed'), this.rules)) this.emit('alert', alert);
    if(this.reminders)for(const alert of observationAlerts(this.dateObservations,Date.now(),this.monthlySchedules))this.emit('alert',alert);
    if(this.reminders)for(const alert of userDateAlerts(this.userDates,this.records))this.emit('alert',alert);
    if(this.reminders)for(const notice of this.notices)if(notice.expiresAt>Date.now()&&this.rules[notice.recordId+'/'+notice.poolId]?.notify!==false&&this.records.some(r=>r.id===notice.recordId&&r.status!=='account_changed'))this.emit('alert',notice);
    this.emit('state');
  }
  start() {
    clearInterval(this.timer); clearInterval(this.ticks); this.stopped=false;
    this.rescan();
    if (this.enabled) this.refresh();
    this.timer = setInterval(() => { if (this.enabled) this.refresh(); }, 5*60000);
    this.ticks = setInterval(() => this.tick(), 30000);
  }
  stop() { this.stopped = true; this.generation++; this.busy.clear();this.queryRuns.clear();this.connectRuns.clear();this.connecting.clear(); clearInterval(this.timer); clearInterval(this.ticks); }
}
module.exports = { CreditCenter };
