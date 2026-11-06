// Brotherhood — barbershop operating system backend (zero dependencies, Node 22.5+ built-in SQLite).
// Walk-in queue + POS API, shifts/cash drawer/Z-readings, attendance, payroll, reports, audit log, backups.
// Run:  ADMIN_PASSWORD=yourpass node server.js     (PowerShell: $env:ADMIN_PASSWORD='yourpass'; node server.js)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

process.env.TZ ||= 'Asia/Manila';
const PORT = +process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
const ownerUser = () => String(getSetting('ownerUser') || process.env.OWNER_USERNAME || '').trim().toLowerCase();   // chosen by the owner in Settings (or OWNER_USERNAME); blank = old behaviour
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
addCol('staff', 'photo', 'text'); addCol('items', 'photo', 'text'); addCol('items', 'bookable', 'integer'); addCol('items', 'apptOnly', 'integer'); addCol('items', 'commission', 'real'); addCol('branches', 'closeTime', 'text');
db.exec(`
create table if not exists images(id text primary key, mime text, data blob, createdAt text);
create table if not exists bookings(id text primary key, branchId text, staffId text, customerName text, phone text, date text, time text, mins integer,
  itemIds text, status text, notes text, source text, orderId text, createdAt text);
create index if not exists bookings_date on bookings(date, branchId);
create table if not exists email_log(id text primary key, customerId text, toAddr text, kind text, subject text, html text, text text, status text, attempts integer, error text, createdAt text, sentAt text);
create index if not exists orders_cust on orders(customerId);
`);
addCol('customers', 'preferredCut', 'text'); addCol('customers', 'consent', 'integer'); addCol('customers', 'consentAt', 'text'); addCol('customers', 'welcomedAt', 'text');
addCol('customers', 'phoneKey', 'text'); addCol('customers', 'emailKey', 'text'); addCol('customers', 'source', 'text'); addCol('bookings', 'customerId', 'text');
db.exec('create index if not exists cust_phone on customers(phoneKey); create index if not exists cust_email on customers(emailKey);');
addCol('branches', 'googlePlaceId', 'text'); addCol('branches', 'googleUrl', 'text'); addCol('branches', 'photo', 'text'); addCol('branches', 'mapUrl', 'text'); addCol('branches', 'defaultPct', 'real'); addCol('customers', 'branchId', 'text'); addCol('orders', 'discountId', 'text');
addCol('payroll_days', 'deduction', 'real'); addCol('payroll_days', 'extra', 'real'); addCol('payroll_days', 'lunch', 'real'); addCol('attendance', 'lateRaw', 'integer'); addCol('users', 'staffId', 'text');
for (const c of ['inPhoto', 'outPhoto', 'deviceIn', 'deviceOut', 'receivedIn', 'receivedOut', 'geoIn', 'geoOut', 'flagReason', 'corrections']) addCol('attendance', c, 'text');
for (const c of ['undertimeMins', 'overtimeMins', 'flagged', 'offline', 'corrected']) addCol('attendance', c, 'integer');
db.exec(`create table if not exists attendance_events(id text primary key, clientId text unique, staffId text, branchId text, action text, deviceAt text, receivedAt text, effectiveAt text, photoId text, flag text, byName text);`); addCol('items', 'needId', 'integer'); addCol('orders', 'idPhoto', 'text'); addCol('orders', 'idType', 'text');
db.exec(`
create table if not exists expense_claims(id text primary key, branchId text, date text, category text, description text, amount real, method text, receipts text, noReceiptReason text,
  status text, submittedById text, submittedBy text, staffId text, createdAt text, reviewedBy text, reviewedAt text, reviewNote text, cashMoveId text, history text);
create index if not exists exp_date on expense_claims(date, branchId);
create table if not exists staff_adjustments(id text primary key, staffId text, branchId text, date text, kind text, amount real, note text, byName text, createdAt text, payrollDate text);
create table if not exists equipment(id text primary key, branchId text, name text, category text, serial text, status text, lastService text, nextService text, notes text, active integer);
create table if not exists checklist_runs(id text primary key, branchId text, date text, kind text, items text, photoId text, submittedById text, submittedBy text, createdAt text);
create table if not exists leaves(id text primary key, branchId text, staffId text, type text, from_date text, to_date text, reason text, status text, requestedBy text, createdAt text, reviewedBy text, reviewedAt text, reviewNote text);
create table if not exists problems(id text primary key, branchId text, category text, description text, priority text, photos text, status text, assignedTo text, submittedById text, submittedBy text, createdAt text, updatedAt text, history text, comments text);
create table if not exists channels(id text primary key, kind text, name text, branchId text, announceOnly integer, members text, createdBy text, createdAt text);
create table if not exists messages(id text primary key, channelId text, authorId text, authorName text, text text, attachments text, replyTo text, pinned integer, reactions text, createdAt text);
create index if not exists msg_chan on messages(channelId, createdAt);
create table if not exists chat_reads(channelId text, userId text, at text, primary key(channelId, userId));
create table if not exists advances(id text primary key, branchId text, staffId text, staffName text, type text, amount real, reason text, installments integer, status text, approvedAmt real, firstDue text,
  releasedAmt real, method text, proofId text, requestedById text, requestedBy text, createdAt text, consentAt text, reviewedBy text, reviewedAt text, reviewNote text, releasedBy text, releasedAt text, cashMoveId text, history text);
create table if not exists advance_deductions(id text primary key, advanceId text, staffId text, branchId text, amount real, dueDate text, status text, seq integer, appliedAt text, payrollDate text);
create index if not exists advd_staff on advance_deductions(staffId, status, dueDate);
create table if not exists files(id text primary key, kind text, branchId text, mime text, data blob, byId text, byName text, createdAt text);
create table if not exists remittances(id text primary key, branchId text, date text, posSales real, cashSales real, gcashSales real, mayaSales real, otherSales real,
  cashIn real, cashExpenses real, expected real, actual real, variance real, responsible text, proofId text, notes text, status text, flagReason text,
  submittedById text, submittedBy text, createdAt text, reviewedBy text, reviewedAt text, reviewNote text, history text);
create index if not exists remit_date on remittances(date, branchId);
`);
addCol('files', 'enc', 'integer');
db.exec(`
create table if not exists id_photos(id text primary key, orderId text, branchId text, idType text, mime text, data blob, byId text, createdAt text);
create index if not exists idp_order on id_photos(orderId);
`);
db.exec(`
create table if not exists reviews(id text primary key, branchId text, staffId text, name text, rating integer, text text, createdAt text);
create index if not exists reviews_branch on reviews(branchId, createdAt);
`);
db.exec("create table if not exists settings(k text primary key, v text)");
db.exec("create unique index if not exists users_pin on users(pinKey) where pinKey is not null and pinKey<>''");

const COLS = {
  branches: ['name', 'phone', 'address', 'openTime', 'graceMins', 'closeTime', 'photo', 'mapUrl', 'defaultPct', 'googlePlaceId', 'googleUrl'],
  chairs: ['branchId', 'name', 'sort', 'active'],
  staff: ['name', 'branchId', 'chairId', 'pct', 'allowance', 'active', 'photo'],
  categories: ['name', 'type'],
  items: ['name', 'categoryId', 'type', 'price', 'mins', 'active', 'photo', 'bookable', 'apptOnly', 'needId', 'commission'],
  discounts: ['name', 'kind', 'value', 'active'],
  customers: ['name', 'phone', 'email', 'notes', 'createdAt', 'preferredCut'],
  users: ['name', 'username', 'role', 'branchId', 'active', 'staffId'],
  equipment: ['branchId', 'name', 'category', 'serial', 'status', 'lastService', 'nextService', 'notes', 'active']
};
const NUM = new Set(['sort', 'active', 'pct', 'allowance', 'price', 'mins', 'value', 'graceMins', 'bookable', 'apptOnly', 'defaultPct', 'needId', 'commission']);
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
run("update branches set closeTime='21:00' where closeTime is null or closeTime=''");
run("update items set bookable=case when type='service' then 1 else 0 end where bookable is null");
run("update items set commission=case when type='product' then 100 else 0 end where commission is null");   // fixed barber commission per piece sold (products); owner can change it per product
run("update items set apptOnly=case when name='Vip Compadre' then 1 else 0 end where apptOnly is null");
run("update items set needId=case when lower(name)='buddy' then 1 else 0 end where needId is null");   // Buddy = Senior / PWD / Student discount service: needs a photo of the ID

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
// evidence photos are encrypted at rest (AES-256-GCM) with a key derived from the server secret
const FKEY = crypto.createHash('sha256').update('files:' + SECRET).digest();
const encBuf = b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', FKEY, iv), e = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]); };
const decBuf = b => { const d = crypto.createDecipheriv('aes-256-gcm', FKEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };
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
  return { id: u.id, role: u.role, name: u.name, branchId: u.role === 'cashier' || u.role === 'barber' ? u.branchId : null };
}
const isAdmin = me => me.role === 'owner' || me.role === 'admin';
const isBranchUser = me => me.role === 'cashier' || me.role === 'barber';
// Which parts of the POS each role may open (editable by the owner in Settings → Access)
const MODULES = ['dashboard', 'pos', 'bookings', 'queue', 'expenses', 'attendance', 'reading', 'customers', 'remittance', 'release', 'problems', 'inbox', 'checklist', 'leave', 'myperf'];
// barbers never get the walk-in queue (stripped in permsAll below)
const DEFAULT_PERMS = { cashier: [...MODULES], barber: ['dashboard', 'bookings', 'problems', 'inbox', 'myperf'] };
const permsAll = () => { try { const p = JSON.parse(getSetting('perms') || '{}'); return { cashier: Array.isArray(p.cashier) ? p.cashier.filter(m => MODULES.includes(m)) : DEFAULT_PERMS.cashier, barber: (Array.isArray(p.barber) ? p.barber.filter(m => MODULES.includes(m)) : DEFAULT_PERMS.barber).filter(m => m !== 'queue') }; } catch { return { ...DEFAULT_PERMS }; } };
const modulesFor = role => role === 'owner' || role === 'admin' ? MODULES : (permsAll()[role] || []);
const needAny = (me, mods) => { if (isAdmin(me)) return; const have = modulesFor(me.role); if (![].concat(mods).some(m => have.includes(m))) bad(403, 'Your role is not allowed to open this section'); };
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
  const id = isBranchUser(me) ? me.branchId : String(requested || '');
  if (!get('branches', id)) bad(400, 'Pick a branch');
  return id;
};
// One Z-reading (sales reading) per branch per day. Once it is done the day is locked: no new shift, no new tickets, no payments until tomorrow.
const dayLocked = (branchId, date) => one('select no from zreadings where branchId=? and businessDate=? order by generatedAt desc', branchId, date);
const openTickets = (branchId, date) => one("select count(*) n from orders where branchId=? and date=? and status in ('waiting','in_chair')", branchId, date).n;
// a shop's own cover photo (site/<name>-1.jpg) is used on the promo and booking sites until a picture is set for the branch in the back office
const siteSvc = name => { const f = 'svc-' + String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.jpg'; return fs.existsSync(path.join(DIR, 'site', f)) ? '/site/' + f : null; };   // service photo: site/svc-<name>.jpg until one is set in the back office
const siteCover = name => { const s = String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), f = s === 'alaminos' ? 'alaminos.jpg' : s + '-1.jpg'; return s && fs.existsSync(path.join(DIR, 'site', f)) ? '/site/' + f : null; };
const openShift = branchId => one("select * from shifts where branchId=? and status='open' order by openedAt desc", branchId);
function priceItems(lines) {
  const out = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const it = get('items', l.itemId); if (!it || !it.active) bad(400, 'Unknown or inactive item');
    const qty = Math.max(1, Math.min(99, Math.floor(+l.qty || 1)));
    out.push({ itemId: it.id, name: it.name, type: it.type, price: it.price, qty, ...(it.type === 'product' && it.commission > 0 ? { comm: it.commission } : {}), ...(it.needId ? { needId: 1 } : {}) });
  }
  return out;
}
// Items marked "requires ID" (Buddy: Senior / PWD / Student) can only be sold with a photo of the customer's ID attached to the ticket.
const idNeeded = items => items.filter(i => i.needId).map(i => i.name);
const ID_TYPES = ['Senior', 'PWD', 'Student'];
function attachIdPhoto(orderId, branchId, photoId) {
  const p = get('id_photos', String(photoId || '')); if (!p || (p.orderId && p.orderId !== orderId) || p.branchId !== branchId) bad(400, 'ID photo not found. Please take the photo again.');
  run('update id_photos set orderId=? where id=?', orderId, p.id); run('update orders set idPhoto=?, idType=? where id=?', p.id, p.idType, orderId);
}
function totals(items, disc) {
  const subtotal = r2(sum(items, i => i.price * i.qty));
  let amt = 0;
  if (disc) amt = disc.kind === 'percent' ? subtotal * disc.value / 100 : disc.value;
  amt = r2(Math.min(subtotal, Math.max(0, amt)));
  return { subtotal, discountAmt: amt, total: r2(subtotal - amt) };
}
const serviceNet = o => { const svc = sum(o.items.filter(i => i.type === 'service'), i => i.price * i.qty); return o.subtotal > 0 ? svc * o.total / o.subtotal : 0; };
// barber commission on a ticket = their % of the services + a fixed amount for every product they sold (saved on the ticket line; older tickets use the product's current amount)
const productComm = o => sum(o.items.filter(i => i.type === 'product'), i => (i.comm !== undefined ? i.comm : (get('items', i.itemId)?.commission || 0)) * i.qty);
const commissionOf = (o, pct) => r2(serviceNet(o) * (pct || 0) / 100 + productComm(o));

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
// When a chair becomes free, the next customer queued on that chair sits down (if its barber is on duty and not on break).
function promoteNext(branchId, chairId) {
  if (!chairId) return;
  if (one("select 1 x from orders where status='in_chair' and chairId=?", chairId)) return;
  const nxt = one("select * from orders where status='waiting' and branchId=? and chairId=? and date=? and ifnull(barberId,'')<>'' order by no limit 1", branchId, chairId, todayStr());
  if (!nxt) return;
  const d = onDuty(nxt.barberId, todayStr()); if (!d || d.breakStartedAt) return;
  if (one("select 1 x from orders where status='in_chair' and barberId=?", nxt.barberId)) return;
  run("update orders set status='in_chair', startedAt=? where id=?", nowISO(), nxt.id);
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

// ---------- customer directory, loyalty tiers, consent, welcome email ----------
const normPhone = s => { const d = String(s || '').replace(/\D/g, ''); return d.startsWith('63') ? '0' + d.slice(2) : d; };
const normEmail = s => String(s || '').trim().toLowerCase();
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const TIERS = [[51, 'VIP'], [26, 'Gold'], [16, 'Silver'], [5, 'Bronze'], [0, 'Member']];   // 1 paid visit = 1 point
const tierOf = v => TIERS.find(([min]) => v >= min)[1];
const nextTier = v => { const n = [...TIERS].reverse().find(([min]) => min > v); return n ? { name: n[1], visitsNeeded: n[0] - v } : null; };
const getSetting = k => one('select v from settings where k=?', k)?.v;
const setSetting = (k, v) => run('insert into settings(k,v) values(?,?) on conflict(k) do update set v=excluded.v', k, v);
// one-time: online booking is for Vip Compadre only (Buddy and Amigo are walk-in). The owner can change it later under Services & Products ("Show on online booking").
if (!getSetting('migOnlineVip')) { run("update items set bookable=0 where name in ('Buddy','Amigo') and type='service'"); run("update items set bookable=1 where name='Vip Compadre'"); setSetting('migOnlineVip', '1'); }
const DEFAULT_TERMS = `TERMS & CONDITIONS AND CONSENT: BROTHERHOOD BARBER

1. What information we collect
Your full name, mobile number, email address, preferred haircut, and the history of your visits and purchases at our branches.

2. Why we collect it
So our barbers can recognise you and prepare your preferred haircut, so we can record your visits and loyalty points, and so we can take care of your appointments.

3. Consent to emails and promos
By ticking the box, you agree that Brotherhood Barber may send you emails, promos and news. This is not required to get a haircut. If you do not give an email address, you will not receive emails.

4. Loyalty program
1 completed and paid visit = 1 point. Member (0-4 visits), Bronze (5-15), Silver (16-25), Gold (26-50), VIP (51 and up). Brotherhood may change the benefits of each tier at any time.

5. Stopping emails
You can unsubscribe at any time using the link at the bottom of every email, or by telling our cashier.

6. Protecting your data
We do not sell or share your information with other companies. We follow the Data Privacy Act of 2012 (RA 10173). You have the right to ask to see, correct or delete your data by asking our cashier.`;
const getTerms = () => getSetting('terms') || DEFAULT_TERMS;
const EMAIL = { key: process.env.RESEND_API_KEY || '', from: process.env.EMAIL_FROM || 'Brotherhood Barber <onboarding@resend.dev>', replyTo: process.env.EMAIL_REPLY_TO || '' };
let lastOrigin = getSetting('origin') || '';
const baseUrl = () => process.env.PUBLIC_URL || lastOrigin || 'http://localhost:' + PORT;
function rememberOrigin(req) {   // only called for authenticated admins, so the Host header can be trusted
  const host = req.headers.host || ''; if (!host || /^(localhost|127\.)/.test(host)) return;
  const o = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0] + '://' + host;
  if (o !== lastOrigin) { lastOrigin = o; setSetting('origin', o); }
}
const unsubSig = id => crypto.createHmac('sha256', SECRET).update('unsub:' + id).digest('base64url').slice(0, 22);

