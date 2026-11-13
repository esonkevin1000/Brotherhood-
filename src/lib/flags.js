// The per-branch switch for the new (MVP) behaviour (T11). The pilot starts in one branch (San Pablo, decision D-4); the other
// branches keep today's behaviour until the owner adds them one at a time. Off everywhere by default.
// Code asks mvpOn(branchId). The list is a setting of each shop's own database, so partner shops have their own.
export function createFlags({ getSetting, setSetting, branchExists }) {
  const mvpBranches = () => { try { const v = JSON.parse(getSetting('mvpBranches') || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
  const mvpOn = branchId => !!branchId && mvpBranches().includes(String(branchId));
  const setMvpBranches = ids => {
    if (!Array.isArray(ids) || ids.some(x => typeof x !== 'string' || !branchExists(x))) throw new Error('Pick existing branches');
    setSetting('mvpBranches', JSON.stringify([...new Set(ids)]));
  };
  return { mvpOn, mvpBranches, setMvpBranches };
}
