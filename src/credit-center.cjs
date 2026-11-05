'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { scan, providers, canonical, hash } = require('./catalog.cjs');
const { CreditStore } = require('./credit-store.cjs');
const { cleanRecord, fresh, validateRule, events, expiryAlerts, recoveryAlerts, renewalAlerts } = require('./credit-model.cjs');
const adapters = require('./credit-adapters.cjs');
const {configuredKey}=require('./credit-credentials.cjs');
const {connectionCatalog,componentCatalog,probeComponents,accessFor}=require('./connection-capabilities.cjs');
const {cleanPreferences,followed,patchPreferences}=require('./connection-preferences.cjs');
const {policyFor,enrichSchedules}=require('./credit-policies.cjs');
const {cleanObservations,observationEvents,observationAlerts,applyMonthlyRules,validateMonthlyRule}=require('./credit-date-observations.cjs');
const {validateUserDate,cleanUserDates,activeUserDates,userDateEvents,userDateAlerts}=require('./credit-user-dates.cjs');
const creativeExpiry=require('./ui/creative-expiry.js');
const errors = ['cli_missing','login_required','account_changed','timeout','query_failed','invalid_response','invalid_balance','rate_limited','relay_unavailable','storage_failed','credential_storage_failed','invalid_credential','browser_offline','browser_setup_required','page_closed','selection_changed','permission_denied','authorization_pending','authorization_cancelled','authorization_denied'];
const safeError = e => errors.includes(e?.message) ? e.message : 'query_failed';
class CreditCenter extends EventEmitter {
  constructor(directory, options = {}) {
    super(); const existingInstallation=['credit-center.json','settings.json'].some(file=>fs.existsSync(path.join(directory,file)));this.store = new CreditStore(directory); this.options = options; this.busy = new Set(); this.statuses = {}; this.stopped = false; this.generation = 0;
    this.providerEpoch=new Map();this.queryRuns=new Map();this.connectRuns=new Map();this.connecting=new Set();
    const data = this.store.data;
    this.creativeExpiry=creativeExpiry.clean(data.creativeExpiry);
    this.subscriptionRoutes={};if(['direct','relay'].includes(data.subscriptionRoutes?.minimax))this.subscriptionRoutes.minimax=data.subscriptionRoutes.minimax;
    this.records = [];
    this.dateObservations=cleanObservations(data.dateObservations);
    this.userDates=cleanUserDates(data.userDates);
    this.onboardingCompleted=data.onboardingCompleted===true||data.onboardingCompleted==null&&(existingInstallation||data.records.length>0||this.dateObservations.length>0);
    this.connectionPreferences=cleanPreferences(data.connectionPreferences,this.onboardingCompleted);
    this.monthlySchedules={};
    for(const [key,rule]of Object.entries(data.monthlySchedules||{}))if(this.dateObservations.some(o=>['lovart','xyq','jimeng'].includes(o.provider)&&o.items.some(p=>key===o.id+'/'+p.id&&['monthly','subscription'].includes(p.id)&&p.kind!=='never')))try{this.monthlySchedules[key]=validateMonthlyRule(rule);}catch{}
    for (const r of Array.isArray(data.records) ? data.records : []) try {
      if (r.id !== r.provider + ':' + r.scope || !/^[a-f0-9]{20}$/.test(r.scope)) continue;
      const clean = cleanRecord({ ...r, scope: r.scope });
      this.records.push(enrichSchedules({ ...clean, id: r.id, scope: r.scope, status: r.source==='browser'&&r.status!=='account_changed'?'offline':['ready','offline','account_changed','stale'].includes(r.status) ? r.status : 'offline', error: r.source==='browser'?'browser_offline':r.error ? 'query_failed' : null }));
    } catch { }
    for(const r of this.records)this.followReading(r);
    this.customTools = data.customTools && typeof data.customTools === 'object' && !Array.isArray(data.customTools) ? data.customTools : {};
    this.rules = {};
    this.snapshotBindings={};
    for(const [hostId,apiId]of Object.entries(data.snapshotBindings||{}))if(this.records.some(r=>r.id===hostId&&r.source==='host')&&this.records.some(r=>r.id===apiId&&r.source==='api'))this.snapshotBindings[hostId]=apiId;
    for (const [key, rule] of Object.entries(data.rules || {})) if (this.records.some(r => r.pools.some(p => key === r.id + '/' + p.id))) try { this.rules[key] = validateRule(rule); } catch { }
    this.notices = Array.isArray(data.notices) ? data.notices.filter(e => (e?.kind === 'recovered'||e?.kind==='check_renewal'&&e.source==='policy') && Number.isFinite(e.at) && e.at > Date.now() - 7 * 86400000).slice(-100) : [];
    this.inventory = data.inventory && Array.isArray(data.inventory.tools) && data.inventory.tools.every(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&Array.isArray(t.connections)&&t.connections.every(c=>c&&typeof c.kind==='string'&&typeof c.source==='string'&&typeof c.label==='string')) ? data.inventory : { tools: [], sources: [], issues: [], scannedAt: null };
    for(const r of this.dateObservations)this.ensureObservationTool(r.provider);
    this.enabled = data.enabled !== false; this.reminders = data.reminders !== false;
    options.nativeMcp?.on('state',()=>this.emit('state'));
    options.nativeMcp?.on('connected',(id,rows)=>{
      if(this.stopped)throw Error('authorization_cancelled');
      if(this.store.error)throw Error('storage_failed');
      const verified=rows.map(row=>cleanRecord(row));
      const old={records:structuredClone(this.records),inventory:structuredClone(this.inventory),preferences:structuredClone(this.connectionPreferences),notices:structuredClone(this.notices),data:structuredClone(this.store.data),status:this.statuses[id]};
      this.invalidateProvider(id);
      this.retireProvider(id);
      for(const row of verified)this.put(row,false);
      this.ensureTool(id);this.statuses[id]='ready';this.rescan();
      if(this.store.error){this.records=old.records;this.inventory=old.inventory;this.connectionPreferences=old.preferences;this.notices=old.notices;this.store.data=old.data;if(old.status===undefined)delete this.statuses[id];else this.statuses[id]=old.status;throw Error('storage_failed');}
      this.emit('state');
    });
    options.nativeMcp?.on('disconnected',id=>{
      this.invalidateProvider(id);this.retireProvider(id);this.statuses[id]='login_required';this.persist();this.emit('state');
    });
  }
  persist() {
    this.store.data.creativeExpiry=this.creativeExpiry;
    this.store.data.subscriptionRoutes=this.subscriptionRoutes;
    this.store.data.connectionPreferences=this.connectionPreferences;
    Object.assign(this.store.data, { records: this.records, dateObservations:this.dateObservations,userDates:this.userDates,onboardingCompleted:this.onboardingCompleted,monthlySchedules:this.monthlySchedules,rules: this.rules, notices: this.notices, inventory: this.inventory, customTools:this.customTools,snapshotBindings:this.snapshotBindings, enabled: this.enabled, reminders: this.reminders });
    this.store.data.connectionAccess=Object.fromEntries(this.inventory.tools.map(t=>[t.id,this.access(t)]));
    this.store.data.connectionObservedAt=Date.now();
    try { this.store.save(); } catch { this.store.error = 'storage_failed'; }
  }
  state() {
    const tools = this.inventory.tools.map(t => {const access=this.access(t);return ({ ...t, nativeConnection:this.options.nativeMcp?.state(t.id),followed:followed(this.connectionPreferences,t.id),userFollowed:this.connectionPreferences.platforms[t.id]?.userChoice===true&&followed(this.connectionPreferences,t.id),membershipInput:this.connectionPreferences.platforms[t.id]?.membership||'unknown', access, canBrowser:['tapnow','ideogram'].includes(t.id),adapter:access.query.supported,policy:policyFor(t.id),canConnect:['firecrawl','tavily','deepseek','minimax'].includes(t.id),
      queryReady:access.query.canAttempt,
      userDates:activeUserDates(this.userDates.filter(o=>o.provider===t.id),this.records),recordedDates:userDateEvents(this.userDates.filter(o=>o.provider===t.id),this.records),
      dateObservations:applyMonthlyRules(this.dateObservations.filter(o=>o.provider===t.id),this.monthlySchedules),webDates:observationEvents(this.dateObservations.filter(o=>o.provider===t.id),Date.now(),this.monthlySchedules),querying: this.busy.has(t.id)||this.connecting.has(t.id) || ['kimi','minimax','zai'].includes(t.id) && this.busy.has('relay'), queryStatus: this.statuses[t.id] || null,
      records: this.records.filter(r => r.provider === t.id && r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r), rules: Object.fromEntries(Object.entries(this.rules).filter(([key]) => key.startsWith(r.id + '/'))) })) });});
    return { ...this.inventory, tools, connectionPreferences:this.connectionPreferences,connectionCatalog:connectionCatalog().map(p=>({...p,name:providers[p.provider].name,nameEn:({xyq:'Pippit',jimeng:'Dreamina','wanxiang':'Tongyi Wanxiang',quark:'Quark','hailuo-audio':'Hailuo Audio','capcut-hub':'CapCut Hub','kimi-subscription':'Kimi membership','minimax-subscription':'MiniMax Token Plan',ark:'Volcengine Ark',zai:'Z.AI'})[p.provider]||providers[p.provider].name})),connectionComponents:componentCatalog(),onboardingCompleted:this.onboardingCompleted,enabled: this.enabled, reminders: this.reminders, busy: this.busy.size > 0||this.connecting.size>0,
      records: this.records.filter(r => r.status !== 'account_changed').map(r => ({ ...r, stale: !fresh(r) })), rules: this.rules,creativeExpiry:this.creativeExpiry,
      events: [...events(this.records.filter(r => r.status !== 'account_changed'), this.rules),...observationEvents(this.dateObservations,Date.now(),this.monthlySchedules),...userDateEvents(this.userDates,this.records), ...this.notices].sort((a,b) => a.at-b.at),
      browserLink:this.options.browserState?.(),storageError: this.store.error, revision: this.store.data.revision };
  }
  access(tool){
    this.componentProbe ||= probeComponents(this.options);
    const relayEnabled=this.inventory.tools.some(t=>t.id==='agent-relay'&&t.connections.some(c=>c.enabled&&c.evidence==='configured'&&c.kind==='plugin'&&c.source==='Codex'))||this.inventory.tools.some(t=>['kimi','minimax','zai'].includes(t.id)&&t.connections.some(c=>c.enabled&&c.kind==='cli'&&c.evidence==='installed'))||this.records.some(r=>['kimi','minimax','zai'].includes(r.provider)&&r.source==='relay');
    let hasCredential=false;try{hasCredential=!!this.options.hasCredential?.(tool.id);}catch{}
    return accessFor(tool,{probe:this.componentProbe,records:this.records,queryStatus:this.statuses[tool.id]||(['kimi','minimax','zai'].includes(tool.id)?this.statuses.relay:null),browser:this.options.browserState?.(),hasCredential,native:this.options.nativeMcp?.state(tool.id),subscriptionRoute:this.subscriptionRoutes[tool.id],relayEnabled});
  }
  rescan() {
    this.componentProbe=probeComponents(this.options);
    this.inventory = scan({ ...this.options, hostTools: this.store.hostInventory() });
    if(this.componentProbe.checks.codex_cli&&!this.inventory.tools.some(t=>t.id==='codex')){this.ensureTool('codex');this.inventory.tools.find(t=>t.id==='codex').connections=[{kind:'cli',source:'Local CLI installation',label:'Codex',enabled:true,evidence:'installed'}];}
    for(const id of ['firecrawl','tavily','deepseek','minimax'])if(configuredKey(id,this.options)||this.options.hasCredential?.(id)){this.ensureTool(id);const tool=this.inventory.tools.find(t=>t.id===id);if(!tool.connections.some(c=>c.evidence==='credential_reference'))tool.connections.push({kind:'api',source:'Existing local credential',label:id,enabled:true,evidence:'credential_reference'});}
    for(const id of ['runway','recraft'])if(this.options.nativeMcp?.state(id)?.selected){this.ensureTool(id);if(!this.options.nativeMcp.state(id).connected)this.retireProvider(id);this.inventory.tools.find(t=>t.id===id).connections.push({kind:'mcp',source:'Gauge native OAuth',label:id,enabled:true,evidence:'credential_reference'});}
    for (const row of this.records){this.ensureTool(row.provider);if(row.source==='browser')this.ensureBrowserTool(row.provider);}
    for(const row of this.userDates)this.ensureUserDateTool(row.provider);
    for(const id of Object.keys(this.connectionPreferences.platforms))this.ensureFollowedTool(id);
    this.loadImports(); this.persist(); this.emit('state'); return this.state();
  }
  ensureTool(id) {
    if (!this.inventory.tools.some(t => t.id === id)) { const p = providers[id]; this.inventory.tools.push({ id, name: this.customTools[id]?.name || p?.name || id, category: p?.category || '其他工具', categoryEn: p?.categoryEn || 'Other tools', connections: [{ kind: 'api', source: 'Credit source', label: id, enabled: true, evidence: 'observed' }] }); }
  }
  ensureFollowedTool(id){
    if(!this.inventory.tools.some(t=>t.id===id)){
      this.ensureTool(id);this.inventory.tools.find(t=>t.id===id).connections=[];
    }
  }
  followReading(record){
    // A current measured amount (including zero) can introduce a platform.
    // Explicit follow/hide always wins; old snapshots and failed reads cannot.
    const choice=this.connectionPreferences.platforms[record.provider];
    if(choice?.userChoice!==true&&fresh(record)&&!record.error&&!['manual','host'].includes(record.source)&&record.pools.some(p=>p.unit!=='cards'&&p.entitlement!=='not_in_plan'&&Number.isFinite(p.amount)&&p.amount>=0)){
      this.connectionPreferences.platforms[record.provider]={...choice,followed:true,membership:choice?.membership||'unknown',userChoice:false};
    }
  }
  setConnectionPreferences(input){
    const valid=id=>Object.hasOwn(providers,id)||this.inventory.tools.some(t=>t.id===id)||Object.hasOwn(this.connectionPreferences.platforms,id);
    const next=patchPreferences(this.connectionPreferences,input,valid),old=this.connectionPreferences,inventory=structuredClone(this.inventory);
    this.connectionPreferences=next;if(input.provider)this.ensureFollowedTool(input.provider);
    this.persist();
    if(this.store.error){this.connectionPreferences=old;this.store.data.connectionPreferences=old;this.inventory=inventory;this.store.data.inventory=inventory;throw Error('storage_failed');}
    this.emit('state');
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
  ensureObservationTool(id){const existing=this.inventory.tools.some(t=>t.id===id);this.ensureTool(id);const t=this.inventory.tools.find(t=>t.id===id);if(!existing)t.connections=[];if(!t.connections.some(c=>c.evidence==='web_observation'))t.connections.push({kind:'web',source:'Recorded account page',label:id,enabled:true,evidence:'web_observation'});if(!Object.hasOwn(this.connectionPreferences.platforms,id))this.connectionPreferences.platforms[id]={followed:true,membership:'unknown',userChoice:false};}
  ensureUserDateTool(id){const existing=this.inventory.tools.some(t=>t.id===id);this.ensureTool(id);const tool=this.inventory.tools.find(t=>t.id===id);if(!existing)tool.connections=[];if(!tool.connections.some(c=>c.evidence==='user_dates'))tool.connections.push({kind:'manual',source:'User dates',label:id,enabled:true,evidence:'user_dates'});}
  acceptBrowserReading(input,{manual=false}={}){
    if(this.stopped||!this.enabled&&!manual||!['tapnow','ideogram'].includes(input?.provider)||input.source!=='browser'||input.identityVerified!==false)throw Error('invalid_response');
    const r=cleanRecord(input);this.put(r,false);this.ensureBrowserTool(r.provider);this.statuses[r.provider]='ready';this.persist();if(this.store.error)throw Error('storage_failed');this.emit('state');
  }
  browserUnavailable(id,error='browser_offline'){
    for(const r of this.records)if(r.provider===id&&r.source==='browser'&&r.status!=='account_changed'){r.status='offline';r.error=error;}this.statuses[id]=error;this.persist();this.emit('state');
  }
  ensureBrowserTool(id){const had=this.inventory.tools.some(t=>t.id===id);this.ensureTool(id);const t=this.inventory.tools.find(t=>t.id===id);if(!had)t.connections=[];const c=t.connections.find(c=>c.kind==='browser');if(c)c.enabled=!!this.options.browserState?.()?.enabled;else t.connections.push({kind:'browser',source:'User-linked browser page',label:id,enabled:!!this.options.browserState?.()?.enabled,evidence:'user_linked'});}
  completeOnboarding(){const old=this.onboardingCompleted;this.onboardingCompleted=true;this.persist();if(this.store.error){this.onboardingCompleted=old;this.store.data.onboardingCompleted=old;throw Error('storage_failed');}this.emit('state');}
  setUserDate(input){
    if(!input||!this.inventory.tools.some(t=>t.id===input.provider)&&!Object.hasOwn(providers,input.provider))throw Error('invalid_dates');
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
    const oldInventory=structuredClone(this.inventory),oldPreferences=structuredClone(this.connectionPreferences);this.ensureUserDateTool(clean.provider);
    if(!Object.hasOwn(this.connectionPreferences.platforms,clean.provider))this.connectionPreferences.platforms[clean.provider]={followed:true,membership:'unknown'};
    this.userDates=[...old.filter(r=>r.id!==row.id),row];this.persist();
    if(this.store.error){this.connectionPreferences=oldPreferences;this.store.data.connectionPreferences=oldPreferences;this.userDates=old;this.store.data.userDates=old;this.inventory=oldInventory;this.store.data.inventory=oldInventory;this.emit('state');throw Error('storage_failed');}this.emit('state');return row.id;
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
    if(record.source==='browser')for(const old of this.records)if(old.provider===record.provider&&old.source==='browser'&&old.id!==record.id)old.status='account_changed';
    if (['cli','relay','api'].includes(record.source)||record.source==='mcp'&&['suno','recraft','kling'].includes(record.provider)) for (const old of this.records) if (old.provider === record.provider && old.source === record.source && old.id !== record.id) old.status = 'account_changed';
    if(record.provider==='kling'&&record.source==='mcp')for(const old of this.records)if(old.provider==='kling'&&old.source==='cli')old.status='account_changed';
    if(record.provider==='runway'&&record.source==='mcp'&&record.connectionRef)for(const old of this.records)if(old.provider==='runway'&&old.source==='mcp'&&old.id!==record.id&&(!old.connectionRef||old.connectionRef===record.connectionRef))old.status='account_changed';
    const recovered = notify && previous ? recoveryAlerts(previous, record) : [];
    this.records = [...this.records.filter(r => r.id !== record.id), record].slice(-250);
    this.followReading(record);
    for (const event of recovered) {
      if (!this.notices.some(n => n.key === event.key)) this.notices.push(event);
      if (this.reminders && this.rules[event.recordId+'/'+event.poolId]?.notify !== false) this.emit('alert', event);
    }
    this.notices = this.notices.filter(e => e.at > Date.now() - 7*86400000).slice(-100);
  }
  updateCodex(state, accountKey) {
    this.statuses.codex=state.status;
    if (!state.snapshot || !accountKey) {
      for (const r of this.records.filter(r => r.provider === 'codex')) r.status = state.status === 'account_changed' || state.status === 'login_required' ? 'account_changed' : 'offline';
      this.persist();this.emit('state'); return;
    }
    if (state.status !== 'ready') { for (const r of this.records.filter(r => r.provider === 'codex')) r.status = 'offline';this.persist(); this.emit('state'); return; }
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
  async query(id,{manual=false}={}) {
    if(!['xyq','jimeng','relay','firecrawl','deepseek','lovart','suno','tavily','runway','kling','recraft','tapnow','ideogram','minimax'].includes(id))return;
    if (this.stopped || this.busy.has(id)) return;
    if(this.options.nativeMcp?.state(id)?.pending)return;
    const generation=this.generation,epoch=this.providerEpoch.get(id)||0,run=Symbol();this.queryRuns.set(id,run);
    this.busy.add(id); this.statuses[id] = 'querying'; this.emit('state');
    try {
      let rows;
      if(id==='minimax'){this.subscriptionRoutes.minimax='direct';this.persist();if(this.store.error)throw Error('storage_failed');}
      if (this.options.nativeMcp?.state(id)?.pending)throw Error('authorization_pending');
      if (this.options.nativeMcp?.state(id)?.selected)rows=await this.options.nativeMcp.read(id);
      else if (id === 'minimax')rows=await adapters.securedApiBalance(id,this.options);
      else if (id === 'xyq') rows = await adapters.xyq(this.options);
      else if(id==='lovart')rows=await require('./codex-mcp-credit.cjs').lovart(this.options);
      else if(id==='suno')rows=await require('./codex-mcp-credit.cjs').suno(this.options);
      else if(['runway','kling','recraft'].includes(id))rows=await require('./creative-providers.cjs')[id](this.options);
      else if(['tapnow','ideogram'].includes(id)&&this.options.browserRefresh)rows=await this.options.browserRefresh(id,{manual});
      else if (id === 'jimeng') rows = await adapters.jimeng(this.options);
      else if (id === 'relay') rows = await adapters.relay(this.options);
      else if (['firecrawl','deepseek','tavily'].includes(id)) rows = await adapters.securedApiBalance(id, this.options);
      else return;
      if (this.stopped || generation!==this.generation||epoch!==(this.providerEpoch.get(id)||0)) return;
      if(id==='runway'){
        const active=new Set(rows.map(r=>cleanRecord(r).id));
        for(const old of this.records)if(old.provider==='runway'&&old.source==='mcp'&&old.status!=='account_changed'&&!active.has(old.id)){old.status='offline';old.error='query_failed';}
      }
      for (const input of rows) {
        if(id==='relay'&&input.provider==='minimax'&&this.access({id:'minimax',connections:[]}).query.route==='subscription_api')continue;
        this.ensureTool(input.provider);
        if (!input.pools.length) { this.statuses[input.provider] = 'query_failed'; for(const old of this.records)if(old.provider===input.provider&&old.source==='relay'){old.status='offline';old.error='query_failed';} continue; }
        const r = cleanRecord(input);
        if(r.provider==='minimax'&&r.source==='api')for(const old of this.records)if(old.provider==='minimax'&&old.source==='relay')old.status='account_changed';
        if (input.reportedStatus && input.reportedStatus !== 'ready') { r.status = 'stale'; r.error = 'query_failed'; }
        this.put(r); this.statuses[r.provider] = r.status;
      }
      if(id!=='relay'&&this.statuses[id]==='querying')this.statuses[id] = rows.length?'ready':'query_failed';
      if(id==='relay')delete this.statuses.relay;
    } catch (e) {
      if (this.stopped || generation!==this.generation||epoch!==(this.providerEpoch.get(id)||0)) return;
      const error = safeError(e); this.statuses[id] = error;
      for (const r of this.records) if ((r.provider === id || id === 'relay' && r.source === 'relay') && !['host','manual'].includes(r.source) && r.status!=='account_changed') {
        r.status = ['login_required','account_changed'].includes(error) ? 'account_changed' : 'offline'; r.error = error;
      }
    } finally { if(generation===this.generation&&this.queryRuns.get(id)===run){this.queryRuns.delete(id);this.busy.delete(id); this.persist(); this.emit('state');} }
  }
  async refresh(id, { manual=false } = {}) {
    if(this.stopped || !manual&&!this.enabled)return;
    const generation=this.generation;
    this.loadImports();
    this.componentProbe=probeComponents(this.options);
    const ids = id ? [['kimi','minimax','zai'].includes(id)&&this.access({id,connections:[]}).query.route!=='subscription_api'?'relay':id] : ['xyq','jimeng','relay','minimax','firecrawl','deepseek','lovart','suno','tavily','runway','kling','recraft','tapnow','ideogram'].filter(x => {
      if(x==='relay')return this.access({id:'kimi',connections:[]}).query.canAttempt;
      if(x==='minimax'&&this.access({id:x,connections:[]}).query.route!=='subscription_api')return false;
      return this.inventory.tools.some(t=>t.id===x&&this.access(t).query.canAttempt);
    });
    // Limit concurrent upstream reads. Each query has a separate bounded timeout.
    for (let i=0; i<ids.length; i+=3) {
      if(this.stopped||generation!==this.generation||!manual&&!this.enabled)break;
      await Promise.allSettled(ids.slice(i,i+3).map(x => this.query(x,{manual})));
    }
    if(generation===this.generation){this.persist();this.emit('state');}
  }
  setRule(key, input) {
    if (!this.records.some(r => r.pools.some(p => key === r.id + '/' + p.id))) throw new Error('invalid_rule');
    const record=this.records.find(r=>key.startsWith(r.id+'/'));
    if(record?.provider==='codex')throw new Error('codex_settings_in_gauge');
    if(['relay','cli','mcp','browser'].includes(record?.source)&&!record.identityVerified)throw new Error('identity_unverified');
    const rule = validateRule(input), old = this.rules[key]; this.rules[key] = rule; this.persist();
    if (this.store.error) { if(old)this.rules[key]=old;else delete this.rules[key];this.emit('state');throw new Error('storage_failed'); }
    this.emit('state');
  }
  async connect(provider,key,{replaceRecordId=null}={}){
    if(!['firecrawl','tavily','deepseek','minimax'].includes(provider)||typeof key!=='string')throw new Error('invalid_credential');
    if(replaceRecordId&&!this.records.some(r=>r.id===replaceRecordId&&r.provider===provider&&r.source==='host'))throw new Error('invalid_account');
    if(this.store.error)throw new Error('storage_failed');
    const generation=this.generation,attempt=Symbol();this.connectRuns.set(provider,attempt);this.connecting.add(provider);this.emit('state');
    try{
      const rows=await adapters.apiBalance(provider,key.trim(),this.options.request||adapters.jsonRequest),verified=rows.map(row=>cleanRecord(row));
      if(this.stopped||generation!==this.generation||this.connectRuns.get(provider)!==attempt)throw new Error('query_failed');
      if(!this.options.saveCredential)throw new Error('credential_storage_failed');
      const old={records:structuredClone(this.records),inventory:structuredClone(this.inventory),preferences:structuredClone(this.connectionPreferences),notices:structuredClone(this.notices),bindings:structuredClone(this.snapshotBindings),routes:{...this.subscriptionRoutes},data:structuredClone(this.store.data),status:this.statuses[provider]};
      let undo,saved=false;
      try{
        undo=this.options.saveCredential(provider,key.trim());saved=true;
        this.providerEpoch.set(provider,(this.providerEpoch.get(provider)||0)+1);this.queryRuns.delete(provider);this.busy.delete(provider);
        if(provider==='minimax'){this.subscriptionRoutes.minimax='direct';this.retireProvider(provider);}
        for(const r of verified)this.put(r,false);this.ensureTool(provider);this.statuses[provider]='ready';
        if(replaceRecordId){this.snapshotBindings[replaceRecordId]=verified[0].id;const replaced=this.records.find(r=>r.id===replaceRecordId);if(replaced)replaced.status='account_changed';}
        const tool=this.inventory.tools.find(t=>t.id===provider);if(!tool.connections.some(c=>c.evidence==='credential_reference'))tool.connections.push({kind:'api',source:'Encrypted local credential',label:provider,enabled:true,evidence:'credential_reference'});
        this.persist();if(this.store.error)throw new Error('storage_failed');
      }catch(error){
        if(saved){try{if(typeof undo!=='function')throw Error();undo();}catch{this.emit('state');throw new Error('credential_commit_partial');}}
        this.records=old.records;this.inventory=old.inventory;this.connectionPreferences=old.preferences;this.notices=old.notices;this.snapshotBindings=old.bindings;this.subscriptionRoutes=old.routes;this.store.data=old.data;
        if(old.status===undefined)delete this.statuses[provider];else this.statuses[provider]=old.status;
        this.emit('state');throw error;
      }
    }finally{if(this.connectRuns.get(provider)===attempt){this.connectRuns.delete(provider);this.connecting.delete(provider);this.emit('state');}}
  }
  invalidateProvider(id){this.providerEpoch.set(id,(this.providerEpoch.get(id)||0)+1);this.queryRuns.delete(id);this.busy.delete(id);}
  retireProvider(id){for(const r of this.records)if(r.provider===id&&!['manual','host'].includes(r.source))r.status='account_changed';}
  setSubscriptionRoute(id,route){
    if(id!=='minimax'||!['direct','relay'].includes(route))throw Error('unsupported');
    const previous={routes:{...this.subscriptionRoutes},records:structuredClone(this.records),status:this.statuses[id]};
    this.subscriptionRoutes[id]=route;this.retireProvider(id);this.statuses[id]='login_required';this.persist();
    if(this.store.error){this.subscriptionRoutes=previous.routes;this.records=previous.records;this.statuses[id]=previous.status;throw Error('storage_failed');}
    this.invalidateProvider(id);this.emit('state');
  }
  nativeAction(action,id){
    if(!['runway','recraft'].includes(id)||!this.options.nativeMcp)throw Error('unsupported');
    if(action==='connect'){if(this.store.error)throw Error('storage_failed');this.invalidateProvider(id);this.options.nativeMcp.begin(id);}
    else if(action==='cancel')this.options.nativeMcp.cancel(id);
    else if(action==='disconnect'||action==='legacy')this.options.nativeMcp.disconnect(id,action==='legacy');
    else throw Error('unsupported');
  }
  setCreativeExpiry(provider,threshold){
    if(!creativeExpiry.isCreative(provider)||!creativeExpiry.validThreshold(threshold))throw Error('invalid_rule');
    this.saveCreativeExpiry({...this.creativeExpiry,thresholds:{...this.creativeExpiry.thresholds,[provider]:threshold}});
  }
  dismissCreativeExpiry(event){
    // Resolve the batch from our current data; renderer-supplied deadlines are not trusted.
    const dates=[...events(this.records.filter(r=>r.status!=='account_changed'),this.rules),...observationEvents(this.dateObservations),...userDateEvents(this.userDates,this.records)];
    const key=typeof event==='string'?event:creativeExpiry.batchKey(event),found=dates.find(d=>d.kind==='expiry'&&creativeExpiry.isCreative(d.provider)&&creativeExpiry.batchKey(d)===key);
    if(!found)throw Error('invalid_rule');
    const until=found.dateOnly?new Date(...found.onDate.split('-').map((n,i)=>Number(n)-(i===1?1:0))).getTime()+2*86400000:found.at;
    if(until<=Date.now())throw Error('invalid_rule');
    this.saveCreativeExpiry({...this.creativeExpiry,dismissed:{...this.creativeExpiry.dismissed,[key]:until}});
  }
  saveCreativeExpiry(next){
    const old=this.creativeExpiry;this.creativeExpiry=creativeExpiry.clean(next);this.persist();
    if(this.store.error){this.creativeExpiry=old;this.store.data.creativeExpiry=old;throw Error('storage_failed');}
    this.emit('state');
  }
  setPreferences({ enabled = this.enabled, reminders = this.reminders }) {
    const oldEnabled=this.enabled,oldReminders=this.reminders;
    this.enabled = enabled === true; this.reminders = reminders === true; this.persist();
    if(this.store.error){this.enabled=oldEnabled;this.reminders=oldReminders;this.emit('state');throw new Error('storage_failed');}
    if(oldEnabled&&!this.enabled){this.generation++;this.busy.clear();}
    if(oldEnabled!==this.enabled)this.options.browserControl?.();
    if(!oldEnabled&&this.enabled)this.refresh();
    this.emit('state');
  }
  addManual(input) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.account !== 'string' || !input.account.trim() || input.account.length > 80) throw new Error('invalid_account');
    const provider = input.provider && this.inventory.tools.some(t => t.id === input.provider) ? input.provider : 'manual-' + hash(input.name.trim());
    const record = cleanRecord({ provider, scope:'manual:'+input.account.trim(), identityVerified:false, account:input.account.trim(), source:'manual', fetchedAt:Date.now(),
      pools:[{id:'manual',label:'本人记录',labelEn:'Manual reading',amount:input.amount,unit:input.unit}] });
    const previousRecords=this.records.slice(),previousInventory=structuredClone(this.inventory),previousCustom=structuredClone(this.customTools),previousPreferences=structuredClone(this.connectionPreferences);
    this.ensureTool(provider); const tool = this.inventory.tools.find(t => t.id === provider);
    if (provider.startsWith('manual-')) { this.customTools[provider]={name:input.name.trim()};tool.name = input.name.trim(); tool.category = '本人补充'; tool.categoryEn = 'Manually added'; }
    if(!Object.hasOwn(this.connectionPreferences.platforms,provider))this.connectionPreferences.platforms[provider]={followed:true,membership:'unknown'};
    this.put(record, false); this.persist();
    if(this.store.error){this.connectionPreferences=previousPreferences;this.store.data.connectionPreferences=previousPreferences;this.records=previousRecords;this.inventory=previousInventory;this.customTools=previousCustom;this.emit('state');throw new Error('storage_failed');}
    this.emit('state');
  }
  tick() {
    if (this.stopped || !this.enabled) return;
    this.loadImports();
    if (this.reminders) for (const alert of expiryAlerts(this.records.filter(r => r.provider !== 'codex' && r.status !== 'account_changed'), this.rules,Date.now(),this.creativeExpiry)) this.emit('alert', alert);
    if (this.reminders) for (const alert of renewalAlerts(this.records.filter(r => r.provider !== 'codex' && r.status !== 'account_changed'), this.rules)) this.emit('alert', alert);
    const dateAlert=alert=>{if(!creativeExpiry.shouldNotify(alert,this.creativeExpiry))return;const expiry=creativeExpiry.isCreative(alert.provider)&&alert.scheduleKind==='expiry';this.emit('alert',expiry?{...alert,key:'center:creative-date:'+hash(creativeExpiry.batchKey(alert))+':'+(alert.days===0?'1d':'3d')}:alert);};
    if(this.reminders)for(const alert of observationAlerts(this.dateObservations,Date.now(),this.monthlySchedules))dateAlert(alert);
    if(this.reminders)for(const alert of userDateAlerts(this.userDates,this.records))dateAlert(alert);
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
  stop() { this.stopped = true; for(const id of ['runway','recraft'])this.options.nativeMcp?.cancel(id);this.generation++; this.busy.clear();this.queryRuns.clear();this.connectRuns.clear();this.connecting.clear(); clearInterval(this.timer); clearInterval(this.ticks); }
}
module.exports = { CreditCenter };
