import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import pgPkg from 'pg';

const { Pool } = pgPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPostgresUrl(url) {
  return typeof url === 'string' && /^postgres(ql)?:\/\//i.test(url);
}

function createId() {
  return crypto.randomUUID();
}

const createTableSQL = `
CREATE TABLE IF NOT EXISTS emotion_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('in','out')),
  emotion INTEGER NOT NULL CHECK (emotion BETWEEN 1 AND 5),
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_emotion_logs_employee_created ON emotion_logs(employee_id, created_at);
`;

export async function initDB() {
  const url = process.env.DATABASE_URL;
  if (isPostgresUrl(url)) {
    const pool = new Pool({ connectionString: url, max: 5 });
    // Migrate
    await pool.query(createTableSQL);
    return postgresAdapter(pool);
  }
  // SQLite (local dev default)
  const dataDir = process.env.SQLITE_PATH
    ? path.dirname(process.env.SQLITE_PATH)
    : path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'dev.db');
  const db = new Database(dbPath);
  db.exec(createTableSQL);
  return sqliteAdapter(db);
}

function sqliteAdapter(db) {
  const insertStmtAuto = db.prepare(
    'INSERT INTO emotion_logs (id, employee_id, event_type, emotion, note) VALUES (?, ?, ?, ?, ?)'
  );
  const insertStmtWith = db.prepare(
    'INSERT INTO emotion_logs (id, employee_id, event_type, emotion, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const selectSummaryBase = (
    'SELECT event_type, COUNT(*) as count, AVG(emotion) as avg_emotion' +
    ' FROM emotion_logs WHERE employee_id = ?'
  );
  const selectRecentBase = (
    'SELECT id, employee_id, event_type, emotion, note, created_at' +
    ' FROM emotion_logs WHERE employee_id = ?'
  );
  return {
    async health() {
      db.pragma('quick_check');
      return { ok: true };
    },
    async insertEmotionLog({ employeeId, type, emotion, note, createdAt }) {
      const id = createId();
      if (createdAt) {
        insertStmtWith.run(id, employeeId, type, emotion, note || null, createdAt);
      } else {
        insertStmtAuto.run(id, employeeId, type, emotion, note || null);
      }
      return { id };
    },
    async getSummary({ employeeId, from, to }) {
      let sql = selectSummaryBase;
      const params = [employeeId];
      if (from) { sql += ' AND created_at >= ?'; params.push(from); }
      if (to) { sql += ' AND created_at <= ?'; params.push(to); }
      sql += ' GROUP BY event_type ORDER BY event_type ASC';
      const rows = db.prepare(sql).all(...params);
      const summary = { in: { count: 0, avg: null }, out: { count: 0, avg: null } };
      for (const r of rows) {
        summary[r.event_type] = { count: Number(r.count), avg: r.avg_emotion !== null ? Number(r.avg_emotion) : null };
      }
      return summary;
    },
    async getRecent({ employeeId, limit = 10 }) {
      let sql = selectRecentBase + ' ORDER BY created_at DESC LIMIT ?';
      const rows = db.prepare(sql).all(employeeId, limit);
      return rows.map(r => ({ ...r, emotion: Number(r.emotion) }));
    },
    async getLogsRange({ employeeId, from, to }) {
      let sql = 'SELECT id, employee_id, event_type, emotion, note, created_at FROM emotion_logs WHERE employee_id = ?';
      const params = [employeeId];
      if (from) { sql += ' AND created_at >= ?'; params.push(from); }
      if (to) { sql += ' AND created_at <= ?'; params.push(to); }
      sql += ' ORDER BY created_at ASC';
      const rows = db.prepare(sql).all(...params);
      return rows.map(r => ({ ...r, emotion: Number(r.emotion) }));
    },
    async getTrends({ employeeId, from, to }) {
      const params = [employeeId];
      let where = 'WHERE employee_id = ?';
      if (from) { where += ' AND created_at >= ?'; params.push(from); }
      if (to) { where += ' AND created_at <= ?'; params.push(to); }
      const weekdaySql = `
        SELECT strftime('%w', created_at) AS dow, event_type, COUNT(*) AS cnt, AVG(emotion) AS avg
        FROM emotion_logs ${where}
        GROUP BY dow, event_type
        ORDER BY dow
      `;
      const weeklySql = `
        SELECT strftime('%Y-W%W', created_at) AS yw,
               date(created_at, 'weekday 1', '-7 days') AS week_start,
               event_type, COUNT(*) AS cnt, AVG(emotion) AS avg
        FROM emotion_logs ${where}
        GROUP BY yw, week_start, event_type
        ORDER BY week_start
      `;
      const weekdayRows = db.prepare(weekdaySql).all(...params);
      const weeklyRows = db.prepare(weeklySql).all(...params);
      // shape weekday
      const weekday = Array.from({length:7}, (_,i)=>({ dow:i, in:{count:0,avg:null}, out:{count:0,avg:null} }));
      for (const r of weekdayRows){
        const d = Number(r.dow);
        const key = r.event_type === 'in' ? 'in' : 'out';
        weekday[d][key] = { count: Number(r.cnt), avg: r.avg !== null ? Number(r.avg) : null };
      }
      // shape weekly
      const weeklyMap = new Map();
      for (const r of weeklyRows){
        const k = r.week_start;
        if (!weeklyMap.has(k)) weeklyMap.set(k, { week_start: k, in:{count:0,avg:null}, out:{count:0,avg:null} });
        const key = r.event_type === 'in' ? 'in' : 'out';
        weeklyMap.get(k)[key] = { count: Number(r.cnt), avg: r.avg !== null ? Number(r.avg) : null };
      }
      const weekly = Array.from(weeklyMap.values()).sort((a,b)=> new Date(a.week_start) - new Date(b.week_start));
      return { weekday, weekly };
    },
  };
}

