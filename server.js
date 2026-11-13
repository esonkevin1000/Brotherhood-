// Brotherhood — barbershop operating system backend (zero dependencies, Node 22.5+ built-in SQLite).
// Walk-in queue + POS API, shifts/cash drawer/Z-readings, attendance, payroll, reports, audit log, backups.
// Run:  ADMIN_PASSWORD=yourpass node server.js     (PowerShell: $env:ADMIN_PASSWORD='yourpass'; node server.js)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mountBH } from './bh-api.js';
import { migrate } from './src/db/migrate.js';
import { createMailer } from './src/lib/mail.js';
import { hashPw, checkPw, sha, createAuth } from './src/lib/auth.js';
import { createLimiter, allOf, intSetting } from './src/lib/throttle.js';
import { createFlags } from './src/lib/flags.js';
import { createPolicy } from './src/lib/policy.js';
import { createBookingMessages } from './src/lib/notify.js';
import { createServiceRoutes } from './src/routes/service-records.js';
import { createDeviceRoutes } from './src/routes/devices.js';
import { createScheduleRoutes } from './src/routes/schedules.js';
import { createReports } from './src/lib/reports.js';
import { createBookings, idemKeyOf, snapOf } from './src/lib/booking.js';
import { HttpError, bad, MIME, send, readBody, noteGzip, staticServer, NEXT } from './src/lib/http.js';
import { createManagementRoutes } from './src/routes/management.js';
import { createMarketingRoutes } from './src/routes/marketing.js';
import { createPartnerShopRoutes } from './src/routes/partner-shops.js';
import { createPublicRoutes } from './src/routes/public.js';
import { createStaffToolRoutes } from './src/routes/staff-tools.js';
import { createBackOfficeDataRoutes } from './src/routes/back-office-data.js';
import { createOperationsRoutes } from './src/routes/operations.js';

process.env.TZ ||= 'Asia/Manila';
const PORT = +process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
// Recovery: OWNER_USERNAME_FORCE (hosting variable) overrides whatever owner username was saved in Settings, so a forgotten owner username can always be reset from the host.
const ownerUser = () => curOrg() ? String(curOrg().ownerUser || '') : String(process.env.OWNER_USERNAME_FORCE || getSetting('ownerUser') || process.env.OWNER_USERNAME || '').trim().toLowerCase();   // chosen by the owner in Settings (or OWNER_USERNAME); blank = old behaviour
const SHOP = process.env.SHOP_NAME || 'Brotherhood';
const DIR = import.meta.dirname;
const BRANCHES = ['Alaminos', 'Bay', 'Calauan', 'Nagcarlan', 'Tiaong', 'San Pablo', 'Sto. Tomas'];
if (!process.env.ADMIN_PASSWORD) console.warn('⚠  Using default owner password "admin123". Set ADMIN_PASSWORD before going live.');

