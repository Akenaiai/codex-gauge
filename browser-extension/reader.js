/* Runs only when the user starts the picker or the dedicated quota tab is read. */
function gaugePick(kind,labels,deadline=Date.now()+60000,expectedURL){
 return new Promise((resolve,reject)=>{
  if(Date.now()>=deadline)return reject(Error('timeout'));
  const onPage=()=>!location.search&&!location.hash&&location.origin+location.pathname===expectedURL&&(location.origin==='https://app.tapnow.ai'&&location.pathname==='/home'||location.origin==='https://ideogram.ai'&&['/','/t/explore','/explore','/home'].includes(location.pathname));if(!onPage())return reject(Error('page_closed'));
  const banner=document.createElement('div');banner.textContent=labels[kind];Object.assign(banner.style,{position:'fixed',top:'12px',left:'50%',transform:'translateX(-50%)',zIndex:2147483647,background:'#172326',color:'white',padding:'14px 20px',borderRadius:'10px',pointerEvents:'none',font:'14px sans-serif'});document.documentElement.append(banner);
  const outline=document.createElement('div');Object.assign(outline.style,{position:'fixed',zIndex:2147483646,border:'3px solid #58c8b2',pointerEvents:'none',borderRadius:'4px'});document.documentElement.append(outline);
  const text=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').trim();
  const valid=e=>e&&e!==document.body&&e!==document.documentElement&&!e.matches('input,textarea,select')&&!e.isContentEditable&&!e.closest('form')&&e.getBoundingClientRect().width>0&&text(e).length>0&&text(e).length<=100;
  function selector(e){const parts=[];for(let n=e;n&&n!==document.body&&parts.length<12;n=n.parentElement){if(n.id&&/^[A-Za-z][\w-]{1,50}$/.test(n.id)){parts.unshift('#'+CSS.escape(n.id));return parts.join(' > ');}const tag=n.tagName.toLowerCase(),same=Array.from(n.parentElement?.children||[]).filter(x=>x.tagName===n.tagName);parts.unshift(tag+':nth-of-type('+(same.indexOf(n)+1)+')');}return'body > '+parts.join(' > ');}
  let current=null;function move(event){if(!onPage()||Date.now()>=deadline){stop();reject(Error(onPage()?'timeout':'page_closed'));return;}const e=event.target;if(!valid(e))return;current=e;const r=e.getBoundingClientRect();Object.assign(outline.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});}
  function block(e){if(!onPage()||Date.now()>=deadline){stop();reject(Error(onPage()?'timeout':'page_closed'));return;}e.preventDefault();e.stopImmediatePropagation();}
  function stop(){clearTimeout(timer);document.removeEventListener('pointermove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);for(const type of ['pointerdown','pointerup','mousedown','mouseup'])document.removeEventListener(type,block,true);banner.remove();outline.remove();}
  function click(event){if(!onPage()||Date.now()>=deadline){stop();reject(Error(onPage()?'timeout':'page_closed'));return;}event.preventDefault();event.stopImmediatePropagation();const e=valid(event.target)?event.target:current;if(!valid(e))return;const result={selector:selector(e),preview:text(e)};stop();resolve(result);}
  function key(e){if(!onPage()||Date.now()>=deadline){stop();reject(Error(onPage()?'timeout':'page_closed'));return;}block(e);if(e.key==='Escape'){stop();reject(Error('cancelled'));}}
  const timer=setTimeout(()=>{stop();reject(Error('cancelled'));},Math.min(60000,deadline-Date.now()));document.addEventListener('pointermove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);for(const type of ['pointerdown','pointerup','mousedown','mouseup'])document.addEventListener(type,block,true);
 });
}
async function gaugeRead(selectors,settle,deadline=Date.now()+55000,expectedURL){
 if(Date.now()>=deadline)return{expired:true};
 const onPage=()=>!location.search&&!location.hash&&location.origin+location.pathname===expectedURL&&(location.origin==='https://app.tapnow.ai'&&location.pathname==='/home'||location.origin==='https://ideogram.ai'&&['/','/t/explore','/explore','/home'].includes(location.pathname));if(!onPage())throw Error('page_closed');
 const pause=ms=>new Promise(r=>setTimeout(r,ms));if(settle)await pause(5000);
 const visible=e=>{if(!e||e.matches('input,textarea,select')||e.isContentEditable||e.closest('form'))return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!e.closest('[aria-busy="true"]');};
 const read=()=>{const b=document.querySelector(selectors.balance),m=document.querySelector(selectors.marker);if(!visible(b)||!visible(m))return null;const balance=(b.innerText||'').trim(),marker=(m.innerText||m.getAttribute('aria-label')||m.getAttribute('title')||'').trim();if(!marker||marker.length>100||balance.length>100)return null;return{balance,marker};};
 let previous=null,count=0;for(let i=0;i<16;i++){if(Date.now()>=deadline)return{expired:true};if(!onPage())throw Error('page_closed');const next=read();if(next&&JSON.stringify(next)===JSON.stringify(previous))count++;else count=0;previous=next;if(next&&count>=2){if(!onPage())throw Error('page_closed');return Date.now()>=deadline?{expired:true}:next;}await pause(750);}throw Error('selection_changed');
}
function gaugeAmount(text){
 const m=String(text).trim().match(/^(?:(?:Tapies\s*(?:余额|balance)|余额|剩余|可用积分|积分|Tapies|Credits)\s*[:：]?\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*(?:Tapies|Credits|积分))?$/i);
 if(!m)throw Error('selection_changed');const n=Number(m[1].replaceAll(',',''));if(!Number.isFinite(n)||n<0||n>1e12)throw Error('selection_changed');return n;
}
function gaugeTapNowStep(anchor,deadline){
 if(Date.now()>=deadline)return{expired:true};
 if(location.origin!=='https://app.tapnow.ai'||location.pathname!=='/home'||location.search||location.hash)throw Error('page_closed');
 const visible=e=>{if(!e||e.matches('input,textarea,select')||e.isContentEditable||e.closest('form,[inert],[hidden],[aria-hidden="true"],[aria-busy="true"]'))return false;const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}return true;};
 const one=selector=>{const rows=Array.from(document.querySelectorAll(selector)).filter(visible);return rows.length===1?rows[0]:null;};
 const menuSelector='[data-testid="common-nav-user-menu"]',balanceSelector='[data-testid="common-nav-user-menu-dropdown"] [data-testid="common-nav-user-menu-balance-quota-card"] > div:first-child > div:first-child > span:first-of-type';
 const menu=one(menuSelector),team=one(menuSelector+' [title]');if(!menu||!team)return{pending:true};
 const marker=(team.getAttribute('title')||'').trim();if(!marker||marker.length>100||anchor&&marker!==anchor)throw Error('selection_changed');
 if(menu.getAttribute('aria-expanded')!=='true'){if(anchor)throw Error('selection_changed');if(Date.now()>=deadline)return{expired:true};menu.click();return{pending:true,marker};}
 const b=one(balanceSelector);if(!b)return{pending:true,marker};const balance=(b.innerText||'').trim();
 if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(balance)||balance.length>32)return{pending:true,marker};
 if(one(menuSelector+' [title]')?.getAttribute('title')?.trim()!==marker)throw Error('selection_changed');
 return Date.now()>=deadline?{expired:true}:{balance,marker};
}
if(typeof module==='object')module.exports={gaugeAmount};
