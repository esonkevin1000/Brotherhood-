// Webcam for the camera buttons when the app is used on a computer.
// On a phone, a camera button (a file input with "capture") opens the phone's camera. A computer's browser ignores
// "capture" and only shows a file picker, so here a click on such a button opens a small webcam window instead,
// with "Choose a file" still offered. The photo is handed back to the same input as if it had been picked, so every
// screen (selfie, ID photo, receipt, checklist, problem report, proof of release) keeps its own code unchanged.
(() => {
  const onPhone = () => matchMedia('(pointer: coarse)').matches;
  const hasCam = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let passThrough = null;   // the input that should open the normal file picker this one time

  document.addEventListener('click', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.hasAttribute('capture')) return;
    if (input === passThrough) { passThrough = null; return; }
    if (onPhone() || !hasCam()) return;
    e.preventDefault();
    openWebcam(input);
  }, true);

  function handBack(input, blob) {
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'webcam-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text) n.textContent = text; return n; };
  const BTN = 'font:600 15px Inter,system-ui,sans-serif;border-radius:999px;padding:11px 18px;cursor:pointer;border:1.5px solid #fff;';
  const button = (label, primary) => { const b = el('button', BTN + (primary ? 'background:#fff;color:#0a0a0a;' : 'background:transparent;color:#fff;'), label); b.type = 'button'; return b; };

  function openWebcam(input) {
    const selfie = input.getAttribute('capture') === 'user';
    let stream = null, shot = null;
    const back = el('div', 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:16px');
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', selfie ? 'Take a selfie' : 'Take a photo');
    const panel = el('div', 'width:min(560px,100%);display:flex;flex-direction:column;gap:12px;color:#fff;font:15px/1.45 Inter,system-ui,sans-serif');
    const title = el('div', 'font-weight:700;font-size:17px', selfie ? 'Take a selfie' : 'Take a photo');
    const stage = el('div', 'position:relative;width:100%;aspect-ratio:4/3;background:#111;border-radius:16px;overflow:hidden');
    const video = el('video', 'width:100%;height:100%;object-fit:cover;display:block' + (selfie ? ';transform:scaleX(-1)' : ''));
    video.muted = true; video.playsInline = true; video.autoplay = true;
    const still = el('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none'); still.alt = '';
    const note = el('div', 'font-size:14px;color:#cfcfcf;min-height:20px', 'Starting the camera…');
    const row = el('div', 'display:flex;gap:10px;flex-wrap:wrap');
    const take = button('Take photo', true), use = button('Use this photo', true), retake = button('Retake'), pick = button('Choose a file'), cancel = button('Cancel');
    take.disabled = true;
    stage.append(video, still); panel.append(title, stage, note, row); back.append(panel); document.body.append(back);

    const buttons = list => { row.replaceChildren(...list); };
    const close = () => { if (stream) stream.getTracks().forEach(t => t.stop()); if (still.src.startsWith('blob:')) URL.revokeObjectURL(still.src); back.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    buttons([take, pick, cancel]);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: selfie ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(s => { stream = s; video.srcObject = s; note.textContent = selfie ? 'Look at the camera, then take the selfie.' : 'Hold it steady and fill the frame, then take the photo.'; take.disabled = false; take.focus(); })
      .catch(err => {
        note.textContent = err && err.name === 'NotAllowedError' ? 'The camera is blocked for this site. Allow it in the browser, or choose a file instead.'
          : err && err.name === 'NotFoundError' ? 'No camera was found on this computer. Choose a file instead.'
          : 'The camera could not start. Choose a file instead.';
        buttons([pick, cancel]); pick.focus();
      });

    take.onclick = () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      c.toBlob(b => {
        if (!b) { note.textContent = 'That did not work. Please try again.'; return; }
        shot = b; still.src = URL.createObjectURL(b); still.style.display = 'block';
        note.textContent = 'Use this photo, or take it again.'; buttons([use, retake, cancel]); use.focus();
      }, 'image/jpeg', 0.92);
    };
    retake.onclick = () => { if (still.src.startsWith('blob:')) URL.revokeObjectURL(still.src); still.removeAttribute('src'); still.style.display = 'none'; shot = null; note.textContent = ''; buttons([take, pick, cancel]); take.focus(); };
    use.onclick = () => { const b = shot; close(); if (b) handBack(input, b); };
    pick.onclick = () => { close(); passThrough = input; input.click(); };
    cancel.onclick = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
  }
})();