function custCard(c) {
  const s = one("select count(*) n, ifnull(sum(total),0) s, max(paidAt) l from orders where customerId=? and status='paid'", c.id);
  return { id: c.id, name: c.name, phone: c.phone, email: c.email, preferredCut: c.preferredCut || '', consent: c.consent ? 1 : 0, welcomed: !!c.welcomedAt,
    visits: s.n, spent: r2(s.s), lastVisit: s.l, tier: tierOf(s.n), next: nextTier(s.n) };
}
const withCust = o => { const c = o.customerId ? get('customers', o.customerId) : null; return { ...o, cust: c ? custCard(c) : null }; };
function findCustomer(phone, email) {
  const pk = normPhone(phone), ek = normEmail(email);
  if (pk.length >= 10) { const c = one('select * from customers where phoneKey=?', pk); if (c) return c; }
  if (ek && validEmail(ek)) { const c = one('select * from customers where emailKey=?', ek); if (c) return c; }
  return null;
}
// Directory rule: a person only enters the directory when they give a phone number or an email. Returns null otherwise.
function upsertCustomer(info, source, branchId) {
  const name = String(info.name || '').trim().slice(0, 200), phone = String(info.phone || '').trim().slice(0, 40), email = normEmail(info.email).slice(0, 200);
  if (email && !validEmail(email)) bad(400, 'Invalid email address');
  const pk = normPhone(phone); if (phone && pk.length < 10) bad(400, 'Invalid phone number');
  const cut = info.preferredCut === undefined ? undefined : String(info.preferredCut || '').trim().slice(0, 200);
  let c = info.id ? get('customers', String(info.id)) : null; c ||= findCustomer(phone, email);
  if (!c && !pk && !email) return null;   // directory rule: no phone and no email → not added
  if (!c) {
    if (!name) bad(400, 'Full name required');
    const id = uid();
    run('insert into customers(id,name,phone,email,notes,createdAt,preferredCut,consent,consentAt,welcomedAt,phoneKey,emailKey,source,branchId) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, name, phone, email, '', nowISO(), cut || '', info.consent ? 1 : 0, info.consent ? nowISO() : null, null, pk || null, email || null, source, branchId || null);
    c = get('customers', id);
  } else {
    // returning customer: keep what we already know (e.g. the past email) unless something new was typed
    const nPhone = pk ? phone : c.phone, nEmail = email || c.email;
    run('update customers set name=?, phone=?, email=?, preferredCut=?, consent=?, consentAt=?, phoneKey=?, emailKey=? where id=?',
      c.name || name, nPhone, nEmail, cut || c.preferredCut || '', (info.consent || c.consent) ? 1 : 0, info.consent && !c.consent ? nowISO() : c.consentAt, normPhone(nPhone) || null, nEmail || null, c.id);
    if (!c.branchId && branchId) run('update customers set branchId=? where id=?', branchId, c.id);
    c = get('customers', c.id);
  }
  maybeWelcome(c);
  return c;
}
function resolveCustomer(b, source, branchId) {
  const info = b.customer && typeof b.customer === 'object' ? { ...b.customer } : {};
  info.id = b.customerId || info.id || '';
  const existing = info.id ? get('customers', String(info.id)) : null;
  if (existing) { const hasNew = info.phone || info.email || info.preferredCut !== undefined || info.consent; const c = hasNew ? (upsertCustomer({ ...info, id: existing.id, name: existing.name }, source, branchId) || existing) : existing; return { id: c.id, name: c.name }; }
  const name = String(info.name || b.customerName || '').trim();
  const c = upsertCustomer({ ...info, id: '', name }, source, branchId);
  return c ? { id: c.id, name: c.name } : { id: '', name };
}
function editCustomer(cur, b) {
  const phone = 'phone' in b ? String(b.phone || '').trim().slice(0, 40) : cur.phone, email = 'email' in b ? normEmail(b.email).slice(0, 200) : cur.email;
  if (email && !validEmail(email)) bad(400, 'Invalid email address');
  if (phone && normPhone(phone).length < 10) bad(400, 'Invalid phone number');
  if (!normPhone(phone) && !email) bad(400, 'A phone number or an email is required to stay in the Customer Directory.');
  const name = 'name' in b ? String(b.name || '').trim().slice(0, 200) : cur.name; if (!name) bad(400, 'Name required');
  const clash = findCustomer(phone, email); if (clash && clash.id !== cur.id) bad(409, `Another customer (${clash.name}) already uses this phone number or email`);
  const consent = 'consent' in b ? (+b.consent ? 1 : 0) : cur.consent;
  run('update customers set name=?, phone=?, email=?, preferredCut=?, notes=?, consent=?, consentAt=?, phoneKey=?, emailKey=? where id=?', name, phone, email,
    'preferredCut' in b ? String(b.preferredCut || '').slice(0, 200) : cur.preferredCut, 'notes' in b ? String(b.notes || '').slice(0, 500) : cur.notes,
    consent, consent && !cur.consent ? nowISO() : cur.consentAt, normPhone(phone) || null, email || null, cur.id);
  const c = get('customers', cur.id); maybeWelcome(c); return c;
}
const esc2 = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function welcomeEmail(c) {
  const first = esc2(String(c.name).trim().split(/\s+/)[0] || 'there');
  const rows = [['Member', '0-4 visits'], ['Bronze', '5-15 visits'], ['Silver', '16-25 visits'], ['Gold', '26-50 visits'], ['VIP', '51+ visits']]
    .map(([n, r]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700">${n}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555">${r}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#fff;text-align:center;padding:26px 20px 10px"><img src="${baseUrl()}/logo.png" width="130" height="130" alt="Brotherhood Barber" style="display:inline-block;border-radius:65px"></td></tr>
<tr><td style="height:5px;background:repeating-linear-gradient(135deg,#d6283a 0 10px,#fff 10px 20px,#2563eb 20px 30px)"></td></tr>
<tr><td style="padding:28px 26px"><h1 style="margin:0 0 10px;font-size:22px">Welcome, ${first}! 💈</h1>
<p style="line-height:1.55;margin:0 0 14px">Thank you for joining <b>Brotherhood Barber</b>. You are now a <b>Member</b> of our loyalty program.</p>
<p style="line-height:1.55;margin:0 0 14px">Every completed haircut earns you <b>1 point</b>. The more you visit, the higher your tier:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;border-collapse:separate;margin:0 0 16px">${rows}</table>
<p style="line-height:1.55;margin:0 0 14px">Just give the cashier your mobile number or email on every visit and your points are added automatically. Your barber will also know your favourite cut.</p>
<p style="line-height:1.55;margin:0;color:#555">You will also hear from us about promos and news. See you at your next haircut!</p></td></tr>
<tr><td style="padding:16px 26px 24px;color:#888;font-size:12px;border-top:1px solid #eee">You are receiving this email because you agreed to the Terms &amp; Conditions of Brotherhood Barber.<br><a href="{{UNSUB}}" style="color:#888">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `Welcome, ${String(c.name).trim().split(/\s+/)[0] || 'there'}!\n\nThank you for joining Brotherhood Barber. You are now a Member of our loyalty program.\nEvery completed haircut = 1 point.\nMember 0-4 visits | Bronze 5-15 | Silver 16-25 | Gold 26-50 | VIP 51+\n\nJust give the cashier your mobile number or email on every visit so your points are added automatically.\n\nUnsubscribe: {{UNSUB}}`;
  return { subject: 'Welcome to Brotherhood Barber 💈', html, text };
}function maybeWelcome(c) {
  if (!c.consent || !c.email || !validEmail(c.email) || c.welcomedAt) return;
  const m = welcomeEmail(c);
  run("insert into email_log(id,customerId,toAddr,kind,subject,html,text,status,attempts,error,createdAt) values(?,?,?,?,?,?,?,'pending',0,'',?)", uid(), c.id, c.email, 'welcome', m.subject, m.html, m.text, nowISO());
  run('update customers set welcomedAt=? where id=?', nowISO(), c.id);
  setTimeout(() => processEmails().catch(() => { }), 50);
}
async function sendEmail({ to, subject, html, text }) {
  if (!EMAIL.key) return { ok: false, error: 'Email service not configured' };
  try {
    const r = await fetch(process.env.RESEND_URL || 'https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + EMAIL.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL.from, to: [to], subject, html, text, ...(EMAIL.replyTo ? { reply_to: EMAIL.replyTo } : {}) }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: String(j.message || j.error || r.status).slice(0, 300) };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; }
}
let sending = false;
async function processEmails() {
  if (!EMAIL.key || sending) return; sending = true;
  try {
    for (const r of all("select * from email_log where status='pending' order by createdAt limit 20")) {
      const unsub = `${baseUrl()}/unsubscribe?c=${r.customerId}&t=${unsubSig(r.customerId)}`;
      let m = r; if (r.kind === 'welcome') { const c = get('customers', r.customerId); if (c) m = welcomeEmail(c); }   // always sent in the current wording
      const res = await sendEmail({ to: r.toAddr, subject: m.subject, html: m.html.replaceAll('{{UNSUB}}', unsub), text: m.text.replaceAll('{{UNSUB}}', unsub) });
      if (res.ok) run("update email_log set status='sent', sentAt=?, error='', attempts=attempts+1 where id=?", nowISO(), r.id);
      else run('update email_log set attempts=attempts+1, error=?, status=? where id=?', res.error, r.attempts + 1 >= 5 ? 'failed' : 'pending', r.id);
    }
  } finally { sending = false; }
}
setInterval(() => processEmails().catch(() => { }), 60_000).unref();
for (const c of all('select id,phone,email from customers where phoneKey is null and emailKey is null')) {
  const pk = normPhone(c.phone), ek = normEmail(c.email); if (pk || ek) run('update customers set phoneKey=?, emailKey=? where id=?', pk || null, ek || null, c.id);
}

// ---------- Google reviews (links always; live rating + latest reviews when a Places API key is set) ----------
const G_KEY = process.env.GOOGLE_PLACES_API_KEY || '', G_BASE = process.env.GOOGLE_PLACES_URL || 'https://places.googleapis.com/v1/places/';
const gEnc = s => encodeURIComponent(s);
function gInfo(b) {
  const pid = b.googlePlaceId || '', cached = getSetting('g:' + b.id); let c = null; try { c = cached ? JSON.parse(cached).data : null; } catch { }
  return { readUrl: b.googleUrl || (pid ? `https://search.google.com/local/reviews?placeid=${gEnc(pid)}` : b.mapUrl || ''), writeUrl: b.googleUrl || (pid ? `https://search.google.com/local/writereview?placeid=${gEnc(pid)}` : ''),
    connected: !!(G_KEY && pid), rating: c?.rating || null, count: c?.count || 0 };
}
async function googleData(b) {
  if (!G_KEY || !b.googlePlaceId) return null;
  const key = 'g:' + b.id; let cached = null; try { cached = JSON.parse(getSetting(key) || 'null'); } catch { }
  if (cached && Date.now() - cached.at < 12 * 3600e3) return cached.data;
  try {
    const r = await fetch(G_BASE + gEnc(b.googlePlaceId), { headers: { 'X-Goog-Api-Key': G_KEY, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' } });
    if (!r.ok) throw new Error('Google returned ' + r.status);
    const j = await r.json();
    const data = { rating: j.rating || null, count: j.userRatingCount || 0, reviews: (j.reviews || []).slice(0, 5).map(v => ({ author: v.authorAttribution?.displayName || 'Google user', photo: v.authorAttribution?.photoUri || '', rating: v.rating || 0, when: v.relativePublishTimeDescription || '', text: v.text?.text || v.originalText?.text || '' })) };
    setSetting(key, JSON.stringify({ at: Date.now(), data })); return data;
  } catch (e) { return cached?.data || null; }   // keep showing the last good copy if Google is unreachable
}

// ---------- online / phone bookings ----------
const hmOf = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const bookHits = new Map();
const reviewHits = new Map();
const recent = (map, ip) => { const now = Date.now(); return (map.get(ip) || []).filter(t => now - t < 3600e3); };
const hitRate = (map, ip) => { const a = recent(map, ip); a.push(Date.now()); map.set(ip, a); };
const reviewBlocked = ip => recent(reviewHits, ip).length >= (+process.env.REVIEW_LIMIT || 3);   // only successful posts count, so typos never use up the limit
const bookingBlocked = ip => recent(bookHits, ip).length >= (+process.env.BOOK_LIMIT || 10);
function bookingMins(ids) {
  let m = 0;
  for (const id of ids) { const it = get('items', id); if (!it || !it.active || it.type !== 'service') bad(400, 'Unknown service'); m += it.mins || 30; }
  return Math.max(30, m);
}
const bookedOverlap = (sid, date, start, mins) => all("select * from bookings where staffId=? and date=? and status in ('booked','arrived')", sid, date)
  .some(b => start < toMin(b.time) + b.mins && toMin(b.time) < start + mins);
const staffFree = (s, date, start, mins) => s.active && !(date === todayStr() && staffState(s.id, date).state === 'off') && !bookedOverlap(s.id, date, start, mins);
function slotsFor(branchId, date, staffId, mins) {
  const br = get('branches', branchId); if (!br) bad(400, 'Pick a branch');
  const open = toMin(br.openTime || '09:00'), close = toMin(br.closeTime || '21:00'), nowM = minsOfDay(new Date());
  const pool = staffId === 'any' ? all('select * from staff where branchId=? and active=1', branchId) : [get('staff', staffId)].filter(s => s && s.branchId === branchId);
  const out = [];
  for (let m = open; m + mins <= close; m += 30) {
    if (date === todayStr() && m < nowM + 15) continue;
    if (pool.some(s => staffFree(s, date, m, mins))) out.push(hmOf(m));
  }
  return out;
}
function createBooking(b, source) {
  const branchId = String(b.branchId || ''); if (!get('branches', branchId)) bad(400, 'Pick a branch');
  const date = String(b.date || ''), time = String(b.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) bad(400, 'Invalid date or time');
  if (date < todayStr()) bad(400, 'Date is in the past');
  if (date > dOf(new Date(Date.now() + 60 * 864e5))) bad(400, 'Too far ahead (max 60 days)');
  const itemIds = (Array.isArray(b.itemIds) ? b.itemIds : []).map(String); if (!itemIds.length) bad(400, 'Pick at least one service');
  if (source === 'online') for (const id of itemIds) { const it = get('items', id); if (!it || !it.active || it.type !== 'service' || !it.bookable) bad(400, 'That service cannot be booked online. Please walk in or call the shop.'); }
  const name = String(b.name || '').trim().slice(0, 100), phone = String(b.phone || '').trim().slice(0, 30);
  if (!name) bad(400, 'Name required');
  if (phone.replace(/\D/g, '').length < 10) bad(400, 'Enter a valid mobile number');
  const mins = bookingMins(itemIds), start = toMin(time);
  let sid = String(b.staffId || 'any');
  if (!slotsFor(branchId, date, sid, mins).includes(time)) bad(409, 'That time is no longer available. Please pick another.');
  if (sid === 'any') {
    const load = s => one("select count(*) n from bookings where staffId=? and date=? and status in ('booked','arrived')", s.id, date).n;
    const free = all('select * from staff where branchId=? and active=1', branchId).filter(s => staffFree(s, date, start, mins)).sort((x, y) => load(x) - load(y));
    sid = free[0].id;
  }
  const cust = upsertCustomer({ name, phone, email: b.email, preferredCut: b.preferredCut ?? b.notes, consent: !!b.consent }, source === 'online' ? 'online' : 'pos', branchId);
  const id = uid();
  run('insert into bookings(id,branchId,staffId,customerName,phone,date,time,mins,itemIds,status,notes,source,orderId,createdAt,customerId) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, branchId, sid, name, phone, date, time, mins, JSON.stringify(itemIds), 'booked', String(b.preferredCut ?? b.notes ?? '').slice(0, 300), source, '', nowISO(), cust?.id || '');
  return bookingView(one('select * from bookings where id=?', id));
}
function bookingView(b) {
  const ids = jp(b.itemIds), its = ids.map(i => get('items', i)).filter(Boolean), s = b.staffId ? get('staff', b.staffId) : null;
  return { ...b, itemIds: ids, items: its.map(i => ({ id: i.id, name: i.name, price: i.price })), total: r2(sum(its, i => i.price)), staffName: s?.name || '', staffPhoto: s?.photo || '', branchName: get('branches', b.branchId)?.name || '' };
}
// a walk-in style ticket (used when a booked customer arrives)
function createTicket(me, branchId, customerId, name, items, barberId) {
  const t = todayStr(), tt = totals(items, null), id = uid();
  const no = (one('select max(no) m from orders where branchId=? and date=?', branchId, t).m || 0) + 1, ord = (one('select max(ord) m from orders').m || 0) + 1;
  run(`insert into orders(id,ord,no,branchId,date,customerId,customerName,barberId,chairId,status,items,subtotal,discountName,discountAmt,total,tenders,cashierId,createdAt)
    values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, ord, no, branchId, t, customerId || '', name, '', '', 'waiting', JSON.stringify(items), tt.subtotal, '', 0, tt.total, '[]', me.id, nowISO());
  if (barberId) {
    try { const a = checkAssign({ id, branchId }, { barberId }); run("update orders set barberId=?, chairId=?, status='in_chair', startedAt=? where id=?", a.barber.id, a.chairId, nowISO(), id); }
    catch (e) { if (!(e instanceof HttpError)) throw e; }   // preferred barber busy/off: customer simply waits
  }
  return parseOrder(get('orders', id));
}

// ---------- payroll / reports ----------
// Pay rules (owner can change them in Settings). Daily pay is always built on the barber's commission:
//   commission + (daily allowance top-up, only if on time enough) + (free lunch money, only if on time)
// Lateness is counted from the branch opening time (9:00) to the real time-in, with no grace.
const ruleNum = (k, d) => { const v = getSetting(k); return v === undefined || v === null || v === '' || isNaN(+v) ? d : Math.max(0, +v); };
const payRules = () => ({ lunchAmount: ruleNum('lunchAmount', 60), lunchLateMins: ruleNum('lunchLateMins', 15), allowLateMins: ruleNum('allowLateMins', 60) });
function dayRows(from, to, br) {
  const R = payRules();
  const att = all(`select a.staffId, a.date, a.branchId, min(a.timeIn) timeIn, max(a.timeOut) timeOut, max(a.lateMins) lateMins, max(a.lateRaw) lateRawDb, s.name, s.pct, s.allowance, s.chairId
    from attendance a join staff s on s.id=a.staffId where a.date>=? and a.date<=? and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''} group by a.staffId, a.date`, ...(br ? [from, to, br] : [from, to]));
  const ords = all(`select * from orders where status='paid' and date>=? and date<=?${br ? ' and branchId=?' : ''}`, ...(br ? [from, to, br] : [from, to])).map(parseOrder);
  const mv = all(`select * from cash_moves where kind='advance' and date>=? and date<=?${br ? ' and branchId=?' : ''}`, ...(br ? [from, to, br] : [from, to]));
  const paidRows = all('select staffId,date,paidAt from payroll_days where date>=? and date<=?', from, to);
  const paid = new Map(paidRows.map(p => [p.staffId + '|' + p.date, p.paidAt]));
  return att.map(a => {
    const commission = r2(sum(ords.filter(o => o.barberId === a.staffId && o.date === a.date), o => commissionOf(o, a.pct)));
    const bo = get('branches', a.branchId), lateRaw = a.lateRawDb != null ? a.lateRawDb : a.timeIn ? Math.max(0, minsOfDay(new Date(a.timeIn)) - toMin(bo?.openTime || '09:00')) : 0;   // stored at time-in; older records are worked out from the time-in
    const allowLost = lateRaw >= R.allowLateMins, lunchLost = lateRaw >= R.lunchLateMins || allowLost;
    const topup = allowLost ? 0 : r2(Math.max(0, (a.allowance || 0) - commission)), lunch = lunchLost ? 0 : r2(R.lunchAmount);
    const advance = r2(sum(mv.filter(m => m.staffId === a.staffId && m.date === a.date), m => m.amount));
    return { ...a, commission, topup, lunch, lateRaw, allowLost, lunchLost, advance, pay: r2(commission + topup + lunch), due: r2(commission + topup + lunch - advance), paidAt: paid.get(a.staffId + '|' + a.date) || null };
  });
}
const cashierName = id => (id && get('users', id)?.name) || '';
const paidOrders = (from, to, br) =>
  all(`select o.*, b.name branchName, s.name barberName from orders o left join branches b on b.id=o.branchId left join staff s on s.id=o.barberId
    where o.status='paid' and o.date>=? and o.date<=?${br ? ' and o.branchId=?' : ''} order by o.paidAt desc`, ...(br ? [from, to, br] : [from, to])).map(parseOrder);
const movesIn = (from, to, br) => all(`select m.*, b.name branchName, s.name staffName from cash_moves m left join branches b on b.id=m.branchId left join staff s on s.id=m.staffId
  where m.date>=? and m.date<=?${br ? ' and m.branchId=?' : ''} order by m.ts desc`, ...(br ? [from, to, br] : [from, to]));
const stamp = iso => iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const staffLabel = (sid) => get('staff', sid)?.name || '';

// Scheduled release-pay deductions that fall due up to `to`. Whole installments only, and never more than the pay available, so net pay can never go below zero.
function planDeductions(staffId, to, avail) {
  const list = []; let tot = 0;
  for (const d of all("select * from advance_deductions where staffId=? and status='SCHEDULED' and dueDate<=? order by dueDate, seq", staffId, to)) { if (r2(tot + d.amount) > r2(avail)) break; list.push(d); tot = r2(tot + d.amount); }
  return { list, total: tot };
}
// Bonuses, incentives and other earnings entered by the owner and not yet paid out in payroll
const adjTotal = (staffId, to) => r2(sum(all("select amount from staff_adjustments where staffId=? and payrollDate is null and date<=?", staffId, to), a => a.amount));
// Barber performance numbers (used by the owner scorecard and by each barber's own screen)
function scoreData(from, to, br, onlyStaff) {
  const os = paidOrders(from, to, br), days = dayRows(from, to, br);
  const rv = all(`select * from reviews where date(createdAt,'localtime')>=? and date(createdAt,'localtime')<=?${br ? ' and branchId=?' : ''}`, ...(br ? [from, to, br] : [from, to]));
  const leaves = all("select * from leaves where status='APPROVED' and from_date<=? and to_date>=?", to, from);
  const visits = new Map(all("select customerId, count(*) n from orders where status='paid' and customerId<>'' group by customerId").map(r => [r.customerId, r.n]));
  const end = to < todayStr() ? to : todayStr(), cal = []; for (let d = new Date(from + 'T00:00'), n = 0; dOf(d) <= end && n < 400; d.setDate(d.getDate() + 1), n++) cal.push(dOf(d));
  return all(`select * from staff where active=1${br ? ' and branchId=?' : ''} order by name`, ...(br ? [br] : [])).filter(s => !onlyStaff || s.id === onlyStaff).map(s => {
    const mine = os.filter(o => o.barberId === s.id), svc = sum(mine, o => serviceNet(o)), dd = days.filter(d => d.staffId === s.id), r = rv.filter(x => x.staffId === s.id);
    const custs = new Set(mine.map(o => o.customerId).filter(Boolean)), returning = [...custs].filter(c => (visits.get(c) || 0) > 1).length, workedDays = new Set(dd.map(d => d.date)), leave = new Set();
    for (const l of leaves.filter(l => l.staffId === s.id)) for (const d of cal) if (d >= l.from_date && d <= l.to_date) leave.add(d);
    return { s, branchId: s.branchId, n: mine.length, sales: r2(svc), avg: mine.length ? svc / mine.length : 0, comm: r2(sum(mine, o => commissionOf(o, s.pct))), worked: workedDays.size, late: dd.filter(d => d.lateMins > 0).length, lateMins: sum(dd, d => d.lateMins || 0),
      absent: cal.filter(d => !workedDays.has(d) && !leave.has(d)).length, leaveDays: leave.size, rating: r.length ? sum(r, x => x.rating) / r.length : null, rc: r.length, custs: custs.size, returning, perDay: workedDays.size ? svc / workedDays.size : 0, cutsPerDay: workedDays.size ? mine.length / workedDays.size : 0 };
  });
}
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
      const comm = sum(mine, o => commissionOf(o, s.pct)), top = sum(d, x => x.topup + x.lunch);
      return { s, n: sum(mine, o => sum(o.items.filter(i => i.type === 'service'), i => i.qty)), net: sum(mine, o => o.total), comm, top, pay: comm + top, att: a ? (a.status === 'off' ? 'Off duty' : a.lateMins > 0 ? 'Late' : 'Present') : '—' };
    }).filter(r => r.s.active || r.n);
    const net = sum(os, o => o.total), pay = sum(rows, r => r.pay);
    return {
      cards: [{ label: 'Services rendered', value: sum(rows, r => r.n), t: 'num' }, { label: 'Net sales', value: net, t: 'peso' }, { label: 'Commission earned', value: sum(rows, r => r.comm), t: 'peso' },
        { label: 'Total payout', value: pay, t: 'peso', sub: 'Incl. allowance top-up & lunch ' + '₱' + sum(rows, r => r.top).toFixed(2) }, { label: 'Shop share', value: net - pay, t: 'peso', sub: 'Net sales − payout' }],
      tables: [{ title: 'Barber commissions', cols: [['Barber'], ['Chair'], ['Branch'], ['Today'], ['Services', 'num'], ['Net sales', 'peso'], ['Rate'], ['Commission', 'peso'], ['Top-up & lunch', 'peso'], ['Payout', 'peso']],
        rows: rows.map(r => [r.s.name, r.s.chairName || '', r.s.branchName, r.att, r.n, r.net, r.s.pct + '%', r.comm, r.top, r.pay]) }]
    };
  },
  payroll(f) {
    // only the days inside the chosen range (Today = today, This week = the whole week, All time = everything); unpaid days before the range are reported separately
    const every = dayRows('2000-01-01', f.to, f.br), inRange = every.filter(d => d.date >= f.from), unpaid = inRange.filter(d => !d.paidAt).sort((a, b) => a.date.localeCompare(b.date));
    const earlier = every.filter(d => d.date < f.from && !d.paidAt), detail = {};
    for (const d of inRange) (detail[d.staffId] ||= []).push({ date: d.date, timeIn: d.timeIn, lateMins: d.lateRaw, commission: d.commission, topup: d.topup, lunch: d.lunch, advance: d.advance, paid: !!d.paidAt, allowLost: d.allowLost, lunchLost: d.lunchLost });
    const by = new Map(); for (const d of unpaid) { const r = by.get(d.staffId) || { d: [], name: d.name, branchId: d.branchId }; r.d.push(d); by.set(d.staffId, r); }
    const rows = [...by.entries()].map(([id, r]) => ({ id, ...r, comm: sum(r.d, x => x.commission), top: sum(r.d, x => x.topup + x.lunch), adv: sum(r.d, x => x.advance) })).map(r => { const bon = adjTotal(r.id, f.to); return { ...r, bon, ded: planDeductions(r.id, f.to, r2(r.comm + r.top + bon - r.adv)).total }; });
    const paidP = all('select * from payroll_days where date>=? and date<=?', f.from, f.to);
    return {
      cards: [{ label: 'Payroll due', value: sum(rows, r => r.comm + r.top + r.bon - r.adv - r.ded), t: 'peso', sub: f.from <= '2000-01-01' ? 'All unpaid days' : 'Unpaid days ' + f.from + (f.from === f.to ? '' : ' → ' + f.to) }, { label: 'Barbers', value: rows.length, t: 'num' },
        ...(earlier.length ? [{ label: 'Unpaid before this range', value: sum(earlier, d => d.commission + d.topup + d.lunch - d.advance), t: 'peso', sub: 'Pick All time to see and pay these' }] : []),
        { label: 'Released during the day', value: sum(rows, r => r.adv), t: 'peso', sub: 'Already deducted' }, { label: 'Paid in period', value: sum(paidP, p => p.commission + p.topup + (p.lunch || 0) + (p.extra || 0) - p.advance - (p.deduction || 0)), t: 'peso' }],
      tables: [{
        title: 'Payroll', selectable: true, detail, ids: rows.map(r => r.id), cols: [['Barber'], ['Branch'], ['Days', 'days'], ['Dates'], ['Commission', 'peso'], ['Top-up & lunch', 'peso'], ['Bonuses & incentives', 'peso'], ['Advances', 'peso'], ['Release pay deductions', 'peso'], ['Net due', 'peso']],
        rows: rows.map(r => [r.name, get('branches', r.branchId)?.name || '', r.d.length + '~' + r.id, r.d[0].date + (r.d.length > 1 ? ' → ' + r.d[r.d.length - 1].date : ''), r.comm, r.top, r.bon, r.adv, r.ded, r.comm + r.top + r.bon - r.adv - r.ded])
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
        { title: 'Discounted transactions', cols: [['SI / Order'], ['Date / Time'], ['Branch'], ['Discount'], ['Customer'], ['Gross', 'peso'], ['Discount', 'peso'], ['Net', 'peso'], ['ID photo', 'idlink']],
          rows: os.map(o => ['SI-' + String(o.si).padStart(6, '0'), stamp(o.paidAt), o.branchName, o.discountName, o.customerName, o.subtotal, o.discountAmt, o.total, o.idPhoto ? o.idType + '~' + o.idPhoto : '']) },
        { title: 'Buddy / ID discount sales (with ID photo on file)', cols: [['SI / Order'], ['Date / Time'], ['Branch'], ['Customer'], ['Service'], ['Cashier'], ['ID photo', 'idlink']],
          rows: all_.filter(o => o.idPhoto || o.items.some(i => i.needId)).map(o => ['SI-' + String(o.si).padStart(6, '0'), stamp(o.paidAt), o.branchName, o.customerName, o.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), cashierName(o.cashierId), o.idPhoto ? o.idType + '~' + o.idPhoto : 'MISSING']) }]
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
  scorecard(f) {
    const rows = scoreData(f.from, f.to, f.br).sort((a, b) => b.sales - a.sales), rate = r => r.rating == null ? '—' : r.rating.toFixed(1) + ' ★ (' + r.rc + ')';
    const byBr = {}; for (const r of rows) { const b = byBr[r.branchId] ||= { n: 0, sales: 0, worked: 0, late: 0, absent: 0, custs: 0, returning: 0, rs: 0, rc: 0, barbers: 0 }; b.n += r.n; b.sales += r.sales; b.worked += r.worked; b.late += r.late; b.absent += r.absent; b.custs += r.custs; b.returning += r.returning; b.rs += (r.rating || 0) * r.rc; b.rc += r.rc; b.barbers++; }
    return {
      cards: [{ label: 'Haircuts completed', value: sum(rows, r => r.n), t: 'num' }, { label: 'Service sales', value: sum(rows, r => r.sales), t: 'peso' }, { label: 'Top barber', value: rows[0] && rows[0].n ? rows[0].s.name : '—', t: 'text' }, { label: 'Returning customers', value: sum(rows, r => r.returning), t: 'num', sub: 'of ' + sum(rows, r => r.custs) + ' identified customers' }],
      tables: [{ title: 'Barber comparison (ranked by sales)', cols: [['Rank', 'num'], ['Barber'], ['Branch'], ['Haircuts', 'num'], ['Service sales', 'peso'], ['Avg ticket', 'peso'], ['Sales per day', 'peso'], ['Haircuts per day', 'num'], ['Returning customers', 'num'], ['Commission', 'peso'], ['Days worked', 'num'], ['Late arrivals', 'num'], ['Days without time-in', 'num'], ['Rating']],
        rows: rows.map((r, i) => [i + 1, r.s.name, get('branches', r.branchId)?.name || '', r.n, r.sales, r.avg, r.perDay, Math.round(r.cutsPerDay * 10) / 10, r.returning, r.comm, r.worked, r.late, r.absent, rate(r)]) },
        { title: 'Branch comparison', cols: [['Branch'], ['Barbers', 'num'], ['Haircuts', 'num'], ['Service sales', 'peso'], ['Sales per barber', 'peso'], ['Returning customers', 'num'], ['Late arrivals', 'num'], ['Days without time-in', 'num'], ['Rating']],
          rows: Object.entries(byBr).sort((a, b) => b[1].sales - a[1].sales).map(([id, b]) => [get('branches', id)?.name || '', b.barbers, b.n, b.sales, b.barbers ? b.sales / b.barbers : 0, b.returning, b.late, b.absent, b.rc ? (b.rs / b.rc).toFixed(1) + ' ★ (' + b.rc + ')' : '—']) }]
    };
  },
  accountability(f) {
    const zs = all(`select z.*, b.name branchName from zreadings z left join branches b on b.id=z.branchId where z.businessDate>=? and z.businessDate<=?${f.br ? ' and z.branchId=?' : ''} order by z.generatedAt desc`, ...(f.br ? [f.from, f.to, f.br] : [f.from, f.to])).map(z => ({ ...z, d: JSON.parse(z.data) })), by = {};
    for (const z of zs) { const k = z.d.cashier || 'Unknown'; const r = by[k] || { shifts: 0, short: 0, over: 0, shortCount: 0 }; r.shifts++; if (z.d.variance < 0) { r.short += z.d.variance; r.shortCount++; } else r.over += z.d.variance; by[k] = r; }
    return {
      cards: [{ label: 'Shifts closed', value: zs.length, t: 'num' }, { label: 'Total shortage', value: sum(zs.filter(z => z.d.variance < 0), z => z.d.variance), t: 'peso' }, { label: 'Total overage', value: sum(zs.filter(z => z.d.variance > 0), z => z.d.variance), t: 'peso' }, { label: 'Shifts with a shortage', value: zs.filter(z => z.d.variance < 0).length, t: 'num' }],
      tables: [{ title: 'By cashier', cols: [['Cashier'], ['Shifts', 'num'], ['Shifts short', 'num'], ['Total short', 'peso'], ['Total over', 'peso']], rows: Object.entries(by).map(([k, r]) => [k, r.shifts, r.shortCount, r.short, r.over]) },
        { title: 'Every closed shift', cols: [['Date'], ['Reading'], ['Branch'], ['Cashier'], ['Expected cash', 'peso'], ['Counted', 'peso'], ['Variance', 'peso']], rows: zs.map(z => [z.businessDate, 'Z-' + z.no, z.branchName, z.d.cashier || '', z.d.expected, z.d.counted, z.d.variance]) }]
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
  return '﻿' + rep.tables.map(t => [t.title, t.cols.map(c => c[0]).join(','), ...t.rows.map(r => r.map((v, j) => q(t.cols[j] && (t.cols[j][1] === 'idlink' || t.cols[j][1] === 'days') ? String(v).split('~')[0] : v)).join(','))].join('\n')).join('\n\n');
}

// ---------- http ----------
const GZIP_OK = new WeakSet();   // responses whose client accepts gzip
const send = (res, code, body, type = 'application/json') => {
  let out = type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body;
  const h = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (GZIP_OK.has(res) && out.length > 1024) { out = zlib.gzipSync(out, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  res.writeHead(code, h); res.end(out);
};
// Static files: read once, compressed once (brotli + gzip), revalidated with ETag so repeat visits cost a tiny 304.
const SCACHE = new Map();
function serveStatic(req, res, file) {
  const fp = path.join(DIR, file), st = fs.statSync(fp); let c = SCACHE.get(file);
  if (!c || c.mtime !== st.mtimeMs) {
    const buf = fs.readFileSync(fp), ext = file.split('.').pop(), text = ext === 'html' || ext === 'js' || ext === 'webmanifest' || ext === 'json';
    c = { mtime: st.mtimeMs, buf, ext, etag: '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"', br: text && buf.length > 512 ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : null, gz: text && buf.length > 512 ? zlib.gzipSync(buf, { level: 9 }) : null };
    SCACHE.set(file, c);
  }
  const img = c.ext === 'png' || c.ext === 'jpg';
  const h = { 'Content-Type': MIME[c.ext], ETag: c.etag, 'Cache-Control': img ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); return res.end(); }
  const ae = String(req.headers['accept-encoding'] || ''); let body = c.buf;
  if (c.br && /(^|[ ,])br([ ,;]|$)/.test(ae)) { body = c.br; h['Content-Encoding'] = 'br'; } else if (c.gz && /gzip/.test(ae)) { body = c.gz; h['Content-Encoding'] = 'gzip'; }
  h['Content-Length'] = body.length; res.writeHead(200, h); res.end(body);
}
const readBody = (req, max = 100_000) => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > max) { no(new HttpError(413, 'Too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new HttpError(400, 'Bad JSON')); } });
});
const STATIC = { '/book': 'book.html', '/book.js': 'book.js', '/': 'landing.html','/app.js': 'app.js', '/pos': 'pos.html', '/pos.js': 'pos.js', '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest', '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/logo.png': 'logo.png', '/logo-sm.png': 'logo-sm.png', '/membership-card.jpg': 'membership-card.jpg', '/apple-touch-icon.png': 'apple-touch-icon.png', '/update.js': 'update.js', '/inbox.js': 'inbox.js', '/backend': 'index.html', '/.well-known/assetlinks.json': 'assetlinks.json' };
const normHost = h => String(h || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '').replace(/^www\./, '');
const SITE_HOST = normHost(process.env.SITE_HOST), APP_HOST = normHost(process.env.APP_HOST);
const PUBLIC_PATHS = new Set(['/', '/book', '/book.js', '/logo.png', '/logo-sm.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/unsubscribe', '/.well-known/assetlinks.json']);
// App version = hash of every file the apps load. It changes on each deploy, which is what makes phones offer the "Update app" button.
const APP_VERSION = (() => { const h = crypto.createHash('sha1'); for (const f of Object.values(STATIC).filter((v, i, a) => a.indexOf(v) === i && v !== 'sw.js').sort()) { try { h.update(fs.readFileSync(path.join(DIR, f))); } catch { } } return h.digest('hex').slice(0, 12); })();
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };
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
  if (!['admin', 'cashier', 'barber'].includes(role)) bad(400, 'Role must be admin, cashier or barber');
  const branchId = 'branchId' in b ? b.branchId : cur?.branchId;
  if (role !== 'admin' && !get('branches', branchId)) bad(409, 'Cashiers and barbers need a branch');
  const username = 'username' in b ? String(b.username || '').trim().toLowerCase() : (cur?.username || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'owner') bad(409, 'Username: 3–30 letters/numbers (. _ - allowed), not "owner"');
  if (one('select id from users where username=? and id<>?', username, cur?.id || '')) bad(409, 'Username already taken');
  const pin = b.pin ? String(b.pin).trim() : '';
  if (pin) {
    if (!/^\d{6}$/.test(pin)) bad(409, 'PIN must be exactly 6 digits');
    if (one('select id from users where pinKey=? and id<>?', pinKeyOf(pin), cur?.id || '')) bad(409, 'That PIN is already used by someone else');
  }
  if (role !== 'admin' && !pin && !cur?.pinKey) bad(409, 'Set a 6-digit PIN for this user');
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
  // Host-based routing (only when SITE_HOST / APP_HOST are set; otherwise every path works on every host, as in local dev and on the Railway URL).
  // SITE_HOST = public site: promo page + /book.  APP_HOST = staff domain: /backend + /pos.
  if (SITE_HOST || APP_HOST) {
    const host = normHost(req.headers['x-forwarded-host'] || req.headers.host), go = (h, to) => { res.writeHead(302, { Location: 'https://' + h + (to ?? req.url) }); return res.end(); };
    if (SITE_HOST && host === SITE_HOST) {
      const ok = PUBLIC_PATHS.has(p) || p.startsWith('/api/public/') || /^\/img\/\w+$/.test(p) || p.startsWith('/site/');
      if (!ok) { if (APP_HOST && method === 'GET' && !p.startsWith('/api/')) return go(APP_HOST); return send(res, 404, { error: 'Not found' }); }
    } else if (APP_HOST && host === APP_HOST) {
      if (method === 'GET' && p === '/') { res.writeHead(302, { Location: '/backend' }); return res.end(); }
      if (SITE_HOST && method === 'GET' && (p === '/book' || p === '/book.js')) return go(SITE_HOST);
    }
  }
  if (method === 'GET' && p === '/backend/') { res.writeHead(302, { Location: '/backend' }); return res.end(); }
  if (method === 'GET' && p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME.js, 'Cache-Control': 'no-cache' }); return res.end(`const VERSION=${JSON.stringify(APP_VERSION)};\n` + fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8')); }
  if (method === 'GET' && p === '/api/version') return send(res, 200, { version: APP_VERSION });
  if (method === 'GET' && STATIC[p]) return serveStatic(req, res, STATIC[p]);
  const sm0 = p.match(/^\/site\/([\w-]+\.(?:jpg|png))$/);   // promo-site photos (shop, barbers, storefront)
  if (sm0 && method === 'GET') { if (!fs.existsSync(path.join(DIR, 'site', sm0[1]))) return send(res, 404, { error: 'Not found' }); return serveStatic(req, res, 'site/' + sm0[1]); }
  const im = p.match(/^\/img\/(\w+)$/);
  if (im && method === 'GET') {
    const r = one('select mime,data from images where id=?', im[1]); if (!r) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    return res.end(Buffer.from(r.data));
  }
  if (p === '/unsubscribe' && method === 'GET') {
    const c = q.c ? get('customers', String(q.c)) : null, ok = !!c && String(q.t || '') === unsubSig(c.id);
    if (ok) { run('update customers set consent=0 where id=?', c.id); log({ name: 'Customer' }, 'unsubscribe', 'customers', c.id, c.name); }
    const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brotherhood Barber</title><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f6;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 8px 30px -14px rgba(0,0,0,.3)"><div style="font-size:24px;font-weight:700;letter-spacing:3px">BROTHERHOOD</div><p style="margin:18px 0 6px;font-size:18px"><b>${ok ? 'You are unsubscribed.' : 'This link is not valid.'}</b></p><p style="color:#666;margin:0">${ok ? 'You will no longer receive emails and promos from us. Your points and visits are kept.' : 'Please tell our cashier if you want to stop receiving emails.'}</p></div></body>`;
    return send(res, ok ? 200 : 400, page, 'text/html; charset=utf-8');
  }
  if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (p === '/api/public/terms' && method === 'GET') return send(res, 200, { terms: getTerms() });

  // ----- public: Google reviews of a branch -----
  if (p === '/api/public/google' && method === 'GET') {
    const br = get('branches', String(q.branch || '')); if (!br) bad(400, 'Pick a branch');
    const g = await googleData(br); return send(res, 200, { ...gInfo(br), ...(g || {}), available: !!g?.reviews });
  }
  // ----- public booking (customers, no login) -----
  if (p === '/api/public/info' && method === 'GET') {
    return send(res, 200, {
      shop: SHOP, branches: all('select id,name,address,phone,openTime,closeTime,photo,mapUrl,googlePlaceId,googleUrl from branches order by rowid').map(({ googlePlaceId, googleUrl, ...b }) => ({ ...b, photo: b.photo || siteCover(b.name), google: gInfo({ ...b, googlePlaceId, googleUrl }) })),
      ratings: Object.fromEntries(all('select branchId, count(*) n, avg(rating) a from reviews group by branchId').map(s => [s.branchId, { count: s.n, avg: Math.round(s.a * 10) / 10 }])),
      services: all("select id,name,price,mins,photo,apptOnly,categoryId from items where active=1 and type='service' and bookable=1 order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name) })),
      menu: all("select id,name,price,mins,photo,apptOnly,bookable from items where active=1 and type='service' order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name), bookable: !!s.bookable })),   // every service for the price menu; only bookable ones can be booked online
      categories: all("select id,name from categories where type='service'"),
      staff: all('select id,name,photo,branchId from staff where active=1 order by name')
    });
  }
  if (p === '/api/public/slots' && method === 'GET') {
    const date = String(q.date || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr()) return send(res, 200, { slots: [] });
    const ids = String(q.items || '').split(',').filter(Boolean); if (!ids.length) return send(res, 200, { slots: [] });
    return send(res, 200, { slots: slotsFor(String(q.branch || ''), date, String(q.staff || 'any'), bookingMins(ids)) });
  }
  if (p === '/api/public/reviews' && method === 'GET') {
    const brId = q.branch && get('branches', String(q.branch)) ? String(q.branch) : null;
    const rows = all(`select r.id, r.name, r.rating, r.text, r.createdAt, r.branchId, b.name branchName, s.name staffName from reviews r left join branches b on b.id=r.branchId left join staff s on s.id=r.staffId${brId ? ' where r.branchId=?' : ''} order by r.createdAt desc limit 60`, ...(brId ? [brId] : []));
    const sm = one('select count(*) n, avg(rating) a from reviews' + (brId ? ' where branchId=?' : ''), ...(brId ? [brId] : []));
    return send(res, 200, { reviews: rows, count: sm.n, avg: sm.n ? Math.round(sm.a * 10) / 10 : 0 });
  }
  if (p === '/api/public/reviews' && method === 'POST') {
    if (reviewBlocked(ip)) bad(429, 'You can only post a few reviews per hour. Please try again later.');
    const b = await readBody(req), name = String(b.name || '').trim().slice(0, 60), rating = Math.round(+b.rating), text = String(b.text || '').trim().slice(0, 600);
    if (!name) bad(400, 'Please enter your name'); if (!(rating >= 1 && rating <= 5)) bad(400, 'Please choose a rating from 1 to 5 stars');
    if (!get('branches', String(b.branchId || ''))) bad(400, 'Please choose the branch you visited');
    const st = b.staffId ? get('staff', String(b.staffId)) : null, id = uid();
    run('insert into reviews(id,branchId,staffId,name,rating,text,createdAt) values(?,?,?,?,?,?,?)', id, String(b.branchId), st && st.branchId === String(b.branchId) ? st.id : '', name, rating, text, nowISO());
    hitRate(reviewHits, ip); log({ name: 'Online: ' + name }, 'review', 'reviews', id, `${rating} stars`); return send(res, 201, { ok: true });
  }
  if (p === '/api/public/book' && method === 'POST') {
    if (bookingBlocked(ip)) bad(429, 'Too many bookings from this device. Please try again later.');
    const bk = createBooking(await readBody(req), 'online'); hitRate(bookHits, ip);
    log({ name: 'Online: ' + bk.customerName }, 'booking', 'bookings', bk.id, `${bk.date} ${bk.time} ${bk.branchName}`);
    return send(res, 201, { ok: true, booking: { date: bk.date, time: bk.time, branch: bk.branchName, staff: bk.staffName, staffPhoto: bk.staffPhoto, items: bk.items, total: bk.total, name: bk.customerName } });
  }

  if (p === '/api/public/login-hint' && method === 'GET') return send(res, 200, { ownerNamed: !!ownerUser() });
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
    else if ((ownerUser() ? uname === ownerUser() : (!uname || uname === 'owner')) && crypto.timingSafeEqual(sha(pw), sha(PASS))) { tok = makeToken('owner', ''); who = 'Owner'; }
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
  if (!admin) {   // role permissions: which POS sections this role may open (set by the owner in Settings → Access)
    const mod = (() => {
      if (/^\/api\/pos\/dashboard$/.test(p)) return 'dashboard';
      if (/^\/api\/pos\/queue$/.test(p)) return ['queue', 'pos'];
      if (/^\/api\/pos\/(shift|zreadings)$|^\/api\/shifts\//.test(p)) return 'reading';
      if (/^\/api\/(pos\/)?attendance$/.test(p) || p === '/api/attendance/log') return 'attendance';
      if (/^\/api\/expenses$/.test(p) || /^\/api\/expense-claims/.test(p)) return 'expenses';
      if (/^\/api\/bookings/.test(p)) return 'bookings';
      if (p === '/api/orders' && method === 'POST') return 'pos';
      if (p === '/api/pos/idphoto') return 'pos';
      if (/^\/api\/remittances/.test(p)) return 'remittance';
      if (/^\/api\/advances/.test(p)) return 'release';
      if (/^\/api\/problems/.test(p)) return 'problems';
      if (/^\/api\/checklists/.test(p)) return 'checklist';
      if (/^\/api\/leaves/.test(p)) return 'leave';
      if (/^\/api\/me\//.test(p)) return 'myperf';
      if (/^\/api\/inbox/.test(p)) return 'inbox';
      if (/^\/api\/files/.test(p)) return ['remittance', 'expenses', 'pos'];
      if (/^\/api\/orders\/\w+\/(pay|void)$/.test(p)) return 'pos';
      if (/^\/api\/orders\/\w+$/.test(p) && method === 'PUT') return ['pos', 'queue'];
      if (p === '/api/cash') return ['expenses', 'reading'];
      if (/^\/api\/customers/.test(p)) return ['pos', 'customers'];
      return null;
    })();
    if (mod) needAny(me, mod);
  }

  // ----- admin data -----
  if (p === '/api/state' && method === 'GET') {
    if (admin) rememberOrigin(req);
    if (!admin) { const su = get('users', me.id), sp = su && su.staffId ? get('staff', su.staffId) : null; return send(res, 200, { shop: SHOP, me: sp ? { ...me, photo: sp.photo || '' } : me, modules: modulesFor(me.role) }); }   // a barber's own profile picture
    return send(res, 200, {
      shop: SHOP, me, branches: all('select * from branches order by rowid'), chairs: all('select * from chairs order by branchId, sort'), staff: all('select * from staff order by name'),
      categories: all('select * from categories order by name'), items: all('select * from items order by name'), discounts: all('select * from discounts order by name'),
      users: all('select * from users order by name').map(strip), equipment: all('select * from equipment order by branchId, name')
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
    const T = { member: [0, 4], bronze: [5, 15], silver: [16, 25], gold: [26, 50], vip: [51, 1e9] }[String(q.tier || '').toLowerCase()];
    const BR = q.branch && q.branch !== 'all' && get('branches', String(q.branch)) ? String(q.branch) : null;
    const base = `select c.*, (select count(*) from orders o where o.customerId=c.id and o.status='paid') visits, (select ifnull(sum(o.total),0) from orders o where o.customerId=c.id and o.status='paid') spent,
      (select max(o.paidAt) from orders o where o.customerId=c.id and o.status='paid') lastVisit,
      ifnull((select o.branchId from orders o where o.customerId=c.id and o.status='paid' order by o.paidAt desc limit 1), c.branchId) homeBranch from customers c
      where lower(c.name||' '||ifnull(c.phone,'')||' '||ifnull(c.email,'')||' '||ifnull(c.preferredCut,'')) like ?`;
    const conds = [T ? 'visits between ? and ?' : '', BR ? 'homeBranch = ?' : ''].filter(Boolean), where = conds.length ? ' where ' + conds.join(' and ') : '';
    const args = [term, ...(T ? [T[0], T[1]] : []), ...(BR ? [BR] : [])];
    const rows = all(`select * from (${base}) ${where} order by (lastVisit is null), lastVisit desc, createdAt desc limit ${size} offset ${off}`, ...args)
      .map(c => ({ ...c, spent: r2(c.spent), tier: tierOf(c.visits), branchName: get('branches', c.homeBranch || '')?.name || '' }));
    return send(res, 200, { total: one(`select count(*) n from (${base}) ${where}`, ...args).n, rows });
  }  if (p === '/api/customers/lookup' && method === 'GET') { const c = findCustomer(q.phone, q.email); return send(res, 200, { customer: c ? custCard(c) : null }); }
  if (p === '/api/customers' && method === 'POST') {
    const b = await readBody(req), c = upsertCustomer(b, isBranchUser(me) ? 'pos' : 'admin', isBranchUser(me) ? me.branchId : (get('branches', String(b.branchId || '')) ? b.branchId : null));
    if (!c) bad(400, 'A phone number or an email is required to join the Customer Directory.');
    log(me, 'customer', 'customers', c.id, c.name); return send(res, 201, custCard(c));
  }
  const cum = p.match(/^\/api\/customers\/(\w+)$/);
  if (cum && method === 'PUT') {
    const cur = get('customers', cum[1]); if (!cur) bad(404, 'Not found');
    const c = editCustomer(cur, await readBody(req)); log(me, 'update', 'customers', c.id, c.name); return send(res, 200, custCard(c));
  }
  if (cum && method === 'DELETE') { adminOnly(); run('delete from customers where id=?', cum[1]); log(me, 'delete', 'customers', cum[1], ''); return send(res, 200, { ok: true }); }
  if (p === '/api/customers/import' && method === 'POST') {
    adminOnly(); const b = await readBody(req, 8_000_000), rows = Array.isArray(b.rows) ? b.rows.slice(0, 20000) : [];
    let added = 0, skipped = 0; db.exec('begin');
    try {
      for (const r of rows) {
        const name = String(r.name || '').trim().slice(0, 200), imBr = get('branches', String(b.branchId || '')) ? b.branchId : null, phone = String(r.phone || '').trim().slice(0, 40), email = normEmail(r.email).slice(0, 200), pk = normPhone(phone);
        if (!name || (!pk && !(email && validEmail(email))) || findCustomer(phone, email)) { skipped++; continue; }   // directory rule: needs phone or email
        run('insert into customers(id,name,phone,email,notes,createdAt,preferredCut,consent,phoneKey,emailKey,source,branchId) values(?,?,?,?,?,?,?,0,?,?,?,?)', uid(), name, phone, validEmail(email) ? email : '', '', nowISO(), String(r.preferredCut || '').slice(0, 200), pk || null, validEmail(email) ? email : null, 'import', imBr); added++;
      }
      db.exec('commit');
    } catch (e) { db.exec('rollback'); throw e; }
    log(me, 'import', 'customers', '', `${added} added, ${skipped} skipped`);
    return send(res, 200, { added, skipped });
  }

  // ----- reviews (admin can read and delete) -----
  if (p === '/api/reviews' && method === 'GET') {
    adminOnly(); return send(res, 200, all('select r.*, b.name branchName, s.name staffName from reviews r left join branches b on b.id=r.branchId left join staff s on s.id=r.staffId order by r.createdAt desc limit 500'));
  }
  const rvm = p.match(/^\/api\/reviews\/(\w+)$/);
  if (rvm && method === 'DELETE') {
    adminOnly(); const r = one('select * from reviews where id=?', rvm[1]); if (!r) bad(404, 'Not found');
    run('delete from reviews where id=?', r.id); log(me, 'delete', 'reviews', r.id, `${r.name} ${r.rating} stars`); return send(res, 200, { ok: true });
  }
  // ----- branch settings: apply one commission rate to every barber of a branch -----
  const apm = p.match(/^\/api\/branches\/(\w+)\/apply-commission$/);
  if (apm && method === 'POST') {
    adminOnly(); const br = get('branches', apm[1]); if (!br) bad(404, 'Not found');
    const pct = +(await readBody(req)).pct; if (!(pct >= 0 && pct <= 100)) bad(400, 'Commission must be between 0 and 100');
    run('update branches set defaultPct=? where id=?', pct, br.id); const r = run('update staff set pct=? where branchId=?', pct, br.id);
    log(me, 'apply-commission', 'branches', br.id, `${pct}% to ${r.changes} barbers`); return send(res, 200, { ok: true, updated: Number(r.changes) });
  }
  // ----- reset a user's PIN / password (shown once) -----
  const urm = p.match(/^\/api\/users\/(\w+)\/reset$/);
  if (urm && method === 'POST') {
    adminOnly(); const u = get('users', urm[1]); if (!u) bad(404, 'Not found');
    if (u.role === 'admin' && me.role !== 'owner') bad(403, 'Only the owner can reset an admin');
    if (u.role === 'admin') { const pw = crypto.randomBytes(6).toString('base64url'); run('update users set passHash=? where id=?', hashPw(pw), u.id); log(me, 'reset-password', 'users', u.id, u.name); return send(res, 200, { password: pw }); }
    let pin; do { pin = String(100000 + crypto.randomInt(900000)); } while (one('select 1 x from users where pinKey=?', pinKeyOf(pin)));
    run('update users set pinKey=? where id=?', pinKeyOf(pin), u.id); log(me, 'reset-pin', 'users', u.id, u.name); return send(res, 200, { pin });
  }
  // ----- settings: terms, email (admin) -----
  if (p === '/api/settings' && method === 'GET') {
    adminOnly();
    return send(res, 200, { payRules: payRules(), attPhoto: getSetting('attPhoto') !== '0', attGeo: getSetting('attGeo') === '1', ownerUser: ownerUser(), isOwner: me.role === 'owner', google: { configured: !!G_KEY }, perms: permsAll(), modules: MODULES, terms: getTerms(), customTerms: !!getSetting('terms'), email: { configured: !!EMAIL.key, from: EMAIL.from, replyTo: EMAIL.replyTo, baseUrl: baseUrl() },
      log: all('select id,toAddr,kind,subject,status,attempts,error,createdAt,sentAt from email_log order by createdAt desc limit 25') });
  }
  if (p === '/api/settings' && method === 'PUT') {
    adminOnly(); const b = await readBody(req, 50_000);
    if ('attPhoto' in b) setSetting('attPhoto', b.attPhoto ? '1' : '0');
    if ('attGeo' in b) setSetting('attGeo', b.attGeo ? '1' : '0');
    if (b.payRules) { for (const k of ['lunchAmount', 'lunchLateMins', 'allowLateMins']) if (k in b.payRules) { const v = Number(b.payRules[k]); if (!(v >= 0 && v <= 100000)) bad(400, 'Enter a valid number'); setSetting(k, String(v)); } log(me, 'pay-rules', 'settings', '', JSON.stringify(payRules())); }
    if ('terms' in b) setSetting('terms', String(b.terms || '').trim().slice(0, 8000));
    if (b.perms && typeof b.perms === 'object') {
      const cur = permsAll(), next = {}; for (const role of ['cashier', 'barber']) next[role] = Array.isArray(b.perms[role]) ? b.perms[role].filter(m => MODULES.includes(m)) : cur[role];
      setSetting('perms', JSON.stringify(next)); log(me, 'settings', 'settings', '', 'access ' + JSON.stringify(next));
    }
    log(me, 'settings', 'settings', '', 'terms'); return send(res, 200, { ok: true });
  }
  if (p === '/api/settings/reset' && method === 'POST') {
    if (me.role !== 'owner') bad(403, 'Only the owner can reset data');
    const b = await readBody(req); if (b.confirm !== 'RESET') bad(400, 'Type RESET to confirm');
    if (!b.sales && !b.bookings && !b.reviews && !b.customers) bad(400, 'Choose what to reset');
    const file = path.join(BK_DIR, 'pre-reset-' + nowISO().replace(/[:.]/g, '-') + '.db'); backup(file);   // safety copy first
    const gone = {}; db.exec('begin');
    try {
      if (b.sales) for (const tb of ['orders', 'shifts', 'cash_moves', 'zreadings', 'attendance', 'payroll_days']) gone[tb] = Number(run(`delete from ${tb}`).changes);
      if (b.bookings) gone.bookings = Number(run('delete from bookings').changes);
      if (b.reviews) gone.reviews = Number(run('delete from reviews').changes);
      if (b.customers) { gone.customers = Number(run('delete from customers').changes); gone.emails = Number(run('delete from email_log').changes); }
      db.exec('commit');
    } catch (e) { db.exec('rollback'); throw e; }
    log(me, 'reset-data', 'settings', '', JSON.stringify(gone)); return send(res, 200, { ok: true, deleted: gone, backup: path.basename(file) });
  }
  if (p === '/api/settings/owner-username' && method === 'PUT') {
    if (me.role !== 'owner') bad(403, 'Only the owner can change the owner username');
    const b = await readBody(req), u = String(b.username || '').trim().toLowerCase();
    if (u && !/^[a-z0-9._-]{3,30}$/.test(u)) bad(400, 'Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore');
    if (u && one('select 1 x from users where lower(username)=?', u)) bad(409, 'That username is already used by another user');
    if (!crypto.timingSafeEqual(sha(String(b.password || '')), sha(PASS))) bad(403, 'Wrong password. Enter your current owner password to confirm.');
    setSetting('ownerUser', u); log(me, 'owner-username', 'settings', '', u || '(blank)');
    return send(res, 200, { ok: true, username: u });
  }
  if (p === '/api/settings/test-email' && method === 'POST') {
    adminOnly(); const to = normEmail((await readBody(req)).to); if (!validEmail(to)) bad(400, 'Invalid email address');
    if (!EMAIL.key) bad(409, 'The email service is not connected yet (add RESEND_API_KEY in the Railway variables).');
    const w = welcomeEmail({ name: me.name }), unsub = baseUrl() + '/unsubscribe?test=1';
    const r = await sendEmail({ to, subject: 'TEST: ' + w.subject, html: w.html.replaceAll('{{UNSUB}}', unsub), text: w.text.replaceAll('{{UNSUB}}', unsub) });
    if (!r.ok) bad(502, r.error); log(me, 'test-email', 'settings', '', to); return send(res, 200, { ok: true });
  }
  // ----- customer ID photos (Senior / PWD / Student discount). Private: only logged-in staff can view them, never via the public /img route. -----
  if (p === '/api/pos/idphoto' && method === 'POST') {
    const b = await readBody(req, 1_800_000), branchId = branchScope(me, b.branchId);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'The ID photo must be a JPEG, PNG or WebP image');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1_000_000) bad(413, 'The photo is too large. Please try again.');
    const type = ID_TYPES.includes(b.idType) ? b.idType : bad(400, 'Choose the ID type: Senior, PWD or Student');
    const id = uid() + uid(); run('insert into id_photos(id,orderId,branchId,idType,mime,data,byId,createdAt) values(?,?,?,?,?,?,?,?)', id, '', branchId, type, m[1], buf, me.id, nowISO());
    log(me, 'id-photo', 'id_photos', id, type); return send(res, 201, { id, idType: type });
  }
  const idm = p.match(/^\/api\/idphoto\/(\w+)$/);
  if (idm && method === 'GET') {
    const ph = get('id_photos', idm[1]); if (!ph || (isBranchUser(me) && ph.branchId !== me.branchId)) bad(404, 'Not found');
    res.writeHead(200, { 'Content-Type': ph.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(ph.data);
  }
  // ----- private evidence photos (remittance proof, receipts, ...). Never served on a public route. -----
  if (p === '/api/files' && method === 'POST') {
    const b = await readBody(req, 1_800_000), branchId = branchScope(me, b.branchId);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'The photo must be a JPEG, PNG or WebP image');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1_000_000) bad(413, 'The photo is too large. Please try again.');
    const id = uid() + uid(); run('insert into files(id,kind,branchId,mime,data,byId,byName,createdAt,enc) values(?,?,?,?,?,?,?,?,1)', id, String(b.kind || 'other').slice(0, 20), branchId, m[1], encBuf(buf), me.id, me.name, nowISO());
    log(me, 'file-upload', 'files', id, String(b.kind || 'other')); return send(res, 201, { id });
  }
  const flm = p.match(/^\/api\/files\/(\w+)$/);
  if (flm && method === 'GET') {
    const f = get('files', flm[1]); if (!f || (isBranchUser(me) && f.kind !== 'chat' && f.branchId !== me.branchId)) bad(404, 'Not found');
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(f.enc ? decBuf(f.data) : f.data);
  }
  // ----- expenses with receipts -----
  const EXP_CATS = ['Supplies', 'Utilities', 'Repairs & Maintenance', 'Food & Meals', 'Transportation', 'Marketing', 'Equipment', 'Staff Welfare', 'Other'], PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card', 'Other'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const expView = x => ({ ...x, receipts: jp(x.receipts), history: jp(x.history), branchName: get('branches', x.branchId)?.name || '', noReceipt: !jp(x.receipts).length });
  if (p === '/api/expense-claims/options' && method === 'GET') return send(res, 200, { categories: EXP_CATS, methods: PAY_METHODS });
  if (p === '/api/expense-claims' && method === 'GET') {
    const t0 = todayStr(), rg = q.range === 'month' ? [t0.slice(0, 8) + '01', t0] : q.range === 'all' ? ['2000-01-01', '2099-12-31'] : q.range === 'today' ? [t0, t0] : [DATE_RE.test(q.from || '') ? q.from : '2000-01-01', DATE_RE.test(q.to || '') ? q.to : '2099-12-31'];
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), st = ['PENDING', 'APPROVED', 'REJECTED'].includes(q.status) ? q.status : null, cat = EXP_CATS.includes(q.category) ? q.category : null, term = String(q.q || '').toLowerCase();
    let rows = all(`select * from expense_claims where date>=? and date<=?${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''}${cat ? ' and category=?' : ''} order by date desc, createdAt desc limit 1000`, rg[0], rg[1], ...(br ? [br] : []), ...(st ? [st] : []), ...(cat ? [cat] : [])).map(expView);
    if (term) rows = rows.filter(x => (x.description + ' ' + x.category + ' ' + x.submittedBy).toLowerCase().includes(term));
    const live = rows.filter(x => x.status !== 'REJECTED'), byCategory = {}; for (const x of live) byCategory[x.category] = r2((byCategory[x.category] || 0) + x.amount);
    const out = { rows, total: r2(sum(live, x => x.amount)), count: rows.length, noReceipt: rows.filter(x => x.noReceipt).length, byCategory, today: r2(sum(all("select amount from expense_claims where date=? and status<>'REJECTED'" + (br ? ' and branchId=?' : ''), t0, ...(br ? [br] : [])), x => x.amount)) };
    if (q.format === 'csv') {
      adminOnly(); const qt = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="expenses.csv"' });
      return res.end('﻿' + ['Date,Branch,Category,Description,Amount,Payment method,Receipts,No-receipt reason,Status,Submitted by', ...rows.map(x => [x.date, x.branchName, x.category, x.description, x.amount, x.method, x.receipts.length ? x.receipts.length + ' photo(s)' : 'NO RECEIPT', x.noReceiptReason, x.status, x.submittedBy].map(qt).join(','))].join('\n'));
    }
    return send(res, 200, out);
  }
  if (p === '/api/expense-claims' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), date = String(b.date || todayStr());
    if (!DATE_RE.test(date) || date > todayStr() || date < dOf(new Date(Date.now() - 31 * 864e5))) bad(400, 'The expense date must be today or within the last 31 days');
    const amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Amount must be more than 0');
    const category = EXP_CATS.includes(b.category) ? b.category : bad(400, 'Choose a category'), method2 = PAY_METHODS.includes(b.method) ? b.method : bad(400, 'Choose the payment method');
    const description = String(b.description || '').trim().slice(0, 300); if (description.length < 3) bad(400, 'Enter a description');
    const receipts = (Array.isArray(b.receipts) ? b.receipts : []).slice(0, 8).map(String); for (const fid of receipts) { const fl = get('files', fid); if (!fl || fl.branchId !== branchId) bad(400, 'A receipt photo was not found. Please attach it again.'); }
    const reason = String(b.noReceiptReason || '').trim().slice(0, 300); if (!receipts.length && reason.length < 5) bad(400, 'No receipt? Enter the reason (at least a few words).');
    const id = uid(); let cm = '';
    const sh = method2 === 'Cash' && date === todayStr() ? openShift(branchId) : null;
    if (sh) { cm = uid(); run('insert into cash_moves(id,shiftId,branchId,date,kind,amount,note,staffId,ts,by) values(?,?,?,?,?,?,?,?,?,?)', cm, sh.id, branchId, date, 'expense', amount, (category + ': ' + description).slice(0, 200), '', nowISO(), me.name); }
    run('insert into expense_claims(id,branchId,date,category,description,amount,method,receipts,noReceiptReason,status,submittedById,submittedBy,staffId,createdAt,cashMoveId,history) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, branchId, date, category, description, amount, method2, JSON.stringify(receipts), receipts.length ? '' : reason, 'PENDING', me.id, me.name, '', nowISO(), cm, JSON.stringify([{ at: nowISO(), by: me.name, action: 'SUBMITTED', note: receipts.length ? '' : 'NO RECEIPT: ' + reason }]));
    log(me, 'expense', 'expense_claims', id, `${category} ${amount} ${method2}${receipts.length ? '' : ' NO RECEIPT'}`); return send(res, 201, expView(get('expense_claims', id)));
  }
  const exm = p.match(/^\/api\/expense-claims\/(\w+)\/review$/);
  if (exm && method === 'PUT') {
    adminOnly(); const x = get('expense_claims', exm[1]); if (!x) bad(404, 'Not found');
    const b = await readBody(req), act = { approve: 'APPROVED', reject: 'REJECTED' }[b.action], note = String(b.note || '').trim().slice(0, 300);
    if (!act) bad(400, 'Choose approve or reject'); if (act === 'REJECTED' && !note) bad(400, 'A note is required to reject an expense');
    const hist = jp(x.history); hist.push({ at: nowISO(), by: me.name, action: act, note });
    run('update expense_claims set status=?, reviewedBy=?, reviewedAt=?, reviewNote=?, history=? where id=?', act, me.name, nowISO(), note, JSON.stringify(hist), x.id);
    log(me, 'expense-' + b.action, 'expense_claims', x.id, note); return send(res, 200, expView(get('expense_claims', x.id)));
  }
  // ----- release pay / cash advance (deducted automatically in payroll) -----
  const ADV_TYPES = ['Cash Advance', 'Salary Advance', 'Partial Salary Release', 'Emergency Assistance', 'Other Authorized Deduction'], REL_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'];
  const advView = a => { const ds = all('select * from advance_deductions where advanceId=? order by dueDate, rowid', a.id); return { ...a, history: jp(a.history), branchName: get('branches', a.branchId)?.name || '', deductions: ds, balance: r2(sum(ds.filter(d => d.status === 'SCHEDULED'), d => d.amount)), deducted: r2(sum(ds.filter(d => d.status === 'APPLIED'), d => d.amount)) }; };
  const staffBalance = sid => { const ds = all("select * from advance_deductions where staffId=? and status in ('SCHEDULED','APPLIED') order by dueDate", sid); return { balance: r2(sum(ds.filter(d => d.status === 'SCHEDULED'), d => d.amount)), deducted: r2(sum(ds.filter(d => d.status === 'APPLIED'), d => d.amount)), deductions: ds }; };
  if (p === '/api/advances/options' && method === 'GET') return send(res, 200, { types: ADV_TYPES, methods: REL_METHODS });
  if (p === '/api/advances/balance' && method === 'GET') {
    const s = get('staff', String(q.staffId || '')); if (!s || (isBranchUser(me) && s.branchId !== me.branchId)) bad(404, 'Employee not found');
    return send(res, 200, { staffId: s.id, name: s.name, ...staffBalance(s.id) });
  }
  if (p === '/api/advances' && method === 'GET') {
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), st = ['REQUESTED', 'APPROVED', 'RELEASED', 'REJECTED', 'CANCELLED'].includes(q.status) ? q.status : null;
    const rows = all(`select * from advances where 1=1${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''}${q.staffId ? ' and staffId=?' : ''} order by createdAt desc limit 500`, ...(br ? [br] : []), ...(st ? [st] : []), ...(q.staffId ? [String(q.staffId)] : [])).map(advView);
    return send(res, 200, { rows, outstanding: r2(sum(rows, r => r.balance)) });
  }
  if (p === '/api/advances' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), s = get('staff', String(b.staffId || '')); if (!s || s.branchId !== branchId) bad(400, 'Choose the employee');
    const type = ADV_TYPES.includes(b.type) ? b.type : bad(400, 'Choose the request type'), amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Enter the requested amount');
    const reason = String(b.reason || '').trim().slice(0, 300); if (reason.length < 5) bad(400, 'Enter the reason for the request');
    const inst = Math.max(1, Math.min(12, Math.floor(+b.installments || 1)));
    if (b.consent !== true) bad(400, 'The employee must agree in writing to the deduction from their wages. Tick the confirmation box.');
    const id = uid(); run('insert into advances(id,branchId,staffId,staffName,type,amount,reason,installments,status,requestedById,requestedBy,createdAt,consentAt,history) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, branchId, s.id, s.name, type, amount, reason, inst, 'REQUESTED', me.id, me.name, nowISO(), nowISO(), JSON.stringify([{ at: nowISO(), by: me.name, action: 'REQUESTED', note: `${type} ₱${amount} in ${inst} installment(s). Employee agreed to the deduction.` }]));
    log(me, 'advance-request', 'advances', id, `${s.name} ${type} ${amount}`); return send(res, 201, advView(get('advances', id)));
  }
  const avm = p.match(/^\/api\/advances\/(\w+)\/(approve|reject|release|cancel)$/);
  if (avm && method === 'PUT') {
    adminOnly(); const a = get('advances', avm[1]); if (!a) bad(404, 'Not found'); const b = await readBody(req), note = String(b.note || '').trim().slice(0, 300), hist = jp(a.history), act = avm[2];
    const push = (action, n) => hist.push({ at: nowISO(), by: me.name, action, note: n });
    if (act === 'cancel') { if (!['REQUESTED', 'APPROVED'].includes(a.status)) bad(409, 'Only requests that are not yet released can be cancelled'); push('CANCELLED', note); run("update advances set status='CANCELLED', history=? where id=?", JSON.stringify(hist), a.id); }
    else if (act === 'reject') { if (a.status !== 'REQUESTED') bad(409, 'This request was already handled'); if (!note) bad(400, 'A note is required to reject a request'); push('REJECTED', note); run("update advances set status='REJECTED', reviewedBy=?, reviewedAt=?, reviewNote=?, history=? where id=?", me.name, nowISO(), note, JSON.stringify(hist), a.id); }
    else if (act === 'approve') {
      if (a.status !== 'REQUESTED') bad(409, 'This request was already handled');
      const amt = r2(b.approvedAmt ?? a.amount); if (!(amt > 0) || amt > a.amount) bad(400, 'The approved amount must be more than 0 and not more than the requested amount');
      const inst = Math.max(1, Math.min(12, Math.floor(+b.installments || a.installments))), first = /^\d{4}-\d{2}-\d{2}$/.test(b.firstDue || '') ? b.firstDue : todayStr();
      if (b.consent !== true) bad(400, 'Confirm that you have the employee\'s written authorization to deduct from their wages');
      push('APPROVED', `₱${amt} in ${inst} installment(s) starting ${first}. ${note}`.trim());
      run("update advances set status='APPROVED', approvedAmt=?, installments=?, firstDue=?, reviewedBy=?, reviewedAt=?, reviewNote=?, history=? where id=?", amt, inst, first, me.name, nowISO(), note, JSON.stringify(hist), a.id);
    } else {   // release: money actually handed over -> only now deductions are scheduled
      if (a.status !== 'APPROVED') bad(409, 'Only approved requests can be released');
      const deductionOnly = a.type === 'Other Authorized Deduction', amt = deductionOnly ? a.approvedAmt : r2(b.releasedAmt); if (!(amt > 0) || amt > a.approvedAmt) bad(400, 'The released amount must be more than 0 and not more than the approved amount');
      const method2 = deductionOnly ? 'N/A' : (REL_METHODS.includes(b.method) ? b.method : bad(400, 'Choose how the money was released'));
      let proof = ''; if (!deductionOnly) { const f = get('files', String(b.proofId || '')); if (!f || f.branchId !== a.branchId) bad(400, 'Upload a photo as proof of release first'); proof = f.id; }
      const n = a.installments, each = r2(amt / n); let cm = '';
      const sh = method2 === 'Cash' ? openShift(a.branchId) : null;
      if (sh) { cm = uid(); run('insert into cash_moves(id,shiftId,branchId,date,kind,amount,note,staffId,ts,by) values(?,?,?,?,?,?,?,?,?,?)', cm, sh.id, a.branchId, todayStr(), 'out', amt, `Release pay: ${a.staffName} (${a.type})`.slice(0, 200), '', nowISO(), me.name); }
      db.exec('begin');
      try {
        for (let i = 0; i < n; i++) { const d = new Date(a.firstDue + 'T00:00'); d.setDate(d.getDate() + 15 * i); run("insert into advance_deductions(id,advanceId,staffId,branchId,amount,dueDate,status,seq) values(?,?,?,?,?,?,'SCHEDULED',?)", uid(), a.id, a.staffId, a.branchId, i === n - 1 ? r2(amt - each * (n - 1)) : each, dOf(d), i + 1); }
        push('RELEASED', `₱${amt} via ${method2}. ${note}`.trim());
        run("update advances set status='RELEASED', releasedAmt=?, method=?, proofId=?, releasedBy=?, releasedAt=?, cashMoveId=?, history=? where id=?", amt, method2, proof, me.name, nowISO(), cm, JSON.stringify(hist), a.id);
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
    }
    log(me, 'advance-' + act, 'advances', a.id, note); return send(res, 200, advView(get('advances', a.id)));
  }
  // ----- problem reports -----
  const PROB_CATS = ['Equipment malfunction', 'Air conditioning', 'Electrical', 'Internet', 'POS', 'Maintenance', 'Customer complaint', 'Employee concern', 'Inventory shortage', 'Other'], PROB_FLOW = ['SUBMITTED', 'ACKNOWLEDGED', 'IN PROGRESS', 'RESOLVED', 'CLOSED'], PRIOS = ['Low', 'Normal', 'High', 'Urgent'];
  const probView = x => ({ ...x, photos: jp(x.photos), history: jp(x.history), comments: jp(x.comments), branchName: get('branches', x.branchId)?.name || '' });
  if (p === '/api/problems/options' && method === 'GET') return send(res, 200, { categories: PROB_CATS, flow: PROB_FLOW, priorities: PRIOS });
  if (p === '/api/problems' && method === 'GET') {
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), st = PROB_FLOW.includes(q.status) ? q.status : null;
    const rows = all(`select * from problems where 1=1${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''}${q.open === '1' ? " and status<>'CLOSED'" : ''} order by case status when 'CLOSED' then 1 else 0 end, case priority when 'Urgent' then 0 when 'High' then 1 when 'Normal' then 2 else 3 end, createdAt desc limit 500`, ...(br ? [br] : []), ...(st ? [st] : [])).map(probView);
    return send(res, 200, { rows, open: rows.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED').length });
  }
  if (p === '/api/problems' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), category = PROB_CATS.includes(b.category) ? b.category : bad(400, 'Choose a category'), priority = PRIOS.includes(b.priority) ? b.priority : 'Normal';
    const description = String(b.description || '').trim().slice(0, 1000); if (description.length < 5) bad(400, 'Describe the problem');
    const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 6).map(String); for (const fid of photos) { const fl = get('files', fid); if (!fl || fl.branchId !== branchId) bad(400, 'A photo was not found. Please attach it again.'); }
    const id = uid(), n = nowISO();
    run('insert into problems(id,branchId,category,description,priority,photos,status,assignedTo,submittedById,submittedBy,createdAt,updatedAt,history,comments) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, branchId, category, description, priority, JSON.stringify(photos), 'SUBMITTED', '', me.id, me.name, n, n, JSON.stringify([{ at: n, by: me.name, action: 'SUBMITTED', note: '' }]), '[]');
    log(me, 'problem', 'problems', id, `${category} (${priority})`); return send(res, 201, probView(get('problems', id)));
  }
  const pbm = p.match(/^\/api\/problems\/(\w+)\/(status|comment|assign)$/);
  if (pbm && (method === 'PUT' || method === 'POST')) {
    const x = get('problems', pbm[1]); if (!x || (isBranchUser(me) && x.branchId !== me.branchId)) bad(404, 'Not found'); const b = await readBody(req), n = nowISO();
    if (pbm[2] === 'comment') {
      const text = String(b.text || '').trim().slice(0, 600); if (!text) bad(400, 'Write a comment'); const cs = jp(x.comments); cs.push({ at: n, by: me.name, text });
      run('update problems set comments=?, updatedAt=? where id=?', JSON.stringify(cs), n, x.id);
    } else {
      adminOnly();
      if (pbm[2] === 'assign') { const who = String(b.assignedTo || '').trim().slice(0, 80); const h = jp(x.history); h.push({ at: n, by: me.name, action: 'ASSIGNED', note: who || 'Unassigned' }); run('update problems set assignedTo=?, history=?, updatedAt=? where id=?', who, JSON.stringify(h), n, x.id); }
      else {
        const to = String(b.status || ''), i = PROB_FLOW.indexOf(to), cur = PROB_FLOW.indexOf(x.status); if (i < 0) bad(400, 'Unknown status'); if (i !== cur + 1 && !(to === 'IN PROGRESS' && cur < 2)) bad(409, `Next step after ${x.status} is ${PROB_FLOW[cur + 1] || 'none'}`);
        const h = jp(x.history); h.push({ at: n, by: me.name, action: to, note: String(b.note || '').slice(0, 300) }); run('update problems set status=?, history=?, updatedAt=? where id=?', to, JSON.stringify(h), n, x.id);
      }
    }
    log(me, 'problem-' + pbm[2], 'problems', x.id, String(b.status || b.assignedTo || '')); return send(res, 200, probView(get('problems', x.id)));
  }
  // ----- internal inbox -----
  const INBOX_FILES = /^data:((?:image\/(?:jpeg|png|webp|gif))|(?:audio\/(?:webm|ogg|mp4|mpeg|wav|x-m4a))|(?:video\/(?:mp4|webm|quicktime))|application\/pdf);(?:codecs=[^;]*;)?base64,([A-Za-z0-9+/=]+)$/;
  const meId = me.id, isOwnerOrAdmin = isAdmin(me);
  const chanOk = c => c.kind === 'all' || (c.kind === 'branch' && (isOwnerOrAdmin || c.branchId === me.branchId)) || (['dm', 'group'].includes(c.kind) && jp(c.members).includes(meId));
  const ensureChannels = () => {
    if (!one("select 1 x from channels where kind='all' and name='Announcements'")) run("insert into channels(id,kind,name,branchId,announceOnly,members,createdBy,createdAt) values(?,?,?,?,?,?,?,?)", uid(), 'all', 'Announcements', '', 1, '[]', 'system', nowISO());
    if (!one("select 1 x from channels where kind='all' and name='All Barbers'")) run("insert into channels(id,kind,name,branchId,announceOnly,members,createdBy,createdAt) values(?,?,?,?,?,?,?,?)", uid(), 'all', 'All Barbers', '', 0, '[]', 'system', nowISO());
    for (const b of all('select id,name from branches')) if (!one("select 1 x from channels where kind='branch' and branchId=?", b.id)) run("insert into channels(id,kind,name,branchId,announceOnly,members,createdBy,createdAt) values(?,?,?,?,?,?,?,?)", uid(), 'branch', b.name + ' Branch Chat', b.id, 0, '[]', 'system', nowISO());
  };
  const personName = id => id === 'owner' ? 'Owner' : (get('users', id)?.name || 'Unknown');
  const chanView = c => {
    const last = one('select * from messages where channelId=? order by createdAt desc limit 1', c.id), rd = one('select at from chat_reads where channelId=? and userId=?', c.id, meId)?.at || '1970-01-01';
    const unread = one('select count(*) n from messages where channelId=? and createdAt>? and authorId<>?', c.id, rd, meId).n, members = jp(c.members);
    const title = c.kind === 'dm' ? personName(members.find(m => m !== meId) || meId) : c.name;
    return { id: c.id, kind: c.kind, name: title, branchId: c.branchId, announceOnly: !!c.announceOnly, members: members.map(m => ({ id: m, name: personName(m) })), unread, last: last ? { text: last.text || (jp(last.attachments).length ? '📎 Attachment' : ''), by: last.authorName, at: last.createdAt } : null };
  };
  const msgView = m => ({ ...m, attachments: jp(m.attachments), reactions: jp(m.reactions) });
  if (p === '/api/inbox/people' && method === 'GET') {
    const us = all('select id,name,role,branchId from users where active=1').filter(u => u.id !== meId && (isOwnerOrAdmin || u.role === 'admin' || u.branchId === me.branchId)).map(u => ({ id: u.id, name: u.name, role: u.role, branch: get('branches', u.branchId || '')?.name || '' }));
    if (me.id !== 'owner') us.unshift({ id: 'owner', name: 'Owner', role: 'owner', branch: '' });
    return send(res, 200, us);
  }
  if (p === '/api/inbox/channels' && method === 'GET') { ensureChannels(); return send(res, 200, all('select * from channels order by case kind when \'all\' then 0 when \'branch\' then 1 else 2 end, name').filter(chanOk).map(chanView)); }
  if (p === '/api/inbox/channels' && method === 'POST') {
    const b = await readBody(req), kind = b.kind === 'group' ? 'group' : 'dm', ids = [...new Set((Array.isArray(b.members) ? b.members : []).map(String))].filter(i => i !== meId);
    const people = new Set(all('select id from users where active=1').map(u => u.id).concat(['owner'])); if (!ids.length || ids.some(i => !people.has(i))) bad(400, 'Choose who to message');
    const members = [meId, ...ids].sort();
    if (kind === 'dm') { if (ids.length !== 1) bad(400, 'A direct message is between two people'); const ex = all("select * from channels where kind='dm'").find(c => jp(c.members).slice().sort().join() === members.join()); if (ex) return send(res, 200, chanView(ex)); }
    const id = uid(); run('insert into channels(id,kind,name,branchId,announceOnly,members,createdBy,createdAt) values(?,?,?,?,?,?,?,?)', id, kind, kind === 'group' ? String(b.name || 'Group').trim().slice(0, 60) || 'Group' : '', '', 0, JSON.stringify(members), meId, nowISO());
    return send(res, 201, chanView(get('channels', id)));
  }
  const chm = p.match(/^\/api\/inbox\/channels\/(\w+)(?:\/(messages|read))?$/);
  if (chm) {
    const c = get('channels', chm[1]); if (!c || !chanOk(c)) bad(404, 'Not found');
    if (!chm[2] && method === 'PUT') { adminOnly(); const b = await readBody(req); run('update channels set announceOnly=? where id=?', b.announceOnly ? 1 : 0, c.id); log(me, 'inbox-mode', 'channels', c.id, String(!!b.announceOnly)); return send(res, 200, chanView(get('channels', c.id))); }
    if (chm[2] === 'read' && method === 'POST') { run('insert into chat_reads(channelId,userId,at) values(?,?,?) on conflict(channelId,userId) do update set at=excluded.at', c.id, meId, nowISO()); return send(res, 200, { ok: true }); }
    if (chm[2] === 'messages' && method === 'GET') {
      const after = String(q.after || ''), rows = after ? all('select * from messages where channelId=? and createdAt>? order by createdAt limit 200', c.id, after) : all('select * from (select * from messages where channelId=? order by createdAt desc limit 150) order by createdAt', c.id);
      const readers = all('select userId, at from chat_reads where channelId=?', c.id).filter(r => r.userId !== meId).map(r => ({ id: r.userId, name: personName(r.userId), at: r.at }));
      return send(res, 200, { rows: rows.map(msgView), readers, pinned: all('select * from messages where channelId=? and pinned=1 order by createdAt desc limit 5', c.id).map(msgView), channel: chanView(c) });
    }
    if (chm[2] === 'messages' && method === 'POST') {
      if (c.announceOnly && !isOwnerOrAdmin) bad(403, 'Only management can post in this channel');
      const b = await readBody(req), text = String(b.text || '').trim().slice(0, 2000), att = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 6).filter(a => a && get('files', String(a.id)));
      if (!text && !att.length) bad(400, 'Write a message or attach a file'); const rep = b.replyTo && one('select id from messages where id=? and channelId=?', String(b.replyTo), c.id) ? String(b.replyTo) : '';
      const id = uid(); run('insert into messages(id,channelId,authorId,authorName,text,attachments,replyTo,pinned,reactions,createdAt) values(?,?,?,?,?,?,?,?,?,?)', id, c.id, meId, me.name, text, JSON.stringify(att.map(a => ({ id: String(a.id), name: String(a.name || 'file').slice(0, 80), type: String(a.type || '').slice(0, 40) }))), rep, 0, '{}', nowISO());
      run('insert into chat_reads(channelId,userId,at) values(?,?,?) on conflict(channelId,userId) do update set at=excluded.at', c.id, meId, nowISO());
      return send(res, 201, msgView(get('messages', id)));
    }
  }
  const mgm = p.match(/^\/api\/inbox\/messages\/(\w+)\/(react|pin)$/);
  if (mgm && method === 'PUT') {
    const m = get('messages', mgm[1]), c = m && get('channels', m.channelId); if (!m || !c || !chanOk(c)) bad(404, 'Not found'); const b = await readBody(req);
    if (mgm[2] === 'pin') { adminOnly(); run('update messages set pinned=? where id=?', b.pinned ? 1 : 0, m.id); }
    else { const em = String(b.emoji || ''); if (!['👍', '❤️', '😂', '✅', '🙏'].includes(em)) bad(400, 'Unknown reaction'); const rx = JSON.parse(m.reactions || '{}'); const arr = rx[em] || []; rx[em] = arr.includes(meId) ? arr.filter(i => i !== meId) : [...arr, meId]; if (!rx[em].length) delete rx[em]; run('update messages set reactions=? where id=?', JSON.stringify(rx), m.id); }
    return send(res, 200, msgView(get('messages', m.id)));
  }
  if (p === '/api/inbox/search' && method === 'GET') {
    const term = String(q.q || '').trim().toLowerCase(); if (term.length < 2) return send(res, 200, []);
    const chans = new Map(all('select * from channels').filter(chanOk).map(c => [c.id, c]));
    return send(res, 200, all('select * from messages order by createdAt desc limit 3000').filter(m => chans.has(m.channelId) && (m.text || '').toLowerCase().includes(term)).slice(0, 40).map(m => ({ ...msgView(m), channelName: chanView(chans.get(m.channelId)).name })));
  }
  if (p === '/api/inbox/upload' && method === 'POST') {
    const b = await readBody(req, 6_500_000), m = INBOX_FILES.exec(String(b.data || '')); if (!m) bad(400, 'This file type is not allowed. Use a photo, video, voice message or PDF.');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 4_500_000) bad(413, 'The file is too large (max about 4 MB)');
    const id = uid() + uid(); run('insert into files(id,kind,branchId,mime,data,byId,byName,createdAt,enc) values(?,?,?,?,?,?,?,?,1)', id, 'chat', me.branchId || '', m[1], encBuf(buf), me.id, me.name, nowISO());
    return send(res, 201, { id, type: m[1], name: String(b.name || '').slice(0, 80) });
  }
  // ----- daily opening / closing checklists -----
  const DEF_CHK = { opening: ['Shop cleanliness [photo]', 'Barber stations ready [photo]', 'Clippers and equipment working', 'Lights and air conditioning working', 'Cash fund checked', 'Shop ready for customers'], closing: ['Cleaning completed [photo]', 'Equipment switched off and secured', 'Cash count completed', 'Shop secured [photo]', 'End-of-day tasks completed'] };
  const DEF_CHK_OLD = { opening: ['Unlock the shop and turn on the lights and aircon', 'Clean the chairs, mirrors and floor', 'Sanitize clippers, scissors and combs', 'Restock towels, capes and neck strips', 'Open the shift on the POS and count the cash float', 'Barbers are in uniform and timed in'], closing: ['Close all open tickets on the POS', 'Count the cash and do the sales reading (Z-reading)', 'Sanitize and store all tools', 'Sweep and mop the floor, empty the trash', 'Turn off aircon, lights and equipment', 'Lock the doors and secure the cash'] };
  const chkTpl = () => { const t = {}; for (const k of ['opening', 'closing']) { const v = jp(getSetting('chk_' + k)); t[k] = v.length ? v.map(String) : DEF_CHK[k]; } return t; };
  if (p === '/api/checklists/template' && method === 'GET') return send(res, 200, chkTpl());
  if (p === '/api/checklists/template' && method === 'PUT') { adminOnly(); const b = await readBody(req); for (const k of ['opening', 'closing']) if (Array.isArray(b[k])) setSetting('chk_' + k, JSON.stringify(b[k].map(s => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 30))); log(me, 'checklist-template', 'settings', '', ''); return send(res, 200, chkTpl()); }
  const chkParse = s => ({ text: String(s).replace(/\s*\[photo\]\s*$/i, ''), photo: /\[photo\]\s*$/i.test(s) });
  if (p === '/api/checklists/today' && method === 'GET') { const bid = branchScope(me, q.branch), t0 = todayStr(), tp = chkTpl(); return send(res, 200, { template: { opening: tp.opening.map(chkParse), closing: tp.closing.map(chkParse) }, runs: all('select * from checklist_runs where branchId=? and date=?', bid, t0).map(r => ({ ...r, items: jp(r.items) })) }); }
  if (p === '/api/checklists/submit' && method === 'POST') {
    const b = await readBody(req), bid = branchScope(me, b.branchId), kind = ['opening', 'closing'].includes(b.kind) ? b.kind : bad(400, 'Choose opening or closing'), t0 = todayStr(), tpl = chkTpl()[kind];
    if (one('select 1 x from checklist_runs where branchId=? and date=? and kind=?', bid, t0, kind)) bad(409, `The ${kind} checklist for today was already submitted`);
    const items = tpl.map((raw, i) => {
      const x = (Array.isArray(b.items) ? b.items : [])[i] || {}, tk = chkParse(raw), ph = x.photoId ? get('files', String(x.photoId)) : null, okPhoto = ph && ph.branchId === bid, at = x.doneAt && Math.abs(Date.now() - new Date(x.doneAt)) < 36e5 * 20 ? new Date(x.doneAt).toISOString() : nowISO();
      if (x.done && tk.photo && !okPhoto) bad(400, `Take a photo for: ${tk.text}`);
      return { text: tk.text, photoRequired: tk.photo, done: !!x.done, note: String(x.note || '').slice(0, 200), photoId: okPhoto ? ph.id : '', by: x.done ? me.name : '', at: x.done ? at : '' };
    });
    const missing = items.filter(i => !i.done && !i.note.trim()); if (missing.length) bad(400, `Tick every task, or write a note for the ones not done (${missing.length} left)`);
    const photo = b.photoId ? get('files', String(b.photoId)) : null; const id = uid();
    run('insert into checklist_runs(id,branchId,date,kind,items,photoId,submittedById,submittedBy,createdAt) values(?,?,?,?,?,?,?,?,?)', id, bid, t0, kind, JSON.stringify(items), photo && photo.branchId === bid ? photo.id : '', me.id, me.name, nowISO());
    log(me, 'checklist', 'checklist_runs', id, `${kind} ${items.filter(i => i.done).length}/${items.length}`); return send(res, 201, { ok: true, id });
  }
  if (p === '/api/checklists' && method === 'GET') {
    adminOnly(); const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : todayStr(), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), br = q.branch && q.branch !== 'all' ? q.branch : null;
    const rows = all(`select * from checklist_runs where date>=? and date<=?${br ? ' and branchId=?' : ''} order by date desc, createdAt desc limit 500`, from, to, ...(br ? [br] : [])).map(r => { const items = jp(r.items); return { ...r, items, branchName: get('branches', r.branchId)?.name || '', done: items.filter(i => i.done).length, total: items.length }; });
    const missing = []; const end = to < todayStr() ? to : todayStr();
    for (let d = new Date(from + 'T00:00'), n = 0; dOf(d) <= end && n < 31; d.setDate(d.getDate() + 1), n++) for (const b2 of all('select * from branches').filter(b => !br || b.id === br)) for (const k of ['opening', 'closing']) if (!rows.some(r => r.branchId === b2.id && r.date === dOf(d) && r.kind === k) && !(dOf(d) === todayStr() && k === 'closing')) missing.push({ date: dOf(d), branchName: b2.name, kind: k });
    return send(res, 200, { rows, missing });
  }
  // ----- leave requests -----
  const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Other'];
  const leaveView = l => ({ ...l, branchName: get('branches', l.branchId)?.name || '', staffName: get('staff', l.staffId)?.name || '' });
  if (p === '/api/leaves' && method === 'GET') {
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), st = ['PENDING', 'APPROVED', 'REJECTED'].includes(q.status) ? q.status : null;
    return send(res, 200, { rows: all(`select * from leaves where 1=1${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''} order by createdAt desc limit 500`, ...(br ? [br] : []), ...(st ? [st] : [])).map(leaveView), types: LEAVE_TYPES });
  }
  if (p === '/api/leaves' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), s = get('staff', String(b.staffId || '')); if (!s || s.branchId !== branchId) bad(400, 'Choose the employee');
    const type = LEAVE_TYPES.includes(b.type) ? b.type : bad(400, 'Choose the leave type'), from = String(b.from || ''), to = String(b.to || b.from || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) bad(400, 'Choose valid dates'); if (from < todayStr() && type !== 'Sick' && type !== 'Emergency') bad(400, 'Leave cannot start in the past');
    const reason = String(b.reason || '').trim().slice(0, 300); if (reason.length < 3) bad(400, 'Enter the reason');
    if (one("select 1 x from leaves where staffId=? and status<>'REJECTED' and from_date<=? and to_date>=?", s.id, to, from)) bad(409, 'This employee already has leave on those dates');
    const id = uid(); run('insert into leaves(id,branchId,staffId,type,from_date,to_date,reason,status,requestedBy,createdAt) values(?,?,?,?,?,?,?,?,?,?)', id, branchId, s.id, type, from, to, reason, 'PENDING', me.name, nowISO());
    log(me, 'leave-request', 'leaves', id, `${s.name} ${from}..${to}`); return send(res, 201, leaveView(get('leaves', id)));
  }
  const lvm = p.match(/^\/api\/leaves\/(\w+)\/review$/);
  if (lvm && method === 'PUT') {
    adminOnly(); const l = get('leaves', lvm[1]); if (!l) bad(404, 'Not found'); const b = await readBody(req), act = { approve: 'APPROVED', reject: 'REJECTED' }[b.action], note = String(b.note || '').trim().slice(0, 300);
    if (!act) bad(400, 'Choose approve or reject'); if (act === 'REJECTED' && !note) bad(400, 'A note is required to reject leave');
    run('update leaves set status=?, reviewedBy=?, reviewedAt=?, reviewNote=? where id=?', act, me.name, nowISO(), note, l.id); log(me, 'leave-' + b.action, 'leaves', l.id, note); return send(res, 200, leaveView(get('leaves', l.id)));
  }
  // ----- barber scorecard and cash accountability are in REPORTS -----
  // ----- bonuses / incentives / other earnings (owner only; they appear on the next payslip) -----
  const ADJ_KINDS = ['Bonus', 'Incentive', 'Other earning'];
  if (p === '/api/adjustments' && method === 'GET') { adminOnly(); const rows = all(`select a.*, s.name staffName from staff_adjustments a join staff s on s.id=a.staffId${q.staffId ? ' where a.staffId=?' : ''} order by a.date desc, a.createdAt desc limit 300`, ...(q.staffId ? [String(q.staffId)] : [])); return send(res, 200, { rows }); }
  if (p === '/api/adjustments' && method === 'POST') {
    adminOnly(); const b = await readBody(req), s = get('staff', String(b.staffId || '')); if (!s) bad(400, 'Choose the employee');
    const kind = ADJ_KINDS.includes(b.kind) ? b.kind : bad(400, 'Choose Bonus, Incentive or Other earning'), amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Enter the amount');
    const note = String(b.note || '').trim().slice(0, 200); if (note.length < 3) bad(400, 'Enter a short note (what is it for?)'); const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : todayStr(), id = uid();
    run('insert into staff_adjustments(id,staffId,branchId,date,kind,amount,note,byName,createdAt) values(?,?,?,?,?,?,?,?,?)', id, s.id, s.branchId, date, kind, amount, note, me.name, nowISO()); log(me, 'adjustment', 'staff_adjustments', id, `${s.name} ${kind} ${amount}`); return send(res, 201, get('staff_adjustments', id));
  }
  const adm = p.match(/^\/api\/adjustments\/(\w+)$/);
  if (adm && method === 'DELETE') { adminOnly(); const a = get('staff_adjustments', adm[1]); if (!a) bad(404, 'Not found'); if (a.payrollDate) bad(409, 'This was already paid in payroll and cannot be removed'); run('delete from staff_adjustments where id=?', a.id); log(me, 'adjustment-removed', 'staff_adjustments', a.id, `${a.kind} ${a.amount}`); return send(res, 200, { ok: true }); }
  // ----- digital payslips: every payroll payment, with a full breakdown -----
  const payslipRows = (from, to, br, staffId) => {
    const days = all(`select pd.*, s.name staffName from payroll_days pd join staff s on s.id=pd.staffId where date(pd.paidAt,'localtime')>=? and date(pd.paidAt,'localtime')<=?${br ? ' and pd.branchId=?' : ''}${staffId ? ' and pd.staffId=?' : ''} order by pd.paidAt desc, pd.date`, from, to, ...(br ? [br] : []), ...(staffId ? [staffId] : [])), by = new Map();
    for (const d of days) { const k = d.staffId + '|' + d.paidAt.slice(0, 16); const r = by.get(k) || { staffId: d.staffId, staffName: d.staffName, branchName: get('branches', d.branchId)?.name || '', paidAt: d.paidAt, paidBy: d.paidBy, days: [], dayItems: [], commission: 0, topup: 0, lunch: 0, bonus: 0, advance: 0, deduction: 0 }; r.days.push(d.date); r.dayItems.push({ date: d.date, commission: d.commission, topup: d.topup, lunch: d.lunch || 0 }); r.commission = r2(r.commission + d.commission); r.topup = r2(r.topup + d.topup); r.lunch = r2(r.lunch + (d.lunch || 0)); r.bonus = r2(r.bonus + (d.extra || 0)); r.advance = r2(r.advance + d.advance); r.deduction = r2(r.deduction + (d.deduction || 0)); by.set(k, r); }
    const cat = t => t === 'Partial Salary Release' ? 'Partial salary release' : t === 'Other Authorized Deduction' ? 'Other authorized deduction' : 'Cash advance';
    return [...by.values()].map(r => {
      const ph = r.days.map(() => '?').join(','), last = r.days[r.days.length - 1];
      const earnings = all(`select kind, amount, note, date from staff_adjustments where staffId=? and payrollDate=?`, r.staffId, last), cashAdv = all(`select date, amount, note from cash_moves where kind='advance' and staffId=? and date in (${ph})`, r.staffId, ...r.days);
      const deds = all(`select d.amount, d.seq, a.type, a.installments from advance_deductions d join advances a on a.id=d.advanceId where d.staffId=? and d.status='APPLIED' and d.payrollDate=?`, r.staffId, last);
      const gross = r2(r.commission + r.topup + r.lunch + r.bonus), totalDed = r2(r.advance + r.deduction);
      return { ...r, period: r.days[0] + (r.days.length > 1 ? ' to ' + last : ''), earningItems: earnings, gross, advanceItems: cashAdv.map(c => ({ label: 'Cash advance taken on ' + c.date, amount: c.amount })), deductionItems: deds.map(d => ({ label: `${cat(d.type)} (installment ${d.seq} of ${d.installments})`, category: cat(d.type), amount: d.amount })), totalDeductions: totalDed, net: r2(gross - totalDed) };
    });
  };
  if (p === '/api/payslips' && method === 'GET') { adminOnly(); return send(res, 200, { rows: payslipRows(/^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '2000-01-01', /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '2099-12-31', q.branch && q.branch !== 'all' ? q.branch : null, null) }); }
  // ----- an employee's own performance and payslips (their login is linked to their barber profile by the owner) -----
  const myStaff = () => { const u = get('users', me.id); return u && u.staffId && get('staff', u.staffId) ? u.staffId : ''; };
  if (p === '/api/me/payslips' && method === 'GET') { const sid = myStaff(); if (!sid) bad(404, 'Your login is not linked to a barber profile yet. Ask the owner.'); return send(res, 200, { rows: payslipRows('2000-01-01', '2099-12-31', null, sid) }); }
  if (p === '/api/me/performance' && method === 'GET') {
    const sid = myStaff(); if (!sid) bad(404, 'Your login is not linked to a barber profile yet. Ask the owner.');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : todayStr(), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), s = get('staff', sid);
    const mineRow = scoreData(from, to, s.branchId, sid)[0], peers = scoreData(from, to, s.branchId, null).sort((a, b) => b.sales - a.sales), clean = r => ({ ...r, s: undefined, name: r.s.name });
    return send(res, 200, { me: clean(mineRow), rank: peers.findIndex(r => r.s.id === sid) + 1, of: peers.length, branchAvg: { sales: peers.length ? sum(peers, r => r.sales) / peers.length : 0, haircuts: peers.length ? sum(peers, r => r.n) / peers.length : 0 }, from, to });
  }
  // The logged-in barber's own earnings so far: today, and everything earned but not yet paid in payroll. Always their own profile (never taken from the request).
  if (p === '/api/me/earnings' && method === 'GET') {
    const sid = myStaff(); if (!sid) bad(404, 'Your login is not linked to a barber profile yet. Ask the owner.');
    const s = get('staff', sid), t = todayStr(), from = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const mine = dayRows(from, t, s.branchId).filter(d => d.staffId === sid), unpaid = mine.filter(d => !d.paidAt), today = mine.find(d => d.date === t);
    const cuts = one("select count(*) n from orders where status='paid' and date=? and barberId=?", t, sid).n;
    const pay = r2(sum(unpaid, d => d.commission + d.topup + d.lunch)), adv = r2(sum(unpaid, d => d.advance)), bonus = adjTotal(sid, t), ded = planDeductions(sid, t, r2(pay + bonus - adv)).total;
    return send(res, 200, { name: s.name, photo: s.photo || '', branchName: get('branches', s.branchId)?.name || '', allowance: s.allowance || 0, pct: s.pct, today: { present: !!today, cuts, commission: today ? today.commission : 0, topup: today ? today.topup : 0, lunch: today ? today.lunch : 0, lateMins: today ? today.lateRaw : 0, lunchLost: !!today && today.lunchLost, allowLost: !!today && today.allowLost, pay: today ? today.pay : 0 }, rules: payRules(),
      unpaid: { days: unpaid.length, since: unpaid.length ? unpaid[0].date : null, commission: r2(sum(unpaid, d => d.commission)), topup: r2(sum(unpaid, d => d.topup)), lunch: r2(sum(unpaid, d => d.lunch)), bonus, advance: adv, deductions: ded, net: r2(pay + bonus - adv - ded), list: unpaid.slice(-14).map(d => ({ date: d.date, commission: d.commission, topup: d.topup, pay: d.pay })) } });
  }
  // ----- what needs the owner's attention (drives the red badges and the bell) -----
  if (p === '/api/notifications' && method === 'GET') {
    const chats = all('select * from channels').filter(chanOk).reduce((s, c) => s + (chanView(c).unread || 0), 0), items = [];
    if (chats) items.push({ key: 'inbox', label: chats === 1 ? 'new chat message' : 'new chat messages', count: chats, view: 'inbox' });
    if (isOwnerOrAdmin) {
      const n = (sql, ...a) => one(sql, ...a).n, t0 = todayStr();
      const list = [['leave', 'leave request waiting for approval', 'leave requests waiting for approval', "select count(*) n from leaves where status='PENDING'", 'leave'], ['adv', 'release pay request to review', 'release pay requests to review', "select count(*) n from advances where status in ('REQUESTED','APPROVED')", 'adv'], ['exp', 'expense waiting for approval', 'expenses waiting for approval', "select count(*) n from expense_claims where status='PENDING'", 'exp'],
        ['remit', 'remittance to review', 'remittances to review', "select count(*) n from remittances where status in ('PENDING','FLAGGED')", 'remit'], ['prob', 'new problem report', 'new problem reports', "select count(*) n from problems where status='SUBMITTED'", 'prob'], ['att', 'attendance record flagged', 'attendance records flagged', "select count(*) n from attendance where flagged=1 and date>=date('now','-7 day')", 'att']];
      for (const [key, one1, many, sql, view] of list) { const c = n(sql); if (c) items.push({ key, label: c === 1 ? one1 : many, count: c, view }); }
      const openMissing = all('select id from branches').filter(b => !one("select 1 x from checklist_runs where branchId=? and date=? and kind='opening'", b.id, t0)).length;
      if (openMissing && minsOfDay(new Date()) > 11 * 60) items.push({ key: 'chk', label: openMissing === 1 ? 'branch has not submitted its opening checklist' : 'branches have not submitted the opening checklist', count: openMissing, view: 'chk' });
    }
    return send(res, 200, { total: items.reduce((s, i) => s + i.count, 0), items });
  }
  // ----- daily sales remittance (separate from expenses) -----
  const remitCalc = (branchId, date) => {
    const os = all("select * from orders where branchId=? and date=? and status='paid'", branchId, date).map(parseOrder), tender = {};
    for (const o of os) for (const t of o.tenders) tender[t.method] = r2((tender[t.method] || 0) + t.amount);
    const mv = all('select * from cash_moves where branchId=? and date=?', branchId, date);
    const cashSales = tender.Cash || 0, gcash = tender.GCash || 0, maya = tender.Maya || 0, posSales = r2(sum(os, o => o.total));
    const other = r2(Object.entries(tender).filter(([k]) => !['Cash', 'GCash', 'Maya'].includes(k)).reduce((s, [, v]) => s + v, 0));
    const cashIn = r2(sum(mv.filter(m => m.kind === 'in'), m => m.amount)), cashExpenses = r2(sum(mv.filter(m => m.kind !== 'in'), m => m.amount));
    return { branchId, date, posSales, cashSales: r2(cashSales), gcashSales: r2(gcash), mayaSales: r2(maya), otherSales: other, cashIn, cashExpenses, expected: r2(cashSales + cashIn - cashExpenses), orders: os.length };
  };
  const remitView = r => ({ ...r, history: jp(r.history), branchName: get('branches', r.branchId)?.name || '' });
  if (p === '/api/remittances/preview' && method === 'GET') {
    const branchId = branchScope(me, q.branch), date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : todayStr();
    return send(res, 200, { ...remitCalc(branchId, date), existing: all("select id,status from remittances where branchId=? and date=? and status<>'REJECTED'", branchId, date) });
  }
  if (p === '/api/remittances' && method === 'GET') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '2000-01-01', to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '2099-12-31';
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), st = ['PENDING', 'VERIFIED', 'FLAGGED', 'REJECTED'].includes(q.status) ? q.status : null;
    const rows = all(`select * from remittances where date>=? and date<=?${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''} order by date desc, createdAt desc limit 500`, from, to, ...(br ? [br] : []), ...(st ? [st] : [])).map(remitView);
    return send(res, 200, { rows, totals: { count: rows.length, actual: r2(sum(rows, r => r.actual)), expected: r2(sum(rows, r => r.expected)), variance: r2(sum(rows, r => r.variance)) } });
  }
  if (p === '/api/remittances' && method === 'POST') {
    const b = await readBody(req), branchId = branchScope(me, b.branchId), date = String(b.date || todayStr());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayStr() || date < dOf(new Date(Date.now() - 14 * 864e5))) bad(400, 'The business date must be today or within the last 14 days');
    const actual = Number(b.actual); if (!Number.isFinite(actual) || actual < 0) bad(400, 'Enter the actual amount remitted (0 or more)');
    const proof = get('files', String(b.proofId || '')); if (!proof || proof.branchId !== branchId) bad(400, 'Take a photo of the deposit slip or remittance proof first');
    const responsible = String(b.responsible || me.name).trim().slice(0, 100); if (!responsible) bad(400, 'Enter the person responsible');
    if (one("select 1 x from remittances where branchId=? and date=? and status<>'REJECTED'", branchId, date)) bad(409, 'A remittance for this branch and date was already submitted. Ask the owner to reject it first if it must be redone.');
    const c = remitCalc(branchId, date), variance = r2(actual - c.expected), off = Math.abs(variance) >= 1;
    const flag = off ? `Auto-flagged: remitted ${variance < 0 ? 'short by' : 'over by'} ₱${Math.abs(variance).toFixed(2)}` : '', id = uid();
    const hist = [{ at: nowISO(), by: me.name, action: 'SUBMITTED', note: String(b.notes || '').slice(0, 300) }]; if (off) hist.push({ at: nowISO(), by: 'System', action: 'FLAGGED', note: flag });
    run(`insert into remittances(id,branchId,date,posSales,cashSales,gcashSales,mayaSales,otherSales,cashIn,cashExpenses,expected,actual,variance,responsible,proofId,notes,status,flagReason,submittedById,submittedBy,createdAt,history)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, branchId, date, c.posSales, c.cashSales, c.gcashSales, c.mayaSales, c.otherSales, c.cashIn, c.cashExpenses, c.expected, r2(actual), variance, responsible, proof.id,
      String(b.notes || '').slice(0, 500), off ? 'FLAGGED' : 'PENDING', flag, me.id, me.name, nowISO(), JSON.stringify(hist));
    log(me, 'remittance', 'remittances', id, `${date} expected ${c.expected} actual ${r2(actual)}`); return send(res, 201, remitView(get('remittances', id)));
  }
  const rmv = p.match(/^\/api\/remittances\/(\w+)\/review$/);
  if (rmv && method === 'PUT') {
    adminOnly(); const r = get('remittances', rmv[1]); if (!r) bad(404, 'Not found');
    const b = await readBody(req), act = { verify: 'VERIFIED', flag: 'FLAGGED', reject: 'REJECTED' }[b.action], note = String(b.note || '').trim().slice(0, 300);
    if (!act) bad(400, 'Choose verify, flag or reject'); if (act !== 'VERIFIED' && !note) bad(400, 'A note is required to flag or reject a remittance');
    const hist = jp(r.history); hist.push({ at: nowISO(), by: me.name, action: act, note });
    run('update remittances set status=?, reviewedBy=?, reviewedAt=?, reviewNote=?, history=? where id=?', act, me.name, nowISO(), note, JSON.stringify(hist), r.id);
    log(me, 'remittance-' + b.action, 'remittances', r.id, note); return send(res, 200, remitView(get('remittances', r.id)));
  }
  // ----- photos (admin) -----
  if (p === '/api/upload' && method === 'POST') {
    adminOnly(); const b = await readBody(req, 1_500_000);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
    const id = uid() + uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', id, m[1], buf, nowISO());
    log(me, 'upload', 'image', id, Math.round(buf.length / 1024) + ' KB'); return send(res, 201, { url: '/img/' + id });
  }

  // ----- bookings (cashier + admin) -----
  if (p === '/api/bookings' && method === 'GET') {
    const bid = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null);
    const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || ''), from = ok(q.from) ? q.from : (ok(q.date) ? q.date : todayStr()), to = ok(q.to) ? q.to : (ok(q.date) ? q.date : from);
    return send(res, 200, all(`select * from bookings where date>=? and date<=?${bid ? ' and branchId=?' : ''} order by date, time`, ...(bid ? [from, to, bid] : [from, to])).map(bookingView));
  }
  if (p === '/api/bookings' && method === 'POST') {
    const b = await readBody(req); b.branchId = isBranchUser(me) ? me.branchId : b.branchId;
    const bk = createBooking(b, 'pos'); log(me, 'booking', 'bookings', bk.id, `${bk.customerName} ${bk.date} ${bk.time}`); return send(res, 201, bk);
  }
  const bkm = p.match(/^\/api\/bookings\/(\w+)(?:\/(arrive))?$/);
  if (bkm) {
    const cur = one('select * from bookings where id=?', bkm[1]); if (!cur) bad(404, 'Not found');
    if (isBranchUser(me) && cur.branchId !== me.branchId) bad(403, 'Not your branch');
    if (method === 'PUT' && !bkm[2]) {
      const b = await readBody(req); if (!['cancelled', 'noshow'].includes(b.status)) bad(400, 'Bad status');
      if (cur.status !== 'booked') bad(409, 'Booking is already ' + cur.status);
      run('update bookings set status=? where id=?', b.status, cur.id); log(me, 'booking-' + b.status, 'bookings', cur.id, cur.customerName); return send(res, 200, { ok: true });
    }
    if (method === 'POST' && bkm[2] === 'arrive') {
      if (cur.status !== 'booked') bad(409, 'Booking is already ' + cur.status);
      const items = priceItems(jp(cur.itemIds).map(i => ({ itemId: i, qty: 1 })));
      const cust = (cur.customerId && get('customers', cur.customerId)) || findCustomer(cur.phone, '') || upsertCustomer({ name: cur.customerName, phone: cur.phone }, 'online', cur.branchId);
      const o = createTicket(me, cur.branchId, cust.id, cust.name, items, cur.staffId);
      run("update bookings set status='arrived', orderId=? where id=?", o.id, cur.id); log(me, 'booking-arrived', 'bookings', cur.id, `#${o.no} ${cur.customerName}`);
      return send(res, 200, { order: o, seated: o.status === 'in_chair' });
    }
    bad(405, 'Method not allowed');
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
    adminOnly(); const b = await readBody(req), to = /^\d{4}-\d{2}-\d{2}$/.test(b.to || '') ? b.to : todayStr(), from = /^\d{4}-\d{2}-\d{2}$/.test(b.from || '') ? b.from : '2000-01-01'; let n = 0;
    for (const sid of Array.isArray(b.staffIds) ? b.staffIds : []) {
      const days = dayRows('2000-01-01', to, null).filter(x => x.staffId === sid && !x.paidAt && x.date >= from).sort((x, y) => x.date.localeCompare(y.date)); if (!days.length) continue;
      const bonus = adjTotal(sid, to), plan = planDeductions(sid, to, r2(sum(days, x => x.commission + x.topup + x.lunch - x.advance) + bonus)), last = days[days.length - 1].date;
      db.exec('begin');
      try {
        for (const d of days) { run('insert or ignore into payroll_days(staffId,date,branchId,commission,topup,lunch,advance,paidAt,paidBy) values(?,?,?,?,?,?,?,?,?)', sid, d.date, d.branchId, d.commission, d.topup, d.lunch || 0, d.advance, nowISO(), me.name); n++; }
        let applied = 0;
        for (const d of plan.list) { if (Number(run("update advance_deductions set status='APPLIED', appliedAt=?, payrollDate=? where id=? and status='SCHEDULED'", nowISO(), last, d.id).changes) === 1) applied = r2(applied + d.amount); }
        if (bonus) run('update staff_adjustments set payrollDate=? where staffId=? and payrollDate is null and date<=?', last, sid, to);
        if (applied || bonus) run('update payroll_days set deduction=?, extra=? where staffId=? and date=?', applied, bonus, sid, last);
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
    }
    log(me, 'payroll-paid', 'payroll', '', `${n} barber-days up to ${to}`);
    return send(res, 200, { ok: true, days: n });
  }
  if (p === '/api/live' && method === 'GET') {
    const br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null), t = todayStr();
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
      staff: all('select id,name,chairId,pct,photo from staff where branchId=? and active=1 order by name', bid).map(s => ({ ...s, onDuty: !!onDuty(s.id, t), ...staffState(s.id, t) })),
      categories: all('select * from categories order by name'), items: all('select * from items where active=1 order by name'), discounts: all('select * from discounts where active=1 order by name'),
      shift: openShift(bid) || null, locked: !!dayLocked(bid, t), zNo: dayLocked(bid, t)?.no || 0, settings: { attPhoto: getSetting('attPhoto') !== '0', attGeo: getSetting('attGeo') === '1' },
      queue: all("select * from orders where branchId=? and date=? and status in ('waiting','in_chair') order by no", bid, t).map(parseOrder).map(withCust)
    });
  }
  if (p === '/api/pos/dashboard' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr();
    // a barber's dashboard shows only their own sales (never the whole shop's)
    const mySid = me.role === 'barber' ? (get('users', me.id)?.staffId || '-') : '';
    const paid = all("select * from orders where branchId=? and date=? and status='paid'", bid, t).filter(o => !mySid || o.barberId === mySid);
    const queue = all("select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ('waiting','in_chair') order by o.no", bid, t).map(parseOrder).map(withCust);
    const st = all('select id from staff where branchId=? and active=1', bid).map(s => staffState(s.id, t).state);
    return send(res, 200, {
      gross: r2(sum(paid, o => o.subtotal)), net: r2(sum(paid, o => o.total)), completed: paid.length, bookings: one("select count(*) n from bookings where branchId=? and date=? and status='booked'", bid, t).n, waiting: queue.filter(o => o.status === 'waiting').length,
      cutting: queue.filter(o => o.status === 'in_chair').length, onDuty: st.filter(x => ['present', 'late', 'break'].includes(x)).length, totalBarbers: st.length, queue
    });
  }
  if (p === '/api/pos/queue' && method === 'GET') {
    const bid = branchScope(me, q.branch), t = todayStr(), f = q.filter || 'active';
    const sts = f === 'done' ? "('paid')" : f === 'all' ? "('waiting','in_chair','paid','void')" : "('waiting','in_chair')";
    return send(res, 200, all(`select o.*, s.name barberName from orders o left join staff s on s.id=o.barberId where o.branchId=? and o.date=? and o.status in ${sts} order by o.no`, bid, t).map(parseOrder).map(withCust));
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
    return send(res, 200, all('select s.id,s.name,s.photo,s.chairId,c.name chairName from staff s left join chairs c on c.id=s.chairId where s.branchId=? and s.active=1 order by s.name', bid).map(s => ({ ...s, ...staffState(s.id, t) })));
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
    { const zl = dayLocked(branchId, t); if (zl) bad(409, `Today's sales reading (Z-${zl.no}) is already done, so new tickets cannot be made until tomorrow.`); }
    const cust = resolveCustomer(b, 'pos', branchId), name = cust.name.slice(0, 200); if (!name) bad(400, 'Customer name required');
    const items = priceItems(b.items), tt = totals(items, null);
    const need = idNeeded(items); if (need.length && !b.idPhotoId) bad(400, `A photo of the customer's ID (Senior / PWD / Student) is required for ${need.join(', ')}.`);
    if (need.length) { const p = get('id_photos', String(b.idPhotoId)); if (!p || p.orderId || p.branchId !== branchId) bad(400, 'ID photo not found. Please take the photo again.'); }
    const no = (one('select max(no) m from orders where branchId=? and date=?', branchId, t).m || 0) + 1, ord = (one('select max(ord) m from orders').m || 0) + 1, id = uid();
    const dsc = b.discountId && get('discounts', String(b.discountId))?.active ? String(b.discountId) : '';
    run(`insert into orders(id,ord,no,branchId,date,customerId,customerName,barberId,chairId,status,items,subtotal,discountName,discountAmt,total,tenders,cashierId,createdAt,discountId)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, ord, no, branchId, t, cust.id, name, '', '', 'waiting', JSON.stringify(items), tt.subtotal, '', 0, tt.total, '[]', me.id, nowISO(), dsc);
    const o = { id, ord, no, branchId };
    if (need.length) attachIdPhoto(id, branchId, b.idPhotoId);
    if (b.barberId) { const a = checkAssign(o, b); run("update orders set barberId=?, chairId=?, status='in_chair', startedAt=? where id=?", a.barber.id, a.chairId, nowISO(), id); }
    log(me, 'ticket', 'orders', id, `#${no} ${name}`);
    return send(res, 201, parseOrder(get('orders', id)));
  }
  const om = p.match(/^\/api\/orders\/(\w+)(?:\/(pay|void))?$/);
  if (om) {
    const cur = get('orders', om[1]); if (!cur) bad(404, 'Not found');
    if (isBranchUser(me) && cur.branchId !== me.branchId) bad(403, 'Not your branch');
    const o = parseOrder(cur), act = om[2];
    if (method === 'GET' && !act) return send(res, 200, withCust(o));
    if (method === 'PUT' && !act) {
      if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
      const b = await readBody(req); const upd = {}; let queued = false;
      if (!admin && Object.keys(b).some(k => !['barberId', 'chairId'].includes(k))) needAny(me, 'pos');
      if ('items' in b) {
        const items = priceItems(b.items), tt = totals(items, null), need = idNeeded(items);
        if (need.length && !o.idPhoto && !b.idPhotoId) bad(400, `A photo of the customer's ID (Senior / PWD / Student) is required for ${need.join(', ')}.`);
        upd.items = JSON.stringify(items); upd.subtotal = tt.subtotal; upd.total = tt.total;
      }
      if (b.idPhotoId) attachIdPhoto(o.id, o.branchId, b.idPhotoId);
      if ('discountId' in b) upd.discountId = b.discountId && get('discounts', String(b.discountId))?.active ? String(b.discountId) : '';
      if ('customer' in b || 'customerName' in b || 'customerId' in b) {
        const c = resolveCustomer({ ...b, customerName: b.customerName || o.customerName }, 'pos', o.branchId); upd.customerId = c.id; upd.customerName = c.name.slice(0, 200) || o.customerName;
      }
      if (!('barberId' in b) && b.chairId) {
        // Assign to a chair (the chair's barber takes the customer). A busy chair queues the customer behind the one in the chair.
        const ch = get('chairs', String(b.chairId)); if (!ch || ch.branchId !== o.branchId || !ch.active) bad(409, 'That chair is not available in this branch');
        const barber = all('select * from staff where chairId=? and active=1 and branchId=? order by name', ch.id, o.branchId).find(s => { const d = onDuty(s.id, todayStr()); return d && !d.breakStartedAt; });
        if (!barber) bad(409, `No barber is on duty at ${ch.name}`);
        const busy = one("select 1 x from orders where status='in_chair' and id<>? and (chairId=? or barberId=?)", o.id, ch.id, barber.id);
        upd.barberId = barber.id; upd.chairId = ch.id;
        if (busy) { upd.status = 'waiting'; upd.startedAt = null; queued = true; } else { upd.status = 'in_chair'; upd.startedAt = nowISO(); }
      } else if ('barberId' in b) {
        if (!b.barberId) { upd.barberId = ''; upd.chairId = ''; upd.status = 'waiting'; upd.startedAt = null; }
        else { const a = checkAssign(o, b, o.id); upd.barberId = a.barber.id; upd.chairId = a.chairId; if (o.status !== 'in_chair') { upd.status = 'in_chair'; upd.startedAt = nowISO(); } }
      }
      const keys = Object.keys(upd); if (keys.length) run(`update orders set ${keys.map(k => k + '=?').join(',')} where id=?`, ...keys.map(k => upd[k]), o.id);
      if (o.status === 'in_chair' && upd.status === 'waiting') promoteNext(o.branchId, o.chairId);   // the chair this customer left is free again
      return send(res, 200, { ...parseOrder(get('orders', o.id)), queued });
    }
    if (method === 'POST' && act === 'pay') {
      if (!['waiting', 'in_chair'].includes(o.status)) bad(409, 'Order is already closed');
      if (!o.items.length) bad(409, 'Add at least one service or product');
      if (!o.barberId && o.items.some(i => i.type === 'service')) bad(409, 'Assign a barber first');
      const shift = openShift(o.branchId); if (!shift) bad(409, 'Open a shift first (Cash management)');
      const b = await readBody(req), did = 'discountId' in b ? b.discountId : cur.discountId, disc = did ? get('discounts', String(did)) : null;
      if (did && (!disc || !disc.active)) bad(400, 'Unknown discount');
      const tt = totals(o.items, disc);
      const tenders = (Array.isArray(b.tenders) ? b.tenders : []).map(t => ({ method: String(t.method || '').slice(0, 30), amount: r2(t.amount) })).filter(t => t.method && t.amount > 0);
      const paid = sum(tenders, t => t.amount), change = r2(paid - tt.total);
      if (paid < tt.total) bad(409, 'Payment is less than the total');
      if (change > 0) { const cash = tenders.find(t => t.method === 'Cash'); if (!cash || cash.amount < change) bad(409, 'Change can only be given from cash'); cash.amount = r2(cash.amount - change); }
      const si = (one('select max(si) m from orders').m || 0) + 1;
      run("update orders set status='paid', si=?, discountName=?, discountAmt=?, subtotal=?, total=?, tenders=?, cashierId=?, shiftId=?, paidAt=?, date=? where id=?",
        si, disc?.name || '', tt.discountAmt, tt.subtotal, tt.total, JSON.stringify(tenders), me.id, shift.id, nowISO(), todayStr(), o.id);
      promoteNext(o.branchId, o.chairId);
      log(me, 'sale', 'orders', o.id, `SI-${si} ₱${tt.total}`);
      return send(res, 200, { ...parseOrder(get('orders', o.id)), change });
    }
    if (method === 'POST' && act === 'void') {
      const b = await readBody(req);
      if (o.status === 'paid' && !admin) bad(403, 'Only an admin can void a paid sale');
      if (o.status === 'paid') {   // a paid sale is final for staff; the owner/admin may only void it with a reason, and never once it is inside a sales reading
        const zl = dayLocked(o.branchId, o.date); if (zl) bad(409, `This sale is already included in the sales reading (Z-${zl.no}), so it can no longer be voided.`);
        if (String(b.reason || '').trim().length < 3) bad(400, 'Enter the reason for voiding a paid sale');
      }
      if (o.status === 'void') bad(409, 'Already void');
      run("update orders set status='void', voidReason=? where id=?", String(b.reason || '').slice(0, 200), o.id);
      if (o.status === 'in_chair') promoteNext(o.branchId, o.chairId);
      log(me, 'void', 'orders', o.id, `#${o.no} ${b.reason || ''}`); return send(res, 200, { ok: true });
    }
    bad(405, 'Method not allowed');
  }
  if (p === '/api/attendance' && method === 'POST') {
    const b = await readBody(req), s = get('staff', b.staffId); if (!s || !s.active) bad(404, 'Unknown barber');
    if (isBranchUser(me) && s.branchId !== me.branchId) bad(403, 'Not your branch');
    const br = get('branches', s.branchId), needPhoto = getSetting('attPhoto') !== '0', recv = new Date();
    // idempotent: a record sent twice (offline retry) is applied once
    const cid = String(b.clientId || '').slice(0, 64);
    if (cid && one('select 1 x from attendance_events where clientId=?', cid)) return send(res, 200, { ok: true, duplicate: true });
    // the time of the event is the time on the device when the button was pressed (kept exactly); the server time is stored separately
    let at = recv, flag = '', offlineMin = 0;
    if (b.deviceAt) {
      const dv = new Date(b.deviceAt), diff = (dv - recv) / 60000;
      if (isNaN(dv)) flag = 'Unreadable device timestamp; server time used';
      else if (diff > 5) flag = `Device clock was ${Math.round(diff)} minutes ahead of the server; server time used`;
      else if (diff < -48 * 60) flag = 'Device timestamp is more than 48 hours old; server time used';
      else { at = dv; offlineMin = Math.max(0, Math.round(-diff)); if (offlineMin > 12 * 60) flag = `Recorded offline ${Math.round(offlineMin / 60)} hours before it reached the server`; }
    }
    const t = dOf(at), atIso = at.toISOString(), recvIso = recv.toISOString(), open = onDuty(s.id, t);
    let photo = null; if (['in', 'out'].includes(b.action)) { photo = b.photoId ? get('files', String(b.photoId)) : null; if (photo && photo.branchId !== s.branchId) photo = null; if (needPhoto && !photo) bad(400, 'Take a selfie first. Photo is required for time in and time out.'); }
    const geo = b.geo && Number.isFinite(+b.geo.lat) && Number.isFinite(+b.geo.lng) ? { lat: +(+b.geo.lat).toFixed(5), lng: +(+b.geo.lng).toFixed(5), acc: Math.round(+b.geo.acc || 0) } : null;
    let attId = '';
    if (b.action === 'in') {
      if (open) bad(409, `${s.name} is already clocked in`);
      const late = Math.max(0, minsOfDay(at) - (toMin(br.openTime) + (br.graceMins || 0))), lateRaw = Math.max(0, minsOfDay(at) - toMin(br.openTime));   // lateRaw = minutes after opening time with no grace (used for the lunch/allowance pay rules)
      run("delete from attendance where staffId=? and date=? and status='off'", s.id, t);
      const prior = one('select 1 x from attendance where staffId=? and date=?', s.id, t); attId = uid();
      run('insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins,lateRaw,inPhoto,deviceIn,receivedIn,geoIn,flagged,flagReason,offline) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', attId, s.id, s.branchId, t, atIso, null, prior ? 0 : late, prior ? 0 : lateRaw, photo?.id || '', b.deviceAt || '', recvIso, geo ? JSON.stringify(geo) : '', flag ? 1 : 0, flag, offlineMin > 2 ? 1 : 0);
      promoteNext(s.branchId, s.chairId);
    } else if (b.action === 'out') {
      if (!open) bad(409, `${s.name} is not clocked in`);
      if (new Date(open.timeIn) > at) bad(409, 'The time out cannot be earlier than the time in');
      if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
      const close = toMin(br.closeTime || '21:00'), outM = minsOfDay(at), over = Math.max(0, outM - close), under = Math.max(0, close - outM); attId = open.id;
      run('update attendance set timeOut=?, outPhoto=?, deviceOut=?, receivedOut=?, geoOut=?, undertimeMins=?, overtimeMins=?, flagged=?, flagReason=trim(ifnull(flagReason,\'\') || ? ), offline=max(ifnull(offline,0),?) where id=?', atIso, photo?.id || '', b.deviceAt || '', recvIso, geo ? JSON.stringify(geo) : '', under, over, (flag || open.flagged) ? 1 : 0, flag ? ' ' + flag : '', offlineMin > 2 ? 1 : 0, open.id);
    } else if (b.action === 'break_start') {
      if (!open) bad(409, `${s.name} is not clocked in`);
      if (open.breakStartedAt) bad(409, 'Already on break');
      if (one("select 1 x from orders where barberId=? and status='in_chair'", s.id)) bad(409, `${s.name} still has a customer in the chair`);
      run('update attendance set breakStartedAt=? where id=?', nowISO(), open.id);
    } else if (b.action === 'break_end') {
      if (!open?.breakStartedAt) bad(409, 'Not on break');
      run('update attendance set breakStartedAt=null, breakMins=ifnull(breakMins,0)+? where id=?', Math.round((Date.now() - new Date(open.breakStartedAt)) / 60000), open.id);
      promoteNext(s.branchId, s.chairId);
    } else if (b.action === 'off') {
      if (one('select 1 x from attendance where staffId=? and date=?', s.id, t)) bad(409, `${s.name} already has attendance today`);
      run("insert into attendance(id,staffId,branchId,date,timeIn,timeOut,lateMins,status) values(?,?,?,?,?,?,?,'off')", uid(), s.id, s.branchId, t, nowISO(), null, 0);
    } else bad(400, 'action must be in, out, break_start, break_end or off');
    run('insert into attendance_events(id,clientId,staffId,branchId,action,deviceAt,receivedAt,effectiveAt,photoId,flag,byName) values(?,?,?,?,?,?,?,?,?,?,?)', uid(), cid || null, s.id, s.branchId, b.action, b.deviceAt || '', recvIso, atIso, photo?.id || '', flag, me.name);
    log(me, 'clock-' + b.action, 'attendance', s.id, s.name + (flag ? ' [' + flag + ']' : '')); return send(res, 200, { ok: true, flagged: !!flag, id: attId });
  }
  // attendance log with photos, lateness / undertime / overtime, flags and absences (daily, weekly or monthly through the date range)
  if (p === '/api/attendance/log' && method === 'GET') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : todayStr(), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), br = isBranchUser(me) ? me.branchId : (q.branch && q.branch !== 'all' ? q.branch : null);
    const rows = all(`select a.*, s.name staffName, b.name branchName from attendance a join staff s on s.id=a.staffId left join branches b on b.id=a.branchId where a.date>=? and a.date<=? and ifnull(a.status,'present')='present'${br ? ' and a.branchId=?' : ''}${q.flagged === '1' ? ' and a.flagged=1' : ''} order by a.date desc, a.timeIn desc limit 1000`, from, to, ...(br ? [br] : []))
      .map(a => ({ ...a, corrections: jp(a.corrections), geoIn: a.geoIn ? JSON.parse(a.geoIn) : null, geoOut: a.geoOut ? JSON.parse(a.geoOut) : null, workedMins: a.timeOut ? Math.round((new Date(a.timeOut) - new Date(a.timeIn)) / 60000) - (a.breakMins || 0) : null }));
    const absences = []; const end = to < todayStr() ? to : todayStr();
    if (q.flagged !== '1') for (let d = new Date(from + 'T00:00'), n = 0; dOf(d) <= end && n < 62; d.setDate(d.getDate() + 1), n++) {
      const ds = dOf(d), had = new Set(all('select staffId from attendance where date=?', ds).map(x => x.staffId));
      for (const s of all(`select * from staff where active=1${br ? ' and branchId=?' : ''}`, ...(br ? [br] : []))) if (!had.has(s.id) && !(ds === todayStr() && false)) absences.push({ date: ds, staffId: s.id, staffName: s.name, branchName: get('branches', s.branchId)?.name || '' });
    }
    return send(res, 200, { rows, absences, totals: { records: rows.length, late: rows.filter(r => r.lateMins > 0).length, lateMins: sum(rows, r => r.lateMins || 0), undertimeMins: sum(rows, r => r.undertimeMins || 0), overtimeMins: sum(rows, r => r.overtimeMins || 0), flagged: rows.filter(r => r.flagged).length, offline: rows.filter(r => r.offline).length, absences: absences.length } });
  }
  const acm = p.match(/^\/api\/attendance\/(\w+)\/correct$/);
  if (acm && method === 'PUT') {
    adminOnly(); const a = get('attendance', acm[1]); if (!a) bad(404, 'Not found'); const b = await readBody(req), reason = String(b.reason || '').trim().slice(0, 300);
    if (reason.length < 5) bad(400, 'A reason is required for every attendance correction');
    const parse = v => { if (!v) return null; const s = /^\d{2}:\d{2}$/.test(v) ? `${a.date}T${v}:00` : String(v); const d = new Date(s); if (isNaN(d)) bad(400, 'Invalid time'); return d; };
    const tin = b.timeIn ? parse(b.timeIn) : new Date(a.timeIn), tout = b.timeOut === '' || b.timeOut === undefined ? (a.timeOut ? new Date(a.timeOut) : null) : parse(b.timeOut);
    if (tout && tout < tin) bad(400, 'The time out cannot be earlier than the time in');
    const br = get('branches', a.branchId), close = toMin(br.closeTime || '21:00'), late = Math.max(0, minsOfDay(tin) - (toMin(br.openTime) + (br.graceMins || 0))), lateRaw = Math.max(0, minsOfDay(tin) - toMin(br.openTime));
    const log2 = jp(a.corrections); log2.push({ at: nowISO(), by: me.name, reason, before: { timeIn: a.timeIn, timeOut: a.timeOut, lateMins: a.lateMins }, after: { timeIn: tin.toISOString(), timeOut: tout ? tout.toISOString() : null } });
    run('update attendance set timeIn=?, timeOut=?, lateMins=?, lateRaw=?, undertimeMins=?, overtimeMins=?, corrections=?, corrected=1 where id=?', tin.toISOString(), tout ? tout.toISOString() : null, late, lateRaw, tout ? Math.max(0, close - minsOfDay(tout)) : 0, tout ? Math.max(0, minsOfDay(tout) - close) : 0, JSON.stringify(log2), a.id);
    log(me, 'attendance-correction', 'attendance', a.id, reason); return send(res, 200, { ok: true });
  }
  if (p === '/api/shifts/open' && method === 'POST') {
    const b = await readBody(req), bid = branchScope(me, b.branchId), terminal = String(b.terminal || 'Terminal 1').slice(0, 40);
    const zl = dayLocked(bid, todayStr()); if (zl) bad(409, `Today's sales reading (Z-${zl.no}) is already done, so the day is locked. You can open a new shift tomorrow.`);
    if (one("select 1 x from shifts where branchId=? and terminal=? and status='open'", bid, terminal)) bad(409, 'A shift is already open on this terminal');
    const id = uid(), sno = (one('select max(no) m from shifts where branchId=?', bid).m || 0) + 1;
    run("insert into shifts(id,no,branchId,terminal,cashierId,cashierName,businessDate,openedAt,openingFloat,status) values(?,?,?,?,?,?,?,?,?,'open')", id, sno, bid, terminal, me.id, me.name, todayStr(), nowISO(), Math.max(0, r2(b.openingFloat)));
    log(me, 'shift-open', 'shifts', id, terminal); return send(res, 201, get('shifts', id));
  }
  const sm = p.match(/^\/api\/shifts\/(\w+)\/close$/);
  if (sm && method === 'POST') {
    const s = get('shifts', sm[1]); if (!s || s.status !== 'open') bad(404, 'No such open shift');
    if (isBranchUser(me) && s.branchId !== me.branchId) bad(403, 'Not your branch');
    const zl = dayLocked(s.branchId, s.businessDate); if (zl) bad(409, `The sales reading for ${s.businessDate} (Z-${zl.no}) is already done. Only one per day.`);
    const ot = openTickets(s.branchId, s.businessDate); if (ot) bad(409, `Cannot do the sales reading yet: ${ot} ticket${ot === 1 ? ' is' : 's are'} still open (pay later or in the chair). Pay or cancel ${ot === 1 ? 'it' : 'them'} first.`);
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
    if (!admin) needAny(me, b.kind === 'expense' ? 'expenses' : 'reading');
    if (isBranchUser(me) && s.branchId !== me.branchId) bad(403, 'Not your branch');
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
  if (!(kind === 'customers' && isBranchUser(me) && (method === 'POST' || method === 'PUT'))) adminOnly();
  if (method === 'POST' && !id) {
    const b = await readBody(req);
    if (kind !== 'users') { b.name = String(b.name || '').trim(); if (!b.name) bad(400, 'Name required'); }
    if (kind === 'customers') b.createdAt = nowISO();
    if ((kind === 'chairs' || kind === 'staff') && !get('branches', b.branchId)) bad(400, 'Pick a branch');
    if (kind === 'staff' && (b.pct === undefined || b.pct === '')) b.pct = get('branches', b.branchId)?.defaultPct ?? 40;
    if (kind === 'items' && !(+b.price >= 0)) bad(400, 'Check the price');
    if (kind === 'staff' || kind === 'chairs' || kind === 'items' || kind === 'discounts') b.active ??= 1;
    if (kind === 'items') { b.bookable ??= b.type === 'service' ? 1 : 0; b.apptOnly ??= 0; }
    let row;
    if (kind === 'users') { checkUser(b, null); b.active = 1; row = insert('users', b); setPw(row.id, b); row = strip(get('users', row.id)); } else row = insert(kind, b);
    log(me, 'create', kind, row.id, row.name || ''); return send(res, 201, row);
  }
  if (method === 'PUT' && id) {
    const cur = get(kind, id); if (!cur) bad(404, 'Not found'); const b = await readBody(req); delete b.createdAt;
    if ('name' in b && !String(b.name).trim()) bad(400, 'Name required');
    let row;
    if (kind === 'users') { checkUser(b, cur); update('users', id, b); setPw(id, b); row = strip(get('users', id)); } else row = update(kind, id, b);
    if ((kind === 'staff' || kind === 'items' || kind === 'branches') && 'photo' in b && cur.photo && cur.photo !== b.photo) { const im = /\/img\/(\w+)/.exec(cur.photo); if (im) run('delete from images where id=?', im[1]); }
    log(me, 'update', kind, id, JSON.stringify({ ...b, password: b.password ? '***' : undefined, pin: b.pin ? '***' : undefined })); return send(res, 200, row);
  }
  if (method === 'DELETE' && id) {
    if (kind === 'users' && id === me.id) bad(409, 'You cannot delete yourself');
    const used = (REFS[kind] || []).some(([t, c]) => one(`select 1 x from ${t} where ${c}=?`, id));
    if (used) {
      if (SOFT.has(kind)) { run(`update ${kind} set active=0 where id=?`, id); log(me, 'deactivate', kind, id, ''); return send(res, 200, { ok: true, deactivated: true }); }
      bad(409, 'This is still in use, so it cannot be deleted');
    }
    run(`delete from ${kind} where id=?`, id); log(me, 'delete', kind, id, ''); return send(res, 200, { ok: true });
  }
  bad(405, 'Method not allowed');
}

http.createServer(async (req, res) => {
  if (/gzip/.test(String(req.headers['accept-encoding'] || ''))) GZIP_OK.add(res);
  try { await handle(req, res); }
  catch (e) { if (!res.headersSent) send(res, e instanceof HttpError ? e.code : 400, { error: e.message }); }
}).listen(PORT, () => console.log(`${SHOP} running → http://localhost:${PORT}`));
