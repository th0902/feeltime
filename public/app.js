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
});

updateSubmitState();
refresh(employeeIdInput.value.trim());

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
