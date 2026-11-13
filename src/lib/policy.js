// Booking policy per branch (T17, D-7): slot interval, buffer after each appointment, no-show grace, and customer cancel cutoff.
// The owner sets it per branch; it applies in branches on the new booking system (T11). Other branches keep today's rules.
// Each booking stores the policy in force when it was made (bookings.policy), so a later change never alters it.
export const POLICY_CHOICES = {
  slotStep: [15, 20, 30, 60],
  bufferMins: [0, 5, 10, 15, 20, 30],
  noshowGraceMins: Array.from({ length: 31 }, (_, i) => i),   // 0 to 30
  cancelCutoffMins: [0, 30, 60, 90, 120, 180, 240, 360, 720, 1440],
};
// "1 hour", "2 hours", "30 minutes", for messages
export const durText = m => m % 60 === 0 && m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'}`;
// the cancel cutoff a booking was made under (bookings made before T17 keep today's 1 hour)
export const cutoffOf = b => { try { const p = b.policy ? JSON.parse(b.policy) : null; return Number.isFinite(p?.cancelCutoffMins) ? p.cancelCutoffMins : 60; } catch { return 60; } };

export function createPolicy({ getSetting, setSetting, mvpOn = () => false, branchExists }) {
  const shopBuffer = () => +getSetting('bufferMins') || 0;   // the shop-wide buffer from Pro tools (today's rule)
  const today = () => ({ slotStep: 30, bufferMins: shopBuffer(), noshowGraceMins: 5, cancelCutoffMins: 60 });   // D-7 defaults
  const saved = () => { try { const v = JSON.parse(getSetting('bookingPolicy') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  // what the owner set for a branch (defaults for anything not set)
  const savedOf = branchId => ({ ...today(), ...(saved()[branchId] || {}) });
  // the rules that really apply now: the saved ones in branches on the new booking system, today's rules elsewhere
  const policyOf = branchId => mvpOn(branchId) ? savedOf(branchId) : today();
  function setPolicy(branchId, patch) {
    if (!branchExists(branchId)) throw new Error('Pick a branch');
    const next = { ...(saved()[branchId] || {}) };
    for (const k of Object.keys(POLICY_CHOICES)) {
      if (!(k in patch)) continue;
      const v = Number(patch[k]);
      if (!POLICY_CHOICES[k].includes(v)) throw new Error(`Choose a value for ${k} from: ${POLICY_CHOICES[k].length > 12 ? '0 to 30' : POLICY_CHOICES[k].join(', ')}`);
      next[k] = v;
    }
    setSetting('bookingPolicy', JSON.stringify({ ...saved(), [branchId]: next }));
    return savedOf(branchId);
  }
  return { policyOf, savedOf, setPolicy };
}
