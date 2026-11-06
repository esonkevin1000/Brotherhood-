// BarberPro backend — zero dependencies (Node 22.5+ built-in SQLite).
// Run:  ADMIN_PASSWORD=yourpass node server.js     (PowerShell: $env:ADMIN_PASSWORD='yourpass'; node server.js)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PORT = +process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
const SHOP = process.env.SHOP_NAME || 'BarberPro';
const DIR = import.meta.dirname;
const OPEN = 540, CLOSE = 1260;
if (!process.env.ADMIN_PASSWORD) console.warn('⚠  Using default admin password "admin123". Set ADMIN_PASSWORD before going live.');

// ---------- database ----------
const db = new DatabaseSync(process.env.DB_FILE || path.join(DIR, 'barber.db'));
db.exec(`
create table if not exists barbers(id text primary key, name text, pct real);
create table if not exists services(id text primary key, name text, price real, mins integer);
create table if not exists clients(id text primary key, name text, phone text, notes text);
create table if not exists appts(id text primary key, date text, time text, barberId text, clientId text,
  serviceIds text, total real, status text, pay text, tip real);
create index if not exists appts_date on appts(date);
`);
const COLS = {
  barbers: ['name', 'pct'], services: ['name', 'price', 'mins'], clients: ['name', 'phone', 'notes'],
  appts: ['date', 'time', 'barberId', 'clientId', 'serviceIds', 'total', 'status', 'pay', 'tip']
};
const NUM = new Set(['pct', 'price', 'mins', 'total', 'tip']);
const uid = () => crypto.randomBytes(5).toString('hex');
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const parseRow = (kind, r) => kind === 'appts' ? { ...r, serviceIds: JSON.parse(r.serviceIds || '[]') } : { ...r };
const list = (kind, where = '', ...p) => db.prepare(`select * from ${kind} ${where}`).all(...p).map(r => parseRow(kind, r));
const get = (kind, id) => { const r = db.prepare(`select * from ${kind} where id=?`).get(id); return r ? parseRow(kind, r) : null; };
function clean(kind, o) {
  const out = {};
  for (const c of COLS[kind]) {
    if (!(c in o)) continue;
    let v = o[c];
    if (c === 'serviceIds') v = JSON.stringify(Array.isArray(v) ? v.map(String) : []);
    else if (NUM.has(c)) v = Number.isFinite(+v) ? +v : 0;
    else v = String(v ?? '').slice(0, 500);
    out[c] = v;
  }
  return out;
}
function insert(kind, o) {
  const id = uid(), d = clean(kind, o), keys = Object.keys(d);
  db.prepare(`insert into ${kind}(id${keys.map(k => ',' + k).join('')}) values(?${keys.map(() => ',?').join('')})`).run(id, ...keys.map(k => d[k]));
  return get(kind, id);
}
function update(kind, id, o) {
  const d = clean(kind, o), keys = Object.keys(d);
  if (keys.length) db.prepare(`update ${kind} set ${keys.map(k => k + '=?').join(',')} where id=?`).run(...keys.map(k => d[k]), id);
  return get(kind, id);
}

// seed first run
if (!db.prepare('select count(*) n from barbers').get().n) {
  for (const b of [['Kevin', 50], ['Marco', 45], ['Jay', 40]]) insert('barbers', { name: b[0], pct: b[1] });
  for (const s of [['Haircut', 250, 30], ['Beard Trim', 150, 30], ['Haircut + Beard', 350, 60], ['Hot Towel Shave', 200, 30]])
    insert('services', { name: s[0], price: s[1], mins: s[2] });
}

// ---------- booking rules (authoritative) ----------
function checkAppt(a, ignoreId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^\d{2}:\d{2}$/.test(a.time)) return 'Invalid date/time';
  if (!get('barbers', a.barberId)) return 'Unknown barber';
  if (!a.serviceIds.length) return 'Pick at least one service';
  let mins = 0, total = 0;
  for (const id of a.serviceIds) { const s = get('services', id); if (!s) return 'Unknown service'; mins += s.mins; total += s.price; }
  const start = toMin(a.time);
  if (start < OPEN || start + mins > CLOSE) return 'Outside shop hours (9AM–9PM)';
  for (const o of list('appts', "where barberId=? and date=? and status in ('booked','done')", a.barberId, a.date)) {
    if (o.id === ignoreId) continue;
    const om = o.serviceIds.reduce((t, i) => t + (get('services', i)?.mins || 30), 0), os = toMin(o.time);
    if (start < os + om && os < start + mins) return 'That time slot is already taken';
  }
  a.total = total;
  return null;
}

