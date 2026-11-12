// Decision D-1: public sign-up for new shops is closed by default. The page says "opening soon", the API refuses,
// and partner shops that already exist keep working. (SIGNUPS_OPEN=1 opens it again: see signup-billing-email.test.mjs.)
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const S = await startServer(3162);
const { call, B } = S;
try {
  let r = await fetch(B + '/signup'), t = await r.text();
  ok('/signup shows "opening soon", not the form', r.status === 200 && /Opening/.test(t) && !/Create my shop/.test(t), t.slice(0, 200));
  r = await call('POST', '/api/public/signup', { kind: 'owner', shopName: 'Kingsman Cuts', ownerName: 'Juan Dela Cruz', email: 'juan@kingsman.ph', phone: '0917 123 4567', city: 'Calamba', username: 'juan', password: 'secret123', agree: true });
  ok('the sign-up API refuses', r.s === 403 && /not open/.test(r.j.error), r);
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  ok('no shop was created', (await call('GET', '/api/orgs', null, owner)).j.length === 0);
  ok('the public plans say sign-up is closed', (await call('GET', '/api/public/plans')).j.signupOpen === false);
  ok('the app config says so too (home page buttons)', (await call('GET', '/api/bh/config')).j.signupOpen === false);
  // the Brotherhood owner can still add a partner shop by hand, and that shop works
  r = await call('POST', '/api/orgs', { name: 'Partner Cuts', code: 'partner-cuts', branch: 'Lipa', ownerUser: 'pedro' }, owner);
  ok('the owner can still add a partner shop by hand', r.s === 201 && r.j.password, r);
  const login = await call('POST', '/api/login', { username: 'pedro', password: r.j.password }, null, { 'x-org': 'partner-cuts' });
  ok('that partner shop can log in and work', login.s === 200 && (await call('GET', '/api/state', null, login.j.token)).j.org.code === 'partner-cuts', login);
  for (const pg of ['/shop-terms', '/privacy', '/terms']) ok(pg + ' is still served', (await fetch(B + pg)).status === 200);
} catch (e) { fail(e); }
await S.stop();
done();
