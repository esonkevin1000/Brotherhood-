// Staff tools: ID photos and evidence photos, expenses with receipts, release pay, problem reports, the inbox,
// daily checklists, leave, bonuses, payslips, a person's own performance, and the owner's notifications.
// Created once by server.js; the handler gets the request and the logged-in person on each call.
import { NEXT } from '../lib/http.js';

export function createStaffToolRoutes({ db, uid, dOf, todayStr, nowISO, r2, jp, minsOfDay, sum, all, one, run, get, clean, insert, update, log, isAdmin, isBranchUser, isManager, inScope, branchOrAll, branchScope, openShift, ID_TYPES, getSetting, setSetting, payRules, dayRows, planDeductions, adjTotal, scoreData, encBuf, decBuf, REPORTS, csv, bad, send, readBody }) {
  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, q, me, admin, adminOnly, manageIn }) {
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
      const ph = get('id_photos', idm[1]); if (!ph || !inScope(me, ph.branchId)) bad(404, 'Not found');
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
      const f = get('files', flm[1]); if (!f || (f.kind !== 'chat' && !inScope(me, f.branchId))) bad(404, 'Not found');
      res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(f.enc ? decBuf(f.data) : f.data);
    }
    // ----- expenses with receipts -----
    const EXP_CATS = ['Supplies', 'Utilities', 'Repairs & Maintenance', 'Food & Meals', 'Transportation', 'Marketing', 'Equipment', 'Staff Welfare', 'Other'], PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card', 'Other'];
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const expView = x => ({ ...x, receipts: jp(x.receipts), history: jp(x.history), branchName: get('branches', x.branchId)?.name || '', noReceipt: !jp(x.receipts).length });
    if (p === '/api/expense-claims/options' && method === 'GET') return send(res, 200, { categories: EXP_CATS, methods: PAY_METHODS });
    if (p === '/api/expense-claims' && method === 'GET') {
      const t0 = todayStr(), rg = q.range === 'month' ? [t0.slice(0, 8) + '01', t0] : q.range === 'all' ? ['2000-01-01', '2099-12-31'] : q.range === 'today' ? [t0, t0] : [DATE_RE.test(q.from || '') ? q.from : '2000-01-01', DATE_RE.test(q.to || '') ? q.to : '2099-12-31'];
      const br = branchOrAll(me, q.branch), st = ['PENDING', 'APPROVED', 'REJECTED'].includes(q.status) ? q.status : null, cat = EXP_CATS.includes(q.category) ? q.category : null, term = String(q.q || '').toLowerCase();
      let rows = all(`select * from expense_claims where date>=? and date<=?${br ? ' and branchId=?' : ''}${st ? ' and status=?' : ''}${cat ? ' and category=?' : ''} order by date desc, createdAt desc limit 1000`, rg[0], rg[1], ...(br ? [br] : []), ...(st ? [st] : []), ...(cat ? [cat] : [])).map(expView);
      if (term) rows = rows.filter(x => (x.description + ' ' + x.category + ' ' + x.submittedBy).toLowerCase().includes(term));
      const live = rows.filter(x => x.status !== 'REJECTED'), byCategory = {}; for (const x of live) byCategory[x.category] = r2((byCategory[x.category] || 0) + x.amount);
      const out = { rows, total: r2(sum(live, x => x.amount)), count: rows.length, noReceipt: rows.filter(x => x.noReceipt).length, byCategory, today: r2(sum(all("select amount from expense_claims where date=? and status<>'REJECTED'" + (br ? ' and branchId=?' : ''), t0, ...(br ? [br] : [])), x => x.amount)) };
      if (q.format === 'csv') {
        if (!isManager(me)) adminOnly(); const qt = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
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
      if (sh || (method2 === 'Cash' && date === todayStr())) { cm = uid(); run('insert into cash_moves(id,shiftId,branchId,date,kind,amount,note,staffId,ts,by) values(?,?,?,?,?,?,?,?,?,?)', cm, sh ? sh.id : '', branchId, date, 'expense', amount, (category + ': ' + description).slice(0, 200), '', nowISO(), me.name); }
      run('insert into expense_claims(id,branchId,date,category,description,amount,method,receipts,noReceiptReason,status,submittedById,submittedBy,staffId,createdAt,cashMoveId,history) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, branchId, date, category, description, amount, method2, JSON.stringify(receipts), receipts.length ? '' : reason, 'PENDING', me.id, me.name, '', nowISO(), cm, JSON.stringify([{ at: nowISO(), by: me.name, action: 'SUBMITTED', note: receipts.length ? '' : 'NO RECEIPT: ' + reason }]));
      log(me, 'expense', 'expense_claims', id, `${category} ${amount} ${method2}${receipts.length ? '' : ' NO RECEIPT'}`); return send(res, 201, expView(get('expense_claims', id)));
    }
    const exm = p.match(/^\/api\/expense-claims\/(\w+)\/review$/);
    if (exm && method === 'PUT') {
      const x = get('expense_claims', exm[1]); if (!x) bad(404, 'Not found'); manageIn(x.branchId, x);
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
      const s = get('staff', String(q.staffId || '')); if (!s || !inScope(me, s.branchId)) bad(404, 'Employee not found');
      return send(res, 200, { staffId: s.id, name: s.name, ...staffBalance(s.id) });
    }
    if (p === '/api/advances' && method === 'GET') {
      const br = branchOrAll(me, q.branch), st = ['REQUESTED', 'APPROVED', 'RELEASED', 'REJECTED', 'CANCELLED'].includes(q.status) ? q.status : null;
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
      const a = get('advances', avm[1]); if (!a) bad(404, 'Not found'); manageIn(a.branchId, a); const b = await readBody(req), note = String(b.note || '').trim().slice(0, 300), hist = jp(a.history), act = avm[2];
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
      const br = branchOrAll(me, q.branch), st = PROB_FLOW.includes(q.status) ? q.status : null;
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
      const x = get('problems', pbm[1]); if (!x || !inScope(me, x.branchId)) bad(404, 'Not found'); const b = await readBody(req), n = nowISO();
      if (pbm[2] === 'comment') {
        const text = String(b.text || '').trim().slice(0, 600); if (!text) bad(400, 'Write a comment'); const cs = jp(x.comments); cs.push({ at: n, by: me.name, text });
        run('update problems set comments=?, updatedAt=? where id=?', JSON.stringify(cs), n, x.id);
      } else {
        manageIn(x.branchId);
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
    const chanOk = c => c.kind === 'all' || (c.kind === 'branch' && inScope(me, c.branchId)) || (['dm', 'group'].includes(c.kind) && jp(c.members).includes(meId));
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
      const us = all('select id,name,role,branchId from users where active=1').filter(u => u.id !== meId && (isOwnerOrAdmin || u.role === 'admin' || inScope(me, u.branchId))).map(u => ({ id: u.id, name: u.name, role: u.role, branch: get('branches', u.branchId || '')?.name || '' }));
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
      if (!isManager(me)) adminOnly(); const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : todayStr(), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : todayStr(), br = branchOrAll(me, q.branch);
      const rows = all(`select * from checklist_runs where date>=? and date<=?${br ? ' and branchId=?' : ''} order by date desc, createdAt desc limit 500`, from, to, ...(br ? [br] : [])).map(r => { const items = jp(r.items); return { ...r, items, branchName: get('branches', r.branchId)?.name || '', done: items.filter(i => i.done).length, total: items.length }; });
      const missing = []; const end = to < todayStr() ? to : todayStr();
      for (let d = new Date(from + 'T00:00'), n = 0; dOf(d) <= end && n < 31; d.setDate(d.getDate() + 1), n++) for (const b2 of all('select * from branches').filter(b => !br || b.id === br)) for (const k of ['opening', 'closing']) if (!rows.some(r => r.branchId === b2.id && r.date === dOf(d) && r.kind === k) && !(dOf(d) === todayStr() && k === 'closing')) missing.push({ date: dOf(d), branchName: b2.name, kind: k });
      return send(res, 200, { rows, missing });
    }
    // ----- leave requests -----
    const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Other'];
    const leaveView = l => ({ ...l, branchName: get('branches', l.branchId)?.name || '', staffName: get('staff', l.staffId)?.name || '' });
    if (p === '/api/leaves' && method === 'GET') {
      const br = branchOrAll(me, q.branch), st = ['PENDING', 'APPROVED', 'REJECTED'].includes(q.status) ? q.status : null;
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
      const l = get('leaves', lvm[1]); if (!l) bad(404, 'Not found'); manageIn(l.branchId, l); const b = await readBody(req), act = { approve: 'APPROVED', reject: 'REJECTED' }[b.action], note = String(b.note || '').trim().slice(0, 300);
      if (!act) bad(400, 'Choose approve or reject'); if (act === 'REJECTED' && !note) bad(400, 'A note is required to reject leave');
      run('update leaves set status=?, reviewedBy=?, reviewedAt=?, reviewNote=? where id=?', act, me.name, nowISO(), note, l.id); log(me, 'leave-' + b.action, 'leaves', l.id, note); return send(res, 200, leaveView(get('leaves', l.id)));
    }
    // ----- barber scorecard and cash accountability are in REPORTS -----
    // ----- bonuses / incentives / other earnings (owner only; they appear on the next payslip) -----
    const ADJ_KINDS = ['Bonus', 'Incentive', 'Other earning'];
    if (p === '/api/adjustments' && method === 'GET') { if (!isManager(me)) adminOnly(); const rows = all(`select a.*, s.name staffName from staff_adjustments a join staff s on s.id=a.staffId${q.staffId ? ' where a.staffId=?' : ''} order by a.date desc, a.createdAt desc limit 300`, ...(q.staffId ? [String(q.staffId)] : [])).filter(a => inScope(me, a.branchId)); return send(res, 200, { rows }); }
    if (p === '/api/adjustments' && method === 'POST') {
      const b = await readBody(req), s = get('staff', String(b.staffId || '')); if (!s) bad(400, 'Choose the employee'); manageIn(s.branchId, { staffId: s.id });
      const kind = ADJ_KINDS.includes(b.kind) ? b.kind : bad(400, 'Choose Bonus, Incentive or Other earning'), amount = r2(b.amount); if (!(amount > 0)) bad(400, 'Enter the amount');
      const note = String(b.note || '').trim().slice(0, 200); if (note.length < 3) bad(400, 'Enter a short note (what is it for?)'); const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : todayStr(), id = uid();
      run('insert into staff_adjustments(id,staffId,branchId,date,kind,amount,note,byName,createdAt) values(?,?,?,?,?,?,?,?,?)', id, s.id, s.branchId, date, kind, amount, note, me.name, nowISO()); log(me, 'adjustment', 'staff_adjustments', id, `${s.name} ${kind} ${amount}`); return send(res, 201, get('staff_adjustments', id));
    }
    const adm = p.match(/^\/api\/adjustments\/(\w+)$/);
    if (adm && method === 'DELETE') { const a = get('staff_adjustments', adm[1]); if (!a) bad(404, 'Not found'); manageIn(a.branchId, a); if (a.payrollDate) bad(409, 'This was already paid in payroll and cannot be removed'); run('delete from staff_adjustments where id=?', a.id); log(me, 'adjustment-removed', 'staff_adjustments', a.id, `${a.kind} ${a.amount}`); return send(res, 200, { ok: true }); }
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
    if (p === '/api/payslips' && method === 'GET') { if (!isManager(me)) adminOnly(); return send(res, 200, { rows: payslipRows(/^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '2000-01-01', /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '2099-12-31', branchOrAll(me, q.branch), null) }); }
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
    return NEXT;
  };
}
