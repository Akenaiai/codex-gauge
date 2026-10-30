'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { scan, providers, canonical, hash } = require('./catalog.cjs');
const { CreditStore } = require('./credit-store.cjs');
const { cleanRecord, fresh, validateRule, events, expiryAlerts, recoveryAlerts, renewalAlerts } = require('./credit-model.cjs');
const adapters = require('./credit-adapters.cjs');
const errors = ['cli_missing','login_required','account_changed','timeout','query_failed','invalid_response','invalid_balance','rate_limited','relay_unavailable','storage_failed'];
const safeError = e => errors.includes(e?.message) ? e.message : 'query_failed';
class CreditCenter extends EventEmitter {
  constructor(directory, options = {}) {
    super(); this.store = new CreditStore(directory); this.options = options; this.busy = new Set(); this.statuses = {}; this.stopped = false; this.generation = 0;
    const data = this.store.data;
    this.records = [];
    for (const r of Array.isArray(data.records) ? data.records : []) try {
      if (r.id !== r.provider + ':' + r.scope || !/^[a-f0-9]{20}$/.test(r.scope)) continue;
      const clean = cleanRecord({ ...r, scope: r.scope });
      this.records.push({ ...clean, id: r.id, scope: r.scope, status: ['ready','offline','account_changed','stale'].includes(r.status) ? r.status : 'offline', error: r.error ? 'query_failed' : null });
    } catch { }
    this.customTools = data.customTools && typeof data.customTools === 'object' && !Array.isArray(data.customTools) ? data.customTools : {};
    this.rules = {};
    for (const [key, rule] of Object.entries(data.rules || {})) if (this.records.some(r => r.pools.some(p => key === r.id + '/' + p.id))) try { this.rules[key] = validateRule(rule); } catch { }
    this.notices = Array.isArray(data.notices) ? data.notices.filter(e => e?.kind === 'recovered' && Number.isFinite(e.at) && e.at > Date.now() - 7 * 86400000).slice(-100) : [];
    this.inventory = data.inventory && Array.isArray(data.inventory.tools) && data.inventory.tools.every(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&Array.isArray(t.connections)&&t.connections.every(c=>c&&typeof c.kind==='string'&&typeof c.source==='string'&&typeof c.label==='string')) ? data.inventory : { tools: [], sources: [], issues: [], scannedAt: null };
    this.enabled = data.enabled !== false; this.reminders = data.reminders !== false;
  }
  persist() {
    Object.assign(this.store.data, { records: this.records, rules: this.rules, notices: this.notices, inventory: this.inventory, customTools:this.customTools, enabled: this.enabled, reminders: this.reminders });
    try { this.store.save(); } catch { this.store.error = 'storage_failed'; }
  }
  state() {
    const tools = this.inventory.tools.map(t => ({ ...t, adapter: ['codex','xyq','jimeng','firecrawl','deepseek','kimi','minimax','zai','lovart'].includes(t.id),
      querying: this.busy.has(t.id) || ['kimi','minimax','zai'].includes(t.id) && this.busy.has('relay'), queryStatus: this.statuses[t.id] || null,
      records: this.records.filter(r => r.provider === t.id && r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r), rules: Object.fromEntries(Object.entries(this.rules).filter(([key]) => key.startsWith(r.id + '/'))) })) }));
    return { ...this.inventory, tools, enabled: this.enabled, reminders: this.reminders, busy: this.busy.size > 0,
      records: this.records.filter(r => r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r) })), rules: this.rules,
      events: [...events(this.records.filter(r => r.status !== 'account_changed'), this.rules), ...this.notices].sort((a,b) => a.at-b.at),
      storageError: this.store.error, revision: this.store.data.revision };
  }
  rescan() {
    this.inventory = scan({ ...this.options, hostTools: this.store.hostInventory() });
    for (const row of this.records) this.ensureTool(row.provider);
    this.loadImports(); this.persist(); this.emit('state'); return this.state();
  }
  ensureTool(id) {
    if (!this.inventory.tools.some(t => t.id === id)) { const p = providers[id]; this.inventory.tools.push({ id, name: this.customTools[id]?.name || p?.name || id, category: p?.category || '其他工具', categoryEn: p?.categoryEn || 'Other tools', connections: [{ kind: 'api', source: 'Credit source', label: id, enabled: true, evidence: 'observed' }] }); }
  }
  loadImports() {
    for (const input of this.store.imports().records || []) try {
      const r = cleanRecord({ ...input, source: 'host' });
      const old = this.records.find(v => v.id === r.id);
      if (old && old.fetchedAt >= r.fetchedAt) continue;
      this.put(r, false); this.ensureTool(r.provider);
    } catch { }
  }
  put(record, notify = true) {
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
    const generation=this.generation;
    this.busy.add(id); this.statuses[id] = 'querying'; this.emit('state');
    try {
      let rows;
      if (id === 'xyq') rows = await adapters.xyq(this.options);
      else if(id==='lovart')rows=await require('./codex-mcp-credit.cjs').lovart(this.options);
      else if (id === 'jimeng') rows = await adapters.jimeng(this.options);
      else if (id === 'relay') rows = await adapters.relay(this.options);
      else if (['firecrawl','deepseek'].includes(id)) rows = await adapters.securedApiBalance(id, this.options);
      else return;
      if (this.stopped || generation!==this.generation) return;
      for (const input of rows) {
        this.ensureTool(input.provider);
        if (!input.pools.length) { this.statuses[input.provider] = 'query_failed'; for(const old of this.records)if(old.provider===input.provider&&old.source==='relay'){old.status='offline';old.error='query_failed';} continue; }
        const r = cleanRecord(input);
        if (input.reportedStatus && input.reportedStatus !== 'ready') { r.status = 'stale'; r.error = 'query_failed'; }
        this.put(r); this.statuses[r.provider] = r.status;
      }
      this.statuses[id] = 'ready';
    } catch (e) {
      if (this.stopped || generation!==this.generation) return;
      const error = safeError(e); this.statuses[id] = error;
      for (const r of this.records) if ((r.provider === id || id === 'relay' && r.source === 'relay') && r.source !== 'host') {
        r.status = ['login_required','account_changed'].includes(error) ? 'account_changed' : 'offline'; r.error = error;
      }
    } finally { if(generation===this.generation){this.busy.delete(id); this.persist(); this.emit('state');} }
  }
  async refresh(id, { manual=false } = {}) {
    if(this.stopped || !manual&&!this.enabled)return;
    const generation=this.generation;
    this.loadImports();
    const ids = id ? [id] : ['xyq','jimeng','relay','firecrawl','deepseek','lovart'].filter(x => {
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
  stop() { this.stopped = true; this.generation++; this.busy.clear(); clearInterval(this.timer); clearInterval(this.ticks); }
}
module.exports = { CreditCenter };
