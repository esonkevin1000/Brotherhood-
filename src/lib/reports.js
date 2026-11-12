// Back-office reports (dashboard, finished services, commissions, payroll, attendance, payment methods, discounts, cash,
// scorecard, accountability, old POS readings) and their CSV export. Created once by server.js with the helpers they read from.
export function createReports({ dOf, todayStr, r2, sum, all, one, get, commissionOf, zData, dayRows, cashierName, paidOrders, movesIn, stamp, planDeductions, adjTotal, scoreData }) {
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
          title: 'Finished services', cols: [['Visit'], ['Date / Time'], ['Branch'], ['Customer'], ['Barber'], ['Items'], ['Discount', 'peso'], ['Total', 'peso'], ['Paid with']],
          rows: os.map(o => ['#' + o.no + ' · ' + o.date, stamp(o.paidAt), o.branchName, o.customerName, o.barberName, o.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), o.discountAmt, o.total, o.tenders.map(t => t.method).join('+')])
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
          { title: 'Discounted visits', cols: [['Visit'], ['Date / Time'], ['Branch'], ['Discount'], ['Customer'], ['Gross', 'peso'], ['Discount', 'peso'], ['Net', 'peso'], ['ID photo', 'idlink']],
            rows: os.map(o => ['#' + o.no + ' · ' + o.date, stamp(o.paidAt), o.branchName, o.discountName, o.customerName, o.subtotal, o.discountAmt, o.total, o.idPhoto ? o.idType + '~' + o.idPhoto : '']) },
          { title: 'Buddy / ID discount visits (with ID photo on file)', cols: [['Visit'], ['Date / Time'], ['Branch'], ['Customer'], ['Service'], ['Cashier'], ['ID photo', 'idlink']],
            rows: all_.filter(o => o.idPhoto || o.items.some(i => i.needId)).map(o => ['#' + o.no + ' · ' + o.date, stamp(o.paidAt), o.branchName, o.customerName, o.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), cashierName(o.cashierId), o.idPhoto ? o.idType + '~' + o.idPhoto : 'MISSING']) }]
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
  return { REPORTS, csv };
}
