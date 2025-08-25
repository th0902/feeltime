import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import morgan from 'morgan';
import { initDB } from './db.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Security & logging
app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

let db;

// Health endpoints
app.get('/healthz', async (req, res) => {
  try {
    if (!db) db = await initDB();
    await db.health();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: String(e?.message || e) });
  }
});
app.get('/readyz', (req, res) => res.json({ ready: true }));

const ClockSchema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  type: z.enum(['in', 'out']),
  emotion: z.number().int().min(1).max(5),
  note: z.string().max(1000).optional().or(z.literal('')),
});

app.post('/api/clock', async (req, res) => {
  try {
    if (!db) db = await initDB();
    const parsed = ClockSchema.parse(req.body);
    const note = parsed.note === '' ? undefined : parsed.note;
    const result = await db.insertEmotionLog({
      employeeId: parsed.employeeId,
      type: parsed.type,
      emotion: parsed.emotion,
      note,
    });
    res.status(201).json({ ok: true, id: result.id });
  } catch (e) {
    if (e?.issues) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: e.issues });
    }
    res.status(500).json({ ok: false, error: 'server_error', message: String(e?.message || e) });
  }
});

const SummarySchema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

app.get('/api/summary', async (req, res) => {
  try {
    if (!db) db = await initDB();
    const parsed = SummarySchema.parse(req.query);
    const summary = await db.getSummary({
      employeeId: parsed.employeeId,
      from: parsed.from,
      to: parsed.to,
    });
    res.json({ ok: true, summary });
  } catch (e) {
    if (e?.issues) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: e.issues });
    }
    res.status(500).json({ ok: false, error: 'server_error', message: String(e?.message || e) });
  }
});

const RecentSchema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

app.get('/api/recent', async (req, res) => {
  try {
    if (!db) db = await initDB();
    const parsed = RecentSchema.parse(req.query);
    const rows = await db.getRecent({ employeeId: parsed.employeeId, limit: parsed.limit });
    res.json({ ok: true, rows });
  } catch (e) {
    if (e?.issues) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: e.issues });
    }
    res.status(500).json({ ok: false, error: 'server_error', message: String(e?.message || e) });
  }
});

const LogsRangeSchema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

app.get('/api/logs', async (req, res) => {
  try {
    if (!db) db = await initDB();
    const parsed = LogsRangeSchema.parse(req.query);
    const rows = await db.getLogsRange({ employeeId: parsed.employeeId, from: parsed.from, to: parsed.to });
    res.json({ ok: true, rows });
  } catch (e) {
    if (e?.issues) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: e.issues });
    }
    res.status(500).json({ ok: false, error: 'server_error', message: String(e?.message || e) });
  }
});

// Serve index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

app.listen(PORT, async () => {
  db = await initDB();
  // eslint-disable-next-line no-console
  console.log(`feeltime listening on port ${PORT}`);
});
