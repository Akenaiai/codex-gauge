'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {canonical,entriesToml}=require('./catalog.cjs');
const variables={firecrawl:'FIRECRAWL_API_KEY',tavily:'TAVILY_API_KEY',exa:'EXA_API_KEY',deepseek:'DEEPSEEK_API_KEY'};
function useful(value){return typeof value==='string'&&value.length>=16&&value.length<=2000&&!/your[_ -]|replace[_ -]|example|placeholder|<[^>]+>|\$\{|^\*+$|^\.\.\.$/i.test(value);}
function parseString(text){
  const s=text.trim();if(s.startsWith('"'))try{return JSON.parse(s.replace(/\s+#.*$/,''));}catch{return null;}
  const match=s.match(/^'([^']*)'\s*(?:#.*)?$/);return match?match[1]:null;
}
// Inspect only the named provider's existing MCP environment. Raw values never
// enter inventory, renderer state, error strings, logs, or public files.
function configuredKey(provider,{home=os.homedir(),env=process.env}={}){
  const variable=variables[provider];if(!variable)return null;
  if(useful(env[variable]))return{key:env[variable],source:'environment'};
  const file=path.join(home,'.codex/config.toml');let text='';try{text=fs.readFileSync(file,'utf8');}catch{}
  const enabled=new Map(entriesToml(text).filter(e=>e.kind==='mcp').map(e=>[e.name,e.enabled]));
  let owner=null,inEnv=false;
  for(const line of text.split(/\r?\n/)){
    if(/^\s*\[/.test(line)){
      const m=line.match(/^\s*\[mcp_servers\.(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\.\]\s]+))\.env\]\s*(?:#.*)?$/);
      const name=m&&(m[1]||m[2]||m[3]);owner=m?canonical(name):null;inEnv=!!m&&enabled.get(name)!==false;continue;
    }
    if(!inEnv||owner!==provider)continue;
    const assignment=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if(assignment?.[1]!==variable)continue;const key=parseString(assignment[2]);
    if(useful(key))return{key,source:'configured_mcp'};
  }
  const jsonFiles=[path.join(home,'.cursor/mcp.json'),path.join(home,'.claude.json'),path.join(home,'.gemini/settings.json'),path.join(home,'.qwen/settings.json'),path.join(env.APPDATA||path.join(home,'AppData/Roaming'),'Claude/claude_desktop_config.json')];
  for(const configFile of jsonFiles)try{
    if(fs.statSync(configFile).size>5e6)continue;
    const data=JSON.parse(fs.readFileSync(configFile,'utf8'));
    for(const[name,config]of Object.entries(data.mcpServers||data.mcp||{})){
      if(canonical(name)!==provider||!config||config.disabled===true||config.enabled===false)continue;
      const key=config.env?.[variable];if(useful(key))return{key,source:'configured_mcp'};
    }
  }catch{}
  return null;
}
class CreditSecrets{
  constructor(directory,crypto){this.directory=directory;this.crypto=crypto;}
  read(){try{const p=path.join(this.directory,'credit-secrets.json');if(fs.statSync(p).size>65536)throw Error();const d=JSON.parse(fs.readFileSync(p,'utf8'));return d&&typeof d==='object'&&!Array.isArray(d)?d:{};}catch(e){if(e.code==='ENOENT')return{};throw new Error('credential_storage_failed');}}
  has(provider){return !!this.read()[provider];}
  get(provider){if(!Object.hasOwn(variables,provider))return null;const value=this.read()[provider];if(!value)return null;if(!this.crypto?.isEncryptionAvailable())throw new Error('credential_storage_failed');try{return this.crypto.decryptString(Buffer.from(value,'base64'));}catch{throw new Error('credential_storage_failed');}}
  write(data){fs.mkdirSync(this.directory,{recursive:true});const target=path.join(this.directory,'credit-secrets.json'),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600});fs.renameSync(temp,target);}
  set(provider,key){if(!['firecrawl','tavily','deepseek'].includes(provider)||!useful(key))throw new Error('invalid_credential');if(!this.crypto?.isEncryptionAvailable()||this.crypto.getSelectedStorageBackend?.()==='basic_text')throw new Error('credential_storage_failed');const previous=this.read(),data={...previous};data[provider]=this.crypto.encryptString(key).toString('base64');this.write(data);return()=>this.write(previous);}
}
module.exports={variables,useful,parseString,configuredKey,CreditSecrets};
