'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

// Catalog metadata is descriptive. Only explicit adapters may execute a query.
const definitions = [
  ['codex', 'Codex', '开发', 'Development', ['codex', 'codex-app-tools'], ['codex']],
  ['xyq', '小云雀', '图片与视频', 'Images & video', ['xyq', 'pippit', 'pippit-tool-cli', 'xyq-skill', 'xyq-short-drama-skill', 'xyq-marketing-skill'], ['pippit-tool-cli']],
  ['jimeng', '即梦', '图片与视频', 'Images & video', ['dreamina', 'jimeng', 'seedance'], ['dreamina']],
  ['lovart', 'Lovart', '图片与视频', 'Images & video', ['lovart'], []],
  ['firecrawl', 'Firecrawl', '搜索与资料', 'Research', ['firecrawl', 'app-6a314a73f8ac819195b0d55e36b9c609'], ['firecrawl']],
  ['runway', 'Runway', '图片与视频', 'Images & video', ['runway'], []],
  ['deepseek', 'DeepSeek', '模型 API', 'Model API', ['deepseek'], []],
  ['claude', 'Claude Code', '开发', 'Development', ['claude', 'claude-code'], ['claude']],
  ['gemini', 'Gemini', '开发与模型', 'Coding & models', ['gemini', 'gemini-cli'], ['gemini']],
  ['qwen', 'Qwen Code', '开发', 'Development', ['qwen', 'qwen-code'], ['qwen']],
  ['kimi', 'Kimi', '开发与模型', 'Coding & models', ['kimi', 'kimi-cli', 'kimi-cu'], ['kimi']],
  ['minimax', 'MiniMax', '开发与模型', 'Coding & models', ['minimax', 'minimax-code'], ['minimax']],
  ['zai', '智谱 / Z.AI', '开发与模型', 'Coding & models', ['zcode', 'zai', 'glm-camp', 'zai-mcp-server', 'web-reader', 'web-search-prime'], ['zcode']],
  ['ark', '火山方舟', '模型 API', 'Model API', ['arkcli', 'ark', 'arkcli-gen', 'arkcli-usage'], ['arkcli']],
  ['openai-api', 'OpenAI API', '模型 API', 'Model API', ['openai'], ['openai']],
  ['tapnow', 'TapNow', '图片与视频', 'Images & video', ['tapnow'], ['tapnow']],
  ['chatcut', 'ChatCut', '视频制作', 'Video editing', ['chatcut'], ['chatcut']],
  ['notebooklm', 'NotebookLM', '搜索与资料', 'Research', ['notebooklm', 'notebooklm-browser-query'], ['notebooklm']],
  ['exa', 'Exa', '搜索与资料', 'Research', ['exa', 'exa-smithery', 'app-69ea4ed2cf7c8191b742ef3622479ddd'], ['exa']],
  ['tavily', 'Tavily', '搜索与资料', 'Research', ['tavily', 'tavily-mcp', 'app-69f271663a288191ac98f46bed7cb032'], []],
  ['adobe', 'Adobe', '设计', 'Design', ['adobe', 'app-69312da8e4dc81919370cb86fd172b6c'], []],
  ['canva', 'Canva', '设计', 'Design', ['canva'], []],
  ['figma', 'Figma', '设计', 'Design', ['figma', 'talk-to-figma', 'talktofigma'], []],
  ['stitch', 'Stitch', '设计', 'Design', ['stitch'], []],
  ['pencil', 'Pencil', '设计', 'Design', ['pencil'], []],
  ['descript', 'Descript', '视频制作', 'Video editing', ['descript', 'app-69f0dc45f6048191876c14c1016fe778'], []],
  ['tripo', 'Tripo', '三维', '3D', ['tripo', 'tripo-3d'], []],
  ['taptap-maker', 'TapTap Maker', '游戏制作', 'Game creation', ['taptap-maker'], ['taptap-maker']],
  ['comfy-local', 'ComfyUI', '本地创作', 'Local creation', ['comfy-local', 'comfyui'], ['comfy']],
  ['ollama', 'Ollama', '本地模型', 'Local models', ['ollama'], ['ollama']],
  ['agent-relay', 'Agent Relay', '开发协调', 'Coding coordination', ['agent-relay'], []],
  ['github', 'GitHub', '开发服务', 'Developer service', ['github', 'gh'], ['gh']],
  ['vercel', 'Vercel', '部署服务', 'Deployment', ['vercel'], ['vercel']],
  ['netlify', 'Netlify', '部署服务', 'Deployment', ['netlify', 'netlify-mcp'], ['netlify']],
  ['lark', '飞书', '协作', 'Collaboration', ['lark', 'lark-cli'], ['lark-cli']],
  ['dingtalk', '钉钉', '协作', 'Collaboration', ['dingtalk'], ['dingtalk']],
  ['supabase', 'Supabase', '开发服务', 'Developer service', ['supabase'], ['supabase']],
  ['context7', 'Context7', '开发资料', 'Development docs', ['context7', 'context7-legacy'], []],
  ['playwright', 'Playwright', '浏览器测试', 'Browser testing', ['playwright', 'playwright-automatalabs'], ['playwright']],
  ['suno', 'Suno', '音乐', 'Music', ['suno'], []],
  ['second-brain', '第二大脑', '本地资料', 'Local research', ['second-brain','aken-second-brain'], []],
  ['mobbin', 'Mobbin', '设计资料', 'Design references', ['mobbin','app-69fdb9081018819193707354f21b366e'], []],
  ['appdeploy', 'AppDeploy', '部署服务', 'Deployment', ['appdeploy','app-6956e6ff740481919946ceae8e5d6304'], []],
  ['coursera-learning', 'Coursera Learning', '学习', 'Learning', ['coursera-learning','coursera_learning','app-68e01e8c1c2081918b4567a0b959d3ff'], []],
  ['spaceship', 'Spaceship', '域名', 'Domains', ['spaceship','app-692e119561848191979b13cc5c060389'], []],
  ['metricool', 'Metricool', '内容管理', 'Content management', ['metricool','app-69d73fc8aa5c8191bec1583760b130c7'], []],
  ['parallel-search', 'Parallel Search', '搜索与资料', 'Research', ['parallel-search','parallel_search','app-69fb9378663481919a68e8a2109644e5'], []],
  ['remote-desktop-commander', 'Remote Desktop Commander', '电脑工具', 'Computer tools', ['remote-desktop-commander','remote_desktop_commander','app-6a057d268ebc81919918d37eec718425'], []],
  ['devpost-hackathons', 'Devpost Hackathons', '比赛', 'Hackathons', ['devpost-hackathons','devpost_hackathons','app-6a330a7730c081919892632d5baaec58'], []],
];
const providers = Object.fromEntries(definitions.map(([id, name, category, categoryEn, aliases, bins]) => [id, { id, name, category, categoryEn, aliases, bins }]));
const hash = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 20);
function canonical(name) {
  const normalized = String(name).toLowerCase().replace(/@(?:openai|personal|chatcut).*$/, '').trim();
  for (const def of Object.values(providers)) if (def.aliases.includes(normalized)) return def.id;
  // Renamed copies of the same MCP entry use the original name as a prefix.
  for (const def of Object.values(providers)) if (def.aliases.some(a => normalized.startsWith(a + ' '))) return def.id;
  const extraAliases = { 'sequential thinking 智能思考链':'sequential-thinking', 'sequential-thinking-legacy':'sequential-thinking' };
  if (extraAliases[normalized]) return extraAliases[normalized];
  const base = normalized.replace(/\s+[\u3400-\u9fff].*$/, '').replace(/-legacy$/, '');
  return base.replace(/[^a-z0-9\u3400-\u9fff._-]/g, '-').slice(0, 110) || 'tool-' + hash(name);
}
function read(file, issues) {
  try { const stat = fs.statSync(file); if (stat.size > 5e6) throw new Error(); return fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code !== 'ENOENT') issues.push({ source: path.basename(file), status: 'unreadable' }); return null; }
}
function entriesToml(text) {
  const found = []; let current;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      current = null;
      const m = line.match(/^\s*\[(mcp_servers|plugins)\.(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\.\]\s]+))\]\s*(?:#.*)?$/);
      if (m) { current = { name: m[2] || m[3] || m[4], kind: m[1] === 'plugins' ? 'plugin' : 'mcp', enabled: true }; found.push(current); }
    } else if (current) {
      const enabled = line.match(/^\s*(?:enabled|disabled)\s*=\s*(true|false)\b/);
      if (enabled) current.enabled = /^\s*disabled/.test(line) ? enabled[1] === 'false' : enabled[1] === 'true';
    }
  }
  return found;
}
function entriesJson(text) {
  const data = JSON.parse(text); const result = [];
  for (const [name, config] of Object.entries(data.mcpServers || data.mcp || {})) {
    if (!config || typeof config !== 'object') continue;
    result.push({ name, kind: 'mcp', enabled: config.disabled !== true && config.enabled !== false });
  }
  return result;
}
function findExecutable(name, { home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const dirs = [...(env.PATH || '').split(path.delimiter), path.join(home, '.local', 'bin'),
    path.join(home, '.cargo', 'bin'), path.join(home, '.bun', 'bin'), env.APPDATA && path.join(env.APPDATA, 'npm')].filter(Boolean);
  for (const dir of [...new Set(dirs)]) for (const ext of platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : ['']) {
    const file = path.join(dir, name + ext);
    try { if (fs.statSync(file).isFile()) return file; } catch { }
  }
  return null;
}
function findPippitBinary({home=os.homedir(),env=process.env,platform=process.platform}={}){
  const entry=findExecutable('pippit-tool-cli',{home,env,platform});
  if(entry&&!/\.(cmd|ps1|bat)$/i.test(entry))return entry;
  const suffix=platform==='win32'?'pippit-tool-cli.exe':'pippit-tool-cli';
  const roots=entry?[path.dirname(entry)]:[];
  const fnm=path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'fnm','node-versions');
  try{for(const version of fs.readdirSync(fnm).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).slice(0,20))roots.push(path.join(fnm,version,'installation'));}catch{}
  const candidates=roots.map(root=>path.join(root,'node_modules','@pippit-dev','cli','bin',suffix));
  candidates.push(path.join(home,'.cache','pippit-tool-cli','xyq-skill',platform+'-'+process.arch,'current','node_modules','@pippit-dev','cli','bin',suffix));
  return candidates.find(p=>fs.existsSync(p))||null;
}
function scan({ home = os.homedir(), env = process.env, platform = process.platform, hostTools = [], extraFiles = [] } = {}) {
  const items = new Map(), issues = [], sources = [];
  const add = (name, kind, source, enabled = true, evidence = 'configured') => {
    if (typeof name !== 'string' || name.length > 180) return;
    const id = canonical(name); const def = providers[id];
    if (!items.has(id)) items.set(id, { id, name: def?.name || name, category: def?.category || '其他工具', categoryEn: def?.categoryEn || 'Other tools', connections: [] });
    const connection = { kind, source, label: name, enabled, evidence };
    const row = items.get(id);
    if (!row.connections.some(c => c.kind === kind && c.source === source && c.label === name)) row.connections.push(connection);
  };
  const configFiles = [
    [path.join(home, '.codex', 'config.toml'), 'Codex'], [path.join(home, '.claude.json'), 'Claude Code'],
    [path.join(home, '.cursor', 'mcp.json'), 'Cursor'], [path.join(home, '.gemini', 'settings.json'), 'Gemini CLI'],
    [path.join(home, '.qwen', 'settings.json'), 'Qwen Code'],
    [path.join(home, '.config', 'opencode', 'opencode.json'), 'OpenCode'],
    [path.join(home, '.codeium', 'windsurf', 'mcp_config.json'), 'Windsurf'],
    [path.join(env.APPDATA || path.join(home, 'Library', 'Application Support'), 'Claude', 'claude_desktop_config.json'), 'Claude Desktop'], ...extraFiles,
  ];
  for (const [file, label] of configFiles) {
    const text = read(file, issues); if (text == null) continue;
    try {
      const found = file.endsWith('.toml') ? entriesToml(text) : entriesJson(text);
      for (const e of found) add(e.name.split('@')[0], e.kind, label, e.enabled);
      sources.push({ name: label, kind: 'configuration', count: found.length });
    } catch { issues.push({ source: label, status: 'parse_failed' }); }
  }
  for (const def of Object.values(providers)) for (const bin of def.bins) {
    if (findExecutable(bin, { home, env, platform })) add(def.id, 'cli', 'PATH', true, 'installed');
  }
  if(findPippitBinary({home,env,platform}))add('xyq','cli','Local CLI installation',true,'installed');
  const skillRoots = [path.join(home, '.codex', 'skills'), path.join(home, '.agents', 'skills')];
  for (const root of skillRoots) {
    let dirs; try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const dir of dirs) {
      if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
      const id = canonical(dir.name);
      if (!providers[id]) continue; // A writing Skill is not an installed AI account.
      if (fs.existsSync(path.join(root, dir.name, 'SKILL.md'))) add(id, 'skill', path.basename(path.dirname(root)) + '/skills', true, 'instructions');
    }
  }
  // Cached plugins are visible as cached, never silently upgraded to enabled.
  const cache = path.join(home, '.codex', 'plugins', 'cache');
  try {
    for (const market of fs.readdirSync(cache, { withFileTypes: true })) {
      if (!market.isDirectory()) continue;
      for (const plugin of fs.readdirSync(path.join(cache, market.name), { withFileTypes: true })) {
        if (!plugin.isDirectory()) continue;
        add(plugin.name, 'plugin', 'Codex plugin cache', false, 'cached');
        const row = items.get(canonical(plugin.name));
        try {
          const folder = path.join(cache, market.name, plugin.name);
          const versions = fs.readdirSync(folder, { withFileTypes: true }).filter(v => v.isDirectory()).sort((a,b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
          for (const version of versions.slice(0, 1)) {
            const manifest = JSON.parse(fs.readFileSync(path.join(folder, version.name, '.codex-plugin', 'plugin.json'), 'utf8'));
            const label = manifest.interface?.displayName;
            if (!providers[row.id] && typeof label === 'string' && label.trim() && label.length < 90) {
              const resolved = canonical(label);
              if (providers[resolved] && resolved !== row.id) {
                const connections = row.connections; items.delete(row.id);
                for (const c of connections) add(resolved,c.kind,c.source,c.enabled,c.evidence);
              } else row.name = label;
            }
          }
        } catch { }
      }
    }
  } catch (e) { if (e.code !== 'ENOENT') issues.push({ source: 'Plugin cache', status: 'unreadable' }); }
  // Connector names are supplied by the host integration; no credentials or tool arguments.
  for (const entry of hostTools) if (entry && typeof entry.name === 'string') add(entry.name, entry.kind === 'mcp' ? 'mcp' : 'plugin', 'Codex connected tools', true, 'host_available');
  const envProviders = { DEEPSEEK_API_KEY: 'deepseek', OPENAI_API_KEY: 'openai-api', FIRECRAWL_API_KEY: 'firecrawl', ARK_API_KEY: 'ark', MINIMAX_API_KEY: 'minimax', MOONSHOT_API_KEY: 'kimi', DASHSCOPE_API_KEY: 'qwen' };
  for (const [key, id] of Object.entries(envProviders)) if (env[key]) add(id, 'api', 'Environment: ' + key, true, 'credential_reference');
  for (const id of ['deepseek','openai','firecrawl']) {
    if (fs.existsSync(path.join(home,'.codex','private','credentials',id+'-api-key.dpapi'))) add(id === 'openai' ? 'openai-api' : id,'api','Windows secure credential',true,'credential_reference');
  }
  const tools = [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { scannedAt: Date.now(), tools, sources, issues, coverage: ['Codex', 'Claude Code', 'Claude Desktop', 'Cursor', 'Gemini CLI', 'Qwen Code', 'OpenCode', 'Windsurf', 'PATH', 'Codex/Agents Skills', 'Codex plugin cache', 'Host connector inventory'] };
}
module.exports = { providers, hash, canonical, scan, entriesToml, entriesJson, findExecutable, findPippitBinary };
