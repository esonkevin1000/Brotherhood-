// Brotherhood customer app API (accounts, discover, barber profiles, booking history, verified reviews, pro tools).
// Mounted from server.js under /api/bh/*. Shares the same database, staff, branches, bookings and reviews as the POS.
export function mountBH(c) {
  const { db, all, one, run, get, uid, nowISO, todayStr, send, readBody, bad, hashPw, checkPw, makeToken, readToken, createBooking, bookingView, slotsFor,
    whoami, log, normEmail, validEmail, normPhone, jp, upsertCustomer, siteCover, siteSvc, siteGallery, staffState, addCol, toMin, scoreData, serviceNet, parseOrder, dOf } = c;

  // ---------- schema ----------
  db.exec(`
create table if not exists bh_users(id text primary key, name text, email text, phone text, passHash text, bio text, city text, customerId text, createdAt text);
create unique index if not exists bh_users_email on bh_users(email);
create table if not exists bh_barber(staffId text primary key, headline text, bio text, years integer, specialties text, instagram text, facebook text, tiktok text, verified integer);
create table if not exists bh_portfolio(id text primary key, staffId text, url text, caption text, createdAt text);
create index if not exists bh_port_staff on bh_portfolio(staffId, createdAt);
create table if not exists bh_favorites(userId text, staffId text, createdAt text, primary key(userId, staffId));
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
  addCol('bh_users', 'styles', 'text'); addCol('reviews', 'reply', 'text'); addCol('reviews', 'replyAt', 'text'); addCol('reviews', 'replyBy', 'text'); addCol('bookings', 'userId', 'text'); addCol('reviews', 'userId', 'text'); addCol('reviews', 'orderId', 'text'); addCol('reviews', 'verified', 'integer');
  db.exec('create index if not exists bookings_user on bookings(userId); create index if not exists reviews_staff on reviews(staffId)');

  // ---------- helpers ----------
  const hits = new Map();
  const tooMany = (ip, kind, max, windowMs) => { const k = kind + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < windowMs); return a.length >= max; };
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
  const unreadOf = id => one('select count(*) n from bh_notifs where userId=? and readAt is null', id).n;
  const userOf = req => {
    const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!o || !String(o.u).startsWith('c:')) return null;
    const u = get('bh_users', String(o.u).slice(2));
    return u && u.passHash.slice(-8) === o.v ? u : null;
  };
  const needUser = req => userOf(req) || bad(401, 'Please log in');
  const tokenOf = u => makeToken('c:' + u.id, u.passHash.slice(-8));
  const pubUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city || '', bio: u.bio || '', styles: jp(u.styles) });
  const short = n => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0] || 'Customer'; };
  const clip = (s, n) => String(s ?? '').trim().slice(0, n);
  const url = s => { s = clip(s, 200); return /^(https?:\/\/|@?[\w.]+$)/i.test(s) ? s : ''; };

  const ratingMap = () => new Map(all('select staffId, count(*) n, avg(rating) a, sum(coalesce(verified,0)) v from reviews where staffId<>\'\' group by staffId').map(r => [r.staffId, { n: r.n, a: Math.round(r.a * 10) / 10, v: r.v }]));
  const branchRatings = () => new Map(all('select branchId, count(*) n, avg(rating) a from reviews group by branchId').map(r => [r.branchId, { n: r.n, a: Math.round(r.a * 10) / 10 }]));
  const portCount = () => new Map(all('select staffId, count(*) n from bh_portfolio group by staffId').map(r => [r.staffId, r.n]));

  function barberCard(s, rm, pc, br) {
    const p = one('select * from bh_barber where staffId=?', s.id) || {}, r = rm.get(s.id) || { n: 0, a: 0, v: 0 }, spec = jp(p.specialties), photos = pc.get(s.id) || 0;
    let slots = 0; try { slots = slotsFor(s.branchId, todayStr(), s.id, 30).length; } catch { }
    const complete = [p.headline, p.bio, s.photo, p.years, spec.length, photos >= 3].filter(Boolean).length / 6;
    // ranking: verified-review quality (Bayesian), same-day availability, profile completeness, verification — never raw popularity
    const bayes = (r.a * r.n + 4.2 * 5) / (r.n + 5), score = bayes / 5 * 50 + Math.min(slots, 6) / 6 * 20 + complete * 20 + (p.verified ? 10 : 0);
    return { id: s.id, name: s.name, photo: s.photo || '', branchId: s.branchId, branchName: br.get(s.branchId)?.name || '', headline: p.headline || '', years: p.years || 0, specialties: spec,
      rating: r.a, reviews: r.n, verifiedReviews: r.v, verified: !!p.verified, portfolio: photos, slotsToday: slots, score: Math.round(score * 10) / 10 };
  }
  const servicesList = () => all("select id,name,price,mins,photo,apptOnly from items where active=1 and type='service' and bookable=1 order by price").map(s => ({ ...s, photo: s.photo || siteSvc(s.name) }));

  // ---------- handler ----------
  const handleBH = async function (req, res, p, method, q, ip) {
    const sub = p.slice('/api/bh'.length);

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
    if (sub === '/me' && method === 'GET') { const u = needUser(req); syncRate(u.id); return send(res, 200, { user: pubUser(u), favorites: all('select staffId from bh_favorites where userId=?', u.id).map(r => r.staffId), unread: unreadOf(u.id) }); }
    if (sub === '/me' && method === 'PUT') {
      const u = needUser(req), b = await readBody(req), name = clip(b.name ?? u.name, 80), phone = clip(b.phone ?? u.phone, 30);
      if (!name) bad(400, 'Please enter your name'); if (normPhone(phone).length < 10) bad(400, 'Enter a valid mobile number');
      run('update bh_users set name=?, phone=?, city=?, bio=? where id=?', name, phone, clip(b.city ?? u.city, 60), clip(b.bio ?? u.bio, 300), u.id);
      return send(res, 200, { user: pubUser(get('bh_users', u.id)) });
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
      for (const t of ['bh_likes', 'bh_comments', 'bh_follows', 'bh_blocks', 'bh_reports']) run(`delete from ${t} where userId=?`, u.id);
      run('delete from bh_follows where targetId=?', u.id); run('delete from bh_blocks where blockedId=?', u.id); run('delete from bh_likes where postId in (select id from bh_posts where userId=?)', u.id);
      run('delete from bh_comments where postId in (select id from bh_posts where userId=?)', u.id);
      for (const r of all('select imageUrl from bh_posts where userId=?', u.id)) { const im = /\/img\/(\w+)/.exec(r.imageUrl || ''); if (im) run('delete from images where id=?', im[1]); }
      run('delete from bh_posts where userId=?', u.id); run('delete from bh_users where id=?', u.id);
      log({ name: 'App: ' + u.name }, 'app-delete-account', 'bh_users', u.id, ''); return send(res, 200, { ok: true });
    }

    // ----- discover -----
    if (sub === '/discover' && method === 'GET') {
      const brs = all('select * from branches order by rowid'), bm = new Map(brs.map(b => [b.id, b])), rm = ratingMap(), pc = portCount(), brr = branchRatings();
      let barbers = all('select * from staff where active=1').map(s => barberCard(s, rm, pc, bm));
      const term = clip(q.q, 60).toLowerCase(), bid = clip(q.branch, 20), spec = clip(q.specialty, 40).toLowerCase();
      if (bid) barbers = barbers.filter(b => b.branchId === bid);
      if (term) barbers = barbers.filter(b => [b.name, b.branchName, b.headline, ...b.specialties].join(' ').toLowerCase().includes(term));
      if (spec) barbers = barbers.filter(b => b.specialties.some(x => x.toLowerCase() === spec));
      if (q.available === '1') barbers = barbers.filter(b => b.slotsToday > 0);
      if (+q.minRating > 0) barbers = barbers.filter(b => b.rating >= +q.minRating);
      barbers.sort(q.sort === 'rating' ? (a, b) => b.rating - a.rating || b.reviews - a.reviews : q.sort === 'experience' ? (a, b) => b.years - a.years : q.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.score - a.score);
      const shops = brs.filter(b => !bid || b.id === bid).map(b => ({ id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', openTime: b.openTime || '09:00', closeTime: b.closeTime || '21:00', mapUrl: b.mapUrl || '',
        photo: b.photo || siteCover(b.name) || '', rating: brr.get(b.id)?.a || 0, reviews: brr.get(b.id)?.n || 0, barbers: all('select count(*) n from staff where branchId=? and active=1', b.id)[0].n }))
        .filter(s => !term || (s.name + ' ' + s.address).toLowerCase().includes(term) || barbers.some(x => x.branchId === s.id));
      const specialties = [...new Set(all('select specialties from bh_barber').flatMap(r => jp(r.specialties)))].sort();
      return send(res, 200, { shops, barbers, specialties, services: servicesList() });
    }
    const bm = sub.match(/^\/barbers\/(\w+)$/);
    if (bm && method === 'GET') {
      const s = get('staff', bm[1]); if (!s || !s.active) bad(404, 'Barber not found');
      const brs = new Map(all('select * from branches').map(b => [b.id, b])), card = barberCard(s, ratingMap(), portCount(), brs), pr = one('select * from bh_barber where staffId=?', s.id) || {};
      const br = brs.get(s.branchId) || {};
      const reviews = all('select id,name,rating,text,createdAt,coalesce(verified,0) verified,reply,replyAt,replyBy from reviews where staffId=? order by createdAt desc limit 30', s.id);
      const u = userOf(req);
      return send(res, 200, { barber: { ...card, bio: pr.bio || '', instagram: pr.instagram || '', facebook: pr.facebook || '', tiktok: pr.tiktok || '' },
        branch: { id: br.id, name: br.name, address: br.address || '', phone: br.phone || '', openTime: br.openTime || '09:00', closeTime: br.closeTime || '21:00', mapUrl: br.mapUrl || '' },
        portfolio: all('select id,url,caption from bh_portfolio where staffId=? order by createdAt desc limit 60', s.id), reviews,
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
      return send(res, 200, { live, shop: { id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', openTime: b.openTime || '09:00', closeTime: b.closeTime || '21:00', mapUrl: b.mapUrl || '', photo: b.photo || siteCover(b.name) || '',
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
      const bk = createBooking({ branchId: b.branchId, staffId: b.staffId, itemIds: b.itemIds, date: b.date, time: b.time, name: u.name, phone: u.phone, email: u.email, notes: clip(b.notes, 300), consent: !!b.consent }, 'online');
      hit(ip, 'bk'); run('update bookings set userId=? where id=?', u.id, bk.id);
      notify(u.id, 'booking', `Booked: ${bk.date} ${bk.time} with ${bk.staffName || 'any barber'} at ${bk.branchName}`, '#/bookings', 'bk-' + bk.id);
      if (bk.customerId && !u.customerId) run('update bh_users set customerId=? where id=?', bk.customerId, u.id);
      log({ name: 'App: ' + u.name }, 'booking', 'bookings', bk.id, `${bk.date} ${bk.time} ${bk.branchName}`);
      return send(res, 201, { ok: true, booking: { id: bk.id, date: bk.date, time: bk.time, branch: bk.branchName, staff: bk.staffName, items: bk.items, total: bk.total } });
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
      const u = needUser(req); syncRate(u.id);
      return send(res, 200, { unread: unreadOf(u.id), items: all('select id,kind,text,link,createdAt,readAt from bh_notifs where userId=? order by createdAt desc limit 50', u.id) });
    }
    if (sub === '/notifications/read' && method === 'POST') { const u = needUser(req); run('update bh_notifs set readAt=? where userId=? and readAt is null', nowISO(), u.id); return send(res, 200, { ok: true }); }

    // ----- community -----
    const blockedOf = id => id ? new Set([...all('select blockedId x from bh_blocks where userId=?', id), ...all('select userId x from bh_blocks where blockedId=?', id)].map(r => r.x)) : new Set();
    const nameMap = () => new Map(all('select id,name from bh_users').map(u => [u.id, short(u.name)]));
    const postView = (r, me, names) => ({ id: r.id, text: r.text, image: r.imageUrl || '', createdAt: r.createdAt, userId: r.userId, author: names.get(r.userId) || 'Member', mine: !!me && me.id === r.userId,
      staffId: r.staffId || '', staffName: r.staffId ? get('staff', r.staffId)?.name || '' : '', likes: one('select count(*) n from bh_likes where postId=?', r.id).n, comments: one('select count(*) n from bh_comments where postId=? and hidden=0', r.id).n,
      liked: !!me && !!one('select 1 x from bh_likes where postId=? and userId=?', r.id, me.id), following: !!me && !!one('select 1 x from bh_follows where userId=? and targetId=?', me.id, r.userId) });
    const spammy = t => (String(t).match(/https?:\/\//gi) || []).length > 2;
    if (sub === '/feed' && method === 'GET') {
      const me = userOf(req), blocked = blockedOf(me?.id), names = nameMap(), before = clip(q.before, 40) || '9999';
      let rows = all('select * from bh_posts where hidden=0 and createdAt<? order by createdAt desc limit 200', before);
      if (q.scope === 'following' && me) { const f = new Set(all('select targetId x from bh_follows where userId=?', me.id).map(r => r.x)); rows = rows.filter(r => f.has(r.userId) || r.userId === me.id); }
      rows = rows.filter(r => !blocked.has(r.userId)).slice(0, 20);
      return send(res, 200, { posts: rows.map(r => postView(r, me, names)), more: rows.length === 20 });
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
      run('insert into bh_posts(id,userId,staffId,text,imageUrl,createdAt,hidden) values(?,?,?,?,?,?,0)', id, u.id, staffId, text, image, nowISO()); hit(ip, 'po');
      return send(res, 201, { post: postView(get('bh_posts', id), u, nameMap()) });
    }
    const pm0 = sub.match(/^\/posts\/(\w+)(?:\/(like|comments))?$/);
    if (pm0) {
      const post = get('bh_posts', pm0[1]); if (!post || post.hidden) bad(404, 'Post not found');
      if (!pm0[2] && method === 'DELETE') {
        const u = needUser(req); if (post.userId !== u.id) bad(403, 'You can only delete your own posts');
        const im = /\/img\/(\w+)/.exec(post.imageUrl || ''); if (im) run('delete from images where id=?', im[1]);
        run('delete from bh_likes where postId=?', post.id); run('delete from bh_comments where postId=?', post.id); run('delete from bh_posts where id=?', post.id); return send(res, 200, { ok: true });
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
            instagram: pr.instagram || '', facebook: pr.facebook || '', tiktok: pr.tiktok || '', verified: !!pr.verified, portfolio: all('select id,url,caption from bh_portfolio where staffId=? order by createdAt desc', s.id) };
        });
        return send(res, 200, { admin, name: me.name, staff });
      }
      if (sub === '/pro/shop' && method === 'GET') {   // owner / admin: the shop's own POS numbers across all branches
        if (!admin) bad(403, 'Owner only');
        const t = todayStr(), w = dOf(new Date(Date.now() - 6 * 864e5)), by = (sql, ...a) => new Map(all(sql, ...a).map(r => [r.branchId, r]));
        const today = by("select branchId, ifnull(sum(total),0) s, count(*) n from orders where status='paid' and date=? group by branchId", t), week = by("select branchId, ifnull(sum(total),0) s, count(*) n from orders where status='paid' and date>=? and date<=? group by branchId", w, t);
        const queue = by("select branchId, sum(status='waiting') waiting, sum(status='in_chair') cutting from orders where date=? and status in ('waiting','in_chair') group by branchId", t), appts = by("select branchId, count(*) n from bookings where date=? and status in ('booked','arrived') group by branchId", t);
        const branches = all('select * from branches order by rowid').map(b => ({ id: b.id, name: b.name, today: today.get(b.id)?.s || 0, todayCount: today.get(b.id)?.n || 0, week: week.get(b.id)?.s || 0, waiting: queue.get(b.id)?.waiting || 0, cutting: queue.get(b.id)?.cutting || 0,
          bookings: appts.get(b.id)?.n || 0, onDuty: all('select id from staff where branchId=? and active=1', b.id).filter(x => ['present', 'late'].includes(staffState(x.id, t).state)).length }));
        const sm = k => branches.reduce((a, b) => a + b[k], 0);
        return send(res, 200, { date: t, totals: { today: sm('today'), week: sm('week'), transactions: sm('todayCount'), bookings: sm('bookings'), waiting: sm('waiting'), cutting: sm('cutting'), onDuty: sm('onDuty') }, branches,
          members: one('select count(*) n from bh_users').n, openReports: one("select count(*) n from bh_reports where status='open'").n });
      }
      if (sub === '/pro/dashboard' && method === 'GET') {
        const s = target(q.staffId), days = [7, 30, 90].includes(+q.days) ? +q.days : 30, to = todayStr(), from = dOf(new Date(Date.now() - (days - 1) * 864e5));
        const m = scoreData(from, to, s.branchId, s.id)[0] || { n: 0, sales: 0, avg: 0, comm: 0, rating: null, rc: 0, custs: 0, returning: 0, worked: 0 };
        // clients: everyone this barber has completed a paid service for (all time), grouped by customer
        const orders = all("select * from orders where status='paid' and barberId=? order by date", s.id).map(parseOrder), by = new Map();
        for (const o of orders) {
          const key = o.customerId || ('n:' + String(o.customerName || '').toLowerCase()); if (key === 'n:') continue;
          const r = by.get(key) || { name: o.customerName || 'Walk-in', customerId: o.customerId || '', visits: 0, spent: 0, first: o.date, last: o.date };
          r.visits++; r.spent += serviceNet(o); r.last = o.date; if (o.customerName) r.name = o.customerName; by.set(key, r);
        }
        const phones = new Map(all('select id,phone from customers').map(x => [x.id, x.phone || '']));
        const clients = [...by.values()].map(r => ({ ...r, spent: Math.round(r.spent * 100) / 100, phone: phones.get(r.customerId) || '' })).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 200);
        const rebook = clients.length ? Math.round(clients.filter(x => x.visits > 1).length / clients.length * 100) : 0;
        const appts = all("select * from bookings where staffId=? and date>=? and date<=? and status in ('booked','arrived') order by date, time", s.id, to, dOf(new Date(Date.now() + 7 * 864e5))).map(b => {
          const v = bookingView(b); return { id: v.id, date: v.date, time: v.time, mins: v.mins, status: v.status, customer: v.customerName, phone: v.phone, items: v.items.map(i => i.name), total: v.total, notes: v.notes || '' };
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
        run('insert or replace into bh_barber(staffId,headline,bio,years,specialties,instagram,facebook,tiktok,verified) values(?,?,?,?,?,?,?,?,?)', s.id, clip(b.headline, 80), clip(b.bio, 600),
          Math.max(0, Math.min(60, Math.floor(+b.years || 0))), JSON.stringify(spec), url(b.instagram), url(b.facebook), url(b.tiktok), verified);
        log(me, 'barber-profile', 'bh_barber', s.id, s.name); return send(res, 200, { ok: true });
      }
      if (sub === '/pro/portfolio' && method === 'POST') {
        const b = await readBody(req, 1_500_000), s = target(b.staffId);
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) bad(400, 'Image must be JPEG, PNG or WebP');
        const buf = Buffer.from(m[2], 'base64'); if (buf.length > 700_000) bad(413, 'Image is too large (max about 700KB)');
        if (one('select count(*) n from bh_portfolio where staffId=?', s.id).n >= 60) bad(409, 'Portfolio is full (60 photos)');
        const iid = uid() + uid(), id = uid(); run('insert into images(id,mime,data,createdAt) values(?,?,?,?)', iid, m[1], buf, nowISO());
        run('insert into bh_portfolio(id,staffId,url,caption,createdAt) values(?,?,?,?,?)', id, s.id, '/img/' + iid, clip(b.caption, 100), nowISO());
        log(me, 'portfolio-add', 'bh_portfolio', id, s.name); return send(res, 201, { id, url: '/img/' + iid });
      }
      const pm = sub.match(/^\/pro\/portfolio\/(\w+)$/);
      if (pm && method === 'DELETE') {
        const row = get('bh_portfolio', pm[1]); if (!row) bad(404, 'Photo not found'); target(row.staffId);
        run('delete from bh_portfolio where id=?', row.id); const im = /\/img\/(\w+)/.exec(row.url); if (im) run('delete from images where id=?', im[1]);
        log(me, 'portfolio-delete', 'bh_portfolio', row.id, ''); return send(res, 200, { ok: true });
      }
    }
    bad(404, 'Not found');
  };
  handleBH.notify = notify; handleBH.freed = freed;
  return handleBH;
}
