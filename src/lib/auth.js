// Login helpers: password hashes, signed login tokens, encryption of evidence photos, and unsubscribe codes.
// No database access in here. The formats must not change without a migration plan: people are logged in and photos are stored.
import crypto from 'node:crypto';

// passwords are stored as salt:hash (scrypt), never as the password itself
export const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
export const checkPw = (pw, stored) => { const [salt, h] = String(stored).split(':'); return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(h, 'hex')); };
export const sha = s => crypto.createHash('sha256').update(String(s)).digest();

// Everything that depends on the server secret (SESSION_SECRET).
export function createAuth(secret, { tokenDays = 30 } = {}) {
  // evidence photos are encrypted at rest (AES-256-GCM) with a key derived from the server secret
  const fileKey = crypto.createHash('sha256').update('files:' + secret).digest();
  const encBuf = b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', fileKey, iv), e = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]); };
  const decBuf = b => { const d = crypto.createDecipheriv('aes-256-gcm', fileKey, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };

  // a login token is base64url(JSON { u: user, v: password version, e: expiry, o: shop }) + "." + its signature
  const sign = s => crypto.createHmac('sha256', secret).update(s).digest('base64url');
  const makeToken = (u, v, o) => { const p = Buffer.from(JSON.stringify({ u, v, e: Date.now() + tokenDays * 864e5, ...(o ? { o } : {}) })).toString('base64url'); return p + '.' + sign(p); };
  function readToken(t) {
    const [p, sig] = String(t).split('.');
    if (!p || !sig) return null;
    const a = Buffer.from(sig), b = Buffer.from(sign(p));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
  }

  // the code in an email's unsubscribe link, so only the person who got the email can use it
  const unsubSig = id => crypto.createHmac('sha256', secret).update('unsub:' + id).digest('base64url').slice(0, 22);

  return { makeToken, readToken, encBuf, decBuf, unsubSig };   // sign stays private: with it, any code could make a valid login token
}
