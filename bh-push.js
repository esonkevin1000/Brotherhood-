// Web Push for the Brotherhood app, with no dependencies: VAPID (RFC 8292) and message encryption (RFC 8291, aes128gcm / RFC 8188)
// built on node:crypto. Used by bh-api.js to send booking, reminder and community notifications to phones.
import crypto from 'node:crypto';

export const b64u = b => Buffer.from(b).toString('base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// Encrypts one message for one browser subscription ({ p256dh, auth } are the base64url keys the browser gave us).
// opts.asPrivate / opts.salt exist only so the RFC test vector can be reproduced.
export function encryptPayload(sub, payload, opts = {}) {
  const uaPub = Buffer.from(sub.p256dh, 'base64url'), authSecret = Buffer.from(sub.auth, 'base64url');
  if (uaPub.length !== 65 || uaPub[0] !== 4 || authSecret.length < 16) throw new Error('bad subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(Buffer.from(opts.asPrivate, 'base64url')); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), salt = opts.salt ? Buffer.from(opts.salt, 'base64url') : crypto.randomBytes(16);
  const secret = ecdh.computeSecret(uaPub);
  const ikm = hkdf(authSecret, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const data = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);   // 0x02 = last (and only) record, no padding
  if (data.length > 3800) throw new Error('payload too large');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce), ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

// The server's own signing key pair. `stored` is the saved { d, x, y } (base64url) or nothing, in which case a new pair is made.
export function loadVapid(stored) {
  let j = stored && stored.d && stored.x && stored.y ? stored : null, created = false;
  if (!j) { const jwk = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' }); j = { d: jwk.d, x: jwk.x, y: jwk.y }; created = true; }
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', ...j }, format: 'jwk' });
  const pub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]));
  return { key, pub, stored: j, created };
}

// Authorization header for one push service endpoint. `subject` must be a mailto: or https: URL (Apple rejects anything else).
export function vapidHeader(vapid, endpoint, subject) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: vapid.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.pub}`;
}

// Only real push services are contacted (the endpoint comes from the user's browser, so it must not point anywhere else).
export const knownPushHost = h => /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/i.test(h);

// Returns the push service's HTTP status: 201 sent; 404 / 410 means the subscription is gone and should be deleted.
export async function sendPush(sub, message, vapid, subject, opts = {}) {
  const body = encryptPayload(sub, JSON.stringify(message));
  const r = await fetch(sub.endpoint, {
    method: 'POST', body, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(opts.ttl ?? 86400), Urgency: opts.urgency || 'normal', Authorization: vapidHeader(vapid, sub.endpoint, subject) },
  });
  return r.status;
}
