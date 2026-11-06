// Brotherhood backend — zero dependencies (Node 22.5+ built-in SQLite).
// Multi-branch, owner + staff logins, audit log, daily backups.
// Run:  ADMIN_PASSWORD=yourpass node server.js     (PowerShell: $env:ADMIN_PASSWORD='yourpass'; node server.js)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

process.env.TZ ||= 'Asia/Manila';
const PORT = +process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
const SHOP = process.env.SHOP_NAME || 'Brotherhood';
const DIR = import.meta.dirname;
const OPEN = 540, CLOSE = 1260;
const BRANCHES = ['Alaminos', 'Bay', 'Calauan', 'Nagcarlan', 'Tiaong', 'San Pablo', 'Sto. Tomas'];
if (!process.env.ADMIN_PASSWORD) console.warn('⚠  Using default owner password "admin123". Set ADMIN_PASSWORD before going live.');

// ---------- database ----------
const DB_FILE = process.env.DB_FILE || path.join(DIR, 'barber.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
create table if not exists branches(id text primary key, name text, phone text, address text);
create table if not exists barbers(id text primary key, name text, pct real);
create table if not exists services(id text primary key, name text, price real, mins integer);
create table if not exists clients(id text primary key, name text, phone text, notes text);
create table if not exists appts(id text primary key, date text, time text, barberId text, clientId text,
  serviceIds text, total real, status text, pay text, tip real);
create table if not exists audit(n integer primary key autoincrement, ts text, who text, action text, entity text, entityId text, detail text);
create index if not exists appts_date on appts(date);
`);
function addCol(t, c, type) { if (!db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c)) db.exec(`alter table ${t} add column ${c} ${type}`); }
addCol('barbers', 'branchId', 'text'); addCol('barbers', 'username', 'text'); addCol('barbers', 'passHash', 'text');
addCol('barbers', 'role', 'text'); addCol('barbers', 'active', 'integer'); addCol('appts', 'branchId', 'text');
db.exec(`create unique index if not exists barbers_user on barbers(username) where username is not null and username<>''`);

const COLS = {
  branches: ['name', 'phone', 'address'],
  barbers: ['name', 'pct', 'branchId', 'username', 'role', 'active'],
  services: ['name', 'price', 'mins'],
  clients: ['name', 'phone', 'notes'],
  appts: ['date', 'time', 'barberId', 'clientId', 'serviceIds', 'total', 'status', 'pay', 'tip', 'branchId']
};
const NUM = new Set(['pct', 'price', 'mins', 'total', 'tip', 'active']);
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
const strip = b => { const { passHash, ...r } = b; return { ...r, hasPassword: !!passHash }; };
const log = (me, action, entity, id, detail) =>
  db.prepare('insert into audit(ts,who,action,entity,entityId,detail) values(?,?,?,?,?,?)')
    .run(new Date().toISOString(), me?.name || '?', action, entity, id || '', String(detail || '').slice(0, 300));

// ---------- first run + migration from the single-branch version ----------
if (!db.prepare('select count(*) n from branches').get().n) for (const n of BRANCHES) insert('branches', { name: n });
const firstBranch = db.prepare('select id from branches order by rowid limit 1').get().id;
db.prepare("update barbers set branchId=? where branchId is null or branchId=''").run(firstBranch);
db.exec("update barbers set role='barber' where role is null; update barbers set active=1 where active is null;");
db.exec("update appts set branchId=(select branchId from barbers where barbers.id=appts.barberId) where branchId is null or branchId=''");
if (!db.prepare('select count(*) n from services').get().n)
  for (const s of [['Haircut', 250, 30], ['Beard Trim', 150, 30], ['Haircut + Beard', 350, 60], ['Hot Towel Shave', 200, 30]])
    insert('services', { name: s[0], price: s[1], mins: s[2] });

// ---------- backups (daily snapshot on the volume + owner download) ----------
const BK_DIR = path.join(path.dirname(DB_FILE), 'backups');
function backup(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}
function dailyBackup() {
  try {
    backup(path.join(BK_DIR, `barber-${todayStr()}.db`));
    const files = fs.readdirSync(BK_DIR).filter(f => /^barber-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of files.slice(0, -14)) fs.rmSync(path.join(BK_DIR, f));
  } catch (e) { console.error('backup failed:', e.message); }
}
dailyBackup(); setInterval(dailyBackup, 6 * 3600e3).unref();

// ---------- booking rules (authoritative) ----------
function checkAppt(a, ignoreId, me, futureOnly) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^\d{2}:\d{2}$/.test(a.time)) return 'Invalid date/time';
  const barber = get('barbers', String(a.barberId || ''));
  if (!barber || !barber.active) return 'Unknown barber';
  if (me && me.role !== 'owner' && barber.branchId !== me.branchId) return 'Not your branch';
  if (!a.serviceIds.length) return 'Pick at least one service';
  let mins = 0, total = 0;
  for (const id of a.serviceIds) { const s = get('services', id); if (!s) return 'Unknown service'; mins += s.mins; total += s.price; }
  const start = toMin(a.time);
  if (start < OPEN || start + mins > CLOSE) return 'Outside shop hours (9AM–9PM)';
  if (futureOnly) { const n = new Date(); if (a.date === todayStr() && start <= n.getHours() * 60 + n.getMinutes()) return 'That time has already passed'; }
  for (const o of list('appts', "where barberId=? and date=? and status in ('booked','done')", a.barberId, a.date)) {
    if (o.id === ignoreId) continue;
    const om = o.serviceIds.reduce((t, i) => t + (get('services', i)?.mins || 30), 0), os = toMin(o.time);
    if (start < os + om && os < start + mins) return 'That time slot is already taken';
  }
  a.total = total; a.branchId = barber.branchId;
  return null;
}

// ---------- auth ----------
// Stateless signed tokens: survive restarts. Staff tokens also die when their password changes or they are deactivated.
const SECRET = process.env.SESSION_SECRET || 'bp:' + PASS;
const TOKEN_DAYS = 30;
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = (u, v) => { const p = Buffer.from(JSON.stringify({ u, v, e: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url'); return p + '.' + sign(p); };
function readToken(t) {
  const [p, sig] = String(t).split('.');
  if (!p || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
}
function whoami(req) {
  const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!o) return null;
  if (o.u === 'owner') return { id: 'owner', role: 'owner', name: 'Owner' };
  const s = get('barbers', o.u);
  if (!s || !s.active || !s.passHash || s.passHash.slice(-8) !== o.v) return null;
  return { id: s.id, role: 'barber', name: s.name, branchId: s.branchId };
}
const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
const checkPw = (pw, stored) => { const [salt, h] = String(stored).split(':'); return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(h, 'hex')); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

// per-IP throttles
const fails = new Map(), bookings = new Map();
const failDelay = ip => { const f = fails.get(ip); return f && Date.now() - f.t < 600e3 ? Math.min(f.n * 500, 3000) : 0; };
const noteFail = ip => { const f = fails.get(ip); fails.set(ip, { n: (f && Date.now() - f.t < 600e3 ? f.n : 0) + 1, t: Date.now() }); };
const bookingLimited = ip => { const now = Date.now(), a = (bookings.get(ip) || []).filter(t => now - t < 3600e3); a.push(now); bookings.set(ip, a); return a.length > 10; };

// ---------- http helpers ----------
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = req => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 100_000) { no(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Error('bad json')); } });
});
const STATIC = { '/': 'index.html', '/book': 'index.html', '/app.js': 'app.js' };
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' };

function stateFor(me) {
  if (me.role === 'owner')
    return { shop: SHOP, me, branches: list('branches'), barbers: list('barbers').map(strip), services: list('services'), clients: list('clients'), appts: list('appts') };
  return {
    shop: SHOP, me, branches: list('branches', 'where id=?', me.branchId),
    barbers: list('barbers', 'where branchId=? and active=1', me.branchId).map(b => b.id === me.id ? strip(b) : { id: b.id, name: b.name, branchId: b.branchId, active: 1 }),
    services: list('services'), appts: list('appts', 'where branchId=?', me.branchId),
    clients: list('clients', 'where id in (select clientId from appts where branchId=?)', me.branchId)
  };
}

// owner-only validation for staff accounts; returns an error string or null. Normalises b.
function checkStaff(b, cur) {
  if ('name' in b || !cur) { b.name = String(b.name || '').trim(); if (!b.name) return 'Name required'; }
  const branchId = 'branchId' in b ? b.branchId : cur?.branchId;
  if (!get('branches', String(branchId || ''))) return 'Pick a branch';
  if ('pct' in b && !(+b.pct >= 0 && +b.pct <= 100)) return 'Commission must be 0–100';
  const pw = b.password ? String(b.password) : '';
  if (pw && pw.length < 6) return 'Password must be at least 6 characters';
  const username = 'username' in b ? String(b.username || '').trim().toLowerCase() : (cur?.username || '');
  if (username) {
    if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'owner') return 'Username: 3–30 letters/numbers (. _ - allowed), not "owner"';
    const dup = db.prepare('select id from barbers where username=? and id<>?').get(username, cur?.id || '');
    if (dup) return 'Username already taken';
    if (!pw && !cur?.passHash) return 'Set a password for this login';
  }
  if ('username' in b) b.username = username;
  return null;
}
const setPassword = (id, b) => {
  if (b.password) db.prepare('update barbers set passHash=? where id=?').run(hashPw(String(b.password)), id);
  else if ('username' in b && !b.username) db.prepare("update barbers set passHash=null where id=?").run(id);
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname, method = req.method;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (method === 'GET' && STATIC[p]) {
      const f = STATIC[p];
      return send(res, 200, fs.readFileSync(path.join(DIR, f)), MIME[f.split('.').pop()]);
    }
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

    // --- public (customers) ---
    if (p === '/api/public' && method === 'GET') {
      const appts = list('appts', "where date>=? and status in ('booked','done')", todayStr())
        .map(a => ({ barberId: a.barberId, date: a.date, time: a.time, serviceIds: a.serviceIds, status: a.status }));
      return send(res, 200, {
        shop: SHOP, branches: list('branches').map(b => ({ id: b.id, name: b.name, address: b.address })),
        barbers: list('barbers', 'where active=1').map(b => ({ id: b.id, name: b.name, branchId: b.branchId, active: 1 })),
        services: list('services'), appts
      });
    }
    if (p === '/api/public/book' && method === 'POST') {
      if (bookingLimited(ip)) return send(res, 429, { error: 'Too many bookings from this device. Try again later' });
      const b = await readBody(req);
      const name = String(b.name || '').trim().slice(0, 100), phone = String(b.phone || '').trim().slice(0, 30);
      if (!name) return send(res, 400, { error: 'Name required' });
      if (!get('branches', String(b.branchId))) return send(res, 400, { error: 'Pick a branch' });
      if (String(b.date) < todayStr()) return send(res, 400, { error: 'Date is in the past' });
      const a = { date: String(b.date), time: String(b.time), serviceIds: Array.isArray(b.serviceIds) ? b.serviceIds.map(String) : [] };
      const candidates = String(b.barberId) === 'any'
        ? list('barbers', 'where branchId=? and active=1', String(b.branchId)).map(x => x.id) : [String(b.barberId)];
      let err = 'No barber available', ok = false;
      for (const bid of candidates) {
        a.barberId = bid; err = checkAppt(a, null, null, true);
        if (!err && a.branchId !== String(b.branchId)) err = 'Barber is not in that branch';
        if (!err) { ok = true; break; }
      }
      if (!ok) return send(res, 409, { error: err });
      const ex = phone && db.prepare('select id from clients where phone=?').get(phone);
      const clientId = ex ? ex.id : insert('clients', { name, phone, notes: '' }).id;
      const appt = insert('appts', { ...a, clientId, status: 'booked' });
      log({ name: 'Online: ' + name }, 'book', 'appts', appt.id, `${appt.date} ${appt.time}`);
      return send(res, 201, { ok: true, date: appt.date, time: appt.time, barber: get('barbers', appt.barberId).name, branch: get('branches', appt.branchId).name });
    }

    // --- login ---
    if (p === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      await new Promise(r => setTimeout(r, failDelay(ip)));
      const uname = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
      let tok = null, who = '';
      if ((!uname || uname === 'owner') && crypto.timingSafeEqual(sha(pw), sha(PASS))) { tok = makeToken('owner', ''); who = 'Owner'; }
      else if (uname) {
        const s = db.prepare('select * from barbers where username=? and active=1').get(uname);
        if (s?.passHash && checkPw(pw, s.passHash)) { tok = makeToken(s.id, s.passHash.slice(-8)); who = s.name; }
      }
      if (!tok) { noteFail(ip); log({ name: uname || 'owner' }, 'login-failed', 'auth', '', ip); return send(res, 401, { error: 'Wrong username or password' }); }
      fails.delete(ip); log({ name: who }, 'login', 'auth', '', ip);
      return send(res, 200, { token: tok });
    }

    // --- authenticated ---
    const me = whoami(req);
    if (!me) return send(res, 401, { error: 'Login required' });
    const owner = me.role === 'owner';
    if (p === '/api/state' && method === 'GET') return send(res, 200, stateFor(me));
    if (p === '/api/audit' && method === 'GET') {
      if (!owner) return send(res, 403, { error: 'Owner only' });
      return send(res, 200, db.prepare('select * from audit order by n desc limit 300').all());
    }
    if (p === '/api/backup' && method === 'GET') {
      if (!owner) return send(res, 403, { error: 'Owner only' });
      const tmp = path.join(os.tmpdir(), `bk-${uid()}.db`); backup(tmp);
      const buf = fs.readFileSync(tmp); fs.rmSync(tmp);
      log(me, 'download-backup', 'backup', '', '');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="brotherhood-${todayStr()}.db"` });
      return res.end(buf);
    }

    const m = p.match(/^\/api\/(branches|barbers|services|clients|appts)(?:\/(\w+))?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    const [, kind, id] = m;
    const staffOk = (kind === 'appts' || kind === 'clients') && (method === 'POST' || method === 'PUT');
    if (!owner && !staffOk) return send(res, 403, { error: 'Not allowed for your role' });

    if (method === 'POST' && !id) {
      const b = await readBody(req); let row;
      if (kind === 'appts') {
        b.serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds : []; b.status = 'booked';
        for (const k of ['total', 'pay', 'tip', 'branchId']) delete b[k];
        if (!get('clients', String(b.clientId || ''))) return send(res, 400, { error: 'Pick a client' });
        const e = checkAppt(b, null, me); if (e) return send(res, 409, { error: e });
        row = insert('appts', b);
      } else if (kind === 'clients') {
        b.name = String(b.name || '').trim(); if (!b.name) return send(res, 400, { error: 'Name required' });
        const ph = String(b.phone || '').trim();
        const ex = ph && db.prepare('select id from clients where phone=?').get(ph);
        if (ex) return send(res, 200, get('clients', ex.id));
        row = insert('clients', b);
      } else if (kind === 'barbers') {
        b.role = 'barber'; b.active = 1; const e = checkStaff(b, null); if (e) return send(res, 409, { error: e });
        row = insert('barbers', b); setPassword(row.id, b); row = get('barbers', row.id);
      } else {
        b.name = String(b.name || '').trim(); if (!b.name) return send(res, 400, { error: 'Name required' });
        if (kind === 'services' && !(+b.price >= 0 && +b.mins >= 15)) return send(res, 400, { error: 'Check price and duration' });
        row = insert(kind, b);
      }
      log(me, 'create', kind, row.id, row.name || row.date + ' ' + row.time);
      return send(res, 201, kind === 'barbers' ? strip(row) : row);
    }

    if (method === 'PUT' && id) {
      const cur = get(kind, id); if (!cur) return send(res, 404, { error: 'Not found' });
      if (!owner && kind === 'appts' && (cur.branchId !== me.branchId || cur.status === 'done')) return send(res, 403, { error: 'Not allowed' });
      if (!owner && kind === 'clients' && !db.prepare('select 1 from appts where clientId=? and branchId=?').get(id, me.branchId)) return send(res, 403, { error: 'Not allowed' });
      const b = await readBody(req); let row;
      if (kind === 'appts') {
        const upd = {};
        for (const k of ['status', 'pay', 'tip', 'date', 'time', 'barberId', 'serviceIds', 'clientId']) if (k in b) upd[k] = b[k];
        if (upd.status && !['booked', 'done', 'cancelled', 'noshow'].includes(upd.status)) return send(res, 400, { error: 'Bad status' });
        if (!owner && upd.status === 'booked') return send(res, 403, { error: 'Not allowed' });
        if (upd.pay && !['Cash', 'GCash', 'Maya', 'Card'].includes(upd.pay)) return send(res, 400, { error: 'Bad payment method' });
        if ('tip' in upd) upd.tip = Math.max(0, +upd.tip || 0);
        if (['date', 'time', 'barberId', 'serviceIds'].some(k => k in upd)) {
          const merged = { ...cur, ...upd }; const e = checkAppt(merged, id, me); if (e) return send(res, 409, { error: e });
          upd.total = merged.total; upd.branchId = merged.branchId;
        }
        row = update('appts', id, upd);
      } else if (kind === 'barbers') {
        const e = checkStaff(b, cur); if (e) return send(res, 409, { error: e });
        delete b.role; row = update('barbers', id, b); setPassword(id, b); row = get('barbers', id);
      } else {
        if ('name' in b && !String(b.name).trim()) return send(res, 400, { error: 'Name required' });
        row = update(kind, id, b);
      }
      log(me, 'update', kind, id, JSON.stringify({ ...b, password: b.password ? '***' : undefined }));
      return send(res, 200, kind === 'barbers' ? strip(row) : row);
    }

    if (method === 'DELETE' && id) {
      if (kind === 'barbers' && db.prepare('select 1 from appts where barberId=?').get(id)) {
        db.prepare('update barbers set active=0 where id=?').run(id); log(me, 'deactivate', kind, id, '');
        return send(res, 200, { ok: true, deactivated: true });
      }
      if (kind === 'branches' && (db.prepare('select 1 from barbers where branchId=?').get(id) || db.prepare('select 1 from appts where branchId=?').get(id)))
        return send(res, 409, { error: 'This branch still has staff or bookings' });
      db.prepare(`delete from ${kind} where id=?`).run(id); log(me, 'delete', kind, id, '');
      return send(res, 200, { ok: true });
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`${SHOP} running → staff http://localhost:${PORT}  |  customer booking http://localhost:${PORT}/book`));
