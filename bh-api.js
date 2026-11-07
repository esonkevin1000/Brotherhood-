// Brotherhood customer app API (accounts, discover, barber profiles, booking history, verified reviews, pro tools).
// Mounted from server.js under /api/bh/*. Shares the same database, staff, branches, bookings and reviews as the POS.
export function mountBH(c) {
  const { db, all, one, run, get, uid, nowISO, todayStr, send, readBody, bad, hashPw, checkPw, makeToken, readToken, createBooking, bookingView, slotsFor,
    whoami, log, normEmail, validEmail, normPhone, jp, upsertCustomer, siteCover, siteSvc, siteGallery, staffState, tierOf, nextTier, shopName, getSetting, setSetting, queueEmail, emailReady, baseUrl, esc: escHtml, addCol, toMin, scoreData, serviceNet, parseOrder, dOf } = c;

  // ---------- schema ----------
  db.exec(`
create table if not exists bh_users(id text primary key, name text, email text, phone text, passHash text, bio text, city text, customerId text, createdAt text);
create unique index if not exists bh_users_email on bh_users(email);
create table if not exists bh_barber(staffId text primary key, headline text, bio text, years integer, specialties text, instagram text, facebook text, tiktok text, verified integer);
create table if not exists bh_portfolio(id text primary key, staffId text, url text, caption text, createdAt text);
create index if not exists bh_port_staff on bh_portfolio(staffId, createdAt);
create table if not exists bh_favorites(userId text, staffId text, createdAt text, primary key(userId, staffId));
create table if not exists bh_certs(id text primary key, staffId text, title text, org text, date text, imageUrl text, verified integer default 0, createdAt text);
create index if not exists bh_certs_staff on bh_certs(staffId);
create table if not exists bh_saves(userId text, postId text, createdAt text, primary key(userId, postId));
create table if not exists bh_offers(staffId text, pkg text, price real, primary key(staffId, pkg));
create table if not exists bh_blocked(id text primary key, staffId text, date text, fromMin integer, toMin integer, reason text, createdAt text);
create index if not exists bh_blocked_day on bh_blocked(staffId, date);
create table if not exists bh_client_notes(staffId text, ckey text, note text, pref text, vip integer, birthday text, updatedAt text, primary key(staffId, ckey));
create table if not exists bh_posts(id text primary key, userId text, staffId text, text text, imageUrl text, createdAt text, hidden integer default 0);
create index if not exists bh_posts_time on bh_posts(createdAt);
create table if not exists bh_likes(postId text, userId text, primary key(postId, userId));
create table if not exists bh_comments(id text primary key, postId text, userId text, text text, createdAt text, hidden integer default 0);
create index if not exists bh_comments_post on bh_comments(postId, createdAt);
create table if not exists bh_follows(userId text, targetId text, createdAt text, primary key(userId, targetId));
create table if not exists bh_blocks(userId text, blockedId text, createdAt text, primary key(userId, blockedId));
create table if not exists bh_reports(id text primary key, kind text, targetId text, userId text, reason text, createdAt text, status text default 'open');
create unique index if not exists bh_reports_once on bh_reports(kind, targetId, userId);
create table if not exists bh_waitlist(id text primary key, userId text, branchId text, staffId text, date text, createdAt text, notifiedAt text);
create index if not exists bh_wl_day on bh_waitlist(branchId, date);
create table if not exists bh_notifs(id text primary key, userId text, kind text, text text, link text, ref text, createdAt text, readAt text);
create unique index if not exists bh_notifs_ref on bh_notifs(userId, kind, ref);
create index if not exists bh_notifs_user on bh_notifs(userId, createdAt);
`);
  addCol('bookings', 'reminderAt', 'text'); addCol('bookings', 'reviewReqAt', 'text'); addCol('bh_portfolio', 'style', 'text'); addCol('bh_users', 'photo', 'text'); addCol('bh_users', 'cover', 'text'); addCol('bh_barber', 'cover', 'text'); addCol('bh_posts', 'style', 'text'); addCol('branches', 'lat', 'real'); addCol('branches', 'lng', 'real'); addCol('bh_users', 'styles', 'text'); addCol('reviews', 'reply', 'text'); addCol('reviews', 'replyAt', 'text'); addCol('reviews', 'replyBy', 'text'); addCol('bookings', 'userId', 'text'); addCol('reviews', 'userId', 'text'); addCol('reviews', 'orderId', 'text'); addCol('reviews', 'verified', 'integer');
  db.exec('create index if not exists bookings_user on bookings(userId); create index if not exists reviews_staff on reviews(staffId)');

  // ---------- helpers ----------
  const hits = new Map();
  const tooMany = (ip, kind, max, windowMs) => { const k = kind + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < windowMs); return a.length >= max; };
  // coordinates from a Google Maps link (full links directly; short maps.app.goo.gl links are followed once)
  const parseLatLng = u => {
    const raw = String(u || ''); let s; try { s = decodeURIComponent(raw); } catch { s = raw.replace(/%2C/gi, ','); }   // page text can contain stray % signs
    let m;
    for (const re of [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+)[, ](-?\d{1,3}\.\d+)/, /place\/(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/])
      if ((m = re.exec(s))) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; }
    return null;
  };
  const resolveMapUrl = async u => {
    let url; try { url = new URL(String(u).trim()); } catch { return null; }
    const direct = parseLatLng(url.href); if (direct) return direct;
    if (!/^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i.test(url.hostname) || url.protocol !== 'https:') return null;   // only follow Google Maps links
    try {
      const r = await fetch(url.href, { redirect: 'follow', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brotherhood)' } });
      return parseLatLng(r.url) || parseLatLng((await r.text()).slice(0, 400000));
    } catch { return null; }
  };
  const hit = (ip, kind) => { const k = kind + ip; hits.set(k, [...(hits.get(k) || []), Date.now()]); };
  setInterval(() => hits.clear(), 3600e3).unref();

  // in-app notifications (deduplicated by user + kind + ref)
  const notify = (userId, kind, text, link, ref) => { if (!userId) return; try { run('insert or ignore into bh_notifs(id,userId,kind,text,link,ref,createdAt,readAt) values(?,?,?,?,?,?,?,null)', uid(), userId, kind, String(text).slice(0, 200), link || '', ref || uid(), nowISO()); } catch { } };
  // "rate your cut" appears once a booked visit has been paid at the POS
  const syncRate = userId => {
    for (const b of all("select id,orderId,staffId,date from bookings where userId=? and status='arrived' and orderId<>''", userId)) {
      if (one("select status from orders where id=?", b.orderId)?.status !== 'paid' || one('select 1 x from reviews where orderId=?', b.orderId)) continue;
      notify(userId, 'rate', `How was your cut with ${get('staff', b.staffId)?.name || 'your barber'}? Rate your visit.`, '#/bookings', b.id);
    }
  };
  // when a slot is freed (cancel / no-show), tell waitlisted members for that shop and day if that barber (or anyone) now has an opening
  const freed = (branchId, staffId, date) => {
    try {
      for (const w of all('select * from bh_waitlist where branchId=? and date=? and notifiedAt is null', branchId, date)) {
        if (w.staffId !== 'any' && w.staffId !== staffId) continue;
        if (!slotsFor(branchId, date, w.staffId, 30).length) continue;
        run('update bh_waitlist set notifiedAt=? where id=?', nowISO(), w.id);
        const who = w.staffId === 'any' ? get('branches', branchId)?.name : get('staff', w.staffId)?.name;
        notify(w.userId, 'waitlist', `A slot opened on ${date} at ${who}. Book it before someone else does.`, w.staffId === 'any' ? '#/shop/' + branchId : '#/barber/' + w.staffId, 'wl-' + w.id);
      }
    } catch { }
  };
  // smart rebooking: when a member is due for another cut (their own average gap, or 21 days), nudge once per cycle
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const syncDue = userId => {
    const paid = all("select b.id, b.date, b.staffId from bookings b join orders o on o.id=b.orderId where b.userId=? and b.status='arrived' and o.status='paid' order by b.date", userId);
    if (!paid.length) return;
    const last = paid[paid.length - 1], gaps = paid.slice(1).map((x, i) => daysBetween(paid[i].date, x.date)).filter(g => g > 0);
    const cadence = Math.max(10, Math.min(60, gaps.length >= 2 ? Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length) : 21)), since = daysBetween(last.date, todayStr());
    if (since < cadence || one("select 1 x from bookings where userId=? and status='booked' and date>=?", userId, todayStr())) return;
    const who = get('staff', last.staffId)?.name;
    notify(userId, 'due', `It has been ${since} days since your last cut${who ? ' with ' + who : ''}. Time for a fresh one?`, last.staffId ? '#/barber/' + last.staffId : '#/discover', 'due-' + last.id);
  };
  // ---------- email jobs: booking reminders and review requests (only when the email service is connected) ----------
  const dayWord = d => d === todayStr() ? 'today' : d === dOf(new Date(Date.now() + 864e5)) ? 'tomorrow' : new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' });
  const t12s = t => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const mailShell = (title, body, cta) => `<!doctype html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#09090a;color:#fff;text-align:center;padding:22px;font-size:22px;letter-spacing:3px;font-weight:700">${escHtml(String(shopName || 'Brotherhood').toUpperCase())}</td></tr><tr><td style="padding:26px"><h1 style="margin:0 0 12px;font-size:21px">${title}</h1>${body}${cta ? `<p style="margin:22px 0 0"><a href="${cta.href}" style="background:#3c8dff;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">${cta.label}</a></p>` : ''}</td></tr><tr><td style="padding:14px 26px 22px;color:#888;font-size:12px;border-top:1px solid #eee">${escHtml(shopName || 'Brotherhood')} · <a href="{{UNSUB}}" style="color:#888">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
  // members get the mail at their account email; other customers only if they agreed to receive mail
  const mailTo = b => { if (b.userId) { const u = get('bh_users', b.userId); return u ? { to: u.email, name: u.name } : null; } const c = b.customerId ? get('customers', b.customerId) : null; return c && c.email && c.consent ? { to: c.email, name: c.name } : null; };
  function runJobs() {
    if (!emailReady()) return;
    const now = Date.now(), link = `${baseUrl()}/brotherhood#/bookings`;
    for (const b of all("select * from bookings where status='booked' and reminderAt is null and date>=? and date<=?", todayStr(), dOf(new Date(now + 2 * 864e5)))) {
      const start = new Date(`${b.date}T${b.time}:00`).getTime(), hrs = (start - now) / 36e5;
      if (hrs > 24 || hrs < 2) continue;
      if (now - new Date(b.createdAt).getTime() < 3 * 36e5) continue;   // booked less than 3 hours ago: the confirmation is still fresh, so wait (the reminder can still go out later)
      run('update bookings set reminderAt=? where id=?', nowISO(), b.id);   // marked before sending, so a booking is never reminded twice
      const m = mailTo(b); if (!m) continue;
      const v = bookingView(b), br = get('branches', b.branchId) || {}, first = String(m.name || 'there').split(/\s+/)[0], when = `${dayWord(b.date)} at ${t12s(b.time)}`;
      const body = `<p style="line-height:1.55;margin:0 0 14px">Hi ${escHtml(first)}, a quick reminder of your appointment.</p><table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;border-collapse:separate;width:100%;font-size:15px"><tr><td style="padding:10px 14px;color:#666;width:90px">When</td><td style="padding:10px 14px"><b>${escHtml(when)}</b></td></tr><tr><td style="padding:10px 14px;color:#666;border-top:1px solid #eee">Barber</td><td style="padding:10px 14px;border-top:1px solid #eee">${escHtml(v.staffName || 'Any available barber')}</td></tr><tr><td style="padding:10px 14px;color:#666;border-top:1px solid #eee">Service</td><td style="padding:10px 14px;border-top:1px solid #eee">${escHtml(v.items.map(i => i.name).join(', '))}</td></tr><tr><td style="padding:10px 14px;color:#666;border-top:1px solid #eee">Where</td><td style="padding:10px 14px;border-top:1px solid #eee">${escHtml([br.name, br.address].filter(Boolean).join(', '))}</td></tr></table><p style="line-height:1.55;margin:14px 0 0;color:#555">${b.userId ? 'Plans changed? You can cancel up to 1 hour before.' : `Plans changed? Please call the shop${br.phone ? ' at ' + escHtml(br.phone) : ''}.`}</p>`;
      queueEmail({ customerId: b.customerId || '', to: m.to, kind: 'reminder', subject: `Reminder: your cut ${when}`, html: mailShell(`See you ${escHtml(when)}`, body, b.userId ? { href: link, label: 'Manage my booking' } : null), text: `Hi ${first}, reminder: your appointment is ${when} with ${v.staffName || 'any available barber'} at ${br.name || 'the shop'}. ${b.userId ? 'Manage it: ' + link : ''}` });
    }
    const lo = new Date(now - 72 * 36e5).toISOString(), hi = new Date(now - 2 * 36e5).toISOString();
    for (const b of all("select b.* from bookings b join orders o on o.id=b.orderId where b.userId<>'' and b.status='arrived' and o.status='paid' and b.reviewReqAt is null and o.paidAt>=? and o.paidAt<=?", lo, hi)) {
      run('update bookings set reviewReqAt=? where id=?', nowISO(), b.id);
      if (one('select 1 x from reviews where orderId=?', b.orderId)) continue;   // already reviewed
      const m = mailTo(b); if (!m) continue; const first = String(m.name || 'there').split(/\s+/)[0], who = get('staff', b.staffId)?.name || 'your barber';
      queueEmail({ customerId: b.customerId || '', to: m.to, kind: 'review', subject: `How was your cut with ${who}?`, html: mailShell(`How was your cut, ${escHtml(first)}?`, `<p style="line-height:1.55;margin:0">Thanks for visiting. Your review helps ${escHtml(who)} and the next customer choose well. It takes ten seconds.</p>`, { href: link, label: 'Rate my cut' }), text: `Hi ${first}, how was your cut with ${who}? Rate it: ${link}` });
    }
  }
  const JOB_MS = +process.env.BH_JOB_MS || 600000;
  setInterval(() => { try { runJobs(); } catch (e) { console.error('bh jobs:', e.message); } }, JOB_MS).unref(); setTimeout(() => { try { runJobs(); } catch { } }, Math.min(20000, JOB_MS)).unref();
  const unreadOf = id => one('select count(*) n from bh_notifs where userId=? and readAt is null', id).n;
  const userOf = req => {
    const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!o || !String(o.u).startsWith('c:')) return null;
    const u = get('bh_users', String(o.u).slice(2));
    return u && u.passHash.slice(-8) === o.v ? u : null;
  };
  const needUser = req => userOf(req) || bad(401, 'Please log in');
  const tokenOf = u => makeToken('c:' + u.id, u.passHash.slice(-8));
  const pubUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city || '', bio: u.bio || '', styles: jp(u.styles), photo: u.photo || '', cover: u.cover || '' });
  const short = n => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0] || 'Customer'; };
  const clip = (s, n) => String(s ?? '').trim().slice(0, n);
  // member photos: same rules as every other upload (JPEG/PNG/WebP, under about 700 KB), stored in the shared images table
  const saveImg = b => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
    const iid = uid() + uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', iid, m[1], buf, nowISO()); return '/img/' + iid;
  };
  const dropImg = url => { const im = /\/img\/(\w+)/.exec(url || ''); if (im) run('delete from images where id=?', im[1]); };
  const url = s => { s = clip(s, 200); return /^(https?:\/\/|@?[\w.]+$)/i.test(s) ? s : ''; };

  const ratingMap = () => new Map(all('select staffId, count(*) n, avg(rating) a, sum(coalesce(verified,0)) v from reviews where staffId<>\'\' group by staffId').map(r => [r.staffId, { n: r.n, a: Math.round(r.a * 10) / 10, v: r.v }]));
  const branchRatings = () => new Map(all('select branchId, count(*) n, avg(rating) a from reviews group by branchId').map(r => [r.branchId, { n: r.n, a: Math.round(r.a * 10) / 10 }]));
  const portCount = () => new Map(all('select staffId, count(*) n from bh_portfolio group by staffId').map(r => [r.staffId, r.n]));

  const PKG_IDS = ['cut', 'blow', 'full'];   // Haircut only / Haircut + blower, shampoo & styling / Full package
  const levelOf = n => n >= 1000 ? 'Legend' : n >= 300 ? 'Master Barber' : n >= 50 ? 'Pro Barber' : 'Rising Barber';
  function barberCard(s, rm, pc, br, ex) {
    const p = one('select * from bh_barber where staffId=?', s.id) || {}, r = rm.get(s.id) || { n: 0, a: 0, v: 0 }, spec = jp(p.specialties), photos = pc.get(s.id) || 0;
    let sl = []; try { sl = slotsFor(s.branchId, todayStr(), s.id, 30); } catch { } const slots = sl.length;
    const offers = all('select pkg,price from bh_offers where staffId=?', s.id).filter(o => PKG_IDS.includes(o.pkg)).sort((a, b) => PKG_IDS.indexOf(a.pkg) - PKG_IDS.indexOf(b.pkg));
    const complete = [p.headline, p.bio, s.photo, p.years, spec.length, photos >= 3].filter(Boolean).length / 6;
    // ranking: verified-review quality (Bayesian), same-day availability, profile completeness, verification — never raw popularity
    const bayes = (r.a * r.n + 4.2 * 5) / (r.n + 5), score = bayes / 5 * 50 + Math.min(slots, 6) / 6 * 20 + complete * 20 + (p.verified ? 10 : 0);
    return { id: s.id, name: s.name, photo: s.photo || '', branchId: s.branchId, branchName: br.get(s.branchId)?.name || '', headline: p.headline || '', years: p.years || 0, specialties: spec,
      rating: r.a, reviews: r.n, verifiedReviews: r.v, verified: !!p.verified, portfolio: photos, slotsToday: slots, nextSlot: sl[0] || '', offers, fromPrice: offers.length ? Math.min(...offers.map(o => o.price)) : 0, score: Math.round(score * 10) / 10,
      ...(ex ? { cover: ex.cover.get(s.id) || '', weekCuts: ex.week.get(s.id) || 0, level: levelOf(ex.cuts.get(s.id) || 0), styles: [...(ex.styles.get(s.id) || [])] } : {}) };
  }
  const servicesList = () => all("select id,name,price,mins,photo,apptOnly from items where active=1 and type='service' and bookable=1 order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name) }));

  // ---------- handler ----------
  const handleBH = async function (req, res, p, method, q, ip) {
    const sub = p.slice('/api/bh'.length);

    if (sub === '/config' && method === 'GET') return send(res, 200, { shop: shopName || 'Brotherhood' });
    // ----- accounts -----
    if (sub === '/signup' && method === 'POST') {
      if (tooMany(ip, 'su', 5, 3600e3)) bad(429, 'Too many sign-ups from this device. Try again later.');
      const b = await readBody(req), name = clip(b.name, 80), email = normEmail(b.email), phone = clip(b.phone, 30), pw = String(b.password || '');
      if (!name) bad(400, 'Please enter your name');
      if (!validEmail(email)) bad(400, 'Enter a valid email address');
      if (normPhone(phone).length < 10) bad(400, 'Enter a valid mobile number');
      if (pw.length < 8) bad(400, 'Password must be at least 8 characters');
      if (!b.agree) bad(400, 'Please accept the Terms and Privacy Notice');
      if (one('select id from bh_users where email=?', email)) bad(409, 'That email already has an account. Please log in.');
      const id = uid() + uid();
      run('insert into bh_users(id,name,email,phone,passHash,bio,city,customerId,createdAt) values(?,?,?,?,?,?,?,?,?)', id, name, email, phone, hashPw(pw), '', '', '', nowISO());
      hit(ip, 'su'); log({ name: 'App: ' + name }, 'app-signup', 'bh_users', id, '');
      const u = get('bh_users', id); return send(res, 201, { token: tokenOf(u), user: pubUser(u) });
    }
    if (sub === '/login' && method === 'POST') {
      if (tooMany(ip, 'li', 10, 600e3)) bad(429, 'Too many attempts. Please wait a few minutes.');
      const b = await readBody(req), u = one('select * from bh_users where email=?', normEmail(b.email)), pw = String(b.password || '');
      await new Promise(r => setTimeout(r, 300));
      // phone keyboards often append a space after an autosuggested word: accept the password with that stray space/newline trimmed too
      const good = !!u && (checkPw(pw, u.passHash) || (pw !== pw.trim() && checkPw(pw.trim(), u.passHash)));
      if (!good) { hit(ip, 'li'); log({ name: 'App: ' + clip(b.email, 60) }, 'app-login-failed', 'bh_users', '', u ? 'wrong password' : 'no account with that email'); bad(401, 'Wrong email or password'); }
      return send(res, 200, { token: tokenOf(u), user: pubUser(u) });
    }
    if (sub === '/me' && method === 'GET') { const u = needUser(req); syncRate(u.id); syncDue(u.id); return send(res, 200, { user: pubUser(u), favorites: all('select staffId from bh_favorites where userId=?', u.id).map(r => r.staffId), unread: unreadOf(u.id) }); }
    if (sub === '/me' && method === 'PUT') {
      const u = needUser(req), b = await readBody(req), name = clip(b.name ?? u.name, 80), phone = clip(b.phone ?? u.phone, 30);
      if (!name) bad(400, 'Please enter your name'); if (normPhone(phone).length < 10) bad(400, 'Enter a valid mobile number');
      run('update bh_users set name=?, phone=?, city=?, bio=? where id=?', name, phone, clip(b.city ?? u.city, 60), clip(b.bio ?? u.bio, 300), u.id);
      return send(res, 200, { user: pubUser(get('bh_users', u.id)) });
    }
    for (const kind of ['photo', 'cover']) {   // a member's own profile photo and cover
      if (sub === '/me/' + kind && method === 'POST') {
        const u = needUser(req), b = await readBody(req, 1_500_000); if (!b.data) bad(400, 'Choose a photo');
        const url = saveImg(b); dropImg(u[kind]); run(`update bh_users set ${kind}=? where id=?`, url, u.id); return send(res, 201, { url });
      }
      if (sub === '/me/' + kind && method === 'DELETE') { const u = needUser(req); dropImg(u[kind]); run(`update bh_users set ${kind}='' where id=?`, u.id); return send(res, 200, { ok: true }); }
    }
    if (sub === '/loyalty' && method === 'GET') {   // visits and tier come from the POS loyalty tiers (1 paid visit = 1 point) for the customer record linked to this account's bookings
      const u = needUser(req), cid = u.customerId || one("select customerId c from bookings where userId=? and customerId<>'' order by createdAt desc", u.id)?.c || '';
      const visits = cid ? one("select count(*) n from orders where customerId=? and status='paid'", cid).n : 0;
      return send(res, 200, { linked: !!cid, visits, tier: tierOf(visits), next: nextTier(visits) });
    }
    if (sub === '/me/styles' && method === 'PUT') {   // saved hairstyle ideas from the Style Finder (ids come from the app's catalog)
      const u = needUser(req), b = await readBody(req), ids = [...new Set((Array.isArray(b.styles) ? b.styles : []).map(x => String(x)).filter(x => /^[a-z0-9-]{2,30}$/.test(x)))].slice(0, 12);
      run('update bh_users set styles=? where id=?', JSON.stringify(ids), u.id); return send(res, 200, { styles: ids });
    }
    if (sub === '/me/password' && method === 'PUT') {
      const u = needUser(req), b = await readBody(req);
      if (!checkPw(String(b.current || ''), u.passHash)) bad(403, 'Current password is wrong');
      if (String(b.password || '').length < 8) bad(400, 'New password must be at least 8 characters');
      run('update bh_users set passHash=? where id=?', hashPw(String(b.password)), u.id);
      return send(res, 200, { token: tokenOf(get('bh_users', u.id)) });
    }
    if (sub === '/me' && method === 'DELETE') {   // privacy: customers can delete their account; shop booking records stay with the shop but are unlinked
      const u = needUser(req), b = await readBody(req);
      if (!checkPw(String(b.password || ''), u.passHash)) bad(403, 'Password is wrong');
      run("update bookings set userId='' where userId=?", u.id); run("update reviews set userId='' where userId=?", u.id);
      run('delete from bh_favorites where userId=?', u.id);
      run('delete from bh_notifs where userId=?', u.id); run('delete from bh_waitlist where userId=?', u.id);
      for (const t of ['bh_likes', 'bh_comments', 'bh_follows', 'bh_blocks', 'bh_reports', 'bh_saves']) run(`delete from ${t} where userId=?`, u.id);
      run('delete from bh_follows where targetId=?', u.id); run('delete from bh_blocks where blockedId=?', u.id); run('delete from bh_likes where postId in (select id from bh_posts where userId=?)', u.id);
      run('delete from bh_comments where postId in (select id from bh_posts where userId=?)', u.id);
      for (const r of all('select imageUrl from bh_posts where userId=?', u.id)) { const im = /\/img\/(\w+)/.exec(r.imageUrl || ''); if (im) run('delete from images where id=?', im[1]); }
      run('delete from bh_posts where userId=?', u.id); dropImg(u.photo); dropImg(u.cover); run('delete from bh_users where id=?', u.id);
      log({ name: 'App: ' + u.name }, 'app-delete-account', 'bh_users', u.id, ''); return send(res, 200, { ok: true });
    }

    // ----- discover -----
    if (sub === '/discover' && method === 'GET') {
      const brs = all('select * from branches order by rowid'), bm = new Map(brs.map(b => [b.id, b])), rm = ratingMap(), pc = portCount(), brr = branchRatings();
      const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));   // weeks run Monday to Sunday
      const ex = {
        cover: (m => { for (const r of all("select staffId, cover from bh_barber where cover<>''")) m.set(r.staffId, r.cover); return m; })(new Map(all("select staffId, url from bh_portfolio order by createdAt asc").map(r => [r.staffId, r.url]))),   // latest portfolio photo, unless the barber chose a cover
        week: new Map(all("select barberId, count(*) n from orders where status='paid' and date>=? and barberId<>'' group by barberId", dOf(mon)).map(r => [r.barberId, r.n])),
        cuts: new Map(all("select barberId, count(*) n from orders where status='paid' and barberId<>'' group by barberId").map(r => [r.barberId, r.n])),
        styles: (m => { for (const r of all("select staffId, style from bh_portfolio where style<>''")) (m.get(r.staffId) || m.set(r.staffId, new Set()).get(r.staffId)).add(r.style); return m; })(new Map())
      };
      let barbers = all('select * from staff where active=1').map(s => barberCard(s, rm, pc, bm, ex));
      const term = clip(q.q, 60).toLowerCase(), bid = clip(q.branch, 20), spec = clip(q.specialty, 40).toLowerCase();
      if (bid) barbers = barbers.filter(b => b.branchId === bid);
      if (term) barbers = barbers.filter(b => [b.name, b.branchName, b.headline, ...b.specialties, ...b.styles].join(' ').toLowerCase().includes(term));
      const style = clip(q.style, 30).toLowerCase();
      if (style) barbers = barbers.filter(b => b.styles.some(x => x.toLowerCase() === style) || b.specialties.some(x => x.toLowerCase() === style));
      if (q.verified === '1') barbers = barbers.filter(b => b.verified);
      const pkg = PKG_IDS.includes(q.pkg) ? q.pkg : '', priceOf = b => pkg ? (b.offers.find(o => o.pkg === pkg)?.price ?? 1e9) : (b.fromPrice || 1e9);
      if (pkg) barbers = barbers.filter(b => b.offers.some(o => o.pkg === pkg));
      if (spec) barbers = barbers.filter(b => b.specialties.some(x => x.toLowerCase() === spec));
      if (q.available === '1') barbers = barbers.filter(b => b.slotsToday > 0);
      if (+q.minRating > 0) barbers = barbers.filter(b => b.rating >= +q.minRating);
      barbers.sort(q.sort === 'rating' ? (a, b) => b.rating - a.rating || b.reviews - a.reviews : q.sort === 'experience' ? (a, b) => b.years - a.years : q.sort === 'name' ? (a, b) => a.name.localeCompare(b.name)
        : q.sort === 'trending' ? (a, b) => b.weekCuts - a.weekCuts || b.score - a.score : q.sort === 'soonest' ? (a, b) => (a.nextSlot || '99:99').localeCompare(b.nextSlot || '99:99') || b.score - a.score
        : q.sort === 'cheapest' ? (a, b) => priceOf(a) - priceOf(b) || b.score - a.score : (a, b) => b.score - a.score);
      const shops = brs.filter(b => !bid || b.id === bid).map(b => ({ id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', openTime: b.openTime || '09:00', closeTime: b.closeTime || '21:00', mapUrl: b.mapUrl || '',
        photo: b.photo || siteCover(b.name) || '', lat: b.lat ?? null, lng: b.lng ?? null, rating: brr.get(b.id)?.a || 0, reviews: brr.get(b.id)?.n || 0, barbers: all('select count(*) n from staff where branchId=? and active=1', b.id)[0].n }))
        .filter(s => !term || (s.name + ' ' + s.address).toLowerCase().includes(term) || barbers.some(x => x.branchId === s.id));
      const specialties = [...new Set(all('select specialties from bh_barber').flatMap(r => jp(r.specialties)))].sort();
      const styleTiles = all("select p.style name, count(*) n, (select p2.url from bh_portfolio p2 where p2.style=p.style order by p2.createdAt desc limit 1) image from bh_portfolio p join staff s on s.id=p.staffId and s.active=1 where p.style<>'' group by p.style order by n desc");
      const pkgTiles = PKG_IDS.map(k => { const rows = all('select o.price from bh_offers o join staff s on s.id=o.staffId and s.active=1 where o.pkg=?', k); return { pkg: k, n: rows.length, from: rows.length ? Math.min(...rows.map(r => r.price)) : 0 }; });
      return send(res, 200, { shops, barbers, specialties, styleTiles, pkgTiles, services: servicesList() });
    }
    const bm = sub.match(/^\/barbers\/(\w+)$/);
    if (bm && method === 'GET') {
      const s = get('staff', bm[1]); if (!s || !s.active) bad(404, 'Barber not found');
      const brs = new Map(all('select * from branches').map(b => [b.id, b])), card = barberCard(s, ratingMap(), portCount(), brs), pr = one('select * from bh_barber where staffId=?', s.id) || {};
      const br = brs.get(s.branchId) || {};
      const reviews = all('select id,name,rating,text,createdAt,coalesce(verified,0) verified,reply,replyAt,replyBy from reviews where staffId=? order by createdAt desc limit 30', s.id);
      const u = userOf(req);
      // public, aggregate-only numbers (no revenue): completed cuts, clients served, rebook rate, followers, weekly rank and level
      const pOrders = all("select customerId, customerName from orders where status='paid' and barberId=?", s.id), byClient = new Map();
      for (const o of pOrders) { const k = o.customerId || ('n:' + String(o.customerName || '').toLowerCase()); if (k !== 'n:') byClient.set(k, (byClient.get(k) || 0) + 1); }
      const stats = { cuts: pOrders.length, clients: byClient.size, rebook: byClient.size ? Math.round([...byClient.values()].filter(n => n > 1).length / byClient.size * 100) : 0, followers: one('select count(*) n from bh_favorites where staffId=?', s.id).n };
      const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));   // weeks run Monday to Sunday
      const activeIds = new Set(all('select id from staff where active=1').map(x => x.id)), ranked = all("select barberId, count(*) n from orders where status='paid' and date>=? and barberId<>'' group by barberId order by n desc", dOf(mon)).filter(x => activeIds.has(x.barberId));
      const ri = ranked.findIndex(x => x.barberId === s.id), rankWeek = ri >= 0 ? { rank: ri + 1, of: ranked.length, cuts: ranked[ri].n } : null;
      const level = stats.cuts >= 1000 ? 'Legend' : stats.cuts >= 300 ? 'Master Barber' : stats.cuts >= 50 ? 'Pro Barber' : 'Rising Barber';
      let nextFree = null; for (let i = 0; i < 7 && !nextFree; i++) { const d = dOf(new Date(Date.now() + i * 864e5)); try { const sl = slotsFor(s.branchId, d, s.id, 30); if (sl.length) nextFree = { date: d, time: sl[0] }; } catch { } }
      const taggedPosts = all("select p.id, p.text, p.imageUrl image, p.createdAt, (select count(*) from bh_likes l where l.postId=p.id) likes from bh_posts p where p.staffId=? and p.hidden=0 order by p.createdAt desc limit 30", s.id);
      return send(res, 200, { stats, rankWeek, nextFree, posts: taggedPosts, certs: all('select id,title,org,date,imageUrl image,coalesce(verified,0) verified from bh_certs where staffId=? order by date desc, createdAt desc limit 40', s.id), barber: { ...card, level, followers: stats.followers, cover: pr.cover || '', bio: pr.bio || '', instagram: pr.instagram || '', facebook: pr.facebook || '', tiktok: pr.tiktok || '' },
        branch: { id: br.id, name: br.name, photo: br.photo || siteCover(br.name) || '', address: br.address || '', phone: br.phone || '', openTime: br.openTime || '09:00', closeTime: br.closeTime || '21:00', mapUrl: br.mapUrl || '' },
        portfolio: all('select id,url,caption,style from bh_portfolio where staffId=? order by createdAt desc limit 60', s.id), reviews,
        services: servicesList(), favorite: !!(u && one('select 1 x from bh_favorites where userId=? and staffId=?', u.id, s.id)) });
    }
    const shm = sub.match(/^\/shops\/(\w+)$/);
    if (shm && method === 'GET') {
      const b = get('branches', shm[1]); if (!b) bad(404, 'Shop not found');
      const bm2 = new Map(all('select * from branches').map(x => [x.id, x])), rm = ratingMap(), pc = portCount(), rv = one('select count(*) n, avg(rating) a from reviews where branchId=?', b.id);
      const barbers = all('select * from staff where branchId=? and active=1', b.id).map(s => barberCard(s, rm, pc, bm2)).sort((x, y) => y.score - x.score);
      const gallery = siteGallery(b.name), reviews = all('select r.id,r.name,r.rating,r.text,r.createdAt,coalesce(r.verified,0) verified, r.reply, r.replyAt, r.replyBy, s.name staffName from reviews r left join staff s on s.id=r.staffId where r.branchId=? order by r.createdAt desc limit 20', b.id);
      const t = todayStr(), waiting = one("select count(*) n from orders where branchId=? and date=? and status='waiting'", b.id, t).n, cutting = one("select count(*) n from orders where branchId=? and date=? and status='in_chair'", b.id, t).n;
      const onDuty = all('select id from staff where branchId=? and active=1', b.id).filter(x => ['present', 'late'].includes(staffState(x.id, t).state)).length;
      const nowM = new Date().getHours() * 60 + new Date().getMinutes(), isOpen = nowM >= toMin(b.openTime || '09:00') && nowM < toMin(b.closeTime || '21:00');
      const live = { open: isOpen, waiting, cutting, onDuty, estWait: isOpen && onDuty ? Math.ceil(waiting / onDuty) * 30 : null };
      return send(res, 200, { live, shop: { id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', openTime: b.openTime || '09:00', closeTime: b.closeTime || '21:00', mapUrl: b.mapUrl || '', lat: b.lat ?? null, lng: b.lng ?? null, photo: b.photo || siteCover(b.name) || '',
        rating: rv.n ? Math.round(rv.a * 10) / 10 : 0, reviews: rv.n }, gallery: b.photo ? [b.photo, ...gallery.filter(g => g !== b.photo)] : gallery, barbers, reviews, services: servicesList() });
    }
    const fm = sub.match(/^\/favorites\/(\w+)$/);
    if (fm && (method === 'PUT' || method === 'DELETE')) {
      const u = needUser(req); if (!get('staff', fm[1])) bad(404, 'Barber not found');
      if (method === 'PUT') run('insert or ignore into bh_favorites(userId,staffId,createdAt) values(?,?,?)', u.id, fm[1], nowISO()); else run('delete from bh_favorites where userId=? and staffId=?', u.id, fm[1]);
      return send(res, 200, { ok: true });
    }

    // ----- booking (logged in) -----
    if (sub === '/book' && method === 'POST') {
      const u = needUser(req); if (tooMany(ip, 'bk', 10, 3600e3)) bad(429, 'Too many bookings from this device. Please try again later.');
      const b = await readBody(req);
      // optional repeat: every 1, 2, 3, 4 or 6 weeks for 2 to 6 cuts in total; slots that are taken are skipped and reported
      const every = [1, 2, 3, 4, 6].includes(+b.repeatEvery) ? +b.repeatEvery : 0, count = every ? Math.max(2, Math.min(6, Math.round(+b.repeatCount) || 2)) : 1;
      const make = date => {
        const x = createBooking({ branchId: b.branchId, staffId: b.staffId, itemIds: b.itemIds, date, time: b.time, name: u.name, phone: u.phone, email: u.email, notes: clip(b.notes, 300), consent: !!b.consent }, 'online');
        run('update bookings set userId=? where id=?', u.id, x.id); if (x.customerId && !u.customerId) { run('update bh_users set customerId=? where id=?', x.customerId, u.id); u.customerId = x.customerId; }
        notify(u.id, 'booking', `Booked: ${x.date} ${x.time} with ${x.staffName || 'any barber'} at ${x.branchName}`, '#/bookings', 'bk-' + x.id);
        log({ name: 'App: ' + u.name }, 'booking', 'bookings', x.id, `${x.date} ${x.time} ${x.branchName}`); return x;
      };
      const bk = make(String(b.date || '')); hit(ip, 'bk'); const series = [];
      for (let i = 1; i < count; i++) {
        const d = dOf(new Date(new Date(bk.date + 'T00:00:00').getTime() + i * every * 7 * 864e5));
        try { const x = make(d); series.push({ date: x.date, time: x.time, ok: true, staff: x.staffName }); } catch (er) { series.push({ date: d, time: String(b.time), ok: false, reason: er.message }); }
      }
      return send(res, 201, { ok: true, booking: { id: bk.id, date: bk.date, time: bk.time, branch: bk.branchName, staff: bk.staffName, items: bk.items, total: bk.total }, series });
    }
    if (sub === '/bookings' && method === 'GET') {
      const u = needUser(req), now = Date.now();
      const rows = all('select * from bookings where userId=? order by date desc, time desc limit 100', u.id).map(b => {
        const v = bookingView(b), start = new Date(`${b.date}T${b.time}:00`).getTime();
        const reviewed = b.orderId ? !!one('select 1 x from reviews where orderId=?', b.orderId) : false;
        const paid = b.orderId ? one("select status from orders where id=?", b.orderId)?.status === 'paid' : false;
        return { id: v.id, branchId: v.branchId, branchName: v.branchName, staffId: v.staffId, staffName: v.staffName, staffPhoto: v.staffPhoto, date: v.date, time: v.time, mins: v.mins, status: v.status,
          items: v.items, itemIds: v.itemIds, total: v.total, notes: v.notes || '', canCancel: v.status === 'booked' && start - now >= 3600e3, canReview: paid && !reviewed, reviewed };
      });
      return send(res, 200, { bookings: rows });
    }
    const cm = sub.match(/^\/bookings\/(\w+)\/cancel$/);
    if (cm && method === 'POST') {
      const u = needUser(req), b = one('select * from bookings where id=? and userId=?', cm[1], u.id); if (!b) bad(404, 'Booking not found');
      if (b.status !== 'booked') bad(409, 'This booking is already ' + b.status);
      if (new Date(`${b.date}T${b.time}:00`).getTime() - Date.now() < 3600e3) bad(409, 'Bookings can be cancelled up to 1 hour before. Please call the shop.');
      run("update bookings set status='cancelled' where id=?", b.id); log({ name: 'App: ' + u.name }, 'booking-cancelled', 'bookings', b.id, b.customerName); freed(b.branchId, b.staffId, b.date);
      return send(res, 200, { ok: true });
    }

    // ----- verified reviews: only for a completed, paid visit that was booked through the app -----
    if (sub === '/reviews' && method === 'POST') {
      const u = needUser(req), b = await readBody(req), rating = Math.round(+b.rating), text = clip(b.text, 600);
      if (!(rating >= 1 && rating <= 5)) bad(400, 'Please choose a rating from 1 to 5 stars');
      const bk = one('select * from bookings where id=? and userId=?', String(b.bookingId || ''), u.id); if (!bk || !bk.orderId) bad(404, 'Visit not found');
      const o = get('orders', bk.orderId); if (!o || o.status !== 'paid') bad(409, 'You can review after your haircut is completed');
      if (one('select 1 x from reviews where orderId=?', o.id)) bad(409, 'You already reviewed this visit');
      const id = uid(); run('insert into reviews(id,branchId,staffId,name,rating,text,createdAt,userId,orderId,verified) values(?,?,?,?,?,?,?,?,?,1)', id, o.branchId, o.barberId || bk.staffId || '', short(u.name), rating, text, nowISO(), u.id, o.id);
      log({ name: 'App: ' + u.name }, 'review', 'reviews', id, `${rating} stars (verified)`); return send(res, 201, { ok: true });
    }


    // ----- waitlist -----
    if (sub === '/waitlist' && method === 'GET') {
      const u = needUser(req), t = todayStr();
      return send(res, 200, { items: all('select * from bh_waitlist where userId=? and date>=? and notifiedAt is null order by date', u.id, t).map(w => ({ id: w.id, date: w.date, branchId: w.branchId, branchName: get('branches', w.branchId)?.name || '', staffId: w.staffId, staffName: w.staffId === 'any' ? '' : get('staff', w.staffId)?.name || '' })) });
    }
    if (sub === '/waitlist' && method === 'POST') {
      const u = needUser(req), b = await readBody(req), date = String(b.date || ''), staffId = String(b.staffId || 'any');
      if (!get('branches', String(b.branchId || ''))) bad(400, 'Pick a shop'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr()) bad(400, 'Pick a valid date');
      if (staffId !== 'any' && get('staff', staffId)?.branchId !== String(b.branchId)) bad(400, 'Pick a barber from this shop');
      if (slotsFor(String(b.branchId), date, staffId, 30).length) bad(409, 'There are open slots for that day. Please book instead.');
      if (one('select 1 x from bh_waitlist where userId=? and branchId=? and date=? and staffId=? and notifiedAt is null', u.id, b.branchId, date, staffId)) return send(res, 200, { ok: true });
      if (one('select count(*) n from bh_waitlist where userId=? and date>=? and notifiedAt is null', u.id, todayStr()).n >= 5) bad(409, 'You can wait on up to 5 days at a time');
      run('insert into bh_waitlist(id,userId,branchId,staffId,date,createdAt,notifiedAt) values(?,?,?,?,?,?,null)', uid(), u.id, String(b.branchId), staffId, date, nowISO()); return send(res, 201, { ok: true });
    }
    const wlm = sub.match(/^\/waitlist\/(\w+)$/);
    if (wlm && method === 'DELETE') { const u = needUser(req); run('delete from bh_waitlist where id=? and userId=?', wlm[1], u.id); return send(res, 200, { ok: true }); }

    // ----- notifications -----
    if (sub === '/notifications' && method === 'GET') {
      const u = needUser(req); syncRate(u.id); syncDue(u.id);
      return send(res, 200, { unread: unreadOf(u.id), items: all('select id,kind,text,link,createdAt,readAt from bh_notifs where userId=? order by createdAt desc limit 50', u.id) });
    }
    if (sub === '/notifications/read' && method === 'POST') { const u = needUser(req); run('update bh_notifs set readAt=? where userId=? and readAt is null', nowISO(), u.id); return send(res, 200, { ok: true }); }

    // ----- community -----
    const blockedOf = id => id ? new Set([...all('select blockedId x from bh_blocks where userId=?', id), ...all('select userId x from bh_blocks where blockedId=?', id)].map(r => r.x)) : new Set();
    const nameMap = () => new Map(all('select id,name from bh_users').map(u => [u.id, short(u.name)]));
    const postView = (r, me, names) => ({ id: r.id, text: r.text, image: r.imageUrl || '', style: r.style || '', createdAt: r.createdAt, userId: r.userId, author: names.get(r.userId) || 'Member', authorPhoto: one('select photo from bh_users where id=?', r.userId)?.photo || '', mine: !!me && me.id === r.userId,
      staffId: r.staffId || '', staffName: r.staffId ? get('staff', r.staffId)?.name || '' : '', likes: one('select count(*) n from bh_likes where postId=?', r.id).n, comments: one('select count(*) n from bh_comments where postId=? and hidden=0', r.id).n,
      liked: !!me && !!one('select 1 x from bh_likes where postId=? and userId=?', r.id, me.id), saved: !!me && !!one('select 1 x from bh_saves where userId=? and postId=?', me.id, r.id),
      following: !!me && !!one('select 1 x from bh_follows where userId=? and targetId=?', me.id, r.userId) });
    const spammy = t => (String(t).match(/https?:\/\//gi) || []).length > 2;
    // a member's public profile: only what they chose to show (short name, photo, cover, bio) plus their posts; never phone or email
    const mm = sub.match(/^\/members\/(\w+)$/);
    if (mm && method === 'GET') {
      const me = userOf(req), t = get('bh_users', mm[1]); if (!t || (me && blockedOf(me.id).has(t.id))) bad(404, 'Member not found');
      const names = nameMap(), live = 'userId=? and hidden=0';
      return send(res, 200, { member: { id: t.id, name: short(t.name), photo: t.photo || '', cover: t.cover || '', bio: t.bio || '', joined: t.createdAt, mine: !!me && me.id === t.id,
        posts: one(`select count(*) n from bh_posts where ${live}`, t.id).n, likes: one(`select count(*) n from bh_likes where postId in (select id from bh_posts where ${live})`, t.id).n,
        followers: one('select count(*) n from bh_follows where targetId=?', t.id).n, following: !!me && !!one('select 1 x from bh_follows where userId=? and targetId=?', me.id, t.id) },
        posts: all(`select * from bh_posts where ${live} order by createdAt desc limit 30`, t.id).map(r => postView(r, me, names)) });
    }
    // discovery grid: barbers' portfolio cuts plus members' photo posts, filterable by style
    if (sub === '/cuts' && method === 'GET') {
      const me = userOf(req), blocked = blockedOf(me?.id), style = clip(q.style, 30), names = nameMap(), sm = new Map(all('select id,name,branchId,active from staff').map(x => [x.id, x]));
      const cuts = all('select id,staffId,url,caption,style,createdAt from bh_portfolio order by createdAt desc limit 120').filter(p => sm.get(p.staffId)?.active).map(p => ({ kind: 'cut', id: p.id, image: p.url, title: p.caption || p.style || 'Fresh cut', style: p.style || '', barberId: p.staffId, barberName: sm.get(p.staffId).name, branchId: sm.get(p.staffId).branchId, createdAt: p.createdAt }));
      const posts = all("select id,userId,staffId,text,imageUrl,style,createdAt from bh_posts where hidden=0 and imageUrl<>'' order by createdAt desc limit 120").filter(p => !blocked.has(p.userId)).map(p => ({ kind: 'post', id: p.id, image: p.imageUrl, title: String(p.text || '').slice(0, 40) || p.style || 'Photo', style: p.style || '', barberId: p.staffId || '', barberName: p.staffId ? sm.get(p.staffId)?.name || '' : '', branchId: p.staffId ? sm.get(p.staffId)?.branchId || '' : '', author: names.get(p.userId) || 'Member', createdAt: p.createdAt }));
      let items = [...cuts, ...posts].sort((x, y) => y.createdAt.localeCompare(x.createdAt)); const styles = [...new Set(items.map(i => i.style).filter(Boolean))].sort();
      if (style) items = items.filter(i => i.style === style);
      return send(res, 200, { items: items.slice(0, 90), styles });
    }
    if (sub === '/feed' && method === 'GET') {
      const me = userOf(req), blocked = blockedOf(me?.id), names = nameMap(), before = clip(q.before, 40) || '9999', style = clip(q.style, 30), term = clip(q.q, 60).toLowerCase(), scope = String(q.scope || 'all');
      let rows = all('select * from bh_posts where hidden=0 and createdAt<? order by createdAt desc limit 300', before);
      if (scope !== 'all' && !me) bad(401, 'Please log in');
      if (scope === 'following') { const f = new Set(all('select targetId x from bh_follows where userId=?', me.id).map(r => r.x)), fb = new Set(all('select staffId x from bh_favorites where userId=?', me.id).map(r => r.x)); rows = rows.filter(r => f.has(r.userId) || r.userId === me.id || (r.staffId && fb.has(r.staffId))); }
      else if (scope === 'mine') rows = rows.filter(r => r.userId === me.id);
      else if (scope === 'saved') { const sv = new Set(all('select postId x from bh_saves where userId=?', me.id).map(r => r.x)); rows = rows.filter(r => sv.has(r.id)); }
      if (style) rows = rows.filter(r => r.style === style);
      if (term) rows = rows.filter(r => [r.text, r.style, names.get(r.userId), r.staffId ? get('staff', r.staffId)?.name : ''].join(' ').toLowerCase().includes(term));
      if (scope !== 'mine') rows = rows.filter(r => !blocked.has(r.userId));
      rows = rows.slice(0, 20);
      const out = { posts: rows.map(r => postView(r, me, names)), more: rows.length === 20 };
      if (scope === 'mine') { const mine = all('select id from bh_posts where userId=? and hidden=0', me.id); out.stats = { posts: mine.length, likes: mine.reduce((n, p) => n + one('select count(*) n from bh_likes where postId=?', p.id).n, 0), following: one('select count(*) n from bh_favorites where userId=?', me.id).n }; }
      if (q.spot === '1') {   // barber of the week: most completed cuts since Monday
        const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
        const top = all("select barberId, count(*) n from orders where status='paid' and date>=? and barberId<>'' group by barberId order by n desc", dOf(mon)).find(x => get('staff', x.barberId)?.active), sp = top ? get('staff', top.barberId) : null;
        out.spotlight = sp ? { id: sp.id, name: sp.name, photo: sp.photo || '', branchName: get('branches', sp.branchId)?.name || '', cuts: top.n } : null;
      }
      return send(res, 200, out);
    }
    if (sub === '/posts' && method === 'POST') {
      const u = needUser(req); if (tooMany(ip, 'po', 10, 3600e3)) bad(429, 'You are posting too fast. Please try again later.');
      const b = await readBody(req, 1_500_000), text = clip(b.text, 500); let image = '';
      if (!text && !b.data) bad(400, 'Write something or add a photo'); if (spammy(text)) bad(400, 'Too many links in one post');
      if (b.data) {
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data)); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
        const iid = uid() + uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', iid, m[1], buf, nowISO()); image = '/img/' + iid;
      }
      const staffId = b.staffId && get('staff', String(b.staffId)) ? String(b.staffId) : '', id = uid();
      run('insert into bh_posts(id,userId,staffId,text,imageUrl,style,createdAt,hidden) values(?,?,?,?,?,?,?,0)', id, u.id, staffId, text, image, clip(b.style, 30), nowISO()); hit(ip, 'po');
      return send(res, 201, { post: postView(get('bh_posts', id), u, nameMap()) });
    }
    const pm0 = sub.match(/^\/posts\/(\w+)(?:\/(like|comments|save))?$/);
    if (pm0) {
      const post = get('bh_posts', pm0[1]); if (!post || post.hidden) bad(404, 'Post not found');
      if (!pm0[2] && method === 'DELETE') {
        const u = needUser(req); if (post.userId !== u.id) bad(403, 'You can only delete your own posts');
        const im = /\/img\/(\w+)/.exec(post.imageUrl || ''); if (im) run('delete from images where id=?', im[1]);
        run('delete from bh_likes where postId=?', post.id); run('delete from bh_comments where postId=?', post.id); run('delete from bh_saves where postId=?', post.id); run('delete from bh_posts where id=?', post.id); return send(res, 200, { ok: true });
      }
      if (pm0[2] === 'save' && (method === 'PUT' || method === 'DELETE')) {
        const u = needUser(req); if (method === 'PUT') run('insert or ignore into bh_saves(userId,postId,createdAt) values(?,?,?)', u.id, post.id, nowISO()); else run('delete from bh_saves where userId=? and postId=?', u.id, post.id);
        return send(res, 200, { saved: method === 'PUT' });
      }
      if (pm0[2] === 'like' && (method === 'PUT' || method === 'DELETE')) {
        const u = needUser(req); if (method === 'PUT') { const had = one('select 1 x from bh_likes where postId=? and userId=?', post.id, u.id); run('insert or ignore into bh_likes(postId,userId) values(?,?)', post.id, u.id); if (!had && post.userId !== u.id) notify(post.userId, 'like', `${short(u.name)} liked your post`, '#/community', 'like-' + post.id + '-' + u.id); } else run('delete from bh_likes where postId=? and userId=?', post.id, u.id);
        return send(res, 200, { likes: one('select count(*) n from bh_likes where postId=?', post.id).n });
      }
      if (pm0[2] === 'comments' && method === 'GET') {
        const me = userOf(req), blocked = blockedOf(me?.id), names = nameMap();
        return send(res, 200, { comments: all('select * from bh_comments where postId=? and hidden=0 order by createdAt limit 100', post.id).filter(c => !blocked.has(c.userId)).map(c => ({ id: c.id, text: c.text, createdAt: c.createdAt, author: names.get(c.userId) || 'Member', userId: c.userId, mine: !!me && me.id === c.userId })) });
      }
      if (pm0[2] === 'comments' && method === 'POST') {
        const u = needUser(req); if (tooMany(ip, 'cm', 30, 3600e3)) bad(429, 'You are commenting too fast. Please try again later.');
        if (one('select 1 x from bh_blocks where (userId=? and blockedId=?) or (userId=? and blockedId=?)', u.id, post.userId, post.userId, u.id)) bad(403, 'You cannot comment on this post');
        const text = clip((await readBody(req)).text, 300); if (!text) bad(400, 'Write a comment'); if (spammy(text)) bad(400, 'Too many links in one comment');
        const id = uid(), at = nowISO(); if (post.userId !== u.id) notify(post.userId, 'comment', `${short(u.name)} commented: ${text.slice(0, 60)}`, '#/community', 'cm-' + id);
        run('insert into bh_comments(id,postId,userId,text,createdAt,hidden) values(?,?,?,?,?,0)', id, post.id, u.id, text, at); hit(ip, 'cm');
        return send(res, 201, { comment: { id, text, createdAt: at, author: short(u.name), userId: u.id, mine: true } });
      }
    }
    const cdm = sub.match(/^\/comments\/(\w+)$/);
    if (cdm && method === 'DELETE') { const u = needUser(req), c = get('bh_comments', cdm[1]); if (!c || c.userId !== u.id) bad(404, 'Comment not found'); run('delete from bh_comments where id=?', c.id); return send(res, 200, { ok: true }); }
    const flm = sub.match(/^\/(follow|block)\/(\w+)$/);
    if (flm && (method === 'PUT' || method === 'DELETE')) {
      const u = needUser(req), tid = flm[2]; if (tid === u.id) bad(400, 'You cannot do that to yourself'); if (!get('bh_users', tid)) bad(404, 'Member not found');
      const [tbl, col] = flm[1] === 'follow' ? ['bh_follows', 'targetId'] : ['bh_blocks', 'blockedId'];
      if (method === 'PUT') { run(`insert or ignore into ${tbl}(userId,${col},createdAt) values(?,?,?)`, u.id, tid, nowISO()); if (flm[1] === 'follow') notify(tid, 'follow', `${short(u.name)} started following you`, '#/community', 'fl-' + u.id); if (flm[1] === 'block') run('delete from bh_follows where (userId=? and targetId=?) or (userId=? and targetId=?)', u.id, tid, tid, u.id); }
      else run(`delete from ${tbl} where userId=? and ${col}=?`, u.id, tid);
      return send(res, 200, { ok: true });
    }
    if (sub === '/report' && method === 'POST') {
      const u = needUser(req), b = await readBody(req), kind = String(b.kind), tid = String(b.id || '');
      if (!['post', 'comment', 'user'].includes(kind)) bad(400, 'Bad report'); if (!get({ post: 'bh_posts', comment: 'bh_comments', user: 'bh_users' }[kind], tid)) bad(404, 'Not found');
      run("insert or ignore into bh_reports(id,kind,targetId,userId,reason,createdAt,status) values(?,?,?,?,?,?,'open')", uid(), kind, tid, u.id, clip(b.reason, 200), nowISO());
      if (kind !== 'user' && one("select count(*) n from bh_reports where kind=? and targetId=? and status='open'", kind, tid).n >= 3) run(`update ${kind === 'post' ? 'bh_posts' : 'bh_comments'} set hidden=1 where id=?`, tid);   // auto-hide until the owner reviews it
      return send(res, 200, { ok: true });
    }

    // ----- pro tools (barber / owner, signed in with their POS login) -----
    if (sub.startsWith('/pro/')) {
      const me = whoami(req); if (!me) bad(401, 'Please log in with your Brotherhood staff account');
      const admin = me.role === 'owner' || me.role === 'admin', mine = me.role === 'barber' ? get('users', me.id)?.staffId || '' : '';
      const target = sid => { sid = String(sid || mine); const s = get('staff', sid); if (!s) bad(404, 'Choose a barber'); if (!admin && sid !== mine) bad(403, 'You can only edit your own profile'); return s; };
      if (sub === '/pro/me' && method === 'GET') {
        if (!admin && !mine) bad(404, 'Your login is not linked to a barber profile yet. Ask the owner to link it in Back office → Users.');
        const staff = (admin ? all('select * from staff where active=1 order by name') : [get('staff', mine)]).filter(Boolean).map(s => {
          const pr = one('select * from bh_barber where staffId=?', s.id) || {};
          return { id: s.id, name: s.name, photo: s.photo || '', branchName: get('branches', s.branchId)?.name || '', headline: pr.headline || '', bio: pr.bio || '', years: pr.years || 0, specialties: jp(pr.specialties),
            instagram: pr.instagram || '', facebook: pr.facebook || '', tiktok: pr.tiktok || '', verified: !!pr.verified, cover: pr.cover || '', offers: all('select pkg,price from bh_offers where staffId=?', s.id), portfolio: all('select id,url,caption,style from bh_portfolio where staffId=? order by createdAt desc', s.id), certs: all('select id,title,org,date,imageUrl image,coalesce(verified,0) verified from bh_certs where staffId=? order by date desc, createdAt desc', s.id) };
        });
        return send(res, 200, { admin, name: me.name, staff });
      }
      if (sub === '/pro/branch-location' && method === 'PUT') {   // owner: set a branch's map pin by coordinates, or detect it from the branch's Google Maps link
        if (!admin) bad(403, 'Owner only'); const b = await readBody(req), br = get('branches', String(b.branchId || '')); if (!br) bad(404, 'Branch not found');
        let pos;
        if (b.fromMapUrl) {
          const link = clip(b.mapUrl || br.mapUrl, 500); if (!link) bad(400, 'This branch has no Google Maps link yet. Paste one first.');
          if (!/^https:\/\//i.test(link)) bad(400, 'The link must start with https://');
          pos = await resolveMapUrl(link); if (!pos) bad(422, 'Could not read the location from that link. Open the place in Google Maps, copy the full link from the address bar, or type the coordinates.');
          if (b.mapUrl) run('update branches set mapUrl=? where id=?', link, br.id);
        } else { pos = { lat: +b.lat, lng: +b.lng }; if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng) || Math.abs(pos.lat) > 90 || Math.abs(pos.lng) > 180 || (pos.lat === 0 && pos.lng === 0)) bad(400, 'Enter a valid latitude and longitude'); }
        run('update branches set lat=?, lng=? where id=?', Math.round(pos.lat * 1e6) / 1e6, Math.round(pos.lng * 1e6) / 1e6, br.id);
        log(me, 'branch-location', 'branches', br.id, br.name); return send(res, 200, { ok: true, lat: pos.lat, lng: pos.lng });
      }
      // booking rules (owner): no-show limit and the buffer between cuts
      if (sub === '/pro/rules' && method === 'GET') { if (!admin) bad(403, 'Owner only'); return send(res, 200, { noshowMax: +getSetting('noshowMax') || 0, bufferMins: +getSetting('bufferMins') || 0, emailReady: emailReady() }); }
      if (sub === '/pro/rules' && method === 'PUT') {
        if (!admin) bad(403, 'Owner only'); const b = await readBody(req);
        if ('noshowMax' in b) { const v = Math.round(+b.noshowMax); if (![0, 1, 2, 3, 4, 5].includes(v)) bad(400, 'Choose 0 (off) to 5'); setSetting('noshowMax', String(v)); }
        if ('bufferMins' in b) { const v = Math.round(+b.bufferMins); if (![0, 5, 10, 15, 20, 30].includes(v)) bad(400, 'Choose 0, 5, 10, 15, 20 or 30 minutes'); setSetting('bufferMins', String(v)); }
        log(me, 'booking-rules', 'settings', '', JSON.stringify(b).slice(0, 120)); return send(res, 200, { ok: true });
      }
      // no-show watch (owner): customers who missed appointments in the last 90 days, and who is paused from online booking
      if (sub === '/pro/noshows' && method === 'GET') {
        if (!admin) bad(403, 'Owner only'); const since = dOf(new Date(Date.now() - 90 * 864e5)), max = +getSetting('noshowMax') || 0, by = new Map();
        for (const x of all("select * from bookings where status='noshow' and date>=? order by date desc", since)) {
          const k = x.customerId || ('p:' + normPhone(x.phone)), r = by.get(k) || { customerId: x.customerId || '', name: x.customerName, phone: x.phone, count: 0, last: x.date }; r.count++; by.set(k, r);
        }
        const rows = [...by.values()].map(r => { const c = r.customerId ? get('customers', r.customerId) : null, allowed = !!(c && c.noshowOk); return { ...r, allowed, blocked: max > 0 && r.count >= max && !allowed }; }).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 100);
        return send(res, 200, { max, rows });
      }
      if (sub === '/pro/noshow-allow' && method === 'POST') {
        if (!admin) bad(403, 'Owner only'); const b = await readBody(req), c = get('customers', String(b.customerId || '')); if (!c) bad(404, 'Customer not found');
        run('update customers set noshowOk=? where id=?', b.allow ? 1 : 0, c.id); log(me, b.allow ? 'noshow-allow' : 'noshow-restrict', 'customers', c.id, c.name); return send(res, 200, { ok: true });
      }
      // blocked time: a barber (or the owner) closes a break, training or day off so nobody can book it
      const hm = v => { const m = /^(\d{2}):(\d{2})$/.exec(String(v || '')); return m && +m[1] <= 24 && +m[2] <= 59 ? +m[1] * 60 + +m[2] : null; }, hmText = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      if (sub === '/pro/block' && method === 'POST') {
        const b = await readBody(req), s = target(b.staffId), date = String(b.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr() || date > dOf(new Date(Date.now() + 180 * 864e5))) bad(400, 'Pick a date within the next 6 months');
        const f = b.allDay ? 0 : hm(b.from), t = b.allDay ? 1440 : hm(b.to); if (f == null || t == null || f >= t) bad(400, 'Choose a start time that is before the end time');
        if (one('select count(*) n from bh_blocked where staffId=? and date>=?', s.id, todayStr()).n >= 60) bad(409, 'Too many blocks. Remove old ones first.');
        const id = uid(); run('insert into bh_blocked(id,staffId,date,fromMin,toMin,reason,createdAt) values(?,?,?,?,?,?,?)', id, s.id, date, f, t, clip(b.reason, 60), nowISO());
        const conflicts = all("select * from bookings where staffId=? and date=? and status='booked'", s.id, date).filter(x => toMin(x.time) < t && f < toMin(x.time) + x.mins).map(x => ({ time: x.time, customer: x.customerName, phone: x.phone }));
        log(me, 'time-block', 'bh_blocked', id, `${s.name} ${date} ${hmText(f)}-${hmText(t)}`); return send(res, 201, { id, conflicts });
      }
      if (sub === '/pro/blocks' && method === 'GET') {
        const s = target(q.staffId); return send(res, 200, { blocks: all('select * from bh_blocked where staffId=? and date>=? order by date, fromMin limit 100', s.id, todayStr()).map(r => ({ id: r.id, date: r.date, from: hmText(r.fromMin), to: hmText(Math.min(r.toMin, 1439)), allDay: r.fromMin === 0 && r.toMin >= 1440, reason: r.reason || '' })) });
      }
      const blm = sub.match(/^\/pro\/blocks\/(\w+)$/);
      if (blm && method === 'DELETE') { const r = get('bh_blocked', blm[1]); if (!r) bad(404, 'Not found'); target(r.staffId); run('delete from bh_blocked where id=?', r.id); return send(res, 200, { ok: true }); }
      // a barber's private notes about a client (only that barber and the owner can read them)
      const clientKey = v => { v = String(v || ''); if (!/^(n:.{1,100}|\w{1,20})$/.test(v)) bad(400, 'Bad client'); return v; };
      if (sub === '/pro/client' && method === 'GET') {
        const s = target(q.staffId), key = clientKey(q.key), mine_ = all("select * from orders where status='paid' and barberId=? order by date desc, createdAt desc", s.id).map(parseOrder).filter(o => (o.customerId || ('n:' + String(o.customerName || '').toLowerCase())) === key);
        const n = one('select * from bh_client_notes where staffId=? and ckey=?', s.id, key) || {}, cust = key.startsWith('n:') ? null : get('customers', key);
        return send(res, 200, { key, name: cust?.name || mine_[0]?.customerName || key.slice(2), phone: cust?.phone || '', note: n.note || '', pref: n.pref || cust?.preferredCut || '', vip: !!n.vip, birthday: n.birthday || '',
          visits: mine_.length, first: mine_.length ? mine_[mine_.length - 1].date : '', last: mine_[0]?.date || '', history: mine_.slice(0, 20).map(o => ({ date: o.date, items: o.items.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')), total: o.total })) });
      }
      if (sub === '/pro/client' && method === 'PUT') {
        const b = await readBody(req), s = target(b.staffId), key = clientKey(b.key), cur = one('select * from bh_client_notes where staffId=? and ckey=?', s.id, key) || {};   // fields that are not sent keep their saved value
        let bd = 'birthday' in b ? String(b.birthday || '').trim() : cur.birthday || ''; const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(bd);
        bd = m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? m[1] + '-' + m[2] : '';   // only month and day are kept
        run('insert or replace into bh_client_notes(staffId,ckey,note,pref,vip,birthday,updatedAt) values(?,?,?,?,?,?,?)', s.id, key, 'note' in b ? clip(b.note, 500) : cur.note || '', 'pref' in b ? clip(b.pref, 120) : cur.pref || '', 'vip' in b ? (b.vip ? 1 : 0) : cur.vip || 0, bd, nowISO());
        return send(res, 200, { ok: true });
      }
      // Branch health score (owner): sales trend, retention, attendance, ratings, remittance accuracy, checklists and open problems, each 0-100, weighted
      if (sub === '/pro/health' && method === 'GET') {
        if (!admin) bad(403, 'Owner only');
        const days = [7, 30, 90].includes(+q.days) ? +q.days : 30, day = n => dOf(new Date(Date.now() - n * 864e5)), from = day(days - 1), to = todayStr(), pFrom = day(2 * days - 1), pTo = day(days);
        const clamp = v => Math.max(0, Math.min(100, Math.round(v))), W = { sales: 25, retention: 20, attendance: 15, rating: 15, remittance: 10, checklist: 10, problems: 5 };
        const out = all('select * from branches order by rowid').map(b => {
          const cur = one("select ifnull(sum(total),0) s, count(*) n from orders where status='paid' and branchId=? and date>=? and date<=?", b.id, from, to), prev = one("select ifnull(sum(total),0) s from orders where status='paid' and branchId=? and date>=? and date<=?", b.id, pFrom, pTo);
          const change = prev.s > 0 ? Math.round((cur.s / prev.s - 1) * 100) : null, C = {};
          C.sales = { label: 'Sales trend', score: prev.s > 0 ? clamp(60 + (cur.s / prev.s - 1) * 200) : cur.s > 0 ? 70 : null, detail: prev.s > 0 ? `${change >= 0 ? '+' : ''}${change}% vs the previous ${days} days` : cur.s > 0 ? 'No earlier period to compare yet' : 'No sales in this period' };
          const served = all("select distinct customerId c from orders where status='paid' and customerId<>'' and branchId=? and date>=? and date<=?", b.id, from, to).map(r => r.c), allVisits = new Map(all("select customerId c, count(*) n from orders where status='paid' and customerId<>'' and branchId=? group by customerId", b.id).map(r => [r.c, r.n]));
          const ret = served.length ? served.filter(c => (allVisits.get(c) || 0) > 1).length / served.length : null;
          C.retention = { label: 'Customers coming back', score: ret == null ? null : clamp(ret / 0.6 * 100), detail: ret == null ? 'No identified customers in this period' : `${Math.round(ret * 100)}% of ${served.length} customers have visited more than once` };
          const att = one("select count(*) n, sum(case when lateMins>0 then 1 else 0 end) late from attendance where branchId=? and date>=? and date<=? and (status is null or status<>'off')", b.id, from, to), lateRate = att.n ? (att.late || 0) / att.n : null;
          C.attendance = { label: 'Barber punctuality', score: lateRate == null ? null : clamp(100 - lateRate * 150), detail: lateRate == null ? 'No attendance records' : `${Math.round(lateRate * 100)}% of ${att.n} shifts started late` };
          const rv = one('select count(*) n, avg(rating) a from reviews where branchId=? and createdAt>=?', b.id, from) , rvAll = one('select count(*) n, avg(rating) a from reviews where branchId=?', b.id), rr = rv.n ? rv : rvAll;
          C.rating = { label: 'Customer ratings', score: rr.n ? clamp((rr.a - 3) / 2 * 100) : null, detail: rr.n ? `${(Math.round(rr.a * 10) / 10).toFixed(1)} average from ${rr.n} review${rr.n === 1 ? '' : 's'}${rv.n ? '' : ' (all time)'}` : 'No reviews yet' };
          const rm = one("select count(*) n, sum(case when abs(ifnull(variance,0))<=1 then 1 else 0 end) ok from remittances where branchId=? and date>=? and date<=?", b.id, from, to);
          C.remittance = { label: 'Remittance accuracy', score: rm.n ? clamp((rm.ok || 0) / rm.n * 100) : null, detail: rm.n ? `${rm.ok || 0} of ${rm.n} remittances matched the expected cash` : 'No remittances submitted' };
          const active = one("select count(distinct date) n from orders where status='paid' and branchId=? and date>=? and date<=?", b.id, from, to).n, done = one('select count(*) n from (select distinct date, kind from checklist_runs where branchId=? and date>=? and date<=?)', b.id, from, to).n;
          C.checklist = { label: 'Opening and closing checklists', score: active ? clamp(done / (active * 2) * 100) : null, detail: active ? `${done} of ${active * 2} checklists done on ${active} trading days` : 'No trading days in this period' };
          const open = one("select count(*) n from problems where branchId=? and status not in ('RESOLVED','CLOSED')", b.id).n;
          C.problems = { label: 'Open problem reports', score: clamp(100 - open * 20), detail: open ? `${open} unresolved problem${open === 1 ? '' : 's'}` : 'No open problems' };
          const comps = Object.entries(C).map(([key, c]) => ({ key, weight: W[key], ...c })), have = comps.filter(c => c.score != null), cov = have.reduce((a, c) => a + c.weight, 0);
          const score = cov >= 30 ? Math.round(have.reduce((a, c) => a + c.score * c.weight, 0) / cov) : null, focus = have.slice().sort((x, y) => x.score - y.score)[0];
          return { id: b.id, name: b.name, score, label: score == null ? 'Not enough data' : score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Needs attention' : 'At risk', coverage: cov, sales: { cur: cur.s, prev: prev.s, change }, transactions: cur.n, focus: focus && focus.score < 80 ? focus.label : '', components: comps };
        }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        return send(res, 200, { days, from, to, branches: out });
      }
      // Retention and win-back (owner): regulars who stopped coming, and which barbers keep their clients
      if (sub === '/pro/retention' && method === 'GET') {
        if (!admin) bad(403, 'Owner only');
        const days = [30, 45, 60, 90].includes(+q.days) ? +q.days : 45, cutoff = dOf(new Date(Date.now() - days * 864e5)), bid = q.branch && get('branches', String(q.branch)) ? String(q.branch) : '', bw = bid ? ' and branchId=?' : '', ba = bid ? [bid] : [];
        const regs = all(`select customerId c, count(*) visits, ifnull(sum(total),0) spent, max(date) last from orders where status='paid' and customerId<>''${bw} group by customerId having count(*)>=2`, ...ba);
        const lapsed = regs.filter(r => r.last < cutoff).sort((a, b) => b.spent - a.spent).slice(0, 50).map(r => {
          const lo = one(`select barberId, branchId from orders where customerId=? and status='paid'${bw} order by date desc, createdAt desc`, r.c, ...ba), c = get('customers', r.c);
          return { name: c?.name || 'Customer', phone: c?.phone || '', visits: r.visits, spent: Math.round(r.spent), last: r.last, daysAgo: Math.round((Date.now() - new Date(r.last + 'T00:00:00')) / 864e5), barber: lo ? get('staff', lo.barberId)?.name || '' : '', branch: lo ? get('branches', lo.branchId)?.name || '' : '' };
        });
        const since = dOf(new Date(Date.now() - 89 * 864e5)), barbers = all(`select * from staff where active=1${bid ? ' and branchId=?' : ''} order by name`, ...ba).map(s => {
          const per = all("select customerId c, count(*) n, max(date) last from orders where status='paid' and customerId<>'' and barberId=? group by customerId", s.id), recent = per.filter(p => p.last >= since);
          return { id: s.id, name: s.name, branch: get('branches', s.branchId)?.name || '', clients: recent.length, returning: recent.filter(p => p.n > 1).length, rate: recent.length ? Math.round(recent.filter(p => p.n > 1).length / recent.length * 100) : null };
        }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
        return send(res, 200, { days, summary: { regulars: regs.length, lapsed: regs.filter(r => r.last < cutoff).length, retention: regs.length ? Math.round(regs.filter(r => r.last >= cutoff).length / regs.length * 100) : null }, lapsed, barbers });
      }
      if (sub === '/pro/shop' && method === 'GET') {   // owner / admin: the shop's own POS numbers across all branches
        if (!admin) bad(403, 'Owner only');
        const t = todayStr(), w = dOf(new Date(Date.now() - 6 * 864e5)), by = (sql, ...a) => new Map(all(sql, ...a).map(r => [r.branchId, r]));
        const today = by("select branchId, ifnull(sum(total),0) s, count(*) n from orders where status='paid' and date=? group by branchId", t), week = by("select branchId, ifnull(sum(total),0) s, count(*) n from orders where status='paid' and date>=? and date<=? group by branchId", w, t);
        const queue = by("select branchId, sum(status='waiting') waiting, sum(status='in_chair') cutting from orders where date=? and status in ('waiting','in_chair') group by branchId", t), appts = by("select branchId, count(*) n from bookings where date=? and status in ('booked','arrived') group by branchId", t);
        const branches = all('select * from branches order by rowid').map(b => ({ id: b.id, name: b.name, lat: b.lat ?? null, lng: b.lng ?? null, mapUrl: b.mapUrl || '', today: today.get(b.id)?.s || 0, todayCount: today.get(b.id)?.n || 0, week: week.get(b.id)?.s || 0, waiting: queue.get(b.id)?.waiting || 0, cutting: queue.get(b.id)?.cutting || 0,
          bookings: appts.get(b.id)?.n || 0, onDuty: all('select id from staff where branchId=? and active=1', b.id).filter(x => ['present', 'late'].includes(staffState(x.id, t).state)).length }));
        const sm = k => branches.reduce((a, b) => a + b[k], 0);
        return send(res, 200, { date: t, totals: { today: sm('today'), week: sm('week'), transactions: sm('todayCount'), bookings: sm('bookings'), waiting: sm('waiting'), cutting: sm('cutting'), onDuty: sm('onDuty') }, branches,
          members: one('select count(*) n from bh_users').n, openReports: one("select count(*) n from bh_reports where status='open'").n });
      }
      if (sub === '/pro/dashboard' && method === 'GET') {
        const s = target(q.staffId), range = ['today', 'week', 'month', 'all'].includes(q.range) ? q.range : 'week', to = todayStr(), now = new Date();
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));   // weeks run Monday to Sunday
        const from = range === 'today' ? to : range === 'week' ? dOf(monday) : range === 'month' ? to.slice(0, 8) + '01' : (one("select min(date) d from orders where status='paid' and barberId=?", s.id)?.d || to), days = range;
        const m = scoreData(from, to, s.branchId, s.id)[0] || { n: 0, sales: 0, avg: 0, comm: 0, rating: null, rc: 0, custs: 0, returning: 0, worked: 0 };
        // clients: everyone this barber has completed a paid service for (all time), grouped by customer
        const orders = all("select * from orders where status='paid' and barberId=? order by date", s.id).map(parseOrder), by = new Map();
        for (const o of orders) {
          const key = o.customerId || ('n:' + String(o.customerName || '').toLowerCase()); if (key === 'n:') continue;
          const r = by.get(key) || { key, name: o.customerName || 'Walk-in', customerId: o.customerId || '', visits: 0, spent: 0, first: o.date, last: o.date };
          r.visits++; r.spent += serviceNet(o); r.last = o.date; if (o.customerName) r.name = o.customerName; by.set(key, r);
        }
        const phones = new Map(all('select id,phone from customers').map(x => [x.id, x.phone || '']));
        const cn = new Map(all('select * from bh_client_notes where staffId=?', s.id).map(r => [r.ckey, r]));
        const clients = [...by.values()].map(r => ({ ...r, spent: Math.round(r.spent * 100) / 100, phone: phones.get(r.customerId) || '', vip: !!cn.get(r.key)?.vip, birthday: cn.get(r.key)?.birthday || '', hasNote: !!(cn.get(r.key)?.note || cn.get(r.key)?.pref) })).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 200);
        const rebook = clients.length ? Math.round(clients.filter(x => x.visits > 1).length / clients.length * 100) : 0;
        const appts = all("select * from bookings where staffId=? and date>=? and date<=? and status in ('booked','arrived') order by date, time", s.id, to, dOf(new Date(Date.now() + 7 * 864e5))).map(b => {
          const v = bookingView(b); return { id: v.id, date: v.date, time: v.time, mins: v.mins, status: v.status, customer: v.customerName, phone: v.phone, items: v.items.map(i => i.name), total: v.total, notes: v.notes || '', noShows: one("select count(*) n from bookings where status='noshow' and phone=?", v.phone).n };
        });
        const recent = all('select id,name,rating,text,createdAt,coalesce(verified,0) verified,reply from reviews where staffId=? order by createdAt desc limit 10', s.id);
        return send(res, 200, { staff: { id: s.id, name: s.name }, from, to, days, metrics: { haircuts: m.n, revenue: m.sales, avgService: Math.round(m.avg * 100) / 100, commission: m.comm, rating: m.rating ? Math.round(m.rating * 10) / 10 : 0, reviews: m.rc,
          clients: m.custs, retention: m.custs ? Math.round(m.returning / m.custs * 100) : 0, rebooking: rebook, daysWorked: m.worked }, appointments: appts, clients, recentReviews: recent });
      }
      if (sub === '/pro/reports' && method === 'GET') {
        if (!admin) bad(403, 'Owner only'); const names = new Map(all('select id,name from bh_users').map(u => [u.id, u.name]));
        const rows = all("select kind,targetId,count(*) n,max(createdAt) last,group_concat(reason,' | ') reasons from bh_reports where status='open' group by kind,targetId order by last desc limit 100").map(r => {
          const t = r.kind === 'post' ? get('bh_posts', r.targetId) : r.kind === 'comment' ? get('bh_comments', r.targetId) : get('bh_users', r.targetId);
          return { ...r, hidden: !!t?.hidden, gone: !t, text: r.kind === 'user' ? t?.name || '' : t?.text || '', image: r.kind === 'post' ? t?.imageUrl || '' : '', author: r.kind === 'user' ? '' : names.get(t?.userId) || '' };
        });
        return send(res, 200, { reports: rows });
      }
      if (sub === '/pro/moderate' && method === 'POST') {
        if (!admin) bad(403, 'Owner only'); const b = await readBody(req), kind = String(b.kind), id = String(b.id || ''), tbl = { post: 'bh_posts', comment: 'bh_comments' }[kind];
        if (!tbl || !get(tbl, id)) bad(404, 'Not found');
        if (b.action === 'remove') { if (kind === 'post') { const im = /\/img\/(\w+)/.exec(get(tbl, id).imageUrl || ''); if (im) run('delete from images where id=?', im[1]); run('delete from bh_comments where postId=?', id); run('delete from bh_likes where postId=?', id); } run(`delete from ${tbl} where id=?`, id); }
        else if (b.action === 'restore') run(`update ${tbl} set hidden=0 where id=?`, id); else bad(400, 'Bad action');
        run("update bh_reports set status='closed' where kind=? and targetId=?", kind, id); log(me, 'moderate-' + b.action, tbl, id, ''); return send(res, 200, { ok: true });
      }
      const rrm = sub.match(/^\/pro\/reviews\/(\w+)\/reply$/);
      if (rrm && method === 'POST') {
        const rv = get('reviews', rrm[1]); if (!rv) bad(404, 'Review not found'); if (!admin && !(mine && rv.staffId === mine)) bad(403, 'You can only reply to your own reviews');
        const text = clip((await readBody(req)).text, 400);
        if (!text) run("update reviews set reply=null, replyAt=null, replyBy=null where id=?", rv.id); else run('update reviews set reply=?, replyAt=?, replyBy=? where id=?', text, nowISO(), me.name, rv.id);
        if (text && rv.userId) notify(rv.userId, 'reply', `${me.name} replied to your review`, '#/bookings', 'rp-' + rv.id);
        log(me, 'review-reply', 'reviews', rv.id, ''); return send(res, 200, { ok: true });
      }
      if (sub === '/pro/profile' && method === 'PUT') {
        const b = await readBody(req), s = target(b.staffId), cur = one('select * from bh_barber where staffId=?', s.id) || {};
        const spec = (Array.isArray(b.specialties) ? b.specialties : String(b.specialties || '').split(',')).map(x => clip(x, 30)).filter(Boolean).slice(0, 8);
        const verified = admin && 'verified' in b ? (b.verified ? 1 : 0) : cur.verified || 0;
        run('insert or replace into bh_barber(staffId,headline,bio,years,specialties,instagram,facebook,tiktok,verified,cover) values(?,?,?,?,?,?,?,?,?,?)', s.id, clip(b.headline, 80), clip(b.bio, 600),
          Math.max(0, Math.min(60, Math.floor(+b.years || 0))), JSON.stringify(spec), url(b.instagram), url(b.facebook), url(b.tiktok), verified, cur.cover || '');
        log(me, 'barber-profile', 'bh_barber', s.id, s.name); return send(res, 200, { ok: true });
      }
      // seminars and certificates (added by the barber, verified by the owner)
      const certDate = v => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(v || '')) ? String(v) : '';
      const certImage = b => {
        if (!b.data) return '';
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data)); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
        const iid = uid() + uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', iid, m[1], buf, nowISO()); return '/img/' + iid;
      };
      const dropImage = url => { const im = /\/img\/(\w+)/.exec(url || ''); if (im) run('delete from images where id=?', im[1]); };
      if (sub === '/pro/certs' && method === 'POST') {
        const b = await readBody(req, 1_500_000), s = target(b.staffId), title = clip(b.title, 100); if (!title) bad(400, 'Enter the seminar or certificate name');
        if (one('select count(*) n from bh_certs where staffId=?', s.id).n >= 40) bad(409, 'You can add up to 40 seminars');
        const id = uid(), image = certImage(b);
        run('insert into bh_certs(id,staffId,title,org,date,imageUrl,verified,createdAt) values(?,?,?,?,?,?,0,?)', id, s.id, title, clip(b.org, 80), certDate(b.date), image, nowISO());
        log(me, 'cert-add', 'bh_certs', id, s.name + ': ' + title); return send(res, 201, { id });
      }
      const ctm = sub.match(/^\/pro\/certs\/(\w+)$/);
      if (ctm && method === 'PUT') {
        const row = get('bh_certs', ctm[1]); if (!row) bad(404, 'Not found'); target(row.staffId); const b = await readBody(req);
        const title = 'title' in b ? clip(b.title, 100) : row.title; if (!title) bad(400, 'Enter the seminar or certificate name');
        const verified = admin && 'verified' in b ? (b.verified ? 1 : 0) : row.verified || 0;   // only the owner can verify
        run('update bh_certs set title=?, org=?, date=?, verified=? where id=?', title, 'org' in b ? clip(b.org, 80) : row.org, 'date' in b ? certDate(b.date) : row.date, verified, row.id);
        log(me, 'cert-update', 'bh_certs', row.id, ''); return send(res, 200, { ok: true });
      }
      if (ctm && method === 'DELETE') {
        const row = get('bh_certs', ctm[1]); if (!row) bad(404, 'Not found'); target(row.staffId); dropImage(row.imageUrl);
        run('delete from bh_certs where id=?', row.id); log(me, 'cert-delete', 'bh_certs', row.id, ''); return send(res, 200, { ok: true });
      }
      // service packages a barber offers, with his own price for each (shown in the marketplace; the POS stays the source of truth for what is charged)
      if (sub === '/pro/offers' && method === 'PUT') {
        const b = await readBody(req), s = target(b.staffId), rows = Array.isArray(b.offers) ? b.offers : [], seen = new Set();
        for (const o of rows) {
          if (!PKG_IDS.includes(o.pkg)) bad(400, 'Unknown service'); if (seen.has(o.pkg)) bad(400, 'Each service can be listed once'); seen.add(o.pkg);
          const price = Math.round(+o.price); if (!(price >= 1 && price <= 99999)) bad(400, 'Enter a price between ₱1 and ₱99,999 for each service you offer');
        }
        run('delete from bh_offers where staffId=?', s.id);
        for (const o of rows) run('insert into bh_offers(staffId,pkg,price) values(?,?,?)', s.id, o.pkg, Math.round(+o.price));
        log(me, 'barber-offers', 'bh_offers', s.id, s.name + ': ' + rows.map(o => o.pkg + '=' + o.price).join(', ')); return send(res, 200, { ok: true });
      }
      // cover photo and profile photo (barbers manage their own; the owner can manage anyone's)
      if (sub === '/pro/cover' && method === 'POST') {
        const b = await readBody(req, 1_500_000), s = target(b.staffId); if (!b.data) bad(400, 'Choose a photo');
        const url = certImage(b), cur = one('select * from bh_barber where staffId=?', s.id);
        if (cur) { dropImage(cur.cover); run('update bh_barber set cover=? where staffId=?', url, s.id); } else run("insert into bh_barber(staffId,cover,verified,specialties) values(?,?,0,'[]')", s.id, url);
        log(me, 'barber-cover', 'bh_barber', s.id, s.name); return send(res, 201, { url });
      }
      if (sub === '/pro/cover' && method === 'DELETE') {
        const s = target(q.staffId), cur = one('select * from bh_barber where staffId=?', s.id);
        if (cur && cur.cover) { dropImage(cur.cover); run("update bh_barber set cover='' where staffId=?", s.id); } return send(res, 200, { ok: true });
      }
      if (sub === '/pro/photo' && method === 'POST') {
        const b = await readBody(req, 1_500_000), s = target(b.staffId); if (!b.data) bad(400, 'Choose a photo');
        const url = certImage(b); dropImage(s.photo); run('update staff set photo=? where id=?', url, s.id);
        log(me, 'barber-photo', 'staff', s.id, s.name); return send(res, 201, { url });
      }
      if (sub === '/pro/portfolio' && method === 'POST') {
        const b = await readBody(req, 1_500_000), s = target(b.staffId);
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
        if (one('select count(*) n from bh_portfolio where staffId=?', s.id).n >= 60) bad(409, 'Portfolio is full (60 photos)');
        const iid = uid() + uid(), id = uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', iid, m[1], buf, nowISO());
        run('insert into bh_portfolio(id,staffId,url,caption,style,createdAt) values(?,?,?,?,?,?)', id, s.id, '/img/' + iid, clip(b.caption, 100), clip(b.style, 30), nowISO());
        log(me, 'portfolio-add', 'bh_portfolio', id, s.name); return send(res, 201, { id, url: '/img/' + iid });
      }
      const pm = sub.match(/^\/pro\/portfolio\/(\w+)$/);
      if (pm && method === 'PUT') {   // edit a cut's caption and style tag
        const row = get('bh_portfolio', pm[1]); if (!row) bad(404, 'Photo not found'); target(row.staffId); const b = await readBody(req);
        run('update bh_portfolio set caption=?, style=? where id=?', clip(b.caption, 100), clip(b.style, 30), row.id); return send(res, 200, { ok: true });
      }
      if (pm && method === 'DELETE') {
        const row = get('bh_portfolio', pm[1]); if (!row) bad(404, 'Photo not found'); target(row.staffId);
        run('delete from bh_portfolio where id=?', row.id); const im = /\/img\/(\w+)/.exec(row.url); if (im) run('delete from images where id=?', im[1]);
        log(me, 'portfolio-delete', 'bh_portfolio', row.id, ''); return send(res, 200, { ok: true });
      }
    }
    bad(404, 'Not found');
  };
  handleBH.parseLatLng = parseLatLng; handleBH.notify = notify; handleBH.freed = freed;
  return handleBH;
}
