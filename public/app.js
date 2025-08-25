const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const employeeIdInput = $('#employeeId');
const toast = $('#toast');
const submitIn = $('#submit-in');
const submitOut = $('#submit-out');
const calTitle = $('#cal-title');
const calPrev = $('#cal-prev');
const calNext = $('#cal-next');
const calEl = $('#calendar');
const waveCanvas = $('#wave-canvas');
const wave7 = $('#wave-7');
const wave30 = $('#wave-30');
const wave90 = $('#wave-90');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// Persist employeeId in localStorage
const KEY = 'feeltime.employeeId';
employeeIdInput.value = localStorage.getItem(KEY) || '';
employeeIdInput.addEventListener('change', () => localStorage.setItem(KEY, employeeIdInput.value.trim()));

// Emotion selection logic
const selected = { in: null, out: null };
$$('.emotions').forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji');
    if (!btn) return;
    const v = Number(btn.dataset.v);
    const t = group.dataset.target;
    selected[t] = v;
    group.querySelectorAll('.emoji').forEach((el) => el.classList.toggle('selected', el === btn));
    updateSubmitState();
  });
});

async function postJSON(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || '送信に失敗しました');
  return json;
}

async function refresh(employeeId) {
  if (!employeeId) return;
  // summary
  const sumRes = await fetch(`/api/summary?employeeId=${encodeURIComponent(employeeId)}`);
  const sum = await sumRes.json();
  if (sum.ok) {
    const s = sum.summary;
    $('#summary').innerHTML = `
      <div class="card">出勤: <strong>${s.in.count}</strong> 件 平均: ${formatAvg(s.in.avg)}</div>
      <div class="card">退勤: <strong>${s.out.count}</strong> 件 平均: ${formatAvg(s.out.avg)}</div>
    `;
  }
  // recent
  const recRes = await fetch(`/api/recent?employeeId=${encodeURIComponent(employeeId)}&limit=10`);
  const rec = await recRes.json();
  if (rec.ok) {
    $('#recent').innerHTML = rec.rows.map(r => `
      <li>
        <span class="badge">${r.event_type === 'in' ? '出勤' : '退勤'}</span>
        <span>${emoji(r.emotion)}</span>
        <span class="muted">${new Date(r.created_at).toLocaleString()}</span>
        ${r.note ? `<span>- ${escapeHtml(r.note)}</span>` : ''}
      </li>
    `).join('');
  }
}

function formatAvg(v){
  if (v == null) return '-';
  return (Math.round(v * 10) / 10).toFixed(1);
}