// ---------- database ----------
const DB_FILE = process.env.DB_FILE || path.join(DIR, 'barber.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
// ----- partner shops (multi-tenant) -----
// Brotherhood's own data lives in the main database. Each partner shop has its own database file (org-<id>.db) with the same tables,
// so a partner can never see Brotherhood's data (or another partner's). Every request runs against one database, chosen from the
// signed login token; all queries go through the `db` proxy below, which points at the database of the current request.
const mainDb = new DatabaseSync(DB_FILE);
const als = new AsyncLocalStorage();
const curOrg = () => als.getStore()?.org || null;
const db = new Proxy({}, { get: (_, k) => { const d = als.getStore()?.db || mainDb, v = d[k]; return typeof v === 'function' ? v.bind(d) : v; } });
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
create table if not exists campaigns(id text primary key, subject text, body text, btnText text, btnUrl text, audience text, total integer, createdBy text, createdAt text);
create index if not exists orders_cust on orders(customerId);
`);
addCol('customers', 'noshowOk', 'integer'); addCol('customers', 'preferredCut', 'text'); addCol('customers', 'consent', 'integer'); addCol('customers', 'consentAt', 'text'); addCol('customers', 'welcomedAt', 'text');
addCol('customers', 'phoneKey', 'text'); addCol('customers', 'emailKey', 'text'); addCol('customers', 'source', 'text'); addCol('bookings', 'customerId', 'text');
db.exec('create index if not exists cust_phone on customers(phoneKey); create index if not exists cust_email on customers(emailKey);');
addCol('branches', 'googlePlaceId', 'text'); addCol('branches', 'googleUrl', 'text'); addCol('branches', 'photo', 'text'); addCol('branches', 'mapUrl', 'text'); addCol('branches', 'defaultPct', 'real'); addCol('customers', 'branchId', 'text'); addCol('orders', 'discountId', 'text'); addCol('orders', 'invoiceNo', 'text'); addCol('orders', 'via', 'text');
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
mainDb.exec('create table if not exists orgs(id text primary key, code text unique, name text, ownerUser text, ownerHash text, active integer, createdAt text)');
// self sign-up and plans: who signed up, what kind of user, free trial end and paid-until date
for (const [c, t] of [['email', 'text'], ['phone', 'text'], ['ownerName', 'text'], ['kind', 'text'], ['plan', 'text'], ['trialEnds', 'text'], ['paidUntil', 'text'], ['source', 'text'], ['city', 'text']])
  if (!mainDb.prepare('pragma table_info(orgs)').all().some(x => x.name === c)) mainDb.exec(`alter table orgs add column ${c} ${t}`);
mainDb.exec('create table if not exists org_payments(id text primary key, orgId text, amount real, months integer, method text, ref text, invoiceNo text, note text, paidAt text, createdBy text)');
const ORG_DBS = new Map(); let schemaReady = false;
const BAD_ORGS = new Set();   // partner databases that failed to open or migrate: left out of cross-shop lists until the next restart, so one broken shop never breaks the others
const orgRow = id => mainDb.prepare('select * from orgs where id=?').get(String(id || ''));
const orgList = () => mainDb.prepare('select * from orgs order by createdAt').all();
// copy every table, column and index of the main database into a partner database (safe to repeat; only adds what is missing)
function syncSchema(d) {
  const objs = mainDb.prepare("select type,name,sql from sqlite_master where sql is not null and name not like 'sqlite_%' and type in ('table','index') order by case type when 'table' then 0 else 1 end").all();
  for (const o of objs) {
    if (o.type === 'table') {
      d.exec(o.sql.replace(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?/i, 'CREATE TABLE IF NOT EXISTS '));
      const have = new Set(d.prepare(`pragma table_info("${o.name}")`).all().map(c => c.name));
      for (const c of mainDb.prepare(`pragma table_info("${o.name}")`).all()) if (!have.has(c.name)) d.exec(`alter table "${o.name}" add column "${c.name}" ${c.type || ''}`);
    } else d.exec(o.sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?/i, (m, u) => `CREATE ${u || ''}INDEX IF NOT EXISTS `));
  }
}
function orgDb(id) {
  if (!/^\w+$/.test(id)) throw new Error('bad org id');
  let d = ORG_DBS.get(id); if (d) return d;
  if (BAD_ORGS.has(id)) throw new HttpError(503, 'This shop is temporarily unavailable. Please contact Brotherhood.');
  try { d = new DatabaseSync(path.join(path.dirname(DB_FILE), `org-${id}.db`)); syncSchema(d); if (schemaReady) migrate(d); }
  catch (e) { try { d && d.close(); } catch { } if (schemaReady) { BAD_ORGS.add(id); console.error(`shop database org-${id} could not be prepared:`, e.message); throw new HttpError(503, 'This shop is temporarily unavailable. Please contact Brotherhood.'); } throw e; }
  if (schemaReady) ORG_DBS.set(id, d);   // before startup finishes the main schema is not complete yet, so sync (and migrate) again later
  return d;
}
const inOrg = (org, fn) => als.run({ db: orgDb(org.id), org }, fn);
const inMain = fn => als.run({ db: mainDb, org: null }, fn);
const activeOrgs = () => orgList().filter(o => o.active && !BAD_ORGS.has(o.id));
// which database holds this record: null = Brotherhood, a shop row = that partner, undefined = nowhere (or a paused partner)
const ownerOf = (kind, id) => { id = String(id || ''); if (!id) return undefined; if (inMain(() => get(kind, id))) return null; for (const o of activeOrgs()) if (inOrg(o, () => get(kind, id))) return o; return undefined; };
const shopName = () => curOrg()?.name || SHOP;

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
const strip = u => { const { passHash, pinKey, ...r } = u; return { ...r, hasPassword: !!passHash, hasPin: !!pinKey, ...(u.role === 'manager' ? { branchIds: branchesOf(u.id) } : {}) }; };
// PINs are stored as a keyed hash (stable salt kept in the DB, independent of the owner password) so a PIN can identify its user
let pinSalt = one("select v from settings where k='pinSalt'")?.v;
if (!pinSalt) { pinSalt = crypto.randomBytes(24).toString('hex'); run("insert into settings(k,v) values('pinSalt',?)", pinSalt); }
const pinKeyOf = pin => crypto.createHmac('sha256', pinSalt).update('pin:' + pin).digest('base64url');
const log = (me, action, entity, id, detail) =>
  run('insert into audit(ts,who,action,entity,entityId,detail) values(?,?,?,?,?,?)', nowISO(), me?.name || '?', action, entity, id || '', String(detail || '').slice(0, 300));

// ---------- first run ----------
// FRESH_INSTALL=1 is for another shop's own copy: start empty (no Brotherhood branches, chairs, menu or discounts) so the owner builds their own in the Back office.
const FRESH = /^(1|true|yes)$/i.test(process.env.FRESH_INSTALL || '');
if (!FRESH && !one('select count(*) n from branches').n) for (const n of BRANCHES) insert('branches', { name: n, openTime: '09:00', graceMins: 10 });
run("update branches set openTime='09:00' where openTime is null or openTime=''"); run('update branches set graceMins=10 where graceMins is null');
if (!FRESH && !one('select count(*) n from chairs').n)
  for (const b of all('select id from branches order by rowid')) for (let i = 1; i <= 3; i++) insert('chairs', { branchId: b.id, name: 'Chair ' + i, sort: i, active: 1 });
if (!FRESH && !one('select count(*) n from categories').n) {
  const hc = insert('categories', { name: 'Haircut', type: 'service' }).id, hp = insert('categories', { name: 'Hair Product', type: 'product' }).id;
  for (const [n, p, c, t, m] of [['Buddy', 150, hc, 'service', 30], ['Amigo', 200, hc, 'service', 30], ['Vip Compadre', 250, hc, 'service', 45],
    ['Texture Powder', 380, hp, 'product', 0], ['Sea Salt Spray', 380, hp, 'product', 0]])
    insert('items', { name: n, price: p, categoryId: c, type: t, mins: m, active: 1 });
}
if (!FRESH && !one('select count(*) n from discounts').n) insert('discounts', { name: 'Student', kind: 'amount', value: 50, active: 1 });
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
    for (const o of orgList().filter(x => !BAD_ORGS.has(x.id))) {
      inOrg(o, () => backup(path.join(BK_DIR, `org-${o.id}-${todayStr()}.db`)));
      const of = fs.readdirSync(BK_DIR).filter(f => new RegExp(`^org-${o.id}-\\d{4}-\\d{2}-\\d{2}\\.db$`).test(f)).sort();
      for (const f of of.slice(0, -14)) fs.rmSync(path.join(BK_DIR, f));
    }
  } catch (e) { console.error('backup failed:', e.message); }
}
dailyBackup(); setInterval(dailyBackup, 6 * 3600e3).unref();

// ---------- auth ----------
const SECRET = process.env.SESSION_SECRET || 'bp:' + PASS;
// tokens, photo encryption and unsubscribe codes are in src/lib/auth.js
// Photos stored while SESSION_SECRET was not set were encrypted with a key made from 'bp:' + ADMIN_PASSWORD. That key stays
// on the list for reading, so setting SESSION_SECRET for the first time does not make stored photos unreadable.
// FILES_OLD_SECRETS (comma-separated) lists further old secrets, for the rare case the owner password changed too.
const FILE_SECRETS = [process.env.FILES_SECRET || SECRET, 'bp:' + PASS, ...String(process.env.FILES_OLD_SECRETS || '').split(',').map(s => s.trim()).filter(Boolean)];
const { makeToken, readToken, encBuf, decBuf, unsubSig } = createAuth(SECRET, { fileSecrets: FILE_SECRETS });
// a mark of the Railway password inside the owner token: changing the password logs old owner tokens out. It is keyed with
// the server secret, so someone holding a token cannot use the mark to guess the password offline.
const RAILWAY_OWNER_V = crypto.createHmac('sha256', SECRET).update('owner-login:' + PASS).digest('base64url').slice(-8);
// Settings that weaken logins on the live server (decision D-22: warn loudly, keep running)
const IS_PRODUCTION = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
const SECRET_WARNINGS = !IS_PRODUCTION ? [] : [
  ...(!process.env.ADMIN_PASSWORD ? ['ADMIN_PASSWORD is not set, so the owner password is the default one. Set a long, unique ADMIN_PASSWORD in the Railway variables.']
    : PASS.length < 12 ? ['ADMIN_PASSWORD is shorter than 12 characters. Use a longer one in the Railway variables.'] : []),
  ...(!process.env.SESSION_SECRET ? ['SESSION_SECRET is not set, so logins are signed with a value made from the owner password. Add a long random SESSION_SECRET in the Railway variables (everyone will need to log in again once; stored photos stay readable).'] : []),
];
for (const w of SECRET_WARNINGS) console.error('WARNING:', w);
// roles: owner (env password) and admin = everything; cashier = POS for own branch only
function whoami(req) {
  const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!o) return null;
  const g = curOrg(); if ((o.o || null) !== (g?.id || null)) return null;   // a token only works in its own shop's database
  if (o.u === 'owner') { if (o.v !== (g ? String(g.ownerHash).slice(-8) : RAILWAY_OWNER_V)) return null; return { id: 'owner', role: 'owner', name: 'Owner' }; }
  const u = get('users', o.u);
  if (!u || !u.active || ![u.passHash, u.pinKey].some(h => h && h.slice(-8) === o.v)) return null;
  if (u.role === 'manager') return { id: u.id, role: u.role, name: u.name, branchId: null, branchIds: branchesOf(u.id) };   // read on every request: taking a branch away works at once
  return { id: u.id, role: u.role, name: u.name, branchId: u.role === 'cashier' || u.role === 'barber' ? u.branchId : null };
}
const isAdmin = me => me.role === 'owner' || me.role === 'admin';
const isBranchUser = me => me.role === 'cashier' || me.role === 'barber';
// Branch managers (T7, decision D-12): like an admin, but only for the branches in user_branches.
const isManager = me => me.role === 'manager';
function branchesOf(userId) { return all('select branchId from user_branches where userId=? order by branchId', userId).map(r => r.branchId).filter(b => get('branches', b)); }
// may this person work in this branch? owner and admins everywhere, a manager in their branches, front desk and barbers in their own
const inScope = (me, branchId) => isAdmin(me) || (isManager(me) ? me.branchIds.includes(String(branchId || '')) : !!branchId && me.branchId === branchId);
// a branch filter for lists: one branch id, or null for "all branches" (owner and admins only; a manager with several branches picks one)
const branchOrAll = (me, requested) => {
  if (isBranchUser(me)) return me.branchId;
  const r = requested && requested !== 'all' ? String(requested) : null;
  if (!isManager(me)) return r;
  if (!r) { if (me.branchIds.length === 1) return me.branchIds[0]; bad(400, 'Pick one of your branches'); }
  if (!inScope(me, r)) bad(403, 'Not your branch');
  return r;
};
// Which parts of the POS each role may open (editable by the owner in Settings → Access)
const MODULES = ['dashboard', 'pos', 'bookings', 'queue', 'expenses', 'attendance', 'reading', 'customers', 'remittance', 'release', 'problems', 'inbox', 'checklist', 'leave', 'myperf'];
// barbers never get the walk-in queue (stripped in permsAll below)
const DEFAULT_PERMS = { cashier: [...MODULES], barber: ['dashboard', 'bookings', 'problems', 'inbox', 'myperf'] };
const permsAll = () => { try { const p = JSON.parse(getSetting('perms') || '{}'); return { cashier: Array.isArray(p.cashier) ? p.cashier.filter(m => MODULES.includes(m)) : DEFAULT_PERMS.cashier, barber: (Array.isArray(p.barber) ? p.barber.filter(m => MODULES.includes(m)) : DEFAULT_PERMS.barber).filter(m => m !== 'queue') }; } catch { return { ...DEFAULT_PERMS }; } };
const modulesFor = role => role === 'owner' || role === 'admin' || role === 'manager' ? MODULES : (permsAll()[role] || []);
const needAny = (me, mods) => { if (isAdmin(me)) return; const have = modulesFor(me.role); if (![].concat(mods).some(m => have.includes(m))) bad(403, 'Your role is not allowed to open this section'); };
// Guessing protection for staff logins. The keys cannot be faked by the caller: a shop (for PINs, because a PIN alone says who you are)
// and a shop + username (for passwords). The address-based delay below stays as a small extra brake only.
// Two limits each: a short one that stops a burst, and a daily one that stops someone who stays just under the short limit all day.
const pinLimiter = allOf(
  createLimiter({ max: intSetting(process.env.PIN_FAIL_MAX, 10, 3), windowMs: 10 * 60e3, lockMs: 10 * 60e3, maxLockMs: 2 * 3600e3 }),
  createLimiter({ max: intSetting(process.env.PIN_FAIL_DAY, 40, 5), windowMs: 24 * 3600e3, lockMs: 2 * 3600e3, maxLockMs: 24 * 3600e3 }));
const userLimiter = allOf(
  createLimiter({ max: intSetting(process.env.LOGIN_FAIL_MAX, 10, 3), windowMs: 15 * 60e3, lockMs: 15 * 60e3, maxLockMs: 3600e3 }),
  createLimiter({ max: intSetting(process.env.LOGIN_FAIL_DAY, 30, 5), windowMs: 24 * 3600e3, lockMs: 2 * 3600e3, maxLockMs: 24 * 3600e3 }));
// Name + PIN login (decision D-21): wrong PINs are counted per person, so a pause hits only that person; a phone has its own limit too.
const personPinShort = createLimiter({ max: intSetting(process.env.PERSON_PIN_FAIL_MAX, 5, 3), windowMs: 10 * 60e3, lockMs: 15 * 60e3, maxLockMs: 4 * 3600e3 });
const personPinDaily = createLimiter({ max: intSetting(process.env.PERSON_PIN_FAIL_DAY, 15, 5), windowMs: 24 * 3600e3, lockMs: 4 * 3600e3, maxLockMs: 24 * 3600e3 });
const personPin = allOf(personPinShort, personPinDaily);
const devicePin = createLimiter({ max: intSetting(process.env.DEVICE_PIN_FAIL_MAX, 30, 5), windowMs: 10 * 60e3, lockMs: 10 * 60e3, maxLockMs: 2 * 3600e3 });
// the phone a request comes from (header x-device), if an owner or admin set it up for a branch of this shop and it is still on
function deviceOf(req) {
  const t = readToken(String(req.headers['x-device'] || ''));
  if (!t || !String(t.u).startsWith('device:') || (t.o || null) !== (curOrg()?.id || null)) return null;
  const d = one('select * from devices where id=? and active=1', String(t.u).slice(7));
  return d && get('branches', d.branchId) ? d : null;
}
const SHIFT_DAYS = 0.5;   // a login on a shared branch phone lasts 12 hours
const sameKey = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const waitText = ms => { const m = Math.ceil(ms / 60e3); return m >= 60 ? 'about ' + Math.ceil(m / 60) + ' hour' + (m > 60 ? 's' : '') : m + ' minute' + (m === 1 ? '' : 's'); };
const fails = new Map();
const failDelay = ip => { const f = fails.get(ip); return f && Date.now() - f.t < 600e3 ? Math.min(f.n * 500, 3000) : 0; };
const noteFail = ip => { const f = fails.get(ip); fails.set(ip, { n: (f && Date.now() - f.t < 600e3 ? f.n : 0) + 1, t: Date.now() }); };


// ---------- POS logic ----------
const branchScope = (me, requested) => {
  let id = isBranchUser(me) ? me.branchId : String(requested || '');
  if (isManager(me) && (!id || id === 'all') && me.branchIds.length === 1) id = me.branchIds[0];
  if (!get('branches', id)) bad(400, 'Pick a branch');
  if (!inScope(me, id)) bad(403, 'Not your branch');
  return id;
};
// One Z-reading (sales reading) per branch per day. Once it is done the day is locked: no new shift, no new tickets, no payments until tomorrow.
const dayLocked = (branchId, date) => one('select no from zreadings where branchId=? and businessDate=? order by generatedAt desc', branchId, date);
const openTickets = (branchId, date) => one("select count(*) n from orders where branchId=? and date=? and status in ('waiting','in_chair')", branchId, date).n;
// a shop's own cover photo (site/<name>-1.jpg) is used on the promo and booking sites until a picture is set for the branch in the back office
const siteSvc = name => { const f = 'svc-' + String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.jpg'; return fs.existsSync(path.join(DIR, 'site', f)) ? '/site/' + f : null; };   // service photo: site/svc-<name>.jpg until one is set in the back office
const siteCover = name => { const s = String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), f = s === 'alaminos' ? 'alaminos.jpg' : s + '-1.jpg'; return s && fs.existsSync(path.join(DIR, 'site', f)) ? '/site/' + f : null; };
const siteGallery = name => { const s = String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), out = []; if (!s) return out; if (s === 'alaminos' && fs.existsSync(path.join(DIR, 'site', 'alaminos.jpg'))) out.push('/site/alaminos.jpg'); for (let i = 1; i <= 12; i++) if (fs.existsSync(path.join(DIR, 'site', `${s}-${i}.jpg`))) out.push(`/site/${s}-${i}.jpg`); return out; };   // every photo of a shop in site/
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
// the per-branch switch for the new behaviour (T11): code asks mvpOn(branchId)
const { mvpOn, mvpBranches, setMvpBranches } = createFlags({ getSetting, setSetting, branchExists: id => !!get('branches', id) });
// booking policy per branch (T17): slot interval, buffer, no-show grace, cancel cutoff
const { policyOf, savedOf, setPolicy } = createPolicy({ getSetting, setSetting, mvpOn, branchExists: id => !!get('branches', id) });
// one-time: online booking is for Vip Compadre only (Buddy and Amigo are walk-in). The owner can change it later under Services & Products ("Show on online booking").
// one-time: JB joins the Calauan shop with his photo; the owner sets his chair, commission and allowance in Management → Barbers / Staff
if (!getSetting('migJB')) { const cb = one("select id, defaultPct from branches where lower(name)='calauan'"); if (cb) { if (!one("select 1 x from staff where lower(name)='jb' and branchId=?", cb.id)) insert('staff', { name: 'JB', branchId: cb.id, chairId: '', pct: cb.defaultPct || 40, allowance: 0, photo: '/site/jb.jpg', active: 1 }); setSetting('migJB', '1'); } }
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
// email sending lives in src/lib/mail.js; the count of emails sent today stays here because it is kept in the database
const MAIL = createMailer({ defaultName: SHOP, sentToday: () => mailCount(), countSent: () => mailBump() });
const EMAIL = MAIL.config, mailProvider = MAIL.provider, mailReady = MAIL.ready, MAIL_LIMIT = MAIL.limit, mailFrom = MAIL.from, sendEmail = MAIL.send;
let lastOrigin = getSetting('origin') || '';
addCol('email_log', 'campaignId', 'text');

// ---------- plans for partner shops: self sign-up with a free trial, monthly fee recorded by Brotherhood ----------
const mainGet = k => mainDb.prepare('select v from settings where k=?').get(k)?.v;
const mainSet = (k, v) => mainDb.prepare('insert into settings(k,v) values(?,?) on conflict(k) do update set v=excluded.v').run(k, v);
const TRIAL_DAYS = +process.env.TRIAL_DAYS || 30;
const DEFAULT_PLANS = [
  { id: 'solo', name: 'Solo', price: 299, desc: 'One barber: chair renter, own suite or student barber' },
  { id: 'shop', name: 'Shop', price: 999, desc: 'One branch with your team' },
  { id: 'multi', name: 'Multi-branch', price: 2499, desc: 'Two or more branches' }];
const PLAN_IDS = DEFAULT_PLANS.map(x => x.id);
const plansNow = () => { try { const s = JSON.parse(mainGet('plans') || 'null'); if (Array.isArray(s)) return DEFAULT_PLANS.map(d => ({ ...d, ...(s.find(x => x.id === d.id) || {}) })); } catch { } return DEFAULT_PLANS; };
const payInfo = () => mainGet('payInfo') || '';
const contactEmail = () => String(process.env.CONTACT_EMAIL || '').trim();
const addDaysStr = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return dOf(d); };
const addMonthsStr = (s, n) => { const d = new Date(s + 'T00:00'); d.setMonth(d.getMonth() + n); return dOf(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
// free = added by Brotherhood without a plan (no limits); trial / paid = until a date; expired = can log in and view, cannot add anything
function orgStatus(o) {
  const t = todayStr(), plan = plansNow().find(x => x.id === o.plan) || null;
  const base = { plan: plan ? plan.id : '', planName: plan ? plan.name : '', price: plan ? plan.price : 0, trialEnds: o.trialEnds || '', paidUntil: o.paidUntil || '' };
  if (!o.active) return { ...base, state: 'paused' };
  if (o.paidUntil && o.paidUntil >= t) return { ...base, state: 'paid', until: o.paidUntil, daysLeft: daysBetween(t, o.paidUntil) };
  if (o.trialEnds && o.trialEnds >= t) return { ...base, state: 'trial', until: o.trialEnds, daysLeft: daysBetween(t, o.trialEnds) };
  if (!o.trialEnds && !o.paidUntil) return { ...base, state: 'free' };
  return { ...base, state: 'expired', until: o.paidUntil || o.trialEnds };
}
const orgInfo = () => { const o = curOrg(); if (!o) return null; const f = orgRow(o.id) || o; return { name: f.name, code: f.code, kind: f.kind || '', email: f.email || '', status: orgStatus(f), plans: plansNow(), payInfo: payInfo(), contact: contactEmail() }; };
const signupHits = new Map();
// Public sign-up for new shops is closed until the legal review is done (decision D-1). SIGNUPS_OPEN=1 opens it again; the code stays.
const SIGNUPS_OPEN = process.env.SIGNUPS_OPEN === '1';
const STARTER = [['Haircut', 150, 30], ['Haircut and shave', 250, 45], ['Beard trim', 100, 20]];   // a new shop starts with these; they change the names and prices in a minute
const KIND_LABEL = { owner: 'Shop owner with barbers', renter: 'Chair renter', suite: 'Own suite or studio', student: 'Student barber' };

const NO_MAIL = () => curOrg() ? 'Email is not turned on yet. Ask Brotherhood to connect it.' : 'Email is not connected yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in the Railway variables.';
// emails sent today, all shops together (kept in the main database so a restart does not reset it)
const mailCount = () => { const [d, n] = String(mainGet('mailDay') || '').split(':'); return d === todayStr() ? +n || 0 : 0; };
const mailBump = () => mainSet('mailDay', todayStr() + ':' + (mailCount() + 1));
const baseUrl = () => process.env.PUBLIC_URL || lastOrigin || 'http://localhost:' + PORT;
function rememberOrigin(req) {   // only called for authenticated admins, so the Host header can be trusted
  const host = req.headers.host || ''; if (!host || /^(localhost|127\.)/.test(host)) return;
  const o = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0] + '://' + host;
  if (o !== lastOrigin) { lastOrigin = o; setSetting('origin', o); }
}

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
<tr><td style="background:#fff;text-align:center;padding:26px 20px 10px"><img src="${baseUrl()}/logo.png?v=b" width="130" height="130" alt="Brotherhood Barber" style="display:inline-block;border-radius:65px"></td></tr>
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
}function shopWelcomeEmail({ shop, ownerName, code, user, trialEnds, kind, backend, app }) {
  const first = String(ownerName || '').trim().split(/\s+/)[0] || 'there', solo = kind !== 'owner';
  const steps = solo ? ['Open the app and log in with your shop code, username and password.', 'Set your services and prices (we added three to start).', 'Share your booking link with your clients.', 'Track every finished cut and your earnings in Today.']
    : ['Open the back office and set your services and prices (we added three to start).', 'Add your barbers, then make a login for each one (Management, Users).', 'Your barbers and front desk use the app: walk-ins, the line, finished services, time in and out.', 'Share your booking page so clients book online.'];
  const row = (k, v) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${k}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700">${esc2(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a0a0b;text-align:center;padding:26px 20px"><img src="${baseUrl()}/bh-mark.png" width="48" height="48" alt="" style="display:block;margin:0 auto 10px"><div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:4px">BROTHERHOOD</div></td></tr>
<tr><td style="height:4px;background:#1f7bff;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 26px"><h1 style="margin:0 0 10px;font-size:22px">Welcome, ${esc2(first)}!</h1>
<p style="line-height:1.6;margin:0 0 14px"><b>${esc2(shop)}</b> is ready on Brotherhood. Your free trial runs until <b>${trialEnds}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;border-collapse:separate;margin:0 0 18px">${row('Shop code', code)}${row('Username', user)}${row('Password', 'the one you chose')}</table>
<ol style="line-height:1.7;margin:0 0 18px;padding-left:20px">${steps.map(s => `<li>${esc2(s)}</li>`).join('')}</ol>
<p style="margin:0 0 10px"><a href="${esc2(solo ? app : backend)}" style="display:inline-block;background:#1f7bff;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px">${solo ? 'Open the app' : 'Open the back office'}</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#555">${solo ? 'Back office' : 'The app'}: <a href="${esc2(solo ? backend : app)}">${esc2(solo ? backend : app)}</a></p>
<p style="line-height:1.5;margin:0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:14px">Brotherhood is for bookings and tracking only. It does not issue receipts or invoices. Issue your BIR invoices from your own registered booklet or system.</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `Welcome, ${first}!\n\n${shop} is ready on Brotherhood. Your free trial runs until ${trialEnds}.\n\nShop code: ${code}\nUsername: ${user}\nPassword: the one you chose\n\n${steps.map((s, i) => (i + 1) + '. ' + s).join('\n')}\n\nThe app: ${app}\nBack office: ${backend}\n\nBrotherhood is for bookings and tracking only. It does not issue receipts or invoices. Issue your BIR invoices from your own registered booklet or system.`;
  return { subject: `Welcome to Brotherhood, ${shop} is ready`, html, text };
}
function maybeWelcome(c) {
  if (curOrg()) return;
  if (!c.consent || !c.email || !validEmail(c.email) || c.welcomedAt) return;
  const m = welcomeEmail(c);
  run("insert into email_log(id,customerId,toAddr,kind,subject,html,text,status,attempts,error,createdAt) values(?,?,?,?,?,?,?,'pending',0,'',?)", uid(), c.id, c.email, 'welcome', m.subject, m.html, m.text, nowISO());
  run('update customers set welcomedAt=? where id=?', nowISO(), c.id);
  setTimeout(() => processEmails().catch(() => { }), 50);
}
function queueEmail({ customerId = '', to, kind, subject, html, text, ref = null }) {   // ref: a key that makes the same email go out only once (T20)   // transactional mail from the app (reminders, review requests); only queued when the email service is connected
  if (curOrg() || !mailReady() || !validEmail(to)) return false;
  if (Number(run("insert or ignore into email_log(id,customerId,toAddr,kind,subject,html,text,status,attempts,error,createdAt,ref) values(?,?,?,?,?,?,?,'pending',0,'',?,?)", uid(), customerId, to, kind, subject, html, text, nowISO(), ref).changes) !== 1) return false;   // already queued or sent
  setTimeout(() => processEmails().catch(() => { }), 50); return true;
}
let sending = false;
// sends what is waiting, for Brotherhood and every partner shop (a partner's emails go out with the shop's name and reply to the shop's email)
async function processEmails() {
  if (!mailReady() || sending) return; sending = true;
  try {
    for (const g of [null, ...activeOrgs()]) {
      const go = fn => g ? inOrg(g, fn) : inMain(fn);
      for (const r of go(() => all("select * from email_log where status='pending' order by createdAt limit 20"))) {
        const unsub = `${baseUrl()}/unsubscribe?c=${r.customerId}&t=${unsubSig(r.customerId)}${g ? '&o=' + g.id : ''}`;
        let m = r; if (r.kind === 'welcome' && !g) { const c = inMain(() => get('customers', r.customerId)); if (c) m = inMain(() => welcomeEmail(c)); }   // always sent in the current wording
        const res = await sendEmail({ to: r.toAddr, subject: m.subject, html: m.html.replaceAll('{{UNSUB}}', unsub), text: m.text.replaceAll('{{UNSUB}}', unsub), fromName: g ? g.name : '', replyTo: g ? g.email || '' : '', unsub: r.customerId ? unsub : '' });
        if (res.limit) return;   // daily limit reached: the rest stay waiting until tomorrow
        go(() => {
          if (res.ok) run("update email_log set status='sent', sentAt=?, error='', attempts=attempts+1 where id=?", nowISO(), r.id);
          else run('update email_log set attempts=attempts+1, error=?, status=? where id=?', res.error, r.attempts + 1 >= 5 ? 'failed' : 'pending', r.id);
        });
      }
    }
  } finally { sending = false; }
}
setInterval(() => processEmails().catch(() => { }), 60_000).unref();

// ---------- email marketing: promos to customers who said yes to emails, and an automatic "we miss you" ----------
const AUD_WHO = ['all', 'lapsed', 'new', 'regular', 'tier'];
function audienceOf(a = {}) {
  const seen = new Set();
  let rows = all("select c.id, c.name, c.email, c.branchId, count(o.id) n, max(o.paidAt) last from customers c left join orders o on o.customerId=c.id and o.status='paid' where c.consent=1 and c.email is not null and c.email<>'' group by c.id")
    .filter(c => { const e = String(c.email).toLowerCase(); if (!validEmail(e) || seen.has(e)) return false; seen.add(e); return true; });
  if (a.branchId) rows = rows.filter(c => c.branchId === a.branchId);
  const days = Math.max(7, Math.min(365, +a.days || 45));
  if (a.who === 'lapsed') rows = rows.filter(c => c.last && Date.now() - new Date(c.last) > days * 864e5);
  if (a.who === 'new') rows = rows.filter(c => !c.n);
  if (a.who === 'regular') rows = rows.filter(c => c.n >= 5);
  if (a.who === 'tier') rows = rows.filter(c => tierOf(c.n) === a.tier);
  return rows;
}
function promoEmail({ name, subject, body, btnText, btnUrl }) {
  const shop = shopName(), first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const fill = s => String(s || '').replaceAll('{name}', first).replaceAll('{shop}', shop);
  const subj = fill(subject).replace(/[\r\n]+/g, ' ').slice(0, 150), paras = fill(body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const url = /^https?:\/\/\S+$/.test(String(btnUrl || '').trim()) ? String(btnUrl).trim() : baseUrl() + '/member', label = String(btnText || '').trim() || 'Book now';
  const logo = curOrg() ? '' : `<img src="${baseUrl()}/bh-mark.png" width="44" height="44" alt="" style="display:block;margin:0 auto 10px">`;
  const html = `<!doctype html><html><body style="margin:0;background:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a0a0b;text-align:center;padding:26px 20px">${logo}<div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:4px;text-transform:uppercase">${esc2(shop)}</div></td></tr>
<tr><td style="height:4px;background:#1f7bff;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 26px">${paras.map(p => `<p style="line-height:1.6;margin:0 0 14px;font-size:15px">${esc2(p).replace(/\n/g, '<br>')}</p>`).join('')}
<p style="margin:22px 0 4px"><a href="${esc2(url)}" style="display:inline-block;background:#1f7bff;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px">${esc2(label)}</a></p></td></tr>
<tr><td style="padding:16px 26px 24px;color:#888;font-size:12px;border-top:1px solid #eee">You are getting this email because you agreed to receive news and promos from ${esc2(shop)}.<br><a href="{{UNSUB}}" style="color:#888">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${paras.join('\n\n')}\n\n${label}: ${url}\n\n---\nYou are getting this email because you agreed to receive news and promos from ${shop}.\nUnsubscribe: {{UNSUB}}`;
  return { subject: subj, html, text };
}
function queueMarketing(c, kind, msg, campaignId) {
  const m = promoEmail({ name: c.name, ...msg });
  run("insert into email_log(id,customerId,toAddr,kind,subject,html,text,status,attempts,error,createdAt,campaignId) values(?,?,?,?,?,?,?,'pending',0,'',?,?)", uid(), c.id, c.email, kind, m.subject, m.html, m.text, nowISO(), campaignId || '');
}
const WINBACK = { on: false, days: 45, subject: 'We miss you, {name}', body: 'Hi {name},\n\nIt has been a while since your last cut at {shop}. Your barber is ready when you are.\n\nBook your next visit in the app and skip the wait.', btnText: 'Book my cut' };
const winbackCfg = () => { try { return { ...WINBACK, ...JSON.parse(getSetting('winback') || '{}') }; } catch { return { ...WINBACK }; } };
// once an hour: customers whose last visit was N days ago get one "we miss you" email (once per absence, never twice for the same last visit)
function runWinback() {
  if (!mailReady()) return 0; let total = 0;
  for (const g of [null, ...activeOrgs()]) (g ? fn => inOrg(g, fn) : inMain)(() => {
    const cfg = winbackCfg(); if (!cfg.on) return;
    const now = Date.now(); let n = 0;
    for (const c of audienceOf({})) {
      if (n >= 100) break; if (!c.last) continue;
      const age = (now - new Date(c.last)) / 864e5; if (age < cfg.days || age > cfg.days + 60) continue;
      if (one("select 1 x from email_log where customerId=? and kind='winback' and createdAt>?", c.id, c.last)) continue;
      queueMarketing(c, 'winback', cfg, ''); n++;
    }
    total += n;
  });
  if (total) setTimeout(() => processEmails().catch(() => { }), 50);
  return total;
}
setInterval(() => { try { runWinback(); } catch { } }, 3600e3).unref();
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
const bookHits = new Map();
const reviewHits = new Map();
const recent = (map, ip) => { const now = Date.now(); return (map.get(ip) || []).filter(t => now - t < 3600e3); };
const hitRate = (map, ip) => { const a = recent(map, ip); a.push(Date.now()); map.set(ip, a); };
const reviewBlocked = ip => recent(reviewHits, ip).length >= (+process.env.REVIEW_LIMIT || 3);   // only successful posts count, so typos never use up the limit
const bookingBlocked = ip => recent(bookHits, ip).length >= (+process.env.BOOK_LIMIT || 10);
// one atomic step: everything inside either happens completely or not at all
function tx(fn) { db.exec('begin immediate'); try { const r = fn(); db.exec('commit'); return r; } catch (e) { try { db.exec('rollback'); } catch { } throw e; } }
// the booking rules (free times, making a booking, price snapshot, history) are in src/lib/booking.js
// booking messages (T20): one email per confirmed, cancelled or moved booking
const bookingMessage = createBookingMessages({ one, get, queueEmail, esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), shopName: () => SHOP });
const { bookingMins, slotsFor, bookingEvent, priceBooked, bookedSnap, createBooking, rescheduleBooking, bookingView } = createBookings({ uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, toMin, sum, all, one, run, get, priceItems, staffState, normPhone, getSetting, findCustomer, upsertCustomer, tx, bad, mvpOn, policyOf, onBooked: (kind, id) => bookingMessage(kind, id) });
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

// ---------- http ----------
// JSON answers, request bodies and static files are in src/lib/http.js
const serveStatic = staticServer(DIR);
const STATIC = { '/book': 'book.html', '/book.js': 'book.js', '/brotherhood': 'bh.html', '/member': 'bh.html', '/bh.js': 'bh.js', '/bh.webmanifest': 'bh.webmanifest', '/bh-icon-192.png': 'bh-icon-192.png', '/bh-icon-512.png': 'bh-icon-512.png', '/bh-apple-touch.png': 'bh-apple-touch.png', '/bh-mark.png': 'bh-mark.png', '/barbershop': 'landing.html', '/privacy': 'site/privacy.html', '/terms': 'site/terms.html', '/delete-account': 'site/delete-account.html', '/signup': 'site/signup.html', '/shop-terms': 'site/shop-terms.html', '/': 'home.html','/app.js': 'app.js', '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest', '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/logo.png': 'logo.png', '/logo-sm.png': 'logo-sm.png', '/membership-card.jpg': 'membership-card.jpg', '/apple-touch-icon.png': 'apple-touch-icon.png', '/update.js': 'update.js', '/inbox.js': 'inbox.js', '/backend': 'index.html', '/.well-known/assetlinks.json': 'assetlinks.json' };
const normHost = h => String(h || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '').replace(/^www\./, '');
const SITE_HOST = normHost(process.env.SITE_HOST), APP_HOST = normHost(process.env.APP_HOST), LANDING_HOST = normHost(process.env.LANDING_HOST);
// LANDING_HOST = a separate domain (e.g. brotherhoodbarberph.com) whose home page is the BrotherhoodBarber shop website. The public domain's home page is the Brotherhood product site, and the app is at /member.
const PUBLIC_PATHS = new Set(['/', '/book', '/book.js', '/brotherhood', '/member', '/bh.js', '/bh.webmanifest', '/bh-icon-192.png', '/bh-icon-512.png', '/bh-apple-touch.png', '/bh-mark.png', '/logo.png', '/logo-sm.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/unsubscribe', '/barbershop', '/privacy', '/terms', '/delete-account', '/signup', '/shop-terms', '/.well-known/assetlinks.json']);
// Security headers on every answer (T8). The Content-Security-Policy lets pages run only our own script files, the Leaflet map
// from unpkg, and the few inline scripts we wrote (allowed by their SHA-256 fingerprint, read from the HTML files at start-up).
// A script slipped into a name, a review or a message cannot run. Styles stay open to inline style attributes (used everywhere).
const INLINE_SCRIPT_HASHES = (() => { const out = new Set(); for (const f of ['.', 'site'].flatMap(d => { try { return fs.readdirSync(path.join(DIR, d)).filter(x => x.endsWith('.html')).map(x => path.join(d, x)); } catch { return []; } })) { try { for (const m of fs.readFileSync(path.join(DIR, f), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) out.add("'sha256-" + crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64') + "'"); } catch { } } return [...out]; })();   // browsers turn CRLF into LF before checking the fingerprint
const CSP = ["default-src 'self'", "script-src 'self' https://unpkg.com/leaflet@1.9.4/dist/leaflet.js " + INLINE_SCRIPT_HASHES.join(' '), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob: https:", "connect-src 'self'", "media-src 'self' blob:", "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');
const SECURITY_HEADERS = { 'Content-Security-Policy': CSP, 'Strict-Transport-Security': 'max-age=15552000', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
// App version = hash of every file the apps load. It changes on each deploy, which is what makes phones offer the "Update app" button.
const APP_VERSION = (() => { const h = crypto.createHash('sha1'); for (const f of Object.values(STATIC).filter((v, i, a) => a.indexOf(v) === i && v !== 'sw.js').sort()) { try { h.update(fs.readFileSync(path.join(DIR, f))); } catch { } } return h.digest('hex').slice(0, 12); })();
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
  if (!['owner', 'admin', 'manager', 'cashier', 'barber'].includes(role)) bad(400, 'Role must be owner, admin, manager, cashier or barber');
  const branchId = 'branchId' in b ? b.branchId : cur?.branchId, noPin = role === 'admin' || role === 'owner' || role === 'manager';
  if (!noPin && !get('branches', branchId)) bad(409, 'Cashiers and barbers need a branch');
  if (role === 'manager') {   // a manager runs one or more branches and logs in with a username and password
    if (b.pin || cur?.pinKey) bad(409, 'A manager logs in with a username and password, not a PIN');
    const ids = 'branchIds' in b ? b.branchIds : cur ? branchesOf(cur.id) : [];
    if (!Array.isArray(ids) || !ids.length || ids.some(x => typeof x !== 'string' || !get('branches', x))) bad(409, 'Pick the branches this manager runs');
    b.branchIds = [...new Set(ids)]; b.branchId = null;
  } else delete b.branchIds;
  if (role === 'owner') {   // an owner account opens everything, so it is protected by a real password only (decision D-23)
    if (pw && pw.length < 10) bad(409, 'An owner password must be at least 10 characters');
    if (b.pin || cur?.pinKey) bad(409, 'An owner account cannot have a PIN. Use a username and password.');
    b.branchId = null;
  }
  const username = 'username' in b ? String(b.username || '').trim().toLowerCase() : (cur?.username || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'owner') bad(409, 'Username: 3–30 letters/numbers (. _ - allowed), not "owner"');
  if (username === ownerUser()) bad(409, 'That username is used by the owner login (Railway password). Choose another one.');
  if (one('select id from users where username=? and id<>?', username, cur?.id || '')) bad(409, 'Username already taken');
  const pin = b.pin ? String(b.pin).trim() : '';
  if (pin) {
    if (!/^\d{6}$/.test(pin)) bad(409, 'PIN must be exactly 6 digits');
    if (one('select id from users where pinKey=? and id<>?', pinKeyOf(pin), cur?.id || '')) bad(409, 'That PIN is already used by someone else');
  }
  if (!noPin && !pin && !cur?.pinKey) bad(409, 'Set a 6-digit PIN for this user');
  if (noPin && !pw && !cur?.passHash) bad(409, 'Set a password for this ' + role);
  b.username = username;
}
// a new random PIN nobody else uses (shown once to whoever made it)
const newPin = () => { let pin; do { pin = String(100000 + crypto.randomInt(900000)); } while (one('select 1 x from users where pinKey=?', pinKeyOf(pin))); return pin; };
// after a user is saved: password, PIN, and a manager's branches (a user who is no longer a manager loses them)
const setPw = (id, b) => {
  if (b.password) run('update users set passHash=? where id=?', hashPw(String(b.password)), id);
  if (b.pin) run('update users set pinKey=? where id=?', pinKeyOf(String(b.pin).trim()), id);
  if (b.branchIds || get('users', id)?.role !== 'manager') run('delete from user_branches where userId=?', id);
  for (const br of b.branchIds || []) run('insert or ignore into user_branches(userId, branchId) values(?,?)', id, br);
};

// pick the database for this request: a partner shop's token (or, for logging in, its shop code) runs it in that shop's database
async function handle(req, res) {
  const tk = readToken(String(req.headers.authorization || '').replace(/^Bearer /, '')), pth = req.url.split('?')[0];
  let org = null;
  if (tk && tk.o) { org = orgRow(tk.o); if (!org) return send(res, 401, { error: 'Login required' }); }
  else if (!tk && pth === '/api/public/slots') { const o = ownerOf('branches', new URL(req.url, 'http://x').searchParams.get('branch')); if (o) org = o; }   // the customer app asks a partner shop for its free times
  else if (!tk && (pth === '/api/login' || pth === '/api/public/login-hint' || pth === '/api/device/people')) {
    const code = String(req.headers['x-org'] || '').trim().toLowerCase();
    if (code) { org = mainDb.prepare('select * from orgs where code=?').get(code); if (!org) return send(res, 404, { error: 'Shop code not found. Check the code and try again.' }); }
  }
  if (!org) return handleIn(req, res);
  if (!org.active) return send(res, 403, { error: 'This shop account is paused. Please contact Brotherhood.' });
  if (req.method !== 'GET' && pth !== '/api/login' && orgStatus(org).state === 'expired')
    return send(res, 402, { error: `Your Brotherhood ${org.paidUntil ? 'plan' : 'free trial'} has ended. Your data is safe and you can still view it. To add bookings and services again, renew your plan${contactEmail() ? ' (' + contactEmail() + ')' : ''}.` });
  return inOrg(org, () => handleIn(req, res));
}
async function handleIn(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname, method = req.method, q = Object.fromEntries(url.searchParams);
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  // Host-based routing (only when SITE_HOST / APP_HOST are set; otherwise every path works on every host, as in local dev and on the Railway URL).
  // SITE_HOST = public site: promo page + /book.  APP_HOST = staff domain: /backend + /pos.
  if (SITE_HOST || APP_HOST) {
    const host = normHost(req.headers['x-forwarded-host'] || req.headers.host), go = (h, to) => { res.writeHead(302, { Location: 'https://' + h + (to ?? req.url) }); return res.end(); };
    if (SITE_HOST && host === SITE_HOST) {
      const ok = PUBLIC_PATHS.has(p) || p.startsWith('/api/public/') || p.startsWith('/api/bh/') || p.startsWith('/b/') || /^\/img\/\w+$/.test(p) || p.startsWith('/site/');
      if (!ok) { if (APP_HOST && method === 'GET' && !p.startsWith('/api/')) return go(APP_HOST); return send(res, 404, { error: 'Not found' }); }
    } else if (APP_HOST && host === APP_HOST) {
      if (method === 'GET' && p === '/') { res.writeHead(302, { Location: '/backend' }); return res.end(); }
      if (SITE_HOST && method === 'GET' && (p === '/book' || p === '/book.js')) return go(SITE_HOST);
    }
  }
  if (method === 'GET' && (p === '/pos' || p === '/pos/')) { res.writeHead(302, { Location: '/member#/pro' }); return res.end(); }   // the POS was retired: everything it did is in the Brotherhood app
  if (method === 'GET' && p === '/backend/') { res.writeHead(302, { Location: '/backend' }); return res.end(); }
  if (method === 'GET' && p === '/sw.js') { res.writeHead(200, { 'Content-Type': MIME.js, 'Cache-Control': 'no-cache' }); return res.end(`const VERSION=${JSON.stringify(APP_VERSION)};\n` + fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8')); }
  if (method === 'GET' && p === '/api/version') return send(res, 200, { version: APP_VERSION });
  { const bm = p.match(/^\/b\/(\w{1,30})$/); if (method === 'GET' && bm) { res.writeHead(302, { Location: '/member#/barber/' + bm[1] }); return res.end(); } }   // a barber's personal booking link
  if (method === 'GET' && p === '/') {
    const hostNow = normHost(req.headers['x-forwarded-host'] || req.headers.host);
    if (LANDING_HOST && hostNow === LANDING_HOST) return serveStatic(req, res, 'landing.html');
  }
  if (method === 'GET' && p === '/' && /^\/[\w\-\/]*$/.test(process.env.ROOT_REDIRECT || '')) { res.writeHead(302, { Location: process.env.ROOT_REDIRECT }); return res.end(); }   // e.g. ROOT_REDIRECT=/brotherhood so a partner shop's home page is the app, not Brotherhood's promo page
  if (method === 'GET' && p === '/signup' && !SIGNUPS_OPEN) return serveStatic(req, res, 'site/signup-closed.html');
  if (method === 'GET' && STATIC[p]) return serveStatic(req, res, STATIC[p]);
  const sm0 = p.match(/^\/site\/([\w-]+\.(?:jpg|png))$/);   // promo-site photos (shop, barbers, storefront)
  if (sm0 && method === 'GET') { if (!fs.existsSync(path.join(DIR, 'site', sm0[1]))) return send(res, 404, { error: 'Not found' }); return serveStatic(req, res, 'site/' + sm0[1]); }
  const im = p.match(/^\/img\/(\w+)$/);
  if (im && method === 'GET') {
    let r = one('select mime,data from images where id=?', im[1]);
    if (!r && !curOrg()) for (const o of activeOrgs()) { r = orgDb(o.id).prepare('select mime,data from images where id=?').get(im[1]); if (r) break; }
    if (!r) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    return res.end(Buffer.from(r.data));
  }
  if (p === '/unsubscribe' && method === 'GET') {
    const og = q.o ? orgRow(String(q.o)) : null, inIt = fn => og ? inOrg(og, fn) : fn();
    const c = inIt(() => q.c ? get('customers', String(q.c)) : null), ok = !!c && String(q.t || '') === unsubSig(c.id);
    if (ok) inIt(() => { run('update customers set consent=0 where id=?', c.id); log({ name: 'Customer' }, 'unsubscribe', 'customers', c.id, c.name); });
    const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brotherhood Barber</title><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f6;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 8px 30px -14px rgba(0,0,0,.3)"><div style="font-size:24px;font-weight:700;letter-spacing:3px">BROTHERHOOD</div><p style="margin:18px 0 6px;font-size:18px"><b>${ok ? 'You are unsubscribed.' : 'This link is not valid.'}</b></p><p style="color:#666;margin:0">${ok ? 'You will no longer receive emails and promos from us. Your points and visits are kept.' : 'Please tell our cashier if you want to stop receiving emails.'}</p></div></body>`;
    return send(res, ok ? 200 : 400, page, 'text/html; charset=utf-8');
  }
  if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  { const r = await PUBLIC_ROUTES({ req, res, p, method, q, ip }); if (r !== NEXT) return r; }   // src/routes/public.js
  if (p.startsWith('/api/bh/')) return BH(req, res, p, method, q, ip);
  if (p === '/api/public/login-hint' && method === 'GET') return send(res, 200, { ownerNamed: !!ownerUser() });
  if (p === '/api/device/people' && method === 'GET') {   // only names, for the "pick your name" screen of a set-up phone
    const d = deviceOf(req); if (!d) return send(res, 401, { error: 'This phone is not set up for PIN login. Ask the owner.' });
    run('update devices set lastUsedAt=? where id=?', nowISO(), d.id);
    return send(res, 200, { branch: { id: d.branchId, name: get('branches', d.branchId)?.name || '' }, device: d.name,
      people: all("select id, name, role from users where active=1 and branchId=? and role in ('cashier','barber') and pinKey is not null and pinKey<>'' order by name", d.branchId) });
  }
  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req);
    await new Promise(r => setTimeout(r, failDelay(ip)));
    const uname = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
    let tok = null, who = '', railwayOwner = false;
    const pin = String(b.pin || '').trim();
    if (uname.length > 64) return send(res, 401, { error: 'Wrong username or password' });
    if (b.userId) {   // picked a name on a set-up phone, then typed the PIN. Nothing waits from the checks to the answer.
      const d = deviceOf(req); if (!d) return send(res, 401, { error: 'This phone is not set up for PIN login. Ask the owner.' });
      // only staff of this phone's branch count: a phone cannot pause (or name) someone of another branch
      const shopKey = curOrg()?.id || 'main', found = one('select * from users where id=? and active=1', String(b.userId));
      const u = found && found.branchId === d.branchId && ['cashier', 'barber'].includes(found.role) ? found : null, personKey = shopKey + ':person:' + (u?.id || '-');
      { const w = Math.max(u ? personPin.lockedFor(personKey) : 0, devicePin.lockedFor(d.id));
        if (w) return send(res, 429, { error: u && personPin.lockedFor(personKey) ? `Too many wrong PINs for ${u.name}. Their PIN login is paused for ${waitText(w)}. Ask the owner if this keeps happening.` : `Too many wrong PINs on this phone. Please wait ${waitText(w)}.` }); }
      const good = u && u.pinKey && /^\d{6}$/.test(pin) && sameKey(pinKeyOf(pin), u.pinKey);
      if (!good) {
        devicePin.fail(d.id);
        const locked = u ? personPin.fail(personKey) : 0;
        if (locked) log({ name: u.name }, 'pin-login-paused', 'auth', u.id, `too many wrong PINs, ${waitText(locked)} (phone: ${d.name})`);
        log({ name: found?.name || 'unknown person' }, 'login-failed', 'auth', found?.id || '', 'name + PIN, phone: ' + d.name + (found && !u ? ' (not staff of this branch)' : ''));
        return send(res, 401, { error: 'Wrong PIN' });
      }
      personPinShort.clear(personKey); run('update devices set lastUsedAt=? where id=?', nowISO(), d.id);
      log({ name: u.name }, 'login', 'auth', u.id, 'name + PIN, phone: ' + d.name);
      return send(res, 200, { token: makeToken(u.id, u.pinKey.slice(-8), curOrg()?.id, SHIFT_DAYS) });   // a shared phone: one shift, then log in again
    }
    if (pin && getSetting('pinOnly') === '0') return send(res, 403, { error: 'Log in with a PIN alone is turned off. Pick your name first, on a phone set up for your branch.' });   // no real username is this long: refused without being counted or remembered
    // from here to the answer nothing waits, so many requests sent at once are still counted one by one
    const shopKey = curOrg()?.id || 'main', lockKey = pin ? shopKey : shopKey + ':' + (uname || 'owner'), limiter = pin ? pinLimiter : userLimiter;
    { const w = limiter.lockedFor(lockKey);
      if (w) return send(res, 429, { error: pin ? `Too many wrong PINs. PIN login is paused for ${waitText(w)}. Please wait, or log in with a username and password.` : `Too many wrong tries. Please wait ${waitText(w)} and try again.` }); }
    if (pin) {
      const u = /^\d{6}$/.test(pin) ? one('select * from users where pinKey=? and active=1', pinKeyOf(pin)) : null;
      if (u) { tok = makeToken(u.id, u.pinKey.slice(-8), curOrg()?.id); who = u.name; }
    }
    else if (curOrg() ? (uname === curOrg().ownerUser && checkPw(pw, curOrg().ownerHash)) : ((ownerUser() ? uname === ownerUser() : (!uname || uname === 'owner')) && crypto.timingSafeEqual(sha(pw), sha(PASS)))) { tok = makeToken('owner', curOrg() ? String(curOrg().ownerHash).slice(-8) : RAILWAY_OWNER_V, curOrg()?.id); who = 'Owner'; railwayOwner = !curOrg(); }
    else if (uname) {
      const u = one('select * from users where username=? and active=1', uname);
      if (u?.passHash && checkPw(pw, u.passHash)) { tok = makeToken(u.id, u.passHash.slice(-8), curOrg()?.id); who = u.name; }
    }
    if (!tok) {
      const locked = limiter.fail(lockKey);
      if (locked) log({ name: pin ? 'PIN login' : uname || 'owner' }, pin ? 'pin-login-paused' : 'login-locked', 'auth', '', `too many wrong tries, ${waitText(locked)} (last from ${ip})`);
    }
    else if (!pin) userLimiter.clear(lockKey);
    if (!tok) { noteFail(ip); log({ name: uname || 'owner' }, 'login-failed', 'auth', '', ip); return send(res, 401, { error: pin ? 'Wrong PIN' : 'Wrong username or password' }); }
    const emergency = railwayOwner && one("select 1 x from users where role='owner' and active=1");
    fails.delete(ip); log({ name: who }, emergency ? 'emergency-login' : 'login', 'auth', '', emergency ? `Railway ADMIN_PASSWORD used (${ip})` : ip);
    return send(res, 200, { token: tok });
  }

  const me = whoami(req);
  if (!me) return send(res, 401, { error: 'Login required' });
  const admin = isAdmin(me);
  const adminOnly = () => { if (!admin) bad(403, 'Not allowed for your role'); };
  // approvals and pay for one branch: owner and admins, or a manager of that branch (T7b)
  // A manager never approves or pays their own items: not what they filed, and not the barber profile their login is linked to.
  const myStaffId = isManager(me) ? (get('users', me.id)?.staffId || '') : '';
  const manageIn = (branchId, rec) => {
    if (!(admin || (isManager(me) && inScope(me, branchId)))) bad(403, 'Not allowed for your role');
    if (isManager(me) && rec && (rec.submittedById === me.id || rec.requestedById === me.id || (myStaffId && rec.staffId === myStaffId))) bad(403, 'You cannot approve or change your own request or pay. Ask the owner or an admin.');
  };
  if (!admin) {   // role permissions: which POS sections this role may open (set by the owner in Settings → Access)
    const mod = (() => {
      if (/^\/api\/pos\/dashboard$/.test(p)) return 'dashboard';
      if (/^\/api\/pos\/queue$/.test(p)) return ['queue', 'pos'];
      if (/^\/api\/pos\/(shift|zreadings)$|^\/api\/shifts\//.test(p)) return 'reading';
      if (p === '/api/attendance' && method === 'POST' && me.role === 'barber') return null;   // a barber clocks himself in from the app (checked below: only himself)
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
      if (p === '/api/files' && method === 'POST') return null;   // any staff may attach a photo (selfie, receipt, problem, checklist); it stays private to the shop
      if (/^\/api\/files/.test(p)) return ['remittance', 'expenses', 'pos'];
      if (/^\/api\/orders\/\w+\/(pay|void)$/.test(p)) return 'pos';
      if (/^\/api\/orders\/\w+$/.test(p) && method === 'PUT') return ['pos', 'queue'];
      if (p === '/api/cash') return ['expenses', 'reading'];
      if (/^\/api\/customers/.test(p)) return ['pos', 'customers'];
      return null;
    })();
    if (mod) needAny(me, mod);
  }

  // ----- service log for the Brotherhood app (takes over from the POS): walk-ins, start, finish, cancel -----
  // Tracking only. The app never issues a receipt, an invoice number or a shift reading; the shop issues its own BIR invoice and may note its number here.
  if (p.startsWith('/api/svc/')) return SERVICE_RECORDS({ req, res, p, method, q, me });   // src/routes/service-records.js

  { const r = await DEVICES({ req, res, p, method, me, adminOnly }); if (r !== NEXT) return r; }   // src/routes/devices.js
  { const r = await SCHEDULES({ req, res, p, q, method, me, manageIn }); if (r !== NEXT) return r; }   // src/routes/schedules.js
  { const r = await MANAGEMENT({ req, res, p, method, q, me, admin, adminOnly, manageIn }); if (r !== NEXT) return r; }   // src/routes/management.js
  { const r = await PARTNER_SHOPS({ req, res, p, method, me }); if (r !== NEXT) return r; }   // src/routes/partner-shops.js
  { const r = await MARKETING({ req, res, p, method, me, adminOnly }); if (r !== NEXT) return r; }   // src/routes/marketing.js
  { const r = await STAFF_TOOLS({ req, res, p, method, q, me, admin, adminOnly, manageIn }); if (r !== NEXT) return r; }   // src/routes/staff-tools.js
  { const r = await OPERATIONS({ req, res, url, p, method, q, me, admin, adminOnly, manageIn }); if (r !== NEXT) return r; }   // src/routes/operations.js
  { const r = await BACK_OFFICE_DATA({ req, res, p, method, me, admin, adminOnly }); if (r !== NEXT) return r; }   // src/routes/back-office-data.js
  // ----- end of routes -----
}

