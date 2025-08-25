import { initDB } from '../src/db.js';

function parseArgs(argv){
  const args = { employee: 'E12345', days: 60, reset: false, start: null };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--employee' || a === '-e') args.employee = argv[++i];
    else if (a === '--days' || a === '-d') args.days = Number(argv[++i] || 30);
    else if (a === '--reset') args.reset = true;
    else if (a === '--start' || a === '-s') args.start = argv[++i];
  }
  return args;
}

function rand(min, max){ return Math.random()*(max-min)+min; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function atLocal(date, h, m){
  const d = new Date(date);
  d.setHours(h, m, Math.floor(rand(0,59)), 0);
  return d.toISOString();
}

function randomEmotion(base=3){
  // base around 3 with slight variation [1..5]
  const v = Math.round(base + rand(-1.2, 1.2));
  return clamp(v, 1, 5);
}

async function main(){
  const { employee, days, reset, start } = parseArgs(process.argv);
  const db = await initDB();
  if (reset && db.resetAll) {
    await db.resetAll();
  }
  const today = start ? new Date(start) : new Date();
  today.setHours(0,0,0,0);

  let count = 0;
  for (let i = days - 1; i >= 0; i--){
    const day = new Date(today);
    day.setDate(today.getDate() - i);

    // Create one clock-in and one clock-out with small randomness
    const inHour = Math.round(rand(8.5, 10));
    const inMin = Math.round(rand(0, 59));
    const outHour = Math.round(rand(17.5, 19.5));
    const outMin = Math.round(rand(0, 59));

    const inAt = atLocal(day, inHour, inMin);
    const outAt = atLocal(day, outHour, outMin);

    await db.insertEmotionLog({ employeeId: employee, type: 'in', emotion: randomEmotion(3.2), note: '', createdAt: inAt });
    await db.insertEmotionLog({ employeeId: employee, type: 'out', emotion: randomEmotion(3.5), note: '', createdAt: outAt });
    count += 2;
  }

  // Also add a few recent extra events to show scatter
  for (let j=0;j<6;j++){
    const d = new Date(); d.setDate(d.getDate() - Math.round(rand(0, 6)));
    const isIn = Math.random() < 0.5;
    const h = isIn ? rand(8, 11) : rand(17, 20);
    const m = rand(0, 59);
    const at = atLocal(d, Math.floor(h), Math.floor(m));
    await db.insertEmotionLog({ employeeId: employee, type: isIn ? 'in' : 'out', emotion: randomEmotion(3.2), note: 'sample', createdAt: at });
    count++;
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${count} events for employee ${employee} over ${days} days.`);
}

main().catch((e)=>{
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

