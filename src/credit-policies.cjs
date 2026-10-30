'use strict';
// Reviewed official rules are distinct from account facts. Combined balances
// never acquire an invented monthly expiry.
const checkedOn='2026-10-30';
const policies={
suno:{url:'https://help.suno.com/en/articles/2417089',zh:'付费订阅的生成积分按月补充，年付与月付均有月度发放。MCP区分歌曲生成积分与下载额度；其会员续期字段不当作积分失效或发放日，缺失的积分日期可本人填写预计。',en:'Paid plans replenish generation credits monthly with either monthly or annual billing. The MCP separates song-generation and download credits. Subscription renewal is not treated as credit expiry or grant timing; missing credit dates can be entered as user forecasts.'},
firecrawl:{url:'https://docs.firecrawl.dev/billing',zh:'套餐积分按月度周期重置。部分年付套餐允许结转；购买积分通常随有效订阅保留。总余额中各类积分的到期明细未提供。',en:'Plan credits renew monthly. Some annual plans allow rollover; purchased credits generally remain while subscribed. Individual expiries within the total are not provided.'},
tavily:{url:'https://docs.tavily.com/faq/faq',zh:'月度额度在每月1日重置，与账单日无关。官方未说明具体时刻和时区；按日期提醒核实，不宣称已到账。',en:'Monthly quota resets on the first day, regardless of billing date. The official FAQ specifies no time or timezone; date reminders ask for verification.'},
lovart:{url:'https://www.lovart.ai/statement/lovart-subscribe-faq',zh:'订阅积分在下一账期重置，不结转。2026-06-30起新购买的充值积分有效366天，之前购买的长期有效。余额接口未返回各积分类型及账号账期日。',en:'Subscription credits reset next cycle without rollover. Top-ups bought from 2026-06-30 expire after 366 days; earlier purchases remain valid. The API does not identify these pools or your billing date.'},
xyq:{url:'https://xyq.jianying.com/pricing',zh:'每日赠送积分当日清零，会员另有每月积分。当前CLI仅提供合计余额，不能判断其中多少是每日或每月积分，也未返回账号发放日。',en:'Daily gifts expire that day; memberships also include monthly credits. The CLI gives only a total, without the daily/monthly breakdown or account grant date.'},
jimeng:{url:'https://jimeng.jianying.com/',zh:'会员有每月积分，每日登录另有赠送；部分活动赠送仅有效29天。会员积分与API套餐额度不通用，当前CLI未提供到期明细或发放日期。',en:'Memberships have monthly credits and login gifts; some promotional grants last 29 days. Membership and API-plan credits are separate. The CLI does not return expiries or grant dates.'},
runway:{url:'https://help.runwayml.com/hc/en-us/articles/15124877443219-How-do-credits-work',zh:'Standard、Pro、Unlimited的月度积分在账期结束时失效；Max、Team可结转最多一个月。购买积分及一次性免费积分长期有效。网页版与API积分不同。',en:'Standard, Pro and Unlimited monthly credits expire at the billing boundary. Max and Team allow up to one month of rollover. Purchased and one-time free credits do not expire. Web-app and API balances differ.'},
exa:{url:'https://exa.ai/docs/admin/billing',zh:'符合条件的首个免费团队，每月1日恢复免费额度，未用部分不结转；一次性入门奖励不失效。当前配置未提供可查询团队余额的管理权限。',en:'An eligible first free team receives a monthly grant on the first day without rollover. The onboarding bonus does not expire. The configured connection does not expose team-balance management access.'},
deepseek:{url:'https://static.deepseek.com/faq/index.html?lang=zh',zh:'官方帮助明确充值余额永久有效；赠送余额有独立有效期，可到账号账单页查看。余额接口不返回赠金到期日，也没有固定月度恢复周期。',en:'Official help states that topped-up funds do not expire. Grant expiry is shown on the account billing page, but is absent from the balance API. There is no fixed monthly renewal schedule.'},
codex:{url:'https://developers.openai.com/codex/app-server',zh:'以本机官方接口返回的周期恢复时间和每张重置卡的到期时间为准，原小仪表提醒设置保留。',en:'Uses cycle renewal times and individual reset-credit expiries returned by the local official API. Original badge reminder preferences remain in effect.'},
kimi:{url:'https://www.kimi.com/code/console',zh:'显示已登录账号接口返回的实际周期与恢复时间，不根据套餐名称猜测周期。',en:'Uses the signed-in account’s actual returned windows and reset times, without inferring windows from a plan name.'},
minimax:{url:'https://platform.minimax.io/subscribe/token-plan',zh:'以当前海外Token Plan接口返回的时段与周窗口为准。Claude和MMX共享已绑定套餐，不能把它们重复相加。',en:'Uses interval and weekly windows for the bound international Token Plan. Claude and MMX share that plan and must not be added together.'},
zai:{url:'https://bigmodel.cn/finance-center/usage',zh:'模型额度、工具次数及重置卡分别读取；以接口返回的恢复和到期时间为准。',en:'Model quota, tool requests and reset credits are read separately, using returned renewal and expiry times.'}
};
const dateHints={xyq:{zh:'CLI 未返回分项与日期',en:'CLI omits pool dates'},jimeng:{zh:'CLI 未返回有效期',en:'CLI omits expiry dates'},lovart:{zh:'插件仅返回总余额',en:'Plugin returns a total only'},deepseek:{zh:'充值永久有效；赠金日期另查',en:'Top-ups never expire; check grant dates'}};
function policyFor(provider){const p=policies[provider];return p?{...p,checkedOn,dateHint:dateHints[provider]||null}:null;}
function nextMonthlyDate(now=Date.now()){const d=new Date(now);if(d.getUTCDate()===1)return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;return `${d.getUTCFullYear()+(d.getUTCMonth()===11?1:0)}-${String(d.getUTCMonth()===11?1:d.getUTCMonth()+2).padStart(2,'0')}-01`;}
function firecrawlCycle(data){const start=Date.parse(data.billingPeriodStart),end=Date.parse(data.billingPeriodEnd),days=(end-start)/86400000;return Number.isFinite(start)&&Number.isFinite(end)&&days>=27&&days<=32&&typeof data.planCredits==='number'&&data.planCredits>0?end:null;}
function enrichSchedules(record){
  if(record.provider==='deepseek')return{...record,pools:record.pools.map(p=>p.id.endsWith('.purchased')?{...p,expiryStatus:'never',expirySource:'policy'}:p)};
  if(record.provider!=='firecrawl')return record;
  return{...record,pools:record.pools.map(p=>{const end=firecrawlCycle({billingPeriodStart:p.periodStart?new Date(p.periodStart).toISOString():null,billingPeriodEnd:p.periodEnd?new Date(p.periodEnd).toISOString():null,planCredits:p.limit});return end&&(!p.resetsAt||p.resetsAt===end)?{...p,resetsAt:end,resetSource:'policy',resetLabel:'套餐月度积分',resetLabelEn:'Monthly plan credits'}:p;})};
}
module.exports={policyFor,nextMonthlyDate,firecrawlCycle,enrichSchedules};
