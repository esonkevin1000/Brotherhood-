// Public routes (src/routes/public.js), partner shops (src/routes/partner-shops.js) and email marketing (src/routes/marketing.js):
// the cases no other suite covers — free times asked directly, posting reviews and their limit, and the owner's
// partner-shop actions (new password, pause, resume, open its back office).
import { createPublicRoutes } from '../src/routes/public.js';
import { createPartnerShopRoutes } from '../src/routes/partner-shops.js';
import { createMarketingRoutes } from '../src/routes/marketing.js';
import { startServer, checker, ymd } from './helper.mjs';
const { ok, done, fail } = checker();
ok('the routes come from their own modules', [createPublicRoutes, createPartnerShopRoutes, createMarketingRoutes].every(f => typeof f === 'function'));
const S = await startServer(3143, { SIGNUPS_OPEN: '1', REVIEW_LIMIT: '3' });
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const vip = st.items.find(i => i.name === 'Vip Compadre');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const D = ymd(new Date(Date.now() + 864e5)), past = ymd(new Date(Date.now() - 864e5));

  // ---------- free times, asked directly ----------
  let r = await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=${kev.id}&items=${vip.id}`);
  ok('free times for tomorrow are a list of clock times', r.s === 200 && r.j.slots.length > 10 && r.j.slots.every(x => /^\d{2}:\d{2}$/.test(x)), r.j);
  ok('a past date, a bad date or no service gives no times', (await call('GET', `/api/public/slots?branch=${br.id}&date=${past}&staff=any&items=${vip.id}`)).j.slots.length === 0
    && (await call('GET', `/api/public/slots?branch=${br.id}&date=tomorrow&staff=any&items=${vip.id}`)).j.slots.length === 0
    && (await call('GET', `/api/public/slots?branch=${br.id}&date=${D}&staff=any&items=`)).j.slots.length === 0);
  r = await call('GET', `/api/public/slots?branch=nope&date=${D}&staff=any&items=${vip.id}`); ok('an unknown branch is refused', r.s === 400);

  // ---------- reviews ----------
  r = await call('POST', '/api/public/reviews', { branchId: br.id, staffId: kev.id, name: 'Ana', rating: 5, text: 'Great fade' });
  ok('a customer posts a review', r.s === 201 || r.s === 200, r);
  r = await call('POST', '/api/public/reviews', { branchId: br.id, name: '', rating: 5 }); ok('a review needs a name', r.s === 400 && /name/i.test(r.j.error));
  r = await call('POST', '/api/public/reviews', { branchId: br.id, name: 'Ben', rating: 9 }); ok('a rating must be 1 to 5', r.s === 400);
  r = await call('GET', `/api/public/reviews?branch=${br.id}`); ok('the review shows on the branch with the barber name and the average', r.j.count === 1 && r.j.avg === 5 && r.j.reviews[0].staffName === 'Kev', r.j);
  await call('POST', '/api/public/reviews', { branchId: br.id, name: 'Cid', rating: 4 }); await call('POST', '/api/public/reviews', { branchId: br.id, name: 'Dan', rating: 4 });
  r = await call('POST', '/api/public/reviews', { branchId: br.id, name: 'Eve', rating: 3 }); ok('after a few reviews from one device in an hour, more are refused', r.s === 429, r.s);
  r = await call('GET', '/api/public/info'); ok('the public info shows the branch rating', r.j.ratings[br.id]?.count === 3);

  // ---------- partner shops: what the Brotherhood owner can do ----------
  const shop = (await call('POST', '/api/public/signup', { kind: 'owner', shopName: 'Kingsman Cuts', ownerName: 'Juan Cruz', email: 'juan@kingsman.ph', phone: '0917 123 4567', city: 'Calamba', username: 'juan', password: 'secret123', agree: true })).j;
  const X = { 'x-org': shop.code }, list = async () => (await call('GET', '/api/orgs', null, owner)).j, org = (await list()).find(o => o.code === shop.code);
  r = await call('POST', `/api/orgs/${org.id}/reset`, null, owner);
  ok('the owner makes a new password for a partner shop, shown once', r.s === 200 && r.j.ownerUser === 'juan' && r.j.password.length >= 8, r);
  ok('the new one works, the old one does not', (await call('POST', '/api/login', { username: 'juan', password: r.j.password }, null, X)).s === 200 && (await call('POST', '/api/login', { username: 'juan', password: 'secret123' }, null, X)).s === 401);
  const newPw = r.j.password;
  r = await call('PUT', `/api/orgs/${org.id}`, { active: false }, owner); ok('the owner pauses the shop', r.s === 200 && (await list()).find(o => o.id === org.id).active === false);
  r = await call('POST', '/api/login', { username: 'juan', password: newPw }, null, X); ok('a paused shop cannot log in', r.s === 403 && /paused/.test(r.j.error), r);
  await call('PUT', `/api/orgs/${org.id}`, { active: true }, owner);
  ok('after resuming it can log in again', (await call('POST', '/api/login', { username: 'juan', password: newPw }, null, X)).s === 200);
  r = await call('PUT', `/api/orgs/${org.id}`, { name: 'Kingsman Cuts Calamba' }, owner); ok('the owner renames the shop', r.s === 200 && (await list()).find(o => o.id === org.id).name === 'Kingsman Cuts Calamba');
  r = await call('POST', `/api/orgs/${org.id}/enter`, null, owner);
  ok('the owner opens the partner shop\'s back office', r.s === 200 && (await call('GET', '/api/state', null, r.j.token)).j.org.code === shop.code, r);
  ok('a partner shop cannot open the partner list or another shop', (await call('GET', '/api/orgs', null, r.j.token)).s === 403 && (await call('POST', `/api/orgs/${org.id}/enter`, null, r.j.token)).s === 403);
  ok('an unknown shop is "not found"', (await call('POST', '/api/orgs/nope0nope0/reset', null, owner)).s === 404);

  // ---------- email marketing without an email account ----------
  r = await call('GET', '/api/marketing', null, owner); ok('the marketing page says email is not connected', r.s === 200 && r.j.provider === '');
  r = await call('POST', '/api/marketing/send', { subject: 'Promo', body: 'Hi {name}, this week only.', audience: { who: 'all' } }, owner); ok('sending is refused until email is connected', r.s === 409 && /GMAIL_USER/.test(r.j.error), r);
  ok('the front desk cannot open marketing', (await call('GET', '/api/marketing', null, (await (async () => { await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner); return (await call('POST', '/api/login', { pin: '111111' })).j.token; })()))).s === 403);
} catch (e) { fail(e); }
await S.stop();
done();
