// Brotherhood customer app API (accounts, discover, barber profiles, booking history, verified reviews, pro tools).
// Mounted from server.js under /api/bh/*. Shares the same database, staff, branches, bookings and reviews as the POS.
export function mountBH(c) {
  const { db, all, one, run, get, uid, nowISO, todayStr, send, readBody, bad, hashPw, checkPw, makeToken, readToken, createBooking, bookingView, slotsFor,
    whoami, log, normEmail, validEmail, normPhone, jp, upsertCustomer, siteCover, siteSvc, addCol, toMin, scoreData, serviceNet, parseOrder, dOf } = c;

  // ---------- schema ----------
  db.exec(`
create table if not exists bh_users(id text primary key, name text, email text, phone text, passHash text, bio text, city text, customerId text, createdAt text);
create unique index if not exists bh_users_email on bh_users(email);
create table if not exists bh_barber(staffId text primary key, headline text, bio text, years integer, specialties text, instagram text, facebook text, tiktok text, verified integer);
create table if not exists bh_portfolio(id text primary key, staffId text, url text, caption text, createdAt text);
create index if not exists bh_port_staff on bh_portfolio(staffId, createdAt);
create table if not exists bh_favorites(userId text, staffId text, createdAt text, primary key(userId, staffId));
`);
  addCol('bookings', 'userId', 'text'); addCol('reviews', 'userId', 'text'); addCol('reviews', 'orderId', 'text'); addCol('reviews', 'verified', 'integer');
  db.exec('create index if not exists bookings_user on bookings(userId); create index if not exists reviews_staff on reviews(staffId)');

  // ---------- helpers ----------
  const hits = new Map();
  const tooMany = (ip, kind, max, windowMs) => { const k = kind + ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < windowMs); return a.length >= max; };
  const hit = (ip, kind) => { const k = kind + ip; hits.set(k, [...(hits.get(k) || []), Date.now()]); };
  setInterval(() => hits.clear(), 3600e3).unref();

  const userOf = req => {
    const o = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!o || !String(o.u).startsWith('c:')) return null;
    const u = get('bh_users', String(o.u).slice(2));
    return u && u.passHash.slice(-8) === o.v ? u : null;
  };
  const needUser = req => userOf(req) || bad(401, 'Please log in');
  const tokenOf = u => makeToken('c:' + u.id, u.passHash.slice(-8));
  const pubUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city || '', bio: u.bio || '' });
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
  return async function handleBH(req, res, p, method, q, ip) {
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
      const b = await readBody(req), u = one('select * from bh_users where email=?', normEmail(b.email));
      await new Promise(r => setTimeout(r, 300));
      if (!u || !checkPw(String(b.password || ''), u.passHash)) { hit(ip, 'li'); bad(401, 'Wrong email or password'); }
      return send(res, 200, { token: tokenOf(u), user: pubUser(u) });
    }
    if (sub === '/me' && method === 'GET') { const u = needUser(req); return send(res, 200, { user: pubUser(u), favorites: all('select staffId from bh_favorites where userId=?', u.id).map(r => r.staffId) }); }
    if (sub === '/me' && method === 'PUT') {
      const u = needUser(req), b = await readBody(req), name = clip(b.name ?? u.name, 80), phone = clip(b.phone ?? u.phone, 30);
      if (!name) bad(400, 'Please enter your name'); if (normPhone(phone).length < 10) bad(400, 'Enter a valid mobile number');
      run('update bh_users set name=?, phone=?, city=?, bio=? where id=?', name, phone, clip(b.city ?? u.city, 60), clip(b.bio ?? u.bio, 300), u.id);
      return send(res, 200, { user: pubUser(get('bh_users', u.id)) });
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
      run('delete from bh_favorites where userId=?', u.id); run('delete from bh_users where id=?', u.id);
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
      const reviews = all('select id,name,rating,text,createdAt,coalesce(verified,0) verified from reviews where staffId=? order by createdAt desc limit 30', s.id);
      const u = userOf(req);
      return send(res, 200, { barber: { ...card, bio: pr.bio || '', instagram: pr.instagram || '', facebook: pr.facebook || '', tiktok: pr.tiktok || '' },
        branch: { id: br.id, name: br.name, address: br.address || '', phone: br.phone || '', openTime: br.openTime || '09:00', closeTime: br.closeTime || '21:00', mapUrl: br.mapUrl || '' },
        portfolio: all('select id,url,caption from bh_portfolio where staffId=? order by createdAt desc limit 60', s.id), reviews,
        services: servicesList(), favorite: !!(u && one('select 1 x from bh_favorites where userId=? and staffId=?', u.id, s.id)) });
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
      run("update bookings set status='cancelled' where id=?", b.id); log({ name: 'App: ' + u.name }, 'booking-cancelled', 'bookings', b.id, b.customerName);
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
        const recent = all('select name,rating,text,createdAt,coalesce(verified,0) verified from reviews where staffId=? order by createdAt desc limit 5', s.id);
        return send(res, 200, { staff: { id: s.id, name: s.name }, from, to, days, metrics: { haircuts: m.n, revenue: m.sales, avgService: Math.round(m.avg * 100) / 100, commission: m.comm, rating: m.rating ? Math.round(m.rating * 10) / 10 : 0, reviews: m.rc,
          clients: m.custs, retention: m.custs ? Math.round(m.returning / m.custs * 100) : 0, rebooking: rebook, daysWorked: m.worked }, appointments: appts, clients, recentReviews: recent });
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
}
