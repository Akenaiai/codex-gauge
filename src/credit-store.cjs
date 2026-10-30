'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class CreditStore {
  constructor(directory) {
    this.directory = directory; this.error = null;
    const fallback={version:1,records:[],rules:{},notices:[],enabled:true,reminders:true,revision:0};
    this.data = this.read('credit-center.json', fallback);
    if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data) || this.data.version !== 1 || !Array.isArray(this.data.records)) { this.error='storage_failed'; this.data=fallback; }
  }
  read(name, fallback) {
    try { const file = path.join(this.directory, name); if (fs.statSync(file).size > 8e6) throw new Error(); return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') this.error = 'storage_failed'; return fallback; }
  }
  save() {
    if (this.error) throw new Error('storage_failed');
    const revision = this.data.revision || 0;
    this.data.revision = revision + 1;
    fs.mkdirSync(this.directory, { recursive: true });
    const target = path.join(this.directory, 'credit-center.json'), temp = target + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 }); fs.renameSync(temp, target); }
    catch(error){this.data.revision=revision;throw error;}
  }
  imports() { const data=this.read('credit-imports.json', { records: [] });return data&&Array.isArray(data.records)?data:{records:[]}; }
  hostInventory() { const data=this.read('credit-host-tools.json', []);return Array.isArray(data)?data:[]; }
  dateObservations(){const data=this.read('credit-date-observations.json',{observations:[]});return Array.isArray(data?.observations)?data.observations:[];}
}
module.exports = { CreditStore };
