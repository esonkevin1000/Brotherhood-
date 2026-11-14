// Buddy (Senior / PWD / Student) asks for a photo of the ID, but the desk may go on without it ("Continue without photo").
// Then the ticket is marked "No ID photo", the mark survives edits and finishing, and the records report lists the visit.
import { startServer, checker, ymd } from './helper.mjs';
const S = await startServer(3205), { call } = S, { ok, done, fail } = checker();
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  await call('PUT', '/api/settings', { attPhoto: false }, owner);
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], ch = st.chairs.filter(c => c.branchId === br.id);
  const buddy = st.items.find(i => i.name === 'Buddy'), amigo = st.items.find(i => i.name === 'Amigo');
  const lance = (await call('POST', '/api/staff', { name: 'Lance', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  const desk = (await call('POST', '/api/login', { pin: '111111' })).j.token;
  await call('POST', '/api/attendance', { staffId: lance.id, action: 'in' }, desk);
  const today = ymd(new Date()), line = [{ itemId: buddy.id, qty: 1 }];

  // neither a photo nor the choice to skip: still refused, and the message says what to do
  let r = await call('POST', '/api/svc/walkin', { branchId: br.id, name: 'Lola', items: line }, desk);
  ok('Buddy with no photo and no choice is refused', r.s === 400 && /Continue without photo/.test(r.j.error), r.j);

  // the desk chooses to go on without the photo
  r = await call('POST', '/api/svc/walkin', { branchId: br.id, name: 'Lola', items: line, idSkipped: true }, desk);
  ok('"Continue without photo" adds the walk-in', r.s === 201, r.j);
  const w = r.j;
  ok('the ticket is marked "No ID photo"', w.idSkipped === true && w.hasId === false, w);

  // it can be finished without being asked again
  r = await call('POST', `/api/svc/${w.id}/finish`, { method: 'Cash', barberId: lance.id }, desk);
  ok('the no-photo ticket can be finished', r.s === 200, r.j);
  ok('…and stays marked after finishing', r.j.idSkipped === true, r.j);

  // with a photo the mark is not there
  const ph = await call('POST', '/api/svc/idphoto', { data: JPG, idType: 'Senior', branchId: br.id }, desk);
  r = await call('POST', '/api/svc/walkin', { branchId: br.id, name: 'Lolo', items: line, idPhotoId: ph.j.id }, desk);
  ok('with the photo the ticket is not marked', r.s === 201 && r.j.hasId === true && r.j.idSkipped === false, r.j);

  // Buddy added while finishing a ticket that had none: the choice is offered there too
  const am = (await call('POST', '/api/svc/walkin', { branchId: br.id, name: 'Kuya', items: [{ itemId: amigo.id, qty: 1 }] }, desk)).j;
  r = await call('POST', `/api/svc/${am.id}/finish`, { method: 'Cash', barberId: lance.id, items: [{ itemId: amigo.id, qty: 1 }, { itemId: buddy.id, qty: 1 }] }, desk);
  ok('adding Buddy at finish with no photo and no choice is refused', r.s === 400 && /ID/.test(r.j.error), r.j);
  r = await call('POST', `/api/svc/${am.id}/finish`, { method: 'Cash', barberId: lance.id, items: [{ itemId: amigo.id, qty: 1 }, { itemId: buddy.id, qty: 1 }], idSkipped: true }, desk);
  ok('…and allowed with "Continue without photo"', r.s === 200 && r.j.idSkipped === true, r.j);

  // a ticket without any ID service is never marked
  const plain = (await call('POST', '/api/svc/walkin', { branchId: br.id, name: 'Plain', items: [{ itemId: amigo.id, qty: 1 }], idSkipped: true }, desk)).j;
  ok('a ticket with no ID service is not marked even if the flag is sent', plain.idSkipped === false, plain);

  // the owner sees the no-photo visits in the records report
  const rep = (await call('GET', `/api/reports/records?from=${today}&to=${today}&branch=all`, null, owner)).j;
  const t = rep.tables.find(x => x.title === 'Without an ID photo');
  ok('the records report lists the finished no-photo visits', t && t.rows.length === 2 && t.rows.some(x => x[2] === 'Lola') && t.rows.some(x => x[2] === 'Kuya'), t);
  ok('…not the one with a photo', t && !t.rows.some(x => x[2] === 'Lolo'), t);
} catch (e) { fail(e); }
await S.stop(); done();