function postgresAdapter(pool) {
  return {
    async health() {
      await pool.query('SELECT 1');
      return { ok: true };
    },
    async insertEmotionLog({ employeeId, type, emotion, note, createdAt }) {
      const id = createId();
      if (createdAt) {
        const sql = 'INSERT INTO emotion_logs (id, employee_id, event_type, emotion, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)';
        await pool.query(sql, [id, employeeId, type, emotion, note || null, createdAt]);
      } else {
        const sql = 'INSERT INTO emotion_logs (id, employee_id, event_type, emotion, note) VALUES ($1, $2, $3, $4, $5)';
        await pool.query(sql, [id, employeeId, type, emotion, note || null]);
      }
      return { id };
    },
    async getSummary({ employeeId, from, to }) {
      let sql = 'SELECT event_type, COUNT(*) as count, AVG(emotion) as avg_emotion FROM emotion_logs WHERE employee_id = $1';
      const params = [employeeId];
      if (from) { params.push(from); sql += ` AND created_at >= $${params.length}`; }
      if (to) { params.push(to); sql += ` AND created_at <= $${params.length}`; }
      sql += ' GROUP BY event_type ORDER BY event_type ASC';
      const { rows } = await pool.query(sql, params);
      const summary = { in: { count: 0, avg: null }, out: { count: 0, avg: null } };
      for (const r of rows) {
        summary[r.event_type] = { count: Number(r.count), avg: r.avg_emotion !== null ? Number(r.avg_emotion) : null };
      }
      return summary;
    },
    async getRecent({ employeeId, limit = 10 }) {
      const sql = 'SELECT id, employee_id, event_type, emotion, note, created_at FROM emotion_logs WHERE employee_id = $1 ORDER BY created_at DESC LIMIT $2';
      const { rows } = await pool.query(sql, [employeeId, limit]);
      return rows.map(r => ({ ...r, emotion: Number(r.emotion) }));
    },
    async getLogsRange({ employeeId, from, to }) {
      const params = [employeeId];
      let sql = 'SELECT id, employee_id, event_type, emotion, note, created_at FROM emotion_logs WHERE employee_id = $1';
      if (from) { params.push(from); sql += ` AND created_at >= $${params.length}`; }
      if (to) { params.push(to); sql += ` AND created_at <= $${params.length}`; }
      sql += ' ORDER BY created_at ASC';
      const { rows } = await pool.query(sql, params);
      return rows.map(r => ({ ...r, emotion: Number(r.emotion) }));
    },
    async getTrends({ employeeId, from, to }) {
      const params = [employeeId];
      let where = 'WHERE employee_id = $1';
      if (from) { params.push(from); where += ` AND created_at >= $${params.length}`; }
      if (to) { params.push(to); where += ` AND created_at <= $${params.length}`; }

      const weekdaySql = `
        SELECT EXTRACT(DOW FROM created_at)::int AS dow, event_type, COUNT(*) AS cnt, AVG(emotion) AS avg
        FROM emotion_logs ${where}
        GROUP BY dow, event_type
        ORDER BY dow
      `;
      const weeklySql = `
        SELECT date_trunc('week', created_at)::date AS week_start, event_type, COUNT(*) AS cnt, AVG(emotion) AS avg
        FROM emotion_logs ${where}
        GROUP BY week_start, event_type
        ORDER BY week_start
      `;
      const weekdayRows = (await pool.query(weekdaySql, params)).rows;
      const weeklyRows = (await pool.query(weeklySql, params)).rows;
      const weekday = Array.from({length:7}, (_,i)=>({ dow:i, in:{count:0,avg:null}, out:{count:0,avg:null} }));
      for (const r of weekdayRows){
        const d = Number(r.dow);
        const key = r.event_type === 'in' ? 'in' : 'out';
        weekday[d][key] = { count: Number(r.cnt), avg: r.avg !== null ? Number(r.avg) : null };
      }
      const weeklyMap = new Map();
      for (const r of weeklyRows){
        const k = r.week_start; // already date
        if (!weeklyMap.has(k)) weeklyMap.set(k, { week_start: k, in:{count:0,avg:null}, out:{count:0,avg:null} });
        const key = r.event_type === 'in' ? 'in' : 'out';
        weeklyMap.get(k)[key] = { count: Number(r.cnt), avg: r.avg !== null ? Number(r.avg) : null };
      }
      const weekly = Array.from(weeklyMap.values()).sort((a,b)=> new Date(a.week_start) - new Date(b.week_start));
      return { weekday, weekly };
    },
  };
}
