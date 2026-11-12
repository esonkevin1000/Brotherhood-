// The day board routes (/api/svc/*) after they moved to src/routes/service-records.js: the cases that
// app-today-board.test.mjs does not cover (ID photo upload rules, a barber not linked to a profile, a cancelled
// visit, another branch, a discount, unknown paths).
import { createServiceRoutes } from '../src/routes/service-records.js';
import { startServer, checker } from './helper.mjs';
const { ok, done, fail } = checker();
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
ok('the routes come from their own module', typeof createServiceRoutes === 'function');
const S = await startServer(3134);
const { call } = S;
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, [br, br2] = st.branches, ch = st.chairs.filter(c => c.branchId === br.id);
  const amigo = st.items.find(i => i.name === 'Amigo'), buddy = st.items.find(i => i.name === 'Buddy');
  const kev = (await call('POST', '/api/staff', { name: 'Kev', branchId: br.id, chairId: ch[0].id, pct: 40, allowance: 0 }, owner)).j;
  const leo = (await call('POST', '/api/staff', { name: 'Leo', branchId: br.id, chairId: ch[1].id, pct: 40, allowance: 0 }, owner)).j;
  await call('POST', '/api/users', { name: 'Desk', username: 'desk1', pin: '111111', role: 'cashier', branchId: br.id }, owner);
  await call('POST', '/api/users', { name: 'Desk Two', username: 'desk2', pin: '222222', role: 'cashier', branchId: br2.id }, owner);
  await call('POST', '/api/users', { name: 'Kev', username: 'kev', pin: '333333', role: 'barber', branchId: br.id, staffId: kev.id }, owner);
  await call('POST', '/api/users', { name: 'New Guy', username: 'newguy', pin: '444444', role: 'barber', branchId: br.id }, owner);
  const pin = async p => (await call('POST', '/api/login', { pin: p })).j.token;
  const desk = await pin('111111'), desk2 = await pin('222222'), kevT = await pin('333333'), newGuy = await pin('444444');

  // ---------- ID photo upload ----------
  let r = await call('POST', '/api/svc/idphoto', { data: JPG, idType: 'Senior' }, desk);
  ok('an ID photo is saved and gives back its id and type', r.s === 201 && r.j.id && r.j.idType === 'Senior', r);
  const photoId = r.j.id;
  r = await call('POST', '/api/svc/idphoto', { data: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', idType: 'Senior' }, desk); ok('a GIF is refused', r.s === 400 && /JPEG, PNG or WebP/.test(r.j.error), r);
  r = await call('POST', '/api/svc/idphoto', { data: 'not an image', idType: 'PWD' }, desk); ok('something that is not an image is refused', r.s === 400, r);
  r = await call('POST', '/api/svc/idphoto', { data: JPG, idType: 'Driver' }, desk); ok('only Senior, PWD or Student IDs are accepted', r.s === 400 && /Senior, PWD or Student/.test(r.j.error), r);
  r = await call('POST', '/api/svc/idphoto', { data: 'data:image/jpeg;base64,' + Buffer.alloc(1_100_000, 1).toString('base64'), idType: 'Student' }, desk); ok('a photo over 1 MB is refused', r.s === 413, r.s);
  r = await call('POST', '/api/svc/walkin', { name: 'Lola Ana', items: [{ itemId: buddy.id, qty: 1 }], idPhotoId: photoId }, desk2); ok('another branch cannot use that ID photo', r.s === 400 && /ID photo not found/.test(r.j.error), r);
  r = await call('POST', '/api/svc/walkin', { name: 'Lola Ana', items: [{ itemId: buddy.id, qty: 1 }], idPhotoId: photoId }, desk); ok('the same branch can', r.s === 201 && r.j.hasId === true, r);
  r = await call('POST', '/api/svc/walkin', { name: 'Lolo Ben', items: [{ itemId: buddy.id, qty: 1 }], idPhotoId: photoId }, desk); ok('an ID photo already used for a visit cannot be used again', r.s === 400, r);

  // ---------- who may do what ----------
  r = await call('POST', '/api/svc/walkin', { name: 'Juan', items: [{ itemId: amigo.id, qty: 1 }] }, newGuy); ok('a barber whose login is not linked to a profile is told to ask the owner', r.s === 409 && /not linked/.test(r.j.error), r);
  r = await call('POST', '/api/svc/walkin', { name: 'Juan', items: [{ itemId: amigo.id, qty: 1 }] }, desk); const v1 = r.j;
  r = await call('POST', `/api/svc/${v1.id}/start`, { barberId: kev.id }, desk2); ok('another branch cannot touch the visit', r.s === 403 && /Not your shop/.test(r.j.error), r);
  r = await call('POST', '/api/svc/nope0nope0/start', { barberId: kev.id }, desk); ok('an unknown visit is "not found"', r.s === 404 && /Visit not found/.test(r.j.error), r);
  r = await call('POST', `/api/svc/${v1.id}/start`, {}, desk); ok('starting needs a barber', r.s === 400 && /Choose the barber/.test(r.j.error), r);
  r = await call('POST', `/api/svc/${v1.id}/cancel`, { reason: 'Customer left' }, desk); ok('a waiting visit can be cancelled', r.s === 200, r);
  r = await call('POST', `/api/svc/${v1.id}/finish`, { method: 'Cash', barberId: kev.id }, desk); ok('a cancelled visit cannot be finished', r.s === 409 && /cancelled/.test(r.j.error), r);
  r = await call('GET', '/api/svc/today', null, desk); ok('the cancelled visit is not on the day board', r.s === 200 && !r.j.tickets.some(x => x.id === v1.id));

  // ---------- a discount and the totals ----------
  const disc = st.discounts[0];
  r = await call('POST', '/api/svc/walkin', { name: 'Pedro', items: [{ itemId: amigo.id, qty: 1 }], barberId: leo.id }, desk); const v2 = r.j;
  r = await call('POST', `/api/svc/${v2.id}/finish`, { method: 'GCash', discountId: 'nope', barberId: leo.id }, desk); ok('an unknown discount is refused', r.s === 400 && /Unknown discount/.test(r.j.error), r);
  r = await call('POST', `/api/svc/${v2.id}/finish`, { method: 'GCash', discountId: disc.id, barberId: leo.id }, desk);
  ok('finishing with a discount records it and lowers the total', r.s === 200 && r.j.status === 'done' && r.j.discountName === disc.name && r.j.total < amigo.price && r.j.method === 'GCash', r.j);
  r = await call('GET', '/api/svc/today', null, desk); ok('the day board totals count the finished visit', r.j.totals.done >= 1 && r.j.totals.earned >= r.j.tickets.find(x => x.id === v2.id).total);

  // ---------- the day board for a barber ----------
  const D = new Date(), ymd = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
  r = await call('GET', '/api/svc/today', null, kevT);
  ok('a barber sees his own day: no branch list, his own id, only his visits or the open line', r.s === 200 && r.j.branches.length === 0 && r.j.myStaffId === kev.id && r.j.date === ymd && r.j.tickets.every(x => x.barberId === kev.id || (x.status === 'waiting' && !x.barberId)), r.j.tickets);
  r = await call('GET', '/api/svc/today?branch=' + br2.id, null, desk); ok('the front desk always gets its own branch, whatever it asks for', r.j.branch.id === br.id);
  r = await call('GET', '/api/svc/today?branch=' + br2.id, null, owner); ok('the owner can open any branch', r.j.branch.id === br2.id && r.j.branches.length === st.branches.length);
  ok('the day board lists the payment methods and the menu', r.j.methods.join() === 'Cash,GCash,Maya,Card,Bank transfer,Other' && r.j.menu.some(i => i.name === 'Amigo'));

  // ---------- paths ----------
  r = await call('GET', '/api/svc/nothing-here', null, desk); ok('an unknown day-board path is "not found"', r.s === 404);
  r = await call('GET', '/api/svc/today'); ok('the day board needs a login', r.s === 401);
} catch (e) { fail(e); }
await S.stop();
done();
