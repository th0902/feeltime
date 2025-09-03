const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const employeeIdInput = $('#employeeId');
const departmentSelector = $('#department-selector');
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
const trendDaysSel = $('#trend-days');
const weekdayTrendEl = $('#weekday-trend');
const weeklyTrendEl = $('#weekly-trend');
const dtInput = $('#dt');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// Persist employeeId in localStorage
const KEY = 'feeltime.employeeId';
employeeIdInput.value = localStorage.getItem(KEY) || '';
employeeIdInput.addEventListener('change', () => localStorage.setItem(KEY, employeeIdInput.value.trim()));

// Emotion selection logic (unified)
let selectedEmotion = null;
const emotionGroup = document.querySelector('.emotions');
emotionGroup?.addEventListener('click', (e) => {
  const btn = e.target.closest('.emoji');
  if (!btn) return;
  selectedEmotion = Number(btn.dataset.v);
  emotionGroup.querySelectorAll('.emoji').forEach((el) => el.classList.toggle('selected', el === btn));
  updateSubmitState();
});

async function postJSON(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || '送信に失敗しました');
  return json;
}

async function refresh(employeeId) {
  if (!employeeId) {
    $('#summary').innerHTML = '';
    $('#recent').innerHTML = '';
    return;
  }
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
  return s.replace(/[&<"'\/]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

async function handleSubmit(type){
  const employeeId = employeeIdInput.value.trim();
  if (!employeeId){ showToast('社員IDを入力してください'); return; }
  const emotion = selectedEmotion;
  if (!emotion){ showToast('感情アイコンを選択してください'); return; }
  const note = $('#note')?.value.trim() || '';
  const dtVal = $('#dt')?.value;
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
    const noteEl = $('#note'); if (noteEl) noteEl.value = '';
    if (dtVal) { setNowToDt(); }
    selectedEmotion = null;
    emotionGroup?.querySelectorAll('.emoji').forEach(el => el.classList.remove('selected'));
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
  const hasDt = !!(dtInput && dtInput.value);
  const disabled = !id || !selectedEmotion || !hasDt;
  if (submitIn) submitIn.disabled = disabled;
  if (submitOut) submitOut.disabled = disabled;
}

employeeIdInput.addEventListener('input', () => {
  updateSubmitState();
  refresh(employeeIdInput.value.trim());
  renderCalendar();
  renderWave();
  renderTrends();
});
dtInput?.addEventListener('input', () => updateSubmitState());

function setNowToDt(){
  const el = dtInput || $('#dt');
  if (!el) return;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  el.value = `${y}-${m}-${day}T${hh}:${mm}`;
}

// ===== Calendar =====
let currentMonth = new Date(); // today
function ymKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function startOfMonth(d){ const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d){ const x = new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; }
function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hhmm(dateLike){ const d = new Date(dateLike); const h = String(d.getHours()).padStart(2,'0'); const m = String(d.getMinutes()).padStart(2,'0'); return `${h}:${m}`; }

async function fetchLogsForMonth(employeeId, departmentId, date){
  const from = startOfMonth(date).toISOString();
  const to = endOfMonth(date).toISOString();
  let url;
  if (employeeId) {
    url = `/api/logs?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  } else if (departmentId && departmentId !== 'all') {
    url = `/api/logs/departments?departmentId=${encodeURIComponent(departmentId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  } else {
    // All departments
    const res = await fetch('/api/departments');
    const json = await res.json();
    if (!json.ok) return [];
    const promises = json.departments.map(d => {
      const u = `/api/logs/departments?departmentId=${d.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      return fetch(u).then(r => r.json());
    });
    const results = await Promise.all(promises);
    return results.flatMap(r => r.ok ? r.rows : []);
  }

  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || '取得に失敗しました');
  return json.rows;
}

async function renderCalendar(){
  const employeeId = employeeIdInput.value.trim();
  const departmentId = departmentSelector.value;
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
  try { logs = await fetchLogsForMonth(employeeId, departmentId, currentMonth); } catch(e){ console.error(e); }
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
  const departmentId = departmentSelector.value;
  const now = new Date();
  const from = startOfDay(new Date(now.getTime()- (waveDays-1)*86400000));
  const to = endOfDay(now);
  let rows = [];
  try{
    let url;
    if (employeeId) {
      url = `/api/logs?employeeId=${encodeURIComponent(employeeId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) rows = json.rows || [];
    } else if (departmentId && departmentId !== 'all') {
      url = `/api/logs/departments?departmentId=${encodeURIComponent(departmentId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) rows = json.rows || [];
    } else {
      const res = await fetch('/api/departments');
      const json = await res.json();
      if (!json.ok) return [];
      const promises = json.departments.map(d => {
        const u = `/api/logs/departments?departmentId=${d.id}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
        return fetch(u).then(r => r.json());
      });
      const results = await Promise.all(promises);
      rows = results.flatMap(r => r.ok ? r.rows : []);
    }
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

// ===== Trends (weekday / weekly) =====
async function renderTrends(){
  const employeeId = employeeIdInput.value.trim();
  if (!employeeId) {
    weekdayTrendEl.innerHTML = '';
    weeklyTrendEl.innerHTML = '';
    return;
  }
  const days = Number(trendDaysSel?.value || 30);
  let data = null;
  try{
    const res = await fetch(`/api/trends?employeeId=${encodeURIComponent(employeeId)}&days=${days}`);
    data = await res.json();
  }catch(e){ console.error(e); }
  if (!data || !data.ok) return;
  renderWeekdayTrend(data.weekday);
  renderWeeklyTrend(data.weekly);
}

trendDaysSel?.addEventListener('change', ()=> renderTrends());

function toScore(avg){ if (avg == null) return 0; return Math.round(((avg - 1) / 4) * 100); }
function fmtAvg(avg){ return avg == null ? '-' : (Math.round(avg*10)/10).toFixed(1); }

function renderWeekdayTrend(rows){
  if (!weekdayTrendEl) return;
  const labels = ['日','月','火','水','木','金','土'];
  // 表示は月〜日の順に
  const order = [1,2,3,4,5,6,0];
  weekdayTrendEl.innerHTML = order.map(dow => {
    const r = rows.find(x => Number(x.dow) === dow) || { in:{avg:null,count:0}, out:{avg:null,count:0} };
    const sIn = toScore(r.in.avg); const sOut = toScore(r.out.avg);
    return `
      <div class="trend-row">
        <div class="trend-label">${labels[dow]}</div>
        <div class="trend-bar"><div class="fill fill-in" style="width:${sIn}%"></div></div>
        <div class="trend-meta">出勤 ${fmtAvg(r.in.avg)} (${r.in.count||0})</div>
      </div>
      <div class="trend-row">
        <div class="trend-label"></div>
        <div class="trend-bar"><div class="fill fill-out" style="width:${sOut}%"></div></div>
        <div class="trend-meta">退勤 ${fmtAvg(r.out.avg)} (${r.out.count||0})</div>
      </div>
    `;
  }).join('');
}

function renderWeeklyTrend(rows){
  if (!weeklyTrendEl) return;
  const items = rows.slice(-8); // last 8 weeks
  weeklyTrendEl.innerHTML = items.map(r => {
    // 重み付き平均
    const cntIn = r.in.count || 0, cntOut = r.out.count || 0;
    const total = cntIn + cntOut;
    const avg = total ? ((cntIn*(r.in.avg||0) + cntOut*(r.out.avg||0)) / total) : null;
    const score = toScore(avg);
    const label = new Date(r.week_start).toLocaleDateString();
    return `
      <div class="trend-row">
        <div class="trend-label" style="width:90px;text-align:left">${label}</div>
        <div class="trend-bar"><div class="fill" style="background:linear-gradient(90deg, var(--in-color), var(--out-color)); width:${score}%"></div></div>
        <div class="trend-meta">avg ${fmtAvg(avg)} (${total})</div>
      </div>
    `;
  }).join('');
}

async function init() {
  try {
    const res = await fetch('/api/departments');
    const json = await res.json();
    if (json.ok) {
      for (const dept of json.departments) {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        departmentSelector.appendChild(option);
      }
    }
  } catch (e) {
    console.error('Failed to fetch departments', e);
  }

  departmentSelector.addEventListener('change', () => {
    renderCalendar();
    renderWave();
  });

  // Initial render
  setNowToDt();
  updateSubmitState();
  refresh(employeeIdInput.value.trim());
  renderCalendar();
  renderWave();
  renderTrends();
}

init();