// ---------- http helpers ----------
const tokens = new Set();
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = req => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 100_000) { no(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Error('bad json')); } });
});
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const isAdmin = req => tokens.has((req.headers.authorization || '').replace(/^Bearer /, ''));
let failDelay = 0;

const STATIC = { '/': 'index.html', '/book': 'index.html', '/app.js': 'app.js' };
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (req.method === 'GET' && STATIC[p]) {
      const f = STATIC[p];
      return send(res, 200, fs.readFileSync(path.join(DIR, f)), MIME[f.split('.').pop()]);
    }
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

    // --- public ---
    if (p === '/api/public' && req.method === 'GET') {
      const appts = list('appts', "where date>=? and status in ('booked','done')", todayStr())
        .map(a => ({ barberId: a.barberId, date: a.date, time: a.time, serviceIds: a.serviceIds, status: a.status }));
      return send(res, 200, { shop: SHOP, barbers: list('barbers').map(b => ({ id: b.id, name: b.name })), services: list('services'), appts });
    }
    if (p === '/api/public/book' && req.method === 'POST') {
      const b = await readBody(req);
      const name = String(b.name || '').trim().slice(0, 100), phone = String(b.phone || '').trim().slice(0, 30);
      if (!name) return send(res, 400, { error: 'Name required' });
      if (String(b.date) < todayStr()) return send(res, 400, { error: 'Date is in the past' });
      const a = { date: String(b.date), time: String(b.time), serviceIds: Array.isArray(b.serviceIds) ? b.serviceIds.map(String) : [], barberId: String(b.barberId) };
      let err = null, ok = false;
      const candidates = a.barberId === 'any' ? list('barbers').map(x => x.id) : [a.barberId];
      for (const bid of candidates) { a.barberId = bid; err = checkAppt(a); if (!err) { ok = true; break; } }
      if (!ok) return send(res, 409, { error: err });
      let c = phone && db.prepare('select id from clients where phone=?').get(phone);
      const clientId = c ? c.id : insert('clients', { name, phone, notes: '' }).id;
      const appt = insert('appts', { ...a, clientId, status: 'booked' });
      return send(res, 201, { ok: true, date: appt.date, time: appt.time, barber: get('barbers', appt.barberId).name });
    }

    // --- auth ---
    if (p === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      await new Promise(r => setTimeout(r, failDelay));
      if (crypto.timingSafeEqual(hash(b.password), hash(PASS))) {
        failDelay = 0; const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); return send(res, 200, { token: t });
      }
      failDelay = Math.min(failDelay + 500, 3000);
      return send(res, 401, { error: 'Wrong password' });
    }

    // --- admin ---
    if (!isAdmin(req)) return send(res, 401, { error: 'Login required' });
    if (p === '/api/state' && req.method === 'GET')
      return send(res, 200, { shop: SHOP, barbers: list('barbers'), services: list('services'), clients: list('clients'), appts: list('appts') });

    const m = p.match(/^\/api\/(barbers|services|clients|appts)(?:\/(\w+))?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    const [, kind, id] = m;
    if (req.method === 'POST' && !id) {
      const b = await readBody(req);
      if (kind === 'appts') { b.serviceIds ||= []; b.status ||= 'booked'; const e = checkAppt(b); if (e) return send(res, 409, { error: e }); }
      return send(res, 201, insert(kind, b));
    }
    if (req.method === 'PUT' && id) {
      const cur = get(kind, id); if (!cur) return send(res, 404, { error: 'Not found' });
      const b = await readBody(req);
      if (kind === 'appts' && ['date', 'time', 'barberId', 'serviceIds'].some(k => k in b)) {
        const merged = { ...cur, ...b }; const e = checkAppt(merged, id); if (e) return send(res, 409, { error: e });
        b.total = merged.total;
      }
      return send(res, 200, update(kind, id, b));
    }
    if (req.method === 'DELETE' && id) { db.prepare(`delete from ${kind} where id=?`).run(id); return send(res, 200, { ok: true }); }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`${SHOP} running → admin http://localhost:${PORT}  |  customer booking http://localhost:${PORT}/book`));
