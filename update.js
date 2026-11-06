// Registers the service worker and shows an "Update app" bar when a new version has been deployed.
(function () {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  function bar(reg) {
    if (document.getElementById('upd-bar')) return;
    const d = document.createElement('div'); d.id = 'upd-bar';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;background:#000;color:#fff;border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);font:600 14px Inter,system-ui,sans-serif';
    d.innerHTML = '<span style="flex:1">A new version of Brotherhood is ready.</span><button style="background:#fff;color:#000;border:0;border-radius:10px;padding:10px 16px;font:700 14px inherit;cursor:pointer">Update app</button>';
    d.querySelector('button').onclick = () => { d.querySelector('button').textContent = 'Updating…'; (reg.waiting || reg.installing)?.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 4000); };
    document.body.appendChild(d);
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register('/sw.js').then(reg => {
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) bar(reg); };
    check();
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') check(); }); });
    const poll = () => reg.update().catch(() => { });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    setInterval(poll, 15 * 60 * 1000);
  }).catch(() => { });
})();