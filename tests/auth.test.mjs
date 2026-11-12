// The login helpers on their own (no app server): password hashes, login tokens, encrypted photos and unsubscribe links.
// The formats are pinned here on purpose: people are logged in and photos are stored right now, and a deploy must not
// log anyone out or make a stored photo unreadable.
import crypto from 'node:crypto';
import { hashPw, checkPw, sha, createAuth } from '../src/lib/auth.js';
import { checker, startServer } from './helper.mjs';
const { ok, done, fail } = checker();
const never = fn => { try { return fn() !== true; } catch { return true; } };   // "this must not succeed", whether it answers false or throws
try {
  // ---------- passwords ----------
  const h1 = hashPw('secret123'), h2 = hashPw('secret123');
  ok('a password is stored as salt:hash, never as the password', /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(h1) && !h1.includes('secret123'), h1);
  ok('the same password gives a different hash each time (salted)', h1 !== h2);
  ok('the right password is accepted', checkPw('secret123', h1) === true && checkPw('secret123', h2) === true);
  ok('a wrong password is refused', checkPw('secret124', h1) === false && checkPw('', h1) === false);
  ok('a damaged stored hash never lets anyone in', never(() => checkPw('secret123', 'garbage')) && never(() => checkPw('secret123', '')) && never(() => checkPw('secret123', h1.slice(0, 40))));
  { const salt = 'ab'.repeat(16), old = salt + ':' + crypto.scryptSync('ownerpw', salt, 32).toString('hex'); ok('hashes made before this change still work (scrypt, 32 bytes)', checkPw('ownerpw', old) === true); }
  ok('sha gives a 32-byte digest', Buffer.isBuffer(sha('x')) && sha('x').length === 32 && sha('x').equals(crypto.createHash('sha256').update('x').digest()));

  // ---------- login tokens ----------
  const A = createAuth('test-secret-one'), B = createAuth('test-secret-two');
  const tok = A.makeToken('user1', 'v7', 'org9'), got = A.readToken(tok);
  ok('a token comes back with who it is for, the password version and the shop', got && got.u === 'user1' && got.v === 'v7' && got.o === 'org9', got);
  ok('it lasts 30 days', got.e > Date.now() + 29.9 * 864e5 && got.e < Date.now() + 30.1 * 864e5, got.e - Date.now());
  ok('a Brotherhood token has no shop field', !('o' in A.readToken(A.makeToken('owner', 'abc'))));
  const [p, sig] = tok.split('.');
  ok('the format is base64url(JSON).HMAC-SHA256, the same as before this change', sig === crypto.createHmac('sha256', 'test-secret-one').update(p).digest('base64url') && JSON.parse(Buffer.from(p, 'base64url').toString()).u === 'user1');
  { const body = Buffer.from(JSON.stringify({ u: 'old', v: 'x', e: Date.now() + 5 * 864e5 })).toString('base64url'), oldTok = body + '.' + crypto.createHmac('sha256', 'test-secret-one').update(body).digest('base64url');
    ok('a token issued before this change is still accepted (nobody is logged out)', A.readToken(oldTok)?.u === 'old'); }
  const forged = Buffer.from(JSON.stringify({ ...got, u: 'owner' })).toString('base64url') + '.' + sig;
  ok('changing who the token is for makes it invalid', A.readToken(forged) === null);
  ok('a changed signature is refused', A.readToken(p + '.' + sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA')) === null && A.readToken(p + '.') === null && A.readToken(p + '.short') === null);
  ok('a token signed with another secret is refused', B.readToken(tok) === null && A.readToken(B.makeToken('user1', 'v7')) === null);
  ok('empty or broken input is refused without an error', [undefined, null, '', 'abc', '.', 'a.b.c', 12345, '%%%.%%%'].every(x => A.readToken(x) === null));
  ok('an expired token is refused', createAuth('test-secret-one', { tokenDays: -1 }).readToken(createAuth('test-secret-one', { tokenDays: -1 }).makeToken('u', 'v')) === null);
  const signed = body => { const b = Buffer.from(body).toString('base64url'); return b + '.' + crypto.createHmac('sha256', 'test-secret-one').update(b).digest('base64url'); };
  ok('a correctly signed token that is not JSON is refused', A.readToken(signed('not json')) === null && A.readToken(signed('null')) === null);
  ok('a correctly signed token with no expiry, or an expiry that is not a number, is refused', A.readToken(signed(JSON.stringify({ u: 'owner', v: '' }))) === null && A.readToken(signed(JSON.stringify({ u: 'owner', v: '', e: 'never' }))) === null && A.readToken(signed(JSON.stringify({ u: 'owner', v: '', e: null }))) === null);
  ok('the signing function itself is not handed out', !('sign' in A));

  // ---------- encrypted photos ----------
  const photo = crypto.randomBytes(5000), enc = A.encBuf(photo);
  ok('a photo is unreadable while stored and comes back the same', !enc.includes(photo.subarray(0, 32)) && A.decBuf(enc).equals(photo));
  ok('the same photo is stored differently each time', !A.encBuf(photo).equals(enc));
  { const key = crypto.createHash('sha256').update('files:test-secret-one').digest(), d = crypto.createDecipheriv('aes-256-gcm', key, enc.subarray(0, 12)); d.setAuthTag(enc.subarray(12, 28));
    ok('the stored format is the same as before (AES-256-GCM: 12-byte IV, 16-byte tag, data)', Buffer.concat([d.update(enc.subarray(28)), d.final()]).equals(photo) && enc.length === photo.length + 28); }
  const tampered = Buffer.from(enc); tampered[100] ^= 1;
  ok('a tampered photo is refused, not shown', never(() => { A.decBuf(tampered); return true; }));
  ok('another server secret cannot open it', never(() => { B.decBuf(enc); return true; }));
  ok('an empty file works', A.decBuf(A.encBuf(Buffer.alloc(0))).length === 0);

  // ---------- unsubscribe links ----------
  ok('an unsubscribe code is stable, 22 characters, and the same as before this change', A.unsubSig('cust1') === A.unsubSig('cust1') && A.unsubSig('cust1').length === 22 && A.unsubSig('cust1') === crypto.createHmac('sha256', 'test-secret-one').update('unsub:cust1').digest('base64url').slice(0, 22));
  ok('it differs per customer and per server secret', A.unsubSig('cust1') !== A.unsubSig('cust2') && A.unsubSig('cust1') !== B.unsubSig('cust1'));

  // ---------- the running server uses the same secret for all of this ----------
  const S = await startServer(3170, { SESSION_SECRET: 'wired-secret' });
  try {
    const mk = (secret, payload) => { const p = Buffer.from(JSON.stringify(payload)).toString('base64url'); return p + '.' + crypto.createHmac('sha256', secret).update(p).digest('base64url'); };
    // a Brotherhood owner token carries a mark of the Railway password (T6b), here ADMIN_PASSWORD=ownerpw
    // the mark is keyed with SESSION_SECRET (T6d review), so a stolen token cannot be used to guess the Railway password offline
    const ov = crypto.createHmac('sha256', 'wired-secret').update('owner-login:ownerpw').digest('base64url').slice(-8);
    const good = mk('wired-secret', { u: 'owner', v: ov, e: Date.now() + 864e5 });
    const plain = crypto.createHash('sha256').update('owner-login:ownerpw').digest('base64url').slice(-8);
    ok('an owner token with the old unkeyed mark is refused', (await S.call('GET', '/api/state', null, mk('wired-secret', { u: 'owner', v: plain, e: Date.now() + 864e5 }))).s === 401);
    ok('an owner token without the password mark is refused', (await S.call('GET', '/api/state', null, mk('wired-secret', { u: 'owner', v: '', e: Date.now() + 864e5 }))).s === 401);
    ok('the server accepts a token signed with its SESSION_SECRET', (await S.call('GET', '/api/state', null, good)).s === 200);
    ok('and refuses one signed with anything else', (await S.call('GET', '/api/state', null, mk('bp:ownerpw', { u: 'owner', v: ov, e: Date.now() + 864e5 }))).s === 401);
    ok('and refuses an expired one', (await S.call('GET', '/api/state', null, mk('wired-secret', { u: 'owner', v: ov, e: Date.now() - 1000 }))).s === 401);
    const real = (await S.call('POST', '/api/login', { password: 'ownerpw' })).j.token, [rp, rs] = real.split('.');
    ok('a token from a real login is signed the same way', rs === crypto.createHmac('sha256', 'wired-secret').update(rp).digest('base64url'));
  } finally { await S.stop(); }
} catch (e) { fail(e); }
done();