// the reports and their CSV export are in src/lib/reports.js
const { REPORTS, csv } = createReports({ dOf, todayStr, r2, sum, all, one, get, commissionOf, zData, dayRows, cashierName, paidOrders, movesIn, stamp, planDeductions, adjTotal, scoreData });
const SERVICE_RECORDS = createServiceRoutes({ uid, todayStr, nowISO, r2, jp, sum, all, one, run, get, parseOrder, staffState, log, isAdmin, isBranchUser, isManager, inScope, branchOrAll, MODULES, modulesFor, branchScope, dayLocked, priceItems, idNeeded, ID_TYPES, attachIdPhoto, totals, promoteNext, checkAssign, getSetting, resolveCustomer, createTicket, priceBooked, bookedSnap, bad, send, readBody });
const SCHEDULES = createScheduleRoutes({ all, run, get, log, tx, bad, send, readBody });
const DEVICES = createDeviceRoutes({ uid, nowISO, all, one, run, get, log, curOrg, makeToken, bad, send, readBody });
const MANAGEMENT = createManagementRoutes({ SECRET_WARNINGS, PASS, ownerUser, mainDb, curOrg, db, shopName, uid, todayStr, nowISO, r2, sum, all, one, run, get, insert, update, strip, pinKeyOf, log, BK_DIR, backup, isAdmin, isBranchUser, isManager, inScope, branchOrAll, mvpBranches, setMvpBranches, savedOf, setPolicy, MODULES, permsAll, modulesFor, normPhone, normEmail, validEmail, tierOf, getSetting, setSetting, getTerms, EMAIL, orgInfo, baseUrl, rememberOrigin, custCard, findCustomer, upsertCustomer, editCustomer, G_KEY, payRules, mailProvider, mailReady, mailFrom, makeToken, hashPw, checkPw, sha, bad, send, readBody });
const MARKETING = createMarketingRoutes({ curOrg, uid, nowISO, all, one, run, insert, log, normEmail, validEmail, TIERS, setSetting, NO_MAIL, mailCount, baseUrl, welcomeEmail, processEmails, AUD_WHO, audienceOf, promoEmail, queueMarketing, winbackCfg, runWinback, mailProvider, mailReady, MAIL_LIMIT, mailFrom, sendEmail, bad, send, readBody });
const PARTNER_SHOPS = createPartnerShopRoutes({ ownerUser, mainDb, curOrg, BAD_ORGS, orgRow, orgList, inOrg, uid, dOf, todayStr, nowISO, r2, sum, all, one, run, get, insert, update, log, normEmail, validEmail, mainSet, TRIAL_DAYS, PLAN_IDS, plansNow, payInfo, addMonthsStr, orgStatus, SIGNUPS_OPEN, esc2, sendEmail, makeToken, hashPw, bad, send, readBody });
// T16: guest holds that ran out are marked expired once a minute. Their time is already free (availability checks holdUntil);
// this only keeps the booking lists and history tidy.
function sweepHolds() {
  const f = () => {
    for (const b of all("select id from bookings where status='pending' and holdUntil<?", nowISO())) {
      run('update email_codes set guest=null, codeHash=null where bookingId=?', b.id);
      if (Number(run("update bookings set status='expired' where id=? and status='pending'", b.id).changes) === 1) bookingEvent(b.id, 'pending', 'expired', 'System', 'the 10 minutes ran out');
    }
    // unconfirmed holds are not kept: code rows after a day, expired holds (a name and phone nobody confirmed) after 7 days
    run('delete from email_codes where createdAt<?', new Date(Date.now() - 864e5).toISOString());
    const old = new Date(Date.now() - 7 * 864e5).toISOString();
    run("delete from booking_events where bookingId in (select id from bookings where status='expired' and holdUntil<?)", old);
    run("delete from bookings where status='expired' and holdUntil<?", old);
  };
  try { inMain(f); for (const o of activeOrgs()) inOrg(o, f); } catch (e) { console.error('hold sweep failed:', e.message); }
}
setInterval(sweepHolds, 60e3).unref();
const PUBLIC_ROUTES = createPublicRoutes({ bookingMessage, mvpOn, policyOf, mailReady, findCustomer, upsertCustomer, bookingEvent, bookingView, ownerUser, SHOP, mainDb, curOrg, orgRow, inOrg, inMain, shopName, uid, todayStr, nowISO, all, one, run, get, insert, log, siteSvc, siteCover, normPhone, normEmail, validEmail, getTerms, TRIAL_DAYS, plansNow, contactEmail, addDaysStr, signupHits, SIGNUPS_OPEN, STARTER, KIND_LABEL, baseUrl, esc2, gInfo, googleData, bookHits, reviewHits, recent, hitRate, reviewBlocked, bookingBlocked, shopWelcomeEmail, sendEmail, makeToken, bookingMins, slotsFor, createBooking, hashPw, bad, send, readBody });
const STAFF_TOOLS = createStaffToolRoutes({ db, uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, sum, all, one, run, get, clean, insert, update, log, isAdmin, isBranchUser, isManager, inScope, branchOrAll, branchScope, openShift, ID_TYPES, getSetting, setSetting, payRules, dayRows, planDeductions, adjTotal, scoreData, encBuf, decBuf, REPORTS, csv, bad, send, readBody });
const BACK_OFFICE_DATA = createBackOfficeDataRoutes({ nowISO, one, run, get, insert, update, strip, log, isBranchUser, isManager, inScope, branchOrAll, newPin, REFS, SOFT, CRUD, checkUser, setPw, bad, send, readBody });
const BH = mountBH({ bookingMessage, rescheduleBooking, inOrg, inMain, activeOrgs, ownerOf, db, all, one, run, get, uid, nowISO, todayStr, send, readBody, bad, hashPw, checkPw, makeToken, readToken, createBooking, bookingView, bookingEvent, idemKeyOf, slotsFor, whoami, log, normEmail, validEmail, normPhone, jp, upsertCustomer, siteCover, siteSvc, siteGallery, staffState, tierOf, nextTier, shopName: SHOP, getSetting, setSetting, queueEmail, emailReady: () => !!EMAIL.key, baseUrl, esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), addCol, toMin, scoreData, serviceNet, parseOrder, dOf });
// created after BH because the bookings routes notify app customers through it
const OPERATIONS = createOperationsRoutes({ bookingMessage, rescheduleBooking, db, uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, toMin, sum, all, one, run, get, parseOrder, insert, update, log, isBranchUser, isManager, inScope, branchOrAll, modulesFor, needAny, branchScope, dayLocked, openTickets, openShift, priceItems, idNeeded, attachIdPhoto, totals, onDuty, staffState, promoteNext, checkAssign, zData, getSetting, withCust, findCustomer, upsertCustomer, resolveCustomer, createTicket, dayRows, cashierName, planDeductions, adjTotal, BH, bookingEvent, priceBooked, bookedSnap, createBooking, bookingView, REPORTS, csv, snapOf, bad, send, readBody });

{ const ran = migrate(mainDb); if (ran.length) console.log('migrations applied:', ran.join(', ')); }   // numbered files in src/db/migrations, once per database
schemaReady = true; ORG_DBS.clear();
for (const o of orgList()) { try { orgDb(o.id); } catch { } }   // partner shops are migrated at startup too, not on their first request
http.createServer(async (req, res) => {
  noteGzip(req, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try { await handle(req, res); }
  catch (e) { if (!res.headersSent) send(res, e instanceof HttpError ? e.code : 400, { error: e.message }); }
}).listen(PORT, process.env.HOST || undefined, () => console.log(`${SHOP} running → http://localhost:${PORT}`));
