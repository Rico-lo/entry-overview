'use strict';
const el=id=>document.getElementById(id);
const num=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=(v,signed=false)=>Number.isFinite(v)?(signed&&v>0?'+':'')+num(v/1e6):'—';
const time=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const bytes=v=>Number.isFinite(v)?num(v/1073741824)+' GiB':'—';
const write=(id,text)=>{el(id).textContent=text??'—';};
const pnl=(node,v)=>{node.textContent=money(v,true);node.classList.toggle('pos',v>0);node.classList.toggle('neg',v<0);};
const states={healthy:'健康',degraded:'需关注',blocked:'已阻断',unknown:'未知',active:'运行中',inactive:'未运行',failed:'故障',available:'可用',partial:'部分覆盖'};
function badge(id,state){write(id,states[state]||state||'未知');el(id).className='badge '+(['degraded','unknown','partial','inactive'].includes(state)?'warn':['blocked','failed'].includes(state)?'bad':'');}
const wins=s=>s?num(s.winning_rounds,0)+' / '+num(s.losing_rounds,0):'—';
const rate=s=>{if(!s)return '—';const n=s.winning_rounds+s.losing_rounds+s.flat_rounds;return n?num(100*s.winning_rounds/n,1)+'%':'无已结算成交';};
function row(values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;}
function notice(s){el('notice').hidden=!s;write('notice',s);}

function renderDrawdownPeriod(drawdown) {
 const container = el('dd-period');
 if (!drawdown?.trough_market) {
  container.textContent = drawdown ? '全历史结算曲线 · 暂无回撤' : '等待全历史核对';
  return;
 }
 const endpoint = (label, market) => {
  const part = document.createElement('span');
  const when = market ? time(new Date((Number(market.slice(3)) + 300) * 1000).toISOString()) : '期初';
  part.textContent = label + ' ' + when.replace(/:\d{2}$/, '');
  return part;
 };
 const arrow = document.createElement('span');
 arrow.className = 'range-arrow';
 arrow.textContent = ' → ';
 container.replaceChildren(endpoint('峰值',drawdown.peak_market), arrow, endpoint('谷值',drawdown.trough_market));
}

function drawWinChart(score) {
 const canvas = el('win-chart');
 const ctx = canvas.getContext('2d');
 if (!ctx) return;
 const size = canvas.width;
 const center = size / 2;
 const radius = size * 0.39;
 ctx.clearRect(0, 0, size, size);
 const palette = getComputedStyle(canvas);
 const parts = [
  [score?.winning_rounds, palette.getPropertyValue('--summary-orange').trim()],
  [score?.losing_rounds, palette.getPropertyValue('--chart-loss').trim()],
  [score?.flat_rounds, palette.getPropertyValue('--chart-flat').trim()],
 ];
 const total = parts.reduce((sum, [count]) => sum + (count || 0), 0);
 function arc(start, end, color, width) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.arc(center, center, radius, start, end);
  ctx.stroke();
 }
 const turn = 2 * Math.PI;
 arc(0, turn, palette.getPropertyValue('--chart-track').trim(), size * 0.12);
 if (!total) return;
 let angle = -Math.PI / 2;
 for (const [count, color] of parts) {
  if (!count) continue;
  const end = angle + turn * count / total;
  arc(angle, end, color, size * 0.12);
  angle = end;
 }
}

