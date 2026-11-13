// Public routes (no login): terms, plans and shop sign-up, Google reviews, branch info, free times, reviews, online booking.
// Created once by server.js; the handler gets the request on each call.
import crypto from 'node:crypto';
import { NEXT } from '../lib/http.js';
import { createLimiter } from '../lib/throttle.js';

export function createPublicRoutes({ mvpOn, mailReady, findCustomer, upsertCustomer, bookingEvent, bookingView, ownerUser, SHOP, mainDb, curOrg, orgRow, inOrg, inMain, shopName, uid, todayStr, nowISO, all, one, run, get, insert, log, siteSvc, siteCover, normPhone, normEmail, validEmail, getTerms, TRIAL_DAYS, plansNow, contactEmail, addDaysStr, signupHits, SIGNUPS_OPEN, STARTER, KIND_LABEL, baseUrl, esc2, gInfo, googleData, bookHits, reviewHits, recent, hitRate, reviewBlocked, bookingBlocked, shopWelcomeEmail, sendEmail, makeToken, bookingMins, slotsFor, createBooking, hashPw, bad, send, readBody }) {
  // ----- guest booking confirmed by an email code (T16, D-5, D-14), only in branches on the new booking system -----
  const TRIES = 5, SENDS = 3, PER_EMAIL = 5, RESEND_WAIT = 60e3;
  // per branch, whatever the address or device: open holds at one time, and code emails a day (keeps the shop's email quota and the day's times safe from fake emails)
  const LIVE_MAX = +process.env.HOLD_LIVE_MAX || 15, EMAILS_DAY = +process.env.HOLD_EMAILS_DAY || 120;
  const BUSY = 'Online booking is very busy right now. Please try again later, call the shop, or walk in.';
  const emailsToday = branchId => one('select coalesce(sum(e.sends),0) n from email_codes e join bookings b on b.id=e.bookingId where b.branchId=? and e.createdAt>?', branchId, new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).n;
  const codeHash = (hold, code) => crypto.createHash('sha256').update(hold + ':' + code).digest('hex');
  const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const mask = e => String(e).replace(/^(.)[^@]*/, '$1***');
  const confirmLimit = createLimiter({ max: 30, windowMs: 3600e3, lockMs: 3600e3 });   // wrong codes per device, on top of the 5 per hold
  const sendCode = (to, code, bk) => sendEmail({ to, subject: `${code} is your Brotherhood booking code`,
    text: `Your code is ${code}. Enter it on the booking page within 10 minutes to confirm your booking on ${bk.date} at ${bk.time} (${bk.branchName}). If you did not book, ignore this email: the time will be released.`,
    html: `<p>Your booking code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Enter it on the booking page within 10 minutes to confirm your booking on <b>${esc2(bk.date)} at ${esc2(bk.time)}</b> (${esc2(bk.branchName)}).</p><p style="color:#666">If you did not book, ignore this email: the time will be released.</p>` });
  const expire = (bk, reason) => { run('update email_codes set guest=null, codeHash=null where bookingId=?', bk.id); if (Number(run("update bookings set status='expired' where id=? and status='pending'", bk.id).changes) === 1) bookingEvent(bk.id, 'pending', 'expired', 'System', reason); };
  const holdOf = hold => { const ec = typeof hold === 'string' && hold.length >= 20 && hold.length <= 64 ? one('select * from email_codes where holdKey=?', hold) : null; if (!ec) bad(404, 'This booking was not found. Please start again.'); return { ec, bk: get('bookings', ec.bookingId) }; };
  const doneView = bk => { const v = bookingView(bk); return { date: v.date, time: v.time, branch: v.branchName, staff: v.staffName, staffPhoto: v.staffPhoto, items: v.items, total: v.total, name: v.customerName }; };
  const liveHold = bk => bk && bk.status === 'pending' && bk.holdUntil > new Date().toISOString();

  // returns NEXT when none of these routes matched
  return async function handle({ req, res, p, method, q, ip }) {
    if (p === '/api/public/terms' && method === 'GET') return send(res, 200, { terms: getTerms() });
    // ----- public: plans and self sign-up for new shops (each gets its own separate database and a free trial) -----
    if (p === '/api/public/plans' && method === 'GET') return send(res, 200, { plans: plansNow(), trialDays: TRIAL_DAYS, contact: contactEmail(), signupOpen: SIGNUPS_OPEN });
    const codeTaken = c => !!mainDb.prepare('select 1 x from orgs where code=?').get(c);
    if (p === '/api/public/signup/check' && method === 'GET') { const c = String(q.code || '').trim().toLowerCase(); return send(res, 200, { ok: /^[a-z0-9-]{3,30}$/.test(c) && !codeTaken(c) }); }
    if (p === '/api/public/signup' && method === 'POST') {
      if (curOrg()) bad(404, 'Not found');
      if (!SIGNUPS_OPEN) bad(403, 'Sign-up for new shops is not open yet.');
      if (recent(signupHits, ip).length >= (+process.env.SIGNUP_LIMIT || 5)) bad(429, 'Too many sign-ups from this connection. Please try again in an hour.');
      const b = await readBody(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
      const kind = String(b.kind || ''); if (!KIND_LABEL[kind]) bad(400, 'Choose what describes you');
      const shop = s('shopName', 60), ownerName = s('ownerName', 60), email = normEmail(b.email).slice(0, 120), phone = s('phone', 30), city = s('city', 60), user = s('username', 30).toLowerCase(), pw = String(b.password || '');
      if (shop.length < 2) bad(400, kind === 'owner' ? 'Enter your shop name' : 'Enter the name your clients know you by');
      if (ownerName.length < 2) bad(400, 'Enter your full name');
      if (!validEmail(email)) bad(400, 'Enter a valid email address');
      if (normPhone(phone).length < 10) bad(400, 'Enter a valid mobile number');
      if (!/^[a-z0-9._-]{3,30}$/.test(user)) bad(400, 'Username: 3 to 30 letters, numbers, dot, dash or underscore');
      if (pw.length < 8) bad(400, 'Password: at least 8 characters');
      if (!b.agree) bad(400, 'Please agree to the Terms for shops and the Privacy Policy');
      if (mainDb.prepare('select 1 x from orgs where lower(email)=?').get(email)) bad(409, 'This email already has a Brotherhood shop. Log in instead, or ask us to reset your password.');
      let code = String(b.code || '').trim().toLowerCase();
      if (code) { if (!/^[a-z0-9-]{3,30}$/.test(code)) bad(400, 'Shop code: 3 to 30 letters, numbers or dashes'); if (codeTaken(code)) bad(409, 'That shop code is taken. Try another one.'); }
      else {
        const base = shop.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'shop';
        const root = base.length >= 3 ? base : base + '-shop'; code = root; for (let i = 2; codeTaken(code); i++) code = root + '-' + i;
      }
      const id = uid(), plan = kind === 'owner' ? 'shop' : 'solo', trialEnds = addDaysStr(todayStr(), TRIAL_DAYS);
      mainDb.prepare('insert into orgs(id,code,name,ownerUser,ownerHash,active,createdAt,email,phone,ownerName,kind,plan,trialEnds,source,city) values(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)')
        .run(id, code, shop, user, hashPw(pw), nowISO(), email, phone, ownerName, kind, plan, trialEnds, 'signup', city);
      hitRate(signupHits, ip);
      const g = orgRow(id);
      inOrg(g, () => {
        const bid = insert('branches', { name: city || shop, openTime: '09:00', closeTime: '21:00', graceMins: 10 }).id, chairs = [];
        for (let i = 1; i <= (kind === 'owner' ? 3 : 1); i++) chairs.push(insert('chairs', { branchId: bid, name: 'Chair ' + i, sort: i, active: 1 }).id);
        const cat = insert('categories', { name: 'Haircut', type: 'service' }).id;
        for (const [n, pr, m] of STARTER) insert('items', { name: n, price: pr, categoryId: cat, type: 'service', mins: m, active: 1, bookable: 1 });
        if (kind !== 'owner') insert('staff', { name: ownerName, branchId: bid, chairId: chairs[0], pct: 100, allowance: 0, active: 1 });   // one-person shop: the owner is the barber
        log({ name: ownerName }, 'signup', 'shop', id, `${shop} (${KIND_LABEL[kind]})`);
      });
      inMain(() => log({ name: ownerName }, 'signup', 'orgs', id, `${shop} (${code}, ${KIND_LABEL[kind]}, ${email})`));
      const links = { backend: baseUrl() + '/backend', app: baseUrl() + '/member#/pro' };
      const w = shopWelcomeEmail({ shop, ownerName, code, user, trialEnds, kind, ...links });
      sendEmail({ to: email, ...w }).catch(() => { });
      if (contactEmail()) sendEmail({ to: contactEmail(), subject: `New shop sign-up: ${shop}`, html: `<p><b>${esc2(shop)}</b> signed up (${esc2(KIND_LABEL[kind])}).</p><p>${esc2(ownerName)} · ${esc2(email)} · ${esc2(phone)} · ${esc2(city)}</p><p>Shop code: <b>${esc2(code)}</b>. Free trial until ${trialEnds}.</p>`, text: `${shop} signed up (${KIND_LABEL[kind]}).\n${ownerName} · ${email} · ${phone} · ${city}\nShop code: ${code}. Free trial until ${trialEnds}.` }).catch(() => { });
      return send(res, 201, { code, username: user, name: shop, trialEnds, token: makeToken('owner', String(g.ownerHash).slice(-8), id), ...links });
    }

    // ----- public: Google reviews of a branch -----
    if (p === '/api/public/google' && method === 'GET') {
      const br = get('branches', String(q.branch || '')); if (!br) bad(400, 'Pick a branch');
      const g = await googleData(br); return send(res, 200, { ...gInfo(br), ...(g || {}), available: !!g?.reviews });
    }
    // ----- public booking (customers, no login) -----
    if (p === '/api/public/info' && method === 'GET') {
      return send(res, 200, {
        shop: SHOP, branches: all('select id,name,address,phone,openTime,closeTime,photo,mapUrl,googlePlaceId,googleUrl from branches order by rowid').map(({ googlePlaceId, googleUrl, ...b }) => ({ ...b, verify: mvpOn(b.id), photo: b.photo || siteCover(b.name), google: gInfo({ ...b, googlePlaceId, googleUrl }) })),
        ratings: Object.fromEntries(all('select branchId, count(*) n, avg(rating) a from reviews group by branchId').map(s => [s.branchId, { count: s.n, avg: Math.round(s.a * 10) / 10 }])),
        services: all("select id,name,price,mins,photo,apptOnly,categoryId from items where active=1 and type='service' and bookable=1 order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name) })),
        menu: all("select id,name,price,mins,photo,apptOnly,bookable from items where active=1 and type='service' order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name), bookable: !!s.bookable })),   // every service for the price menu; only bookable ones can be booked online
        categories: all("select id,name from categories where type='service'"),
        // T14: in branches on the new booking system, the services each barber does (null = every service), so the page can hide the others
        staff: all('select id,name,photo,branchId from staff where active=1 order by name').map(s => { const l = mvpOn(s.branchId) ? all('select itemId from staff_services where staffId=?', s.id).map(r => r.itemId) : []; return { ...s, services: l.length ? l : null }; })
      });
    }
    if (p === '/api/public/slots' && method === 'GET') {
      const date = String(q.date || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr()) return send(res, 200, { slots: [] });
      const ids = String(q.items || '').split(',').filter(Boolean); if (!ids.length) return send(res, 200, { slots: [] });
      return send(res, 200, { slots: slotsFor(String(q.branch || ''), date, String(q.staff || 'any'), bookingMins(ids), ids) });
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
      const body = await readBody(req), idemKey = req.headers['idempotency-key'];
      if (mvpOn(String(body.branchId || ''))) {   // the new booking system: hold the time and email a code (T16)
        const email = normEmail(body.email);
        if (!validEmail(email)) bad(400, 'An email is required to book online, so we can send your code. No email? Please walk in, we will gladly serve you.');
        if (!mailReady()) bad(503, 'Online booking is not available right now. Please call the shop or walk in.');
        const seen = idemKey && one('select 1 x from bookings where idemKey=?', String(idemKey));
        if (!seen && one('select count(*) n from email_codes where email=? and createdAt>?', email, new Date(Date.now() - 3600e3).toISOString()).n >= PER_EMAIL) bad(429, 'Too many booking tries with this email. Please try again in an hour, or call the shop.');
        if (!seen && (one("select count(*) n from bookings where branchId=? and status='pending' and holdUntil>?", String(body.branchId), new Date().toISOString()).n >= LIVE_MAX || emailsToday(String(body.branchId)) >= EMAILS_DAY)) bad(429, BUSY);
        const bk = createBooking({ ...body, email, idemKey }, 'online', '', { hold: true });
        if (bk.duplicate) { const ec = one('select holdKey from email_codes where bookingId=?', bk.id); return send(res, 202, { ok: true, pending: true, hold: ec?.holdKey, holdUntil: bk.holdUntil, email: mask(email) }); }
        const hold = crypto.randomBytes(18).toString('base64url'), code = newCode(), at = new Date().toISOString();
        const guest = { name: bk.customerName, phone: bk.phone, email, preferredCut: body.preferredCut ?? body.notes ?? '', consent: !!body.consent };
        run('insert into email_codes(bookingId,holdKey,codeHash,tries,sends,lastSentAt,email,guest,createdAt) values(?,?,?,0,1,?,?,?,?)', bk.id, hold, codeHash(hold, code), at, email, JSON.stringify(guest), at);
        hitRate(bookHits, ip); log({ name: 'Online: ' + bk.customerName }, 'booking-hold', 'bookings', bk.id, `${bk.date} ${bk.time} ${bk.branchName}, code sent to ${mask(email)}`);
        const sent = await sendCode(email, code, bk).catch(e => ({ ok: false, error: e.message }));
        if (!sent?.ok) { expire(bk, 'the code email could not be sent'); bad(503, 'We could not send your code. Please check the email address, try again, or call the shop.'); }
        return send(res, 202, { ok: true, pending: true, hold, holdUntil: bk.holdUntil, email: mask(email) });
      }
      const bk = createBooking({ ...body, idemKey }, 'online');
      if (!bk.duplicate) { hitRate(bookHits, ip); log({ name: 'Online: ' + bk.customerName }, 'booking', 'bookings', bk.id, `${bk.date} ${bk.time} ${bk.branchName}`); }
      return send(res, bk.duplicate ? 200 : 201, { ok: true, booking: { date: bk.date, time: bk.time, branch: bk.branchName, staff: bk.staffName, staffPhoto: bk.staffPhoto, items: bk.items, total: bk.total, name: bk.customerName } });
    }

    if (p === '/api/public/book/confirm' && method === 'POST') {
      if (confirmLimit.lockedFor(ip)) bad(429, 'Too many wrong codes from this device. Please try again later.');
      const b = await readBody(req), { ec, bk } = holdOf(b.hold);
      if (bk?.status === 'booked') return send(res, 200, { ok: true, booking: doneView(bk) });   // confirmed already (a double tap)
      if (!liveHold(bk)) { if (bk) expire(bk, 'the 10 minutes ran out'); bad(410, 'The 10 minutes ran out and the time was released. Please book again.'); }
      if (ec.tries >= TRIES) { expire(bk, 'too many wrong codes'); bad(429, 'Too many wrong codes. The time was released. Please book again.'); }
      const code = String(b.code || '').trim();
      const good = /^\d{6}$/.test(code) && !!ec.codeHash && crypto.timingSafeEqual(Buffer.from(codeHash(ec.holdKey, code)), Buffer.from(ec.codeHash));
      if (!good) {
        confirmLimit.fail(ip);
        const tries = ec.tries + 1; run('update email_codes set tries=? where bookingId=?', tries, bk.id);
        if (tries >= TRIES) { expire(bk, 'too many wrong codes'); bad(429, 'Too many wrong codes. The time was released. Please book again.'); }
        return send(res, 400, { error: `Wrong code. ${TRIES - tries} ${TRIES - tries === 1 ? 'try' : 'tries'} left.`, triesLeft: TRIES - tries });
      }
      // the code proves the email, not the phone: a customer already known by this phone keeps their own email
      const g = JSON.parse(ec.guest || '{}'), known = findCustomer(g.phone, ''), keepEmail = known?.email && normEmail(known.email) !== g.email;
      const cust = upsertCustomer({ name: g.name, phone: g.phone, email: keepEmail ? known.email : g.email, preferredCut: g.preferredCut, consent: !!g.consent }, 'online', bk.branchId);
      run("update bookings set status='booked', holdUntil=null, customerId=? where id=? and status='pending'", cust?.id || '', bk.id);
      run('update email_codes set codeHash=null, guest=null where bookingId=?', bk.id);   // the code cannot be used again; the guest details now live in the customer record
      bookingEvent(bk.id, 'pending', 'booked', 'Customer (online, email confirmed)');
      log({ name: 'Online: ' + bk.customerName }, 'booking', 'bookings', bk.id, `${bk.date} ${bk.time} ${get('branches', bk.branchId)?.name || ''} (email confirmed)`);
      return send(res, 200, { ok: true, booking: doneView(get('bookings', bk.id)) });
    }
    if (p === '/api/public/book/resend' && method === 'POST') {
      const b = await readBody(req), { ec, bk } = holdOf(b.hold);
      if (!liveHold(bk)) bad(410, 'The 10 minutes ran out and the time was released. Please book again.');
      if (ec.sends >= SENDS) bad(429, 'We already sent 3 codes. Please check your spam folder, or book again.');
      if (emailsToday(bk.branchId) >= EMAILS_DAY) bad(429, BUSY);
      if (Date.now() - new Date(ec.lastSentAt).getTime() < RESEND_WAIT) bad(429, 'Please wait a minute before asking for a new code.');
      const code = newCode(); run('update email_codes set codeHash=?, sends=sends+1, lastSentAt=? where bookingId=?', codeHash(ec.holdKey, code), new Date().toISOString(), bk.id);
      const sent = await sendCode(ec.email, code, bookingView(bk)).catch(e => ({ ok: false, error: e.message }));
      if (!sent?.ok) bad(503, 'We could not send a new code. Please try again in a moment.');
      return send(res, 200, { ok: true, email: mask(ec.email) });
    }

    return NEXT;
  };
}
