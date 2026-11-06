// Brotherhood — barbershop operating system backend (zero dependencies, Node 22.5+ built-in SQLite).
// Walk-in queue + POS API, shifts/cash drawer/Z-readings, attendance, payroll, reports, audit log, backups.
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
const BRANCHES = ['Alaminos', 'Bay', 'Calauan', 'Nagcarlan', 'Tiaong', 'San Pablo', 'Sto. Tomas'];
if (!process.env.ADMIN_PASSWORD) console.warn('⚠  Using default owner password "admin123". Set ADMIN_PASSWORD before going live.');

// ---------- database ----------
const DB_FILE = process.env.DB_FILE || path.join(DIR, 'barber.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
create table if not exists branches(id text primary key, name text, phone text, address text);
create table if not exists chairs(id text primary key, branchId text, name text, sort integer, active integer);
create table if not exists staff(id text primary key, name text, branchId text, chairId text, pct real, allowance real, active integer);
create table if not exists categories(id text primary key, name text, type text);
create table if not exists items(id text primary key, name text, categoryId text, type text, price real, mins integer, active integer);
create table if not exists discounts(id text primary key, name text, kind text, value real, active integer);
create table if not exists customers(id text primary key, name text, phone text, email text, notes text, createdAt text);
create table if not exists users(id text primary key, name text, username text, passHash text, role text, branchId text, active integer);
create table if not exists orders(id text primary key, ord integer, no integer, si integer, branchId text, date text, customerId text, customerName text,
  barberId text, chairId text, status text, items text, subtotal real, discountName text, discountAmt real, total real, tenders text,
  cashierId text, shiftId text, createdAt text, startedAt text, paidAt text, voidReason text);
create table if not exists attendance(id text primary key, staffId text, branchId text, date text, timeIn text, timeOut text, lateMins integer);
create table if not exists shifts(id text primary key, branchId text, terminal text, cashierId text, cashierName text, businessDate text, openedAt text,
  closedAt text, openingFloat real, counted real, status text);
create table if not exists cash_moves(id text primary key, shiftId text, branchId text, date text, kind text, amount real, note text, staffId text, ts text);
create table if not exists payroll_days(staffId text, date text, branchId text, commission real, topup real, advance real, paidAt text, paidBy text, primary key(staffId, date));
create table if not exists zreadings(id text primary key, no integer, branchId text, shiftId text, businessDate text, generatedAt text, data text);
create table if not exists audit(n integer primary key autoincrement, ts text, who text, action text, entity text, entityId text, detail text);
create index if not exists orders_date on orders(date, branchId, status);
create index if not exists att_date on attendance(date, staffId);
create unique index if not exists users_name on users(username) where username is not null and username<>'';
`);
function addCol(t, c, type) { if (!db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c)) db.exec(`alter table ${t} add column ${c} ${type}`); }
addCol('branches', 'openTime', 'text'); addCol('branches', 'graceMins', 'integer');
addCol('users', 'pinKey', 'text'); addCol('attendance', 'status', 'text'); addCol('attendance', 'breakStartedAt', 'text'); addCol('attendance', 'breakMins', 'integer');
addCol('shifts', 'no', 'integer'); addCol('cash_moves', 'by', 'text');
db.exec("create table if not exists settings(k text primary key, v text)");
db.exec("create unique index if not exists users_pin on users(pinKey) where pinKey is not null and pinKey<>''");

const COLS = {
  branches: ['name', 'phone', 'address', 'openTime', 'graceMins'],
  chairs: ['branchId', 'name', 'sort', 'active'],
  staff: ['name', 'branchId', 'chairId', 'pct', 'allowance', 'active'],
  categories: ['name', 'type'],
  items: ['name', 'categoryId', 'type', 'price', 'mins', 'active'],
  discounts: ['name', 'kind', 'value', 'active'],
  customers: ['name', 'phone', 'email', 'notes', 'createdAt'],
  users: ['name', 'username', 'role', 'branchId', 'active']
};
const NUM = new Set(['sort', 'active', 'pct', 'allowance', 'price', 'mins', 'value', 'graceMins']);
const uid = () => crypto.randomBytes(5).toString('hex');
const pad = n => String(n).padStart(2, '0');
const dOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dOf(new Date());
const nowISO = () => new Date().toISOString();
const r2 = n => Math.round((+n || 0) * 100) / 100;
const jp = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const minsOfDay = d => d.getHours() * 60 + d.getMinutes();
const toMin = t => { const [h, m] = String(t || '09:00').split(':').map(Number); return h * 60 + (m || 0); };
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);

const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const get = (kind, id) => one(`select * from ${kind} where id=?`, String(id ?? ''));
const parseOrder = o => ({ ...o, items: jp(o.items), tenders: jp(o.tenders) });
function clean(kind, o) {
  const out = {};
  for (const c of COLS[kind]) {
    if (!(c in o)) continue;
    out[c] = NUM.has(c) ? (Number.isFinite(+o[c]) ? +o[c] : 0) : String(o[c] ?? '').slice(0, 500);
  }
  return out;
}
function insert(kind, o) {
  const id = uid(), d = clean(kind, o), keys = Object.keys(d);
  run(`insert into ${kind}(id${keys.map(k => ',' + k).join('')}) values(?${keys.map(() => ',?').join('')})`, id, ...keys.map(k => d[k]));
  return get(kind, id);
}
function update(kind, id, o) {
  const d = clean(kind, o), keys = Object.keys(d);
  if (keys.length) run(`update ${kind} set ${keys.map(k => k + '=?').join(',')} where id=?`, ...keys.map(k => d[k]), id);
  return get(kind, id);
}
const strip = u => { const { passHash, pinKey, ...r } = u; return { ...r, hasPassword: !!passHash, hasPin: !!pinKey }; };
// PINs are stored as a keyed hash (stable salt kept in the DB, independent of the owner password) so a PIN can identify its user
let pinSalt = one("select v from settings where k='pinSalt'")?.v;
if (!pinSalt) { pinSalt = crypto.randomBytes(24).toString('hex'); run("insert into settings(k,v) values('pinSalt',?)", pinSalt); }
const pinKeyOf = pin => crypto.createHmac('sha256', pinSalt).update('pin:' + pin).digest('base64url');
const log = (me, action, entity, id, detail) =>
  run('insert into audit(ts,who,action,entity,entityId,detail) values(?,?,?,?,?,?)', nowISO(), me?.name || '?', action, entity, id || '', String(detail || '').slice(0, 300));

// ---------- first run ----------
if (!one('select count(*) n from branches').n) for (const n of BRANCHES) insert('branches', { name: n, openTime: '09:00', graceMins: 10 });
run("update branches set openTime='09:00' where openTime is null or openTime=''"); run('update branches set graceMins=10 where graceMins is null');
if (!one('select count(*) n from chairs').n)
  for (const b of all('select id from branches order by rowid')) for (let i = 1; i <= 3; i++) insert('chairs', { branchId: b.id, name: 'Chair ' + i, sort: i, active: 1 });
if (!one('select count(*) n from categories').n) {
  const hc = insert('categories', { name: 'Haircut', type: 'service' }).id, hp = insert('categories', { name: 'Hair Product', type: 'product' }).id;
  for (const [n, p, c, t, m] of [['Buddy', 150, hc, 'service', 30], ['Amigo', 200, hc, 'service', 30], ['Vip Compadre', 250, hc, 'service', 45],
    ['Texture Powder', 380, hp, 'product', 0], ['Sea Salt Spray', 380, hp, 'product', 0]])
    insert('items', { name: n, price: p, categoryId: c, type: t, mins: m, active: 1 });
}
if (!one('select count(*) n from discounts').n) insert('discounts', { name: 'Student', kind: 'amount', value: 50, active: 1 });

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

// ---------- auth ----------
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
// roles: owner (env password) and admin = everything; cashier = POS for own branch only
function whoami(req) {
  const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!o) return null;
  if (o.u === 'owner') return { id: 'owner', role: 'owner', name: 'Owner' };
  const u = get('users', o.u);
  if (!u || !u.active || ![u.passHash, u.pinKey].some(h => h && h.slice(-8) === o.v)) return null;
  return { id: u.id, role: u.role, name: u.name, branchId: u.role === 'cashier' ? u.branchId : null };
}
const isAdmin = me => me.role === 'owner' || me.role === 'admin';
const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
const checkPw = (pw, stored) => { const [salt, h] = String(stored).split(':'); return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(h, 'hex')); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const fails = new Map();
const failDelay = ip => { const f = fails.get(ip); return f && Date.now() - f.t < 600e3 ? Math.min(f.n * 500, 3000) : 0; };
const noteFail = ip => { const f = fails.get(ip); fails.set(ip, { n: (f && Date.now() - f.t < 600e3 ? f.n : 0) + 1, t: Date.now() }); };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (code, msg) => { throw new HttpError(code, msg); };

// ---------- POS logic ----------
const branchScope = (me, requested) => {
  const id = me.role === 'cashier' ? me.branchId : String(requested || '');
  if (!get('branches', id)) bad(400, 'Pick a branch');
  return id;
};
const openShift = branchId => one("select * from shifts where branchId=? and status='open' order by openedAt desc", branchId);
function priceItems(lines) {
  const out = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const it = get('items', l.itemId); if (!it || !it.active) bad(400, 'Unknown or inactive item');
    const qty = Math.max(1, Math.min(99, Math.floor(+l.qty || 1)));
    out.push({ itemId: it.id, name: it.name, type: it.type, price: it.price, qty });
  }
  return out;
}
function totals(items, disc) {
  const subtotal = r2(sum(items, i => i.price * i.qty));
  let amt = 0;
  if (disc) amt = disc.kind === 'percent' ? subtotal * disc.value / 100 : disc.value;
  amt = r2(Math.min(subtotal, Math.max(0, amt)));
  return { subtotal, discountAmt: amt, total: r2(subtotal - amt) };
}
const serviceNet = o => { const svc = sum(o.items.filter(i => i.type === 'service'), i => i.price * i.qty); return o.subtotal > 0 ? svc * o.total / o.subtotal : 0; };
const commissionOf = (o, pct) => r2(serviceNet(o) * (pct || 0) / 100);

function onDuty(staffId, date) { return one("select * from attendance where staffId=? and date=? and timeOut is null and ifnull(status,'present')='present'", staffId, date); }
// roster state for one barber today: none | present | late | break | off | out
function staffState(staffId, date) {
  const a = one('select * from attendance where staffId=? and date=? order by timeIn desc limit 1', staffId, date);
  if (!a) return { state: 'none' };
  if (a.status === 'off') return { state: 'off', timeIn: a.timeIn };
  if (a.timeOut) return { state: 'out', timeIn: a.timeIn, timeOut: a.timeOut };
  const first = one('select lateMins from attendance where staffId=? and date=? order by timeIn limit 1', staffId, date);
  return { state: a.breakStartedAt ? 'break' : (first.lateMins > 0 ? 'late' : 'present'), timeIn: a.timeIn, lateMins: first.lateMins || 0 };
}
function checkAssign(order, b, orderId) {
  const barber = get('staff', b.barberId);
  if (!barber || !barber.active || barber.branchId !== order.branchId) bad(409, 'Barber not in this branch');
  const duty = onDuty(barber.id, todayStr());
  if (!duty) bad(409, `${barber.name} is not clocked in`);
  if (duty.breakStartedAt) bad(409, `${barber.name} is on break`);
  if (one("select 1 x from orders where barberId=? and status='in_chair' and id<>?", barber.id, orderId || '')) bad(409, `${barber.name} is already cutting`);
  const chairId = b.chairId || barber.chairId;
  if (chairId) {
    const ch = get('chairs', chairId);
    if (!ch || ch.branchId !== order.branchId) bad(409, 'Chair not in this branch');
    if (one("select 1 x from orders where chairId=? and status='in_chair' and id<>?", chairId, orderId || '')) bad(409, 'That chair is in use');
  }
  return { barber, chairId: chairId || '' };
}

function zData(shift) {
  const os = all("select * from orders where shiftId=? and status='paid'", shift.id).map(parseOrder);
  const mv = all('select * from cash_moves where shiftId=?', shift.id);
  const tender = {}; for (const o of os) for (const t of o.tenders) tender[t.method] = r2((tender[t.method] || 0) + t.amount);
  const cashSales = tender.Cash || 0;
  const cashIn = sum(mv.filter(m => m.kind === 'in'), m => m.amount);
  const cashOut = sum(mv.filter(m => m.kind !== 'in'), m => m.amount);
  const items = {};
  for (const o of os) for (const i of o.items) { const k = items[i.name] ||= { qty: 0, amount: 0 }; k.qty += i.qty; k.amount = r2(k.amount + i.price * i.qty); }
  return {
    transactions: os.length, gross: r2(sum(os, o => o.subtotal)), discounts: r2(sum(os, o => o.discountAmt)), net: r2(sum(os, o => o.total)),
    tender, items, openingFloat: shift.openingFloat, cashSales, cashIn: r2(cashIn), cashOut: r2(cashOut),
    expected: r2(shift.openingFloat + cashSales + cashIn - cashOut)
  };
}

// ---------- payroll / reports ----------
// daily pay = commission earned that day, topped up to the barber's daily allowance when they showed up
function dayRows(from, to, br) {
  const att = all(`select a.staffId, a.date, a.branchId, min(a.timeIn) timeIn, max(a.timeOut) timeOut, max(a.lateMins) lateMins, s.name, s.pct, s.allowance, s.chairId
    from attendance a join staff s on s.id=a.staffId where a.date>=? and a.date<=? and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''} group by a.staffId, a.date`, ...(br ? [from, to, br] : [from, to]));
  const ords = all(`select * from orders where status='paid' and date>=? and date<=?${br ? ' and branchId=?' : ''}`, ...(br ? [from, to, br] : [from, to])).map(parseOrder);
  const mv = all(`select * from cash_moves where kind='advance' and date>=? and date<=?${br ? ' and branchId=?' : ''}`, ...(br ? [from, to, br] : [from, to]));
  const paidRows = all('select staffId,date,paidAt from payroll_days where date>=? and date<=?', from, to);
  const paid = new Map(paidRows.map(p => [p.staffId + '|' + p.date, p.paidAt]));
  return att.map(a => {
    const commission = r2(sum(ords.filter(o => o.barberId === a.staffId && o.date === a.date), o => commissionOf(o, a.pct)));
    const topup = r2(Math.max(0, (a.allowance || 0) - commission));
    const advance = r2(sum(mv.filter(m => m.staffId === a.staffId && m.date === a.date), m => m.amount));
    return { ...a, commission, topup, advance, pay: r2(commission + topup), due: r2(commission + topup - advance), paidAt: paid.get(a.staffId + '|' + a.date) || null };
  });
}
const paidOrders = (from, to, br) =>
  all(`select o.*, b.name branchName, s.name barberName from orders o left join branches b on b.id=o.branchId left join staff s on s.id=o.barberId
    where o.status='paid' and o.date>=? and o.date<=?${br ? ' and o.branchId=?' : ''} order by o.paidAt desc`, ...(br ? [from, to, br] : [from, to])).map(parseOrder);
const movesIn = (from, to, br) => all(`select m.*, b.name branchName, s.name staffName from cash_moves m left join branches b on b.id=m.branchId left join staff s on s.id=m.staffId
  where m.date>=? and m.date<=?${br ? ' and m.branchId=?' : ''} order by m.ts desc`, ...(br ? [from, to, br] : [from, to]));
const stamp = iso => iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const staffLabel = (sid) => get('staff', sid)?.name || '';

const REPORTS = {
  dashboard(f) {
    const t = todayStr(), w = dOf(new Date(Date.now() - 6 * 864e5));
    const all7 = paidOrders(w, t, f.br), today = all7.filter(o => o.date === t);
    const brs = all('select * from branches order by rowid').filter(b => !f.br || b.id === f.br);
    return {
      cards: [{ label: 'Net sales today', value: sum(today, o => o.total), t: 'peso' }, { label: 'Net sales (7 days)', value: sum(all7, o => o.total), t: 'peso' },
        { label: 'Transactions today', value: today.length, t: 'num' }, { label: 'Customers (total)', value: one('select count(*) n from customers').n, t: 'num' }],
      tables: [{
        title: 'Branches', cols: [['Branch'], ['Today', 'peso'], ['7 days', 'peso'], ['Transactions today', 'num']],
        rows: brs.map(b => [b.name, sum(today.filter(o => o.branchId === b.id), o => o.total), sum(all7.filter(o => o.branchId === b.id), o => o.total), today.filter(o => o.branchId === b.id).length])
      }]
    };
  },
  sales(f) {
    const os = paidOrders(f.from, f.to, f.br), sal = sum(dayRows(f.from, f.to, f.br), r => r.pay);
    const exp = sum(movesIn(f.from, f.to, f.br).filter(m => m.kind === 'expense'), m => m.amount);
    const gross = sum(os, o => o.subtotal), disc = sum(os, o => o.discountAmt), net = sum(os, o => o.total);
    return {
      cards: [{ label: 'Gross sales', value: gross, t: 'peso' }, { label: 'Total discounts', value: disc, t: 'peso' }, { label: 'Net sales', value: net, t: 'peso' },
        { label: 'Transactions', value: os.length, t: 'num', sub: 'Average ' + (os.length ? '₱' + (net / os.length).toFixed(2) : '—') },
        { label: 'Barber salaries', value: sal, t: 'peso', sub: 'Commission or allowance, whichever is higher' }, { label: 'Expenses', value: exp, t: 'peso' },
        { label: 'Shop net sales', value: net - sal - exp, t: 'peso', sub: 'Net sales − salaries − expenses' }],
      tables: [{
        title: 'Transactions', cols: [['SI / Order'], ['Date / Time'], ['Branch'], ['Customer'], ['Barber'], ['Items'], ['Discount', 'peso'], ['Total', 'peso'], ['Tender']],
        rows: os.map(o => ['SI-' + String(o.si).padStart(6, '0') + ' #ORD-' + o.ord, stamp(o.paidAt), o.branchName, o.customerName, o.barberName, o.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), o.discountAmt, o.total, o.tenders.map(t => t.method).join('+')])
      }]
    };
  },
  items(f) {
    const os = paidOrders(f.from, f.to, f.br), m = new Map();
    for (const o of os) for (const i of o.items) { const k = i.itemId; const r = m.get(k) || { name: i.name, type: i.type, price: i.price, qty: 0, rev: 0 }; r.qty += i.qty; r.rev += i.qty * i.price; m.set(k, r); }
    const rows = [...m.values()].sort((a, b) => b.qty - a.qty);
    return {
      cards: [{ label: 'Total items sold', value: sum(rows, r => r.qty), t: 'num' }, { label: 'Transactions', value: os.length, t: 'num' }, { label: 'Best seller', value: rows[0]?.name || '—', t: 'text', sub: rows[0] ? rows[0].qty + ' sold' : '' }],
      tables: [{ title: 'All items sold', cols: [['Rank', 'num'], ['Item'], ['Type'], ['Price', 'peso'], ['Qty sold', 'num'], ['Revenue', 'peso']], rows: rows.map((r, i) => [i + 1, r.name, r.type, r.price, r.qty, r.rev]) }]
    };
  },
  commissions(f) {
    const os = paidOrders(f.from, f.to, f.br), days = dayRows(f.from, f.to, f.br), t = todayStr();
    const st = all(`select s.*, b.name branchName, c.name chairName from staff s left join branches b on b.id=s.branchId left join chairs c on c.id=s.chairId${f.br ? ' where s.branchId=?' : ''} order by b.name, s.name`, ...(f.br ? [f.br] : []));
    const rows = st.map(s => {
      const mine = os.filter(o => o.barberId === s.id), d = days.filter(x => x.staffId === s.id), a = one('select * from attendance where staffId=? and date=? order by timeIn limit 1', s.id, t);
      const comm = sum(mine, o => commissionOf(o, s.pct)), top = sum(d, x => x.topup);
      return { s, n: sum(mine, o => sum(o.items.filter(i => i.type === 'service'), i => i.qty)), net: sum(mine, o => o.total), comm, top, pay: comm + top, att: a ? (a.status === 'off' ? 'Off duty' : a.lateMins > 0 ? 'Late' : 'Present') : '—' };
    }).filter(r => r.s.active || r.n);
    const net = sum(os, o => o.total), pay = sum(rows, r => r.pay);
    return {
      cards: [{ label: 'Services rendered', value: sum(rows, r => r.n), t: 'num' }, { label: 'Net sales', value: net, t: 'peso' }, { label: 'Commission earned', value: sum(rows, r => r.comm), t: 'peso' },
        { label: 'Total payout', value: pay, t: 'peso', sub: 'Incl. allowance top-up ' + '₱' + sum(rows, r => r.top).toFixed(2) }, { label: 'Shop share', value: net - pay, t: 'peso', sub: 'Net sales − payout' }],
      tables: [{ title: 'Barber commissions', cols: [['Barber'], ['Chair'], ['Branch'], ['Today'], ['Services', 'num'], ['Net sales', 'peso'], ['Rate'], ['Commission', 'peso'], ['Top-up', 'peso'], ['Payout', 'peso']],
        rows: rows.map(r => [r.s.name, r.s.chairName || '', r.s.branchName, r.att, r.n, r.net, r.s.pct + '%', r.comm, r.top, r.pay]) }]
    };
  },
  payroll(f) {
    const days = dayRows('2000-01-01', f.to, f.br), unpaid = days.filter(d => !d.paidAt).sort((a, b) => a.date.localeCompare(b.date));
    const by = new Map(); for (const d of unpaid) { const r = by.get(d.staffId) || { d: [], name: d.name, branchId: d.branchId }; r.d.push(d); by.set(d.staffId, r); }
    const rows = [...by.entries()].map(([id, r]) => ({ id, ...r, comm: sum(r.d, x => x.commission), top: sum(r.d, x => x.topup), adv: sum(r.d, x => x.advance) }));
    const paidP = all('select * from payroll_days where date>=? and date<=?', f.from, f.to);
    return {
      cards: [{ label: 'Payroll due', value: sum(rows, r => r.comm + r.top - r.adv), t: 'peso', sub: 'Unpaid days up to ' + f.to }, { label: 'Barbers', value: rows.length, t: 'num' },
        { label: 'Released during the day', value: sum(rows, r => r.adv), t: 'peso', sub: 'Already deducted' }, { label: 'Paid in period', value: sum(paidP, p => p.commission + p.topup - p.advance), t: 'peso' }],
      tables: [{
        title: 'Payroll', selectable: true, ids: rows.map(r => r.id), cols: [['Barber'], ['Branch'], ['Days', 'num'], ['Dates'], ['Commission', 'peso'], ['Top-up', 'peso'], ['Advances', 'peso'], ['Net due', 'peso']],
        rows: rows.map(r => [r.name, get('branches', r.branchId)?.name || '', r.d.length, r.d[0].date + (r.d.length > 1 ? ' → ' + r.d[r.d.length - 1].date : ''), r.comm, r.top, r.adv, r.comm + r.top - r.adv])
      }]
    };
  },
  attendance(f) {
    const days = dayRows(f.from, f.to, f.br), by = new Map();
    for (const d of days) { const r = by.get(d.staffId) || { name: d.name, branchId: d.branchId, n: 0, on: 0, late: 0, lm: 0, h: 0 }; r.n++; if (d.lateMins > 0) { r.late++; r.lm += d.lateMins; } else r.on++; r.h += d.timeOut ? (new Date(d.timeOut) - new Date(d.timeIn)) / 36e5 : 0; by.set(d.staffId, r); }
    const rows = [...by.values()], n = sum(rows, r => r.n);
    return {
      cards: [{ label: 'Barbers', value: rows.length, t: 'num' }, { label: 'Days worked', value: n, t: 'num' }, { label: 'On time', value: n ? Math.round(sum(rows, r => r.on) / n * 1000) / 10 + '%' : '—', t: 'text' },
        { label: 'Late', value: sum(rows, r => r.late), t: 'num', sub: sum(rows, r => r.lm) + ' min late in total' }, { label: 'Total hours', value: r2(sum(rows, r => r.h)), t: 'num' }],
      tables: [{ title: 'Barber summary', cols: [['Barber'], ['Branch'], ['Days worked', 'num'], ['On time', 'num'], ['Late', 'num'], ['Minutes late', 'num'], ['Hours', 'num']], rows: rows.map(r => [r.name, get('branches', r.branchId)?.name || '', r.n, r.on, r.late, r.lm, r2(r.h)]) }]
    };
  },
  tender(f) {
    const os = paidOrders(f.from, f.to, f.br), m = {};
    for (const o of os) for (const t of o.tenders) { const r = m[t.method] || { n: 0, a: 0 }; r.n++; r.a += t.amount; m[t.method] = r; }
    const total = sum(Object.values(m), r => r.a), net = sum(os, o => o.total);
    return {
      cards: [{ label: 'Total sales', value: net, t: 'peso' }, { label: 'Transactions', value: os.length, t: 'num' }, { label: 'Average ticket', value: os.length ? net / os.length : 0, t: 'peso' }],
      tables: [{ title: 'By payment method', cols: [['Method'], ['Transactions', 'num'], ['Amount', 'peso'], ['% of sales']], rows: Object.entries(m).map(([k, r]) => [k, r.n, r.a, total ? (r.a / total * 100).toFixed(1) + '%' : '']) }]
    };
  },
  discounts(f) {
    const os = paidOrders(f.from, f.to, f.br).filter(o => o.discountAmt > 0), m = {};
    for (const o of os) { const r = m[o.discountName || 'Discount'] || { n: 0, a: 0 }; r.n++; r.a += o.discountAmt; m[o.discountName || 'Discount'] = r; }
    const all_ = paidOrders(f.from, f.to, f.br), tot = sum(os, o => o.discountAmt);
    return {
      cards: [{ label: 'Total discounts', value: tot, t: 'peso' }, { label: 'Discounted transactions', value: os.length, t: 'num', sub: 'of ' + all_.length }, { label: 'Average discount', value: os.length ? tot / os.length : 0, t: 'peso' }],
      tables: [{ title: 'By discount type', cols: [['Discount'], ['Times applied', 'num'], ['Amount', 'peso']], rows: Object.entries(m).map(([k, r]) => [k, r.n, r.a]) },
        { title: 'Discounted transactions', cols: [['SI / Order'], ['Date / Time'], ['Branch'], ['Discount'], ['Customer'], ['Gross', 'peso'], ['Discount', 'peso'], ['Net', 'peso']],
          rows: os.map(o => ['SI-' + String(o.si).padStart(6, '0'), stamp(o.paidAt), o.branchName, o.discountName, o.customerName, o.subtotal, o.discountAmt, o.total]) }]
    };
  },
  cash(f) {
    const shifts = all(`select s.*, b.name branchName from shifts s left join branches b on b.id=s.branchId where s.businessDate>=? and s.businessDate<=?${f.br ? ' and s.branchId=?' : ''} order by s.openedAt desc`, ...(f.br ? [f.from, f.to, f.br] : [f.from, f.to]));
    const rows = shifts.map(s => { const z = zData(s); return [s.branchName, s.terminal, s.status === 'open' ? 'OPEN' : 'Closed', stamp(s.openedAt), s.cashierName, z.openingFloat, z.cashSales, z.cashIn, z.cashOut, z.expected, s.status === 'open' ? '' : s.counted]; });
    const mv = movesIn(f.from, f.to, f.br);
    return {
      cards: [{ label: 'Open shifts', value: shifts.filter(s => s.status === 'open').length, t: 'num' }, { label: 'Cash in', value: sum(mv.filter(m => m.kind === 'in'), m => m.amount), t: 'peso' },
        { label: 'Cash out / expenses / advances', value: sum(mv.filter(m => m.kind !== 'in'), m => m.amount), t: 'peso' }],
      tables: [{ title: 'Shifts', cols: [['Branch'], ['Terminal'], ['Status'], ['Opened'], ['Cashier'], ['Float', 'peso'], ['Cash sales', 'peso'], ['Cash in', 'peso'], ['Cash out', 'peso'], ['Expected', 'peso'], ['Counted', 'peso']], rows },
        { title: 'Cash in & out audit trail', cols: [['When'], ['Branch'], ['Type'], ['Amount', 'peso'], ['Barber'], ['Note']], rows: mv.map(m => [stamp(m.ts), m.branchName, m.kind, m.amount, m.staffName || '', m.note]) }]
    };
  },
  readings(f) {
    const zs = all(`select z.*, b.name branchName from zreadings z left join branches b on b.id=z.branchId where z.businessDate>=? and z.businessDate<=?${f.br ? ' and z.branchId=?' : ''} order by z.generatedAt desc`, ...(f.br ? [f.from, f.to, f.br] : [f.from, f.to])).map(z => ({ ...z, d: JSON.parse(z.data) }));
    const sal = sum(dayRows(f.from, f.to, f.br), r => r.pay), net = sum(zs, z => z.d.net), exp = sum(movesIn(f.from, f.to, f.br).filter(m => m.kind === 'expense'), m => m.amount);
    return {
      cards: [{ label: 'Days closed', value: zs.length, t: 'num' }, { label: 'Net sales', value: net, t: 'peso' }, { label: 'Barber salaries', value: sal, t: 'peso' },
        { label: 'Shop net income', value: net - sal - exp, t: 'peso' }, { label: 'Cash variance', value: sum(zs, z => z.d.variance), t: 'peso', sub: '+ over, − short' }],
      tables: [{ title: 'End-of-day Z-readings', cols: [['Reading'], ['Business date'], ['Generated'], ['Branch'], ['Transactions', 'num'], ['Net sales', 'peso'], ['Expected cash', 'peso'], ['Counted', 'peso'], ['Variance', 'peso']],
        rows: zs.map(z => ['Z-' + z.no, z.businessDate, stamp(z.generatedAt), z.branchName, z.d.transactions, z.d.net, z.d.expected, z.d.counted, z.d.variance]) }]
    };
  }
};
function csv(rep) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rep.tables.map(t => [t.title, t.cols.map(c => c[0]).join(','), ...t.rows.map(r => r.map(q).join(','))].join('\n')).join('\n\n');
}

// ---------- http ----------
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
};
const readBody = (req, max = 100_000) => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > max) { no(new HttpError(413, 'Too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new HttpError(400, 'Bad JSON')); } });
});
const STATIC = { '/': 'index.html', '/app.js': 'app.js', '/pos': 'pos.html', '/pos.js': 'pos.js', '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest', '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/.well-known/assetlinks.json': 'assetlinks.json' };
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', json: 'application/json' };
const REFS = {
  staff: [['orders', 'barberId'], ['attendance', 'staffId']], chairs: [['orders', 'chairId'], ['staff', 'chairId']],
  branches: [['staff', 'branchId'], ['chairs', 'branchId'], ['orders', 'branchId'], ['users', 'branchId']], categories: [['items', 'categoryId']]
};
const SOFT = new Set(['staff', 'chairs']);
const CRUD = new Set(Object.keys(COLS));

function checkUser(b, cur) {
  const pw = b.password ? String(b.password) : '';
  if (pw && pw.length < 6) bad(409, 'Password must be at least 6 characters');
  if ('name' in b || !cur) { b.name = String(b.name || '').trim(); if (!b.name) bad(400, 'Name required'); }
  const role = 'role' in b ? b.role : cur?.role;
  if (!['admin', 'cashier'].includes(role)) bad(400, 'Role must be admin or cashier');
  const branchId = 'branchId' in b ? b.branchId : cur?.branchId;
  if (role === 'cashier' && !get('branches', branchId)) bad(409, 'Cashiers need a branch');
  const username = 'username' in b ? String(b.username || '').trim().toLowerCase() : (cur?.username || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'owner') bad(409, 'Username: 3–30 letters/numbers (. _ - allowed), not "owner"');
  if (one('select id from users where username=? and id<>?', username, cur?.id || '')) bad(409, 'Username already taken');
  const pin = b.pin ? String(b.pin).trim() : '';
  if (pin) {
    if (!/^\d{6}$/.test(pin)) bad(409, 'PIN must be exactly 6 digits');
    if (one('select id from users where pinKey=? and id<>?', pinKeyOf(pin), cur?.id || '')) bad(409, 'That PIN is already used by someone else');
  }
  if (role === 'cashier' && !pin && !cur?.pinKey) bad(409, 'Set a 6-digit PIN for this cashier');
  if (role === 'admin' && !pw && !cur?.passHash) bad(409, 'Set a password for this admin');
  b.username = username;
}
const setPw = (id, b) => {
  if (b.password) run('update users set passHash=? where id=?', hashPw(String(b.password)), id);
  if (b.pin) run('update users set pinKey=? where id=?', pinKeyOf(String(b.pin).trim()), id);
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname, method = req.method, q = Object.fromEntries(url.searchParams);
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (method === 'GET' && STATIC[p]) return send(res, 200, fs.readFileSync(path.join(DIR, STATIC[p])), MIME[STATIC[p].split('.').pop()]);
  if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req);
    await new Promise(r => setTimeout(r, failDelay(ip)));
    const uname = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
    let tok = null, who = '';
    const pin = String(b.pin || '').trim();
    if (pin) {
      const u = /^\d{6}$/.test(pin) ? one('select * from users where pinKey=? and active=1', pinKeyOf(pin)) : null;
      if (u) { tok = makeToken(u.id, u.pinKey.slice(-8)); who = u.name; }
    }
    else if ((!uname || uname === 'owner') && crypto.timingSafeEqual(sha(pw), sha(PASS))) { tok = makeToken('owner', ''); who = 'Owner'; }
    else if (uname) {
      const u = one('select * from users where username=? and active=1', uname);
      if (u?.passHash && checkPw(pw, u.passHash)) { tok = makeToken(u.id, u.passHash.slice(-8)); who = u.name; }
    }
    if (!tok) { noteFail(ip); log({ name: uname || 'owner' }, 'login-failed', 'auth', '', ip); return send(res, 401, { error: pin ? 'Wrong PIN' : 'Wrong username or password' }); }
    fails.delete(ip); log({ name: who }, 'login', 'auth', '', ip);
    return send(res, 200, { token: tok });
  }

  const me = whoami(req);
  if (!me) return send(res, 401, { error: 'Login required' });
  const admin = isAdmin(me);
  const adminOnly = () => { if (!admin) bad(403, 'Not allowed for your role'); };

  // ----- admin data -----
  if (p === '/api/state' && method === 'GET') {
    if (!admin) return send(res, 200, { shop: SHOP, me });
    return send(res, 200, {
      shop: SHOP, me, branches: all('select * from branches order by rowid'), chairs: all('select * from chairs order by branchId, sort'), staff: all('select * from staff order by name'),
      categories: all('select * from categories order by name'), items: all('select * from items order by name'), discounts: all('select * from discounts order by name'),
      users: all('select * from users order by name').map(strip)
    });
  }
  if (p === '/api/audit' && method === 'GET') { adminOnly(); return send(res, 200, all('select * from audit order by n desc limit 300')); }
  if (p === '/api/backup' && method === 'GET') {
    if (me.role !== 'owner') bad(403, 'Owner only');
    const tmp = path.join(os.tmpdir(), `bk-${uid()}.db`); backup(tmp); const buf = fs.readFileSync(tmp); fs.rmSync(tmp);
    log(me, 'download-backup', 'backup', '', '');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="brotherhood-${todayStr()}.db"` });
    return res.end(buf);
  }

  // ----- customers (admins + cashiers) -----
  if (p === '/api/customers' && method === 'GET') {
    const term = '%' + String(q.q || '').trim().toLowerCase() + '%', size = Math.min(100, +q.size || 20), off = Math.max(0, (+q.page || 1) - 1) * size;
    const where = "where lower(name||' '||ifnull(phone,'')||' '||ifnull(email,'')) like ?";
    return send(res, 200, { total: one(`select count(*) n from customers ${where}`, term).n, rows: all(`select * from customers ${where} order by name limit ${size} offset ${off}`, term) });
  }
  if (p === '/api/customers/import' && method === 'POST') {
    adminOnly(); const b = await readBody(req, 8_000_000), rows = Array.isArray(b.rows) ? b.rows.slice(0, 20000) : [];
    const key = s => String(s || '').replace(/\D/g, '').replace(/^63/, '0'), seen = new Set(all('select phone from customers').map(r => key(r.phone)).filter(Boolean));
    let added = 0, skipped = 0; db.exec('begin');
    try {
      for (const r of rows) {
        const name = String(r.name || '').trim().slice(0, 200), k = key(r.phone);
        if (!name || (k && seen.has(k))) { skipped++; continue; }
        if (k) seen.add(k);
        insert('customers', { name, phone: String(r.phone || '').trim().slice(0, 40), email: String(r.email || '').trim().slice(0, 200), notes: '', createdAt: nowISO() }); added++;
      }
      db.exec('commit');
    } catch (e) { db.exec('rollback'); throw e; }
    log(me, 'import', 'customers', '', `${added} added, ${skipped} skipped`);
    return send(res, 200, { added, skipped });
  }

  // ----- reports -----
  const rm = p.match(/^\/api\/reports\/(\w+)$/);
  if (rm && method === 'GET') {
    adminOnly(); const fn = REPORTS[rm[1]]; if (!fn) bad(404, 'Unknown report');
    const br = q.branch && q.branch !== 'all' && get('branches', q.branch) ? q.branch : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : to;
    const rep = fn({ from, to, br });
    if (q.format === 'csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${rm[1]}-${from}_${to}.csv"` }); return res.end(csv(rep)); }
    return send(res, 200, rep);
  }
  if (p === '/api/payroll/pay' && method === 'POST') {
    adminOnly(); const b = await readBody(req), to = /^\d{4}-\d{2}-\d{2}$/.test(b.to || '') ? b.to : todayStr(); let n = 0;
    for (const sid of Array.isArray(b.staffIds) ? b.staffIds : [])
      for (const d of dayRows('2000-01-01', to, null).filter(x => x.staffId === sid && !x.paidAt)) {
        run('insert or ignore into payroll_days(staffId,date,branchId,commission,topup,advance,paidAt,paidBy) values(?,?,?,?,?,?,?,?)', sid, d.date, d.branchId, d.commission, d.topup, d.advance, nowISO(), me.name); n++;
      }
    log(me, 'payroll-paid', 'payroll', '', `${n} barber-days up to ${to}`);
    return send(res, 200, { ok: true, days: n });
  }
  if (p === '/api/live' && method === 'GET') {
    const br = me.role === 'cashier' ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), t = todayStr();
    const duty = all(`select a.*, s.name from attendance a join staff s on s.id=a.staffId where a.date=? and a.timeOut is null and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''}`, ...(br ? [t, br] : [t]));
    const onBreak = duty.filter(d => d.breakStartedAt).length;
    const queue = all(`select o.*, b.name branchName, s.name barberName from orders o left join branches b on b.id=o.branchId left join staff s on s.id=o.barberId
      where o.date=? and o.status in ('waiting','in_chair')${br ? ' and o.branchId=?' : ''} order by o.branchId, o.no`, ...(br ? [t, br] : [t])).map(parseOrder);
    const cutting = queue.filter(o => o.status === 'in_chair'), waiting = queue.filter(o => o.status === 'waiting');
    const wait = waiting.length ? Math.max(...waiting.map(o => Math.round((Date.now() - new Date(o.createdAt)) / 60000))) : 0;
    return send(res, 200, {
      onDuty: duty.length, onBreak, cutting: cutting.length, available: Math.max(0, duty.length - cutting.length - onBreak), waiting: waiting.length, longestWaitMin: wait,
      queue: queue.map(o => ({ id: o.id, no: o.no, branch: o.branchName, customer: o.customerName, services: o.items.map(i => i.name).join(', '), status: o.status, barber: o.barberName || '', since: o.startedAt || o.createdAt }))
    });
  }

  // ----- POS (cashier + admin) -----
  if (p === '/api/pos/bootstrap' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr();
    return send(res, 200, {
      branch: get('branches', bid), chairs: all('select * from chairs where branchId=? and active=1 order by sort', bid),
      staff: all('select id,name,chairId,pct from staff where branchId=? and active=1 order by name', bid).map(s => ({ ...s, onDuty: !!onDuty(s.id, t), ...staffState(s.id, t) })),
      categories: all('select * from categories order by name'), items: all('select * from items where active=1 order by name'), discounts: all('select * from discounts where active=1 order by name'),
      shift: openShift(bid) || null,
      queue: all("select * from orders where branchId=? and date=? and status in ('waiting','in_chair') order by no", bid, t).map(parseOrder)
    });
  }
  if (p === '/api/pos/dashboard' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr();
    const paid = all("select * from orders where branchId=? and date=? and status='paid'", bid, t);
    const queue = all("select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ('waiting','in_chair') order by o.no", bid, t).map(parseOrder);
    const st = all('select id from staff where branchId=? and active=1', bid).map(s => staffState(s.id, t).state);
    return send(res, 200, {
      gross: r2(sum(paid, o => o.subtotal)), net: r2(sum(paid, o => o.total)), completed: paid.length, waiting: queue.filter(o => o.status === 'waiting').length,
      cutting: queue.filter(o => o.status === 'in_chair').length, onDuty: st.filter(x => ['present', 'late', 'break'].includes(x)).length, totalBarbers: st.length, queue
    });
  }
  if (p === '/api/pos/queue' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr(), f = q.filter || 'active';
    const sts = f === 'done' ? "('paid')" : f === 'all' ? "('waiting','in_chair','paid','void')" : "('waiting','in_chair')";
    return send(res, 200, all(`select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ${sts} order by o.no`, bid, t).map(parseOrder));
  }
  if (p === '/api/pos/shift' && method === 'GET') {
    const s = openShift(branchScope(me, q.branch)); if (!s) return send(res, 200, { shift: null });
    return send(res, 200, { shift: s, z: zData(s), moves: all('select * from cash_moves where shiftId=? order by ts desc', s.id) });
  }
  if (p === '/api/pos/zreadings' && method === 'GET') {
    const bid = branchScope(me, q.branch);
    return send(res, 200, all('select * from zreadings where branchId=? order by generatedAt desc limit 30', bid).map(z => ({ ...z, data: JSON.parse(z.data) })));
  }
  if (p === '/api/pos/attendance' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr();
    return send(res, 200, all('select s.id,s.name,s.chairId,c.name chairName from staff s left join chairs c on c.id=s.chairId where s.branchId=? and s.active=1 order by s.name', bid).map(s => ({ ...s, ...staffState(s.id, t) })));
  }
  if (p === '/api/expenses' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr(), term = '%' + String(q.q || '').toLowerCase() + '%';
    const range = q.range === 'month' ? [t.slice(0, 8) + '01', t] : q.range === 'all' ? ['2000-01-01', t] : [t, t];
    const base = all("select m.*, s.name staffName from cash_moves m left join staff s on s.id=m.staffId where m.branchId=? and m.kind='expense' order by m.ts desc", bid);
    const rows = base.filter(m => m.date >= range[0] && m.date <= range[1] && (m.note + ' ' + m.by + ' ' + (m.staffName || '')).toLowerCase().includes(term.replace(/%/g, '')));
    return send(res, 200, { rows, today: r2(sum(base.filter(m => m.date === t), m => m.amount)), month: r2(sum(base.filter(m => m.date >= t.slice(0, 8) + '01'), m => m.amount)), count: base.length, filtered: r2(sum(rows, m => m.amount)) });
  }
  if (p === '/api/orders' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), t = todayStr();
    const cust = b.customerId ? get('customers', b.customerId) : null;
    const name = String(cust?.name || b.customerName || '').trim().slice(0, 200); if (!name) bad(400, 'Customer name required');
    const items = priceItems(b.items), tt = totals(items, null);
    const no = (one('select max(no) m from orders where branchId=? and date=?', branchId, t).m || 0) + 1, ord = (one('select max(ord) m from orders').m || 0) + 1, id = uid();
    run(`insert into orders(id,ord,no,branchId,date,customerId,customerName,barberId,chairId,status,items,subtotal,discountName,discountAmt,total,tenders,cashierId,createdAt)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, ord, no, branchId, t, cust?.id || '', name, '', '', 'waiting', JSON.stringify(items), tt.subtotal, '', 0, tt.total, '[]', me.id, nowISO());
    const o = { id, ord, no, branchId };
    if (b.barberId) { const a = checkAssign(o, b); run("update orders set barberId=?, chairId=?, status='in_chair', startedAt=? where id=?", a.barber.id, a.chairId, nowISO(), id); }
    log(me, 'ticket', 'orders', id, `#${no} ${name}`);
    return send(res, 201, parseOrder(get('orders', id)));
  }
  const om = p.match(/^\/api\/orders\/(\w+)(?:\/(pay|void))?$/);
  if (om) {
    const cur = get('orders', om[1]); if (!cur) bad(404, 'Not found');
    if (me.role === 'cashier' && cur.branchId !== me.branchId) bad(403, 'Not your branch');
    const o = parseOrder(cur), act = om[2];
    if (method === 'GET' && !act) return send(res, 200, o);
    if (method === 'PUT' && !act) {
      if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
      const b = await readBody(req); const upd = {};
      if ('items' in b) { const items = priceItems(b.items), tt = totals(items, null); upd.items = JSON.stringify(items); upd.subtotal = tt.subtotal; upd.total = tt.total; }
      if ('customerName' in b || 'customerId' in b) {
        const c = b.customerId ? get('customers', b.customerId) : null; upd.customerId = c?.id || ''; upd.customerName = String(c?.name || b.customerName || o.customerName).trim().slice(0, 200);
      }
      if ('barberId' in b) {
        if (!b.barberId) { upd.barberId = ''; upd.chairId = ''; upd.status = 'waiting'; upd.startedAt = null; }
        else { const a = checkAssign(o, b, o.id); upd.barberId = a.barber.id; upd.chairId = a.chairId; if (o.status !== 'in_chair') { upd.status = 'in_chair'; upd.startedAt = nowISO(); } }
      }
      const keys = Object.keys(upd); if (keys.length) run(`update orders set ${keys.map(k => k + '=?').join(',')} where id=?`, ...keys.map(k => upd[k]), o.id);
      return send(res, 200, parseOrder(get('orders', o.id)));
    }
    if (method === 'POST' && act === 'pay') {
      if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
      if (!o.items.length) bad(409, 'Add at least one service or product');
      if (!o.barberId && o.items.some(i => i.type === 'service')) bad(409, 'Assign a barber first');
      const shift = openShift(o.branchId); if (!shift) bad(409, 'Open a shift first (Cash management)');
      const b = await readBody(req), disc = b.discountId ? get('discounts', b.discountId) : null;
      if (b.discountId && (!disc || !disc.active)) bad(400, 'Unknown discount');
      const tt = totals(o.items, disc);
      const tenders = (Array.isArray(b.tenders) ? b.tenders : []).map(t => ({ method: String(t.method || '').slice(0, 30), amount: r2(t.amount) })).filter(t => t.method && t.amount > 0);
      const paid = sum(tenders, t => t.amount), change = r2(paid - tt.total);
      if (paid < tt.total) bad(409, 'Payment is less than the total');
      if (change > 0) { const cash = tenders.find(t => t.method === 'Cash'); if (!cash || cash.amount < change) bad(409, 'Change can only be given from cash'); cash.amount = r2(cash.amount - change); }
      const si = (one('select max(si) m from orders').m || 0) + 1;
      run("update orders set status='paid', si=?, discountName=?, discountAmt=?, subtotal=?, total=?, tenders=?, cashierId=?, shiftId=?, paidAt=?, date=? where id=?",
        si, disc?.name || '', tt.discountAmt, tt.subtotal, tt.total, JSON.stringify(tenders), me.id, shift.id, nowISO(), todayStr(), o.id);
      log(me, 'sale', 'orders', o.id, `SI-${si} ₱${tt.total}`);
      return send(res, 200, { ...parseOrder(get('orders', o.id)), change });
    }
    if (method === 'POST' && act === 'void') {
      const b = await readBody(req);
      if (o.status === 'paid' && !admin) bad(403, 'Only an admin can void a paid sale');
      if (o.status === 'void') bad(409, 'Already void');
      run("update orders set status='void', voidReason=? where id=?", String(b.reason || '').slice(0, 200), o.id);
      log(me, 'void', 'orders', o.id, `#${o.no} ${b.reason || ''}`); return send(res, 200, { ok: true });
    }
    bad(405, 'Method not allowed');
  }
  if (p === '/api/attendance' && method === 'POST') {
    const b = await readBody(req), s = get('staff', b.staffId); if (!s || !s.active) bad(404, 'Unknown barber');
    if (me.role === 'cashier' && s.branchId !== me.branchId) bad(403, 'Not your branch');
    const t = todayStr(), open = onDuty(s.id, t), br = get('branches', s.branchId);
    if (b.action === 'in') {
      if (open) bad(409, `${s.name} is already clocked in`);
      const now = new Date(), late = Math.max(0, minsOfDay(now) - (toMin(br.openTime) + (br.graceMins || 0)));
      run("delete from attendance where staffId=? and date=? and status='off'", s.id, t);
      const prior = one('select 1 x from attendance where staffId=? and date=?', s.id, t);
      run('insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins) values(?,?,?,?,?,?,?)', uid(), s.id, s.branchId, t, nowISO(), null, prior ? 0 : late);
    } else if (b.action === 'out') {
      if (!open) bad(409, `${s.name} is not clocked in`);
      if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
      run('update attendance set timeOut=? where id=?', nowISO(), open.id);
    } else if (b.action === 'break_start') {
      if (!open) bad(409, `${s.name} is not clocked in`);
      if (open.breakStartedAt) bad(409, 'Already on break');
      if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
      run('update attendance set breakStartedAt=? where id=?', nowISO(), open.id);
    } else if (b.action === 'break_end') {
      if (!open?.breakStartedAt) bad(409, 'Not on break');
      run('update attendance set breakStartedAt=null, breakMins=ifnull(breakMins,0)+? where id=?', Math.round((Date.now() - new Date(open.breakStartedAt)) / 60000), open.id);
    } else if (b.action === 'off') {
      if (one('select 1 x from attendance where staffId=? and date=?', s.id, t)) bad(409, `${s.name} already has attendance today`);
      run("insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins,status) values(?,?,?,?,?,?,?,'off')", uid(), s.id, s.branchId, t, nowISO(), null, 0);
    } else bad(400, 'action must be in, out, break_start, break_end or off');
    log(me, 'clock-' + b.action, 'attendance', s.id, s.name); return send(res, 200, { ok: true });
  }
  if (p === '/api/shifts/open' && method === 'POST') {
    const b = await readBody(req), bid = branchScope(me, b.branchId), terminal = String(b.terminal || 'Terminal 1').slice(0, 40);
    if (one("select 1 x from shifts where branchId=? and terminal=? and status='open'", bid, terminal)) bad(409, 'A shift is already open on this terminal');
    const id = uid(), sno = (one('select max(no) m from shifts where branchId=?', bid).m || 0) + 1;
    run("insert into shifts(id,no,branchId,terminal,cashierId,cashierName,businessDate,openedAt,openingFloat,status) values(?,?,?,?,?,?,?,?,?,'open')", id, sno, bid, terminal, me.id, me.name, todayStr(), nowISO(), Math.max(0, r2(b.openingFloat)));
    log(me, 'shift-open', 'shifts', id, terminal); return send(res, 201, get('shifts', id));
  }
  const sm = p.match(/^\/api\/shifts\/(\w+)\/close$/);
  if (sm && method === 'POST') {
    const s = get('shifts', sm[1]); if (!s || s.status !== 'open') bad(404, 'No such open shift');
    if (me.role === 'cashier' && s.branchId !== me.branchId) bad(403, 'Not your branch');
    if (one("select 1 x from orders where branchId=? and status='in_chair'", s.branchId)) bad(409, 'Finish all customers in the chair before closing');
    const b = await readBody(req), z = zData(s); let counted;
    if (b.denoms && typeof b.denoms === 'object') {   // cash denomination counter: { "1000": 2, "50": 3, ... }
      counted = 0; z.denoms = {};
      for (const d of [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25]) { const n = Math.max(0, Math.floor(+b.denoms[d] || 0)); if (n) { z.denoms[d] = n; counted += n * d; } }
      counted = r2(counted);
    } else counted = r2(b.counted);
    z.counted = counted; z.remarks = String(b.remarks || '').slice(0, 300); z.shiftNo = s.no; z.variance = r2(counted - z.expected);
    const brn = get('branches', s.branchId);
    Object.assign(z, { cashier: s.cashierName, terminal: s.terminal, openedAt: s.openedAt, closedAt: nowISO(), branchName: brn?.name || '', address: brn?.address || '', phone: brn?.phone || '' });
    const no = (one('select max(no) m from zreadings where branchId=?', s.branchId).m || 0) + 1;
    run("update shifts set status='closed', closedAt=?, counted=? where id=?", nowISO(), counted, s.id);
    run('insert into zreadings(id,no,branchId,shiftId,businessDate,generatedAt,data) values(?,?,?,?,?,?,?)', uid(), no, s.branchId, s.id, s.businessDate, nowISO(), JSON.stringify(z));
    log(me, 'shift-close', 'shifts', s.id, `Z-${no} variance ${z.variance}`); return send(res, 200, { no, ...z });
  }
  if (p === '/api/cash' && method === 'POST') {
    const b = await readBody(req), s = get('shifts', b.shiftId); if (!s || s.status !== 'open') bad(409, 'Shift is not open');
    if (me.role === 'cashier' && s.branchId !== me.branchId) bad(403, 'Not your branch');
    if (!['in', 'out', 'expense', 'advance'].includes(b.kind)) bad(400, 'Bad type');
    const amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Amount must be more than 0');
    if (b.kind === 'advance' && !get('staff', b.staffId)) bad(400, 'Pick the barber');
    const who = ['advance', 'expense'].includes(b.kind) && get('staff', b.staffId) ? b.staffId : '';
    run('insert into cash_moves(id,shiftId,branchId,date,kind,amount,note,staffId,ts,by) values(?,?,?,?,?,?,?,?,?,?)', uid(), s.id, s.branchId, todayStr(), b.kind, amount, String(b.note || '').slice(0, 200), who, nowISO(), me.name);
    log(me, 'cash-' + b.kind, 'cash', s.id, '₱' + amount); return send(res, 201, { ok: true });
  }

  // ----- generic CRUD (admin only; cashiers may add/edit customers) -----
  const m = p.match(/^\/api\/(\w+)(?:\/(\w+))?$/);
  if (!m || !CRUD.has(m[1])) bad(404, 'Not found');
  const [, kind, id] = m;
  if (!(kind === 'customers' && me.role === 'cashier' && (method === 'POST' || method === 'PUT'))) adminOnly();
  if (method === 'POST' && !id) {
    const b = await readBody(req);
    if (kind !== 'users') { b.name = String(b.name || '').trim(); if (!b.name) bad(400, 'Name required'); }
    if (kind === 'customers') b.createdAt = nowISO();
    if ((kind === 'chairs' || kind === 'staff') && !get('branches', b.branchId)) bad(400, 'Pick a branch');
    if (kind === 'items' && !(+b.price >= 0)) bad(400, 'Check the price');
    if (kind === 'staff' || kind === 'chairs' || kind === 'items' || kind === 'discounts') b.active ??= 1;
    let row;
    if (kind === 'users') { checkUser(b, null); b.active = 1; row = insert('users', b); setPw(row.id, b); row = strip(get('users', row.id)); } else row = insert(kind, b);
    log(me, 'create', kind, row.id, row.name || ''); return send(res, 201, row);
  }
  if (method === 'PUT' && id) {
    const cur = get(kind, id); if (!cur) bad(404, 'Not found'); const b = await readBody(req); delete b.createdAt;
    if ('name' in b && !String(b.name).trim()) bad(400, 'Name required');
    let row;
    if (kind === 'users') { checkUser(b, cur); update('users', id, b); setPw(id, b); row = strip(get('users', id)); } else row = update(kind, id, b);
    log(me, 'update', kind, id, JSON.stringify({ ...b, password: b.password ? '***' : undefined, pin: b.pin ? '***' : undefined })); return send(res, 200, row);
  }
  if (method === 'DELETE' && id) {
    if (kind === 'users' && id === me.id) bad(409, 'You cannot delete yourself');
    const used = (REFS[kind] || []).some(([t, c]) => one(`select 1 x from ${t} where ${c}=?`, id));
    if (used) {
      if (SOFT.has(kind)) { run(`update ${kind} set active=0 where id=?`, id); log(me, 'deactivate', kind, id, ''); return send(res, 200, { ok: true, deactivated: true }); }
      bad(409, 'Ginagamit pa ito, kaya hindi mabubura');
    }
    run(`delete from ${kind} where id=?`, id); log(me, 'delete', kind, id, ''); return send(res, 200, { ok: true });
  }
  bad(405, 'Method not allowed');
}

http.createServer(async (req, res) => {
  try { await handle(req, res); }
  catch (e) { if (!res.headersSent) send(res, e instanceof HttpError ? e.code : 400, { error: e.message }); }
}).listen(PORT, () => console.log(`${SHOP} running → http://localhost:${PORT}`));