let last=null,token='',busy=false,failed=false;
function render(s){
 last=s;
 const f=s.financial,a=s.account,t=s.trading_health||{},v=s.vps||{},d=s.deployment||{},x=s.api_access_health||{};
 const full=f?.history?.kind==='full_history';
 write('scope-note',(full?'全历史':'当前账本')+' · 含手续费，不含返佣');
 renderDrawdownPeriod(f?.max_drawdown);

 pnl(el('total-pnl'),f?.total?.settled_pnl_micros);pnl(el('today-pnl'),f?.today?.settled_pnl_micros);
 write('day',f?.date_beijing||'北京时间');write('total-rounds',wins(f?.total));write('today-rounds',wins(f?.today));write('total-rate',rate(f?.total));write('today-rate',rate(f?.today));
 drawWinChart(f?.total);
 write('drawdown',money(f?.max_drawdown?.amount_micros));write('days',f?num(f.total.winning_days,0)+' / '+num(f.total.losing_days,0):'—');write('flats',f?num(f.total.flat_rounds,0):'—');
 write('spent',money(a?.spent_micros));write('fees',money(a?.fees_micros));write('payout',money(a?.payout_micros));write('unsettled',money(a?.unsettled_spent_micros));
 badge('health',t.state);write('connection',t.clob_connection==='connected'?'CLOB 已连接':'CLOB '+(t.clob_connection||'未知'));write('pending','在途订单 '+num(t.pending_orders,0));write('book-time','有效盘口时间 '+time(t.last_market_data_at));
 el('issues').replaceChildren();for(const i of t.issues||[]){const li=document.createElement('li');li.textContent=i.code+' · '+i.detail;el('issues').append(li);}
 el('latencies').replaceChildren();for(const [key,title] of [['actor.signal_queue','策略队列'],['runtime.consume','行情消费'],['dispatch.t0_to_http','确认 → 影子 HTTP'],['receipt.reconcile','成交对账']]){const m=t.latency_since_entry_start?.[key];el('latencies').append(row([title,m?num(m.count,0):'—',m?.count?'≤ '+num(m.p99_ms)+' ms':'—',m?.count?num(m.max_ms)+' ms':'—']));}
 write('cpu',Number.isFinite(v.cpu_percent)?num(v.cpu_percent,1)+'%':'等待第二次采样');write('steal',Number.isFinite(v.cpu_steal_percent)?num(v.cpu_steal_percent,1)+'%':'等待第二次采样');write('memory',bytes(v.memory_available_bytes)+' / '+bytes(v.memory_total_bytes));write('disk',bytes(v.disk_available_bytes)+' / '+bytes(v.disk_total_bytes));write('load',num(v.load_1m));write('host-time','采样 '+time(v.sampled_at));
 badge('unit-state',d.unit_state);write('started',time(d.entry_started_at));write('release',d.release?.match(/(?:^|-)(go\d+)(?:-|$)/i)?.[1].toUpperCase()||d.release||'尚未核实');el('release').title=d.release||'';write('restarts',num(d.automatic_restarts,0));
 badge('access-health',x.state);write('requests',num(x.requests,0)+' / '+num(x.peak_requests_per_minute,0));write('auth-errors',num(x.auth_failures,0)+' / '+num(x.rate_limited,0));write('server-errors',num(x.server_errors,0)+' / '+num(x.max_completed_request_ms)+' ms');write('suspicious',x.suspicious_traffic===true?'检测到异常访问模式':x.suspicious_traffic===false?'当前未检测到':'未知');
 notice([s.snapshot_error,s.financial_error?'账本核对失败：'+s.financial_error:'',d.error?'部署状态：'+d.error:''].filter(Boolean).join('；'));age();
}
function age(){
 if(!last)return;
 const stamp=Date.parse(last.as_of);
 const sec=Number.isFinite(stamp)?Math.max(0,Math.floor((Date.now()-stamp)/1000)):Infinity;
 const stale=failed||last.snapshot_stale||sec>=30;
 document.body.classList.toggle('stale',stale);
 const elapsed=sec<60?sec+' 秒前':Math.floor(sec/60)+' 分钟前';
 write('fresh-label',!Number.isFinite(sec)?'快照时间未知':stale?'快照 '+elapsed:'更新 '+time(last.as_of).split(' ').at(-1));
 el('fresh-label').title=time(last.as_of)+' · 北京时间';
 el('service-detail').hidden=!stale&&last.service_health?.state==='healthy';
 if(stale){
  badge('service-health','unknown');
  write('service-detail','快照已过期，刷新后核实服务状态。');
 }else{
  badge('service-health',last.service_health?.state);
  write('service-detail',last.service_health?.detail);
 }
 if(stale){write('health','上次快照');el('health').className='badge warn';}else badge('health',last.trading_health?.state);
}
async function refresh(){
 if(busy)return;busy=true;el('refresh').disabled=true;
 try{
  const response=await fetch('https://34-252-130-189.sslip.io:18080/api/entry/overview',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(8000)});
  if(response.status===401){el('login').hidden=false;failed=true;notice('需要只读访问凭据。');return;}
  if(response.status===429){failed=true;notice('刷新过于频繁，请稍后再试。');return;}
  const s=await response.json();failed=!response.ok;
  if(s.schema==='entry_overview_v1'){el('login').hidden=true;render(s);}else{throw Error(s.snapshot_error||'总览数据暂未就绪');}
 }catch(err){failed=true;notice('暂时无法获取总览：'+err.message+'。已显示的数据保留原快照时间。');}
 finally{busy=false;el('refresh').disabled=false;age();}
}
el('refresh').addEventListener('click',refresh);
el('login').addEventListener('submit',event=>{event.preventDefault();token=el('token').value;el('token').value='';refresh();});
setInterval(age,1000);
setInterval(()=>{if(el('auto').checked&&!document.hidden)refresh();},60000);
refresh();