function emoji(v){
  return ['','😡','😟','😐','🙂','😄'][v] || '❓';
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

async function handleSubmit(type){
  const employeeId = employeeIdInput.value.trim();
  if (!employeeId){ showToast('社員IDを入力してください'); return; }
  const emotion = selected[type];
  if (!emotion){ showToast('感情アイコンを選択してください'); return; }
  const note = $('#note-' + type).value.trim();
  const dtVal = $('#dt-' + type)?.value;
  try{
    const btn = type === 'in' ? submitIn : submitOut;
    btn.disabled = true;
    const payload = { employeeId, type, emotion, note };
    if (dtVal) {
      const iso = new Date(dtVal).toISOString();
      payload.createdAt = iso;
    }
    await postJSON('/api/clock', payload);
    showToast(`${type === 'in' ? '出勤' : '退勤'}を記録しました`);
    $('#note-' + type).value = '';
    if (dtVal) { $('#dt-' + type).value = ''; }
    selected[type] = null;
    document.querySelectorAll(`.emotions[data-target="${type}"] .emoji`).forEach(el => el.classList.remove('selected'));
    refresh(employeeId);
    renderCalendar();
  }catch(e){
    console.error(e);
    showToast(e?.message || '送信に失敗しました');
  }
  finally{
    updateSubmitState();
  }
}

submitIn.addEventListener('click', () => handleSubmit('in'));
submitOut.addEventListener('click', () => handleSubmit('out'));

function updateSubmitState(){
  const id = employeeIdInput.value.trim();
  submitIn.disabled = !id || !selected.in;
  submitOut.disabled = !id || !selected.out;
}

employeeIdInput.addEventListener('input', () => {
  updateSubmitState();
  refresh(employeeIdInput.value.trim());
  renderCalendar();
  renderWave();
});

updateSubmitState();
refresh(employeeIdInput.value.trim());
renderWave();

// ===== Calendar =====
let currentMonth = new Date(); // today
function ymKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function startOfMonth(d){ const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d){ const x = new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; }
function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hhmm(dateLike){ const d = new Date(dateLike); const h = String(d.getHours()).padStart(2,'0'); const m = String(d.getMinutes()).padStart(2,'0'); return `${h}:${m}`; }

async function fetchLogsForMonth(employeeId, date){
  if (!employeeId) return [];
  const from = startOfMonth(date).toISOString();
  const to = endOfMonth(date).toISOString();
  const res = await fetch(`/api/logs?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || '取得に失敗しました');
  return json.rows;
}

async function renderCalendar(){
  const employeeId = employeeIdInput.value.trim();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  calTitle.textContent = `${year}年 ${month+1}月`;

  // weekday headers
  const weekdays = ['日','月','火','水','木','金','土'];
  calEl.innerHTML = weekdays.map(d=>`<div class="cal-weekday">${d}</div>`).join('');

  const first = startOfMonth(currentMonth);
  const last = endOfMonth(currentMonth);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // start from Sunday
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay())); // end on Saturday

  let logs = [];
  try { logs = await fetchLogsForMonth(employeeId, currentMonth); } catch(e){ console.error(e); }
  const byDay = new Map();
  for (const r of logs){
    const d = new Date(r.created_at);
    const key = ymd(d);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }

  const todayKey = ymd(new Date());
  const cells = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
    const k = ymd(d);
    const inMonth = d.getMonth() === month;
    const dayLogs = (byDay.get(k) || []).sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
    const firstIn = dayLogs.find(ev => ev.event_type === 'in');
    const lastOut = [...dayLogs].reverse().find(ev => ev.event_type === 'out');
    const lines = [];
    if (firstIn){
      lines.push(`<div class="cal-line"><span class="cal-badge badge-in">出</span><span class="cal-time">${hhmm(firstIn.created_at)}</span><span>${emoji(firstIn.emotion)}</span></div>`);
    }
    if (lastOut){
      lines.push(`<div class="cal-line"><span class="cal-badge badge-out">退</span><span class="cal-time">${hhmm(lastOut.created_at)}</span><span>${emoji(lastOut.emotion)}</span></div>`);
    }
    cells.push(`
      <div class="cal-day ${k===todayKey?'today':''} ${inMonth?'':'out'}">
        <div class="date">${d.getDate()}</div>
        <div class="cal-logs">${lines.join('')}</div>
      </div>
    `);
  }
  calEl.innerHTML += cells.join('');
}

calPrev.addEventListener('click', () => { currentMonth = addMonths(currentMonth, -1); renderCalendar(); });
calNext.addEventListener('click', () => { currentMonth = addMonths(currentMonth, 1); renderCalendar(); });

renderCalendar();

// ===== Wave (emotion over time) =====
let waveDays = 30;
wave7?.addEventListener('click', ()=>{ waveDays = 7; setWaveButtons(); renderWave(); });
wave30?.addEventListener('click', ()=>{ waveDays = 30; setWaveButtons(); renderWave(); });
wave90?.addEventListener('click', ()=>{ waveDays = 90; setWaveButtons(); renderWave(); });

function setWaveButtons(){
  [wave7, wave30, wave90].forEach(b=> b && b.classList.remove('btn--filled'));
  if (waveDays === 7) wave7?.classList.add('btn--filled');
  if (waveDays === 30) wave30?.classList.add('btn--filled');
  if (waveDays === 90) wave90?.classList.add('btn--filled');
}

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }

async function renderWave(){
  if (!waveCanvas) return;
  const employeeId = employeeIdInput.value.trim();
  const now = new Date();
  const from = startOfDay(new Date(now.getTime()- (waveDays-1)*86400000));
  const to = endOfDay(now);
  let rows = [];
  try{
    const res = await fetch(`/api/logs?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    const json = await res.json();
    if (json.ok) rows = json.rows || [];
  }catch(e){ console.error(e); }
  drawWave(waveCanvas, rows, from, to);
}

function drawWave(canvas, rows, from, to){
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 260;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssWidth,cssHeight);

  const styles = getComputedStyle(document.documentElement);
  const grid = styles.getPropertyValue('--grid').trim() || '#e5e7eb';
  const text = styles.getPropertyValue('--muted').trim() || '#6b7280';
  const inColor = styles.getPropertyValue('--in-color').trim() || '#22c55e';
  const outColor = styles.getPropertyValue('--out-color').trim() || '#3b82f6';

  const pad = { left: 36, right: 12, top: 12, bottom: 24 };
  const W = cssWidth - pad.left - pad.right;
  const H = cssHeight - pad.top - pad.bottom;

  // axes/grid
  ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.lineWidth = 1;
  for (let v=1; v<=5; v++){
    const y = pad.top + H - (v-1) * (H/4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cssWidth - pad.right, y); ctx.stroke();
    ctx.fillText(String(v), 8, y+3);
  }

  // no data
  if (!rows || rows.length === 0){
    ctx.fillStyle = text; ctx.textAlign = 'center';
    ctx.fillText('データがありません', cssWidth/2, cssHeight/2);
    return;
  }

  const t0 = from.getTime();
  const t1 = to.getTime();
  function xFor(t){ if (t1===t0) return pad.left; return pad.left + ( (t - t0) / (t1 - t0) ) * W; }
  function yFor(val){ return pad.top + H - ( (val-1) / 4 ) * H; }

  const sorted = rows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));

  // unified line (all events)
  ctx.strokeStyle = '#d1d5db'; // light gray line for overall trend
  ctx.lineWidth = 2; ctx.beginPath();
  sorted.forEach((r,i)=>{
    const t = new Date(r.created_at).getTime();
    const x = xFor(t); const y = yFor(Number(r.emotion));
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points by type
  function drawPoints(type, color){
    ctx.fillStyle = color; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    sorted.filter(r=>r.event_type===type).forEach(r=>{
      const t = new Date(r.created_at).getTime();
      const x = xFor(t); const y = yFor(Number(r.emotion));
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    });
  }
  drawPoints('in', inColor);
  drawPoints('out', outColor);
}

window.addEventListener('resize', ()=> renderWave());
