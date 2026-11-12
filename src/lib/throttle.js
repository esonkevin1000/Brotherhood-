// Counts failures per key and locks the key when there are too many in a short time.
// Used for logins: the key is something the caller cannot fake (a shop, or a username), never an address taken from a header.
// Kept in memory: a restart clears it, which only happens on a deploy.
//
// max: failures allowed inside windowMs. The failure that reaches max starts a lock of lockMs.
// Each further lock is twice as long, up to maxLockMs. A quietMs after the last lock ended, the lock time is back to normal.
// maxKeys: a ceiling on how many keys are remembered, so made-up keys cannot use up memory.
export function createLimiter({ max, windowMs, lockMs, maxLockMs = lockMs, quietMs = 24 * 3600e3, maxKeys = 20000, now = Date.now }) {
  const keys = new Map();   // key → { hits: [times], until, level, last }
  let pruned = 0;
  // a key is worth keeping while it is locked, has failures inside the window, or still carries a raised lock time
  const idle = (s, t) => s.until <= t && t - s.last >= windowMs && (s.level === 0 || t - s.until >= quietMs);
  function prune(t, force) {
    if (!force && t - pruned < 60e3) return; pruned = t;
    for (const [k, s] of keys) if (idle(s, t)) keys.delete(k);
    if (keys.size > maxKeys) {   // still too many: drop the oldest keys that are not locked and have no raised lock time
      for (const [k, s] of keys) { if (keys.size <= maxKeys) break; if (s.until <= t && s.level === 0) keys.delete(k); }
    }
  }

  // milliseconds this key is still locked for (0 = not locked)
  function lockedFor(key) { const s = keys.get(key), t = now(); return s && s.until > t ? s.until - t : 0; }

  // record one failure; returns the lock time if this failure started a lock, else 0
  function fail(key) {
    const t = now(); prune(t, keys.size >= maxKeys);
    let s = keys.get(key);
    if (!s) { s = { hits: [], until: 0, level: 0, last: t }; keys.set(key, s); }
    if (s.until > t) return 0;   // already locked: trying again changes nothing
    if (s.level && t - s.until >= quietMs) s.level = 0;
    s.last = t; s.hits = s.hits.filter(x => t - x < windowMs); s.hits.push(t);
    if (s.hits.length < max) return 0;
    const ms = Math.min(lockMs * 2 ** s.level, maxLockMs);
    // Keep most of the count: after the lock only a few more failures are allowed until the old ones leave the window.
    // (When the lock is at least as long as the window, as for the short limits, the old ones have left by then anyway.)
    s.until = t + ms; s.level++; s.hits = s.hits.slice(Math.ceil(max / 4));
    return ms;
  }

  // forget the failures of a key (after a correct login with that key); a lock that has started stays
  function clear(key) { const s = keys.get(key); if (s && s.until <= now()) { if (s.level) s.hits = []; else keys.delete(key); } }

  return { lockedFor, fail, clear, size: () => { prune(now(), true); return keys.size; } };
}

// Several limits on the same key (for example "10 in 10 minutes" and "40 in a day"): locked when any is locked,
// a failure counts in all of them, and the longest wait is the one reported.
export const allOf = (...limiters) => ({
  lockedFor: key => Math.max(...limiters.map(l => l.lockedFor(key))),
  fail: key => Math.max(...limiters.map(l => l.fail(key))),
  clear: key => { for (const l of limiters) l.clear(key); },
  size: () => Math.max(...limiters.map(l => l.size())),
});

// a whole number setting from the environment; a missing or unsafe value (below min) gives the fallback
export const intSetting = (value, fallback, min) => { const n = Math.floor(+value); return Number.isFinite(n) && n >= min ? n : fallback; };
