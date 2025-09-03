import { initDB } from '../src/db.js';

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
  const db = await initDB();

  console.log('Resetting database...');
  if (db.resetAll) {
    await db.resetAll();
  }

  const departments = ['Engineering', 'Sales', 'Marketing', 'HR'];
  const departmentIds = [];

  console.log('Seeding departments...');
  for (const name of departments) {
    const { id } = await db.insertDepartment({ name });
    departmentIds.push(id);
  }

  const employees = [];
  console.log('Seeding employees...');
  for (const departmentId of departmentIds) {
    for (let i = 0; i < 10; i++) {
      const { id } = await db.insertEmployee({ name: `User ${i + 1}`, departmentId });
      employees.push({ id, departmentId });
    }
  }

  console.log('Seeding emotion logs...');
  const today = new Date();
  today.setHours(0,0,0,0);
  let count = 0;

  for (const employee of employees) {
    for (let i = 30 - 1; i >= 0; i--){
      const day = new Date(today);
      day.setDate(today.getDate() - i);

      const inHour = Math.round(rand(8.5, 10));
      const inMin = Math.round(rand(0, 59));
      const outHour = Math.round(rand(17.5, 19.5));
      const outMin = Math.round(rand(0, 59));

      const inAt = atLocal(day, inHour, inMin);
      const outAt = atLocal(day, outHour, outMin);

      await db.insertEmotionLog({ employeeId: employee.id, type: 'in', emotion: randomEmotion(3.2), note: '', createdAt: inAt });
      await db.insertEmotionLog({ employeeId: employee.id, type: 'out', emotion: randomEmotion(3.5), note: '', createdAt: outAt });
      count += 2;
    }
  }

  console.log(`Seeded ${count} events for ${employees.length} employees in ${departments.length} departments over 30 days.`);
}

main().catch((e)=>{
  console.error(e);
  process.exit(1);
});