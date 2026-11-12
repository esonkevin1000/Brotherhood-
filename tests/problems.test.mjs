import { fileURLToPath as __f } from 'node:url';
const ROOT = __f(new URL('..', import.meta.url));
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt12-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: 'ownerpw', DB_FILE: path.join(dbDir, 't.db'), PORT: '3131' }, stdio: 'ignore' });
const B = 'http://localhost:3131';
for (let i = 0; i < 80; i++) { try { await fetch(B + '/api/public/terms'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
let fails = 0;
async function call(method, url, body, tok, raw) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) { const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, type: r.headers.get('content-type'), len: b.length }; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' → ' + extra)); };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
try {
  const owner = (await call('POST', '/api/login', { password: 'ownerpw' })).j.token;
  const st = (await call('GET', '/api/state', null, owner)).j, br = st.branches[0], br2 = st.branches[1];
  const mkU = async (n, pin, role, b) => { const u = (await call('POST', '/api/users', { name: n, username: n.toLowerCase(), pin, role, branchId: b.id }, owner)).j; return { id: u.id, tok: (await call('POST', '/api/login', { pin }, owner)).j.token }; };
  const c1 = await mkU('Cashone', '111111', 'cashier', br), c2 = await mkU('Cashtwo', '222222', 'cashier', br2), b1 = await mkU('Barberone', '333333', 'barber', br);
  // ---- problems
  const ph = (await call('POST', '/api/files', { data: JPG, kind: 'problem' }, c1.tok)).j.id;
  let r = await call('POST', '/api/problems', { category: 'Air conditioning', description: 'AC is leaking water', priority: 'High', photos: [ph] }, c1.tok); ok('cashier reports a problem with a photo', r.s === 201 && r.j.status === 'SUBMITTED' && r.j.photos.length === 1, JSON.stringify(r)); const pid = r.j.id;
  r = await call('POST', '/api/problems', { category: 'Nope', description: 'xxxxxx' }, c1.tok); ok('unknown category refused', r.s === 400);
  r = await call('POST', '/api/problems', { category: 'POS', description: 'Printer jam today', priority: 'Urgent' }, b1.tok); ok('a barber can report a problem too', r.s === 201);
  ok('other branch cannot see it', (await call('GET', '/api/problems', null, c2.tok)).j.rows.length === 0);
  ok('cashier cannot change the status', (await call('PUT', `/api/problems/${pid}/status`, { status: 'ACKNOWLEDGED' }, c1.tok)).s === 403);
  r = await call('PUT', `/api/problems/${pid}/status`, { status: 'RESOLVED' }, owner); ok('workflow cannot skip steps', r.s === 409);
  for (const s of ['ACKNOWLEDGED', 'IN PROGRESS', 'RESOLVED', 'CLOSED']) r = await call('PUT', `/api/problems/${pid}/status`, { status: s }, owner); ok('owner moves it through Acknowledged, In progress, Resolved, Closed', r.j.status === 'CLOSED' && r.j.history.length === 5, JSON.stringify(r.j.history));
  r = await call('POST', `/api/problems/${pid}/comment`, { text: 'Technician came today' }, c1.tok); ok('staff can comment on their branch report', r.s === 200 && r.j.comments.length === 1);
  r = await call('PUT', `/api/problems/${pid}/assign`, { assignedTo: 'Mang Lito (aircon)' }, owner); ok('owner assigns a person', r.s === 200 && r.j.assignedTo.startsWith('Mang'));
  ok('open list shows only open items', (await call('GET', '/api/problems?open=1', null, owner)).j.rows.length === 1);
  // ---- inbox
  let ch = (await call('GET', '/api/inbox/channels', null, c1.tok)).j; const names = ch.map(c => c.name);
  ok('cashier sees company channels and only their own branch chat', names.includes('Announcements') && names.includes('All Barbers') && names.includes(br.name + ' Branch Chat') && !names.includes(br2.name + ' Branch Chat'), JSON.stringify(names));
  const ownerCh = (await call('GET', '/api/inbox/channels', null, owner)).j; ok('owner sees every branch chat', ownerCh.filter(c => c.kind === 'branch').length === st.branches.length);
  const ann = ch.find(c => c.name === 'Announcements'), bch = ch.find(c => c.kind === 'branch'), allb = ch.find(c => c.name === 'All Barbers');
  ok('announcement-only: staff cannot post', (await call('POST', `/api/inbox/channels/${ann.id}/messages`, { text: 'hi' }, c1.tok)).s === 403);
  r = await call('POST', `/api/inbox/channels/${ann.id}/messages`, { text: 'Team meeting on Friday 3PM' }, owner); ok('owner can post an announcement', r.s === 201);
  ok('other branch cannot open this branch chat', (await call('GET', `/api/inbox/channels/${bch.id}/messages`, null, c2.tok)).s === 404);
  r = await call('POST', `/api/inbox/channels/${bch.id}/messages`, { text: 'Out of towels' }, c1.tok); const mid = r.j.id; ok('branch members chat', r.s === 201);
  r = await call('POST', `/api/inbox/channels/${bch.id}/messages`, { text: 'Will buy later', replyTo: mid }, owner); ok('replies keep a link to the original', r.s === 201 && r.j.replyTo === mid);
  r = await call('PUT', `/api/inbox/messages/${mid}/react`, { emoji: '👍' }, owner); ok('reactions', r.j.reactions['👍'].length === 1); r = await call('PUT', `/api/inbox/messages/${mid}/react`, { emoji: '👍' }, owner); ok('tapping again removes the reaction', !r.j.reactions['👍']);
  ok('staff cannot pin', (await call('PUT', `/api/inbox/messages/${mid}/pin`, { pinned: true }, c1.tok)).s === 403);
  r = await call('PUT', `/api/inbox/messages/${mid}/pin`, { pinned: true }, owner); ok('owner pins a message', r.s === 200 && r.j.pinned === 1);
  await call('POST', `/api/inbox/channels/${bch.id}/read`, null, c1.tok); const msgs = (await call('GET', `/api/inbox/channels/${bch.id}/messages`, null, owner)).j; ok('read receipts show who has read', msgs.readers.some(x => x.name === 'Cashone') && msgs.pinned.length === 1, JSON.stringify(msgs.readers));
  await new Promise(r => setTimeout(r, 20)); await call('POST', '/api/inbox/channels/' + bch.id + '/messages', { text: 'Another note' }, owner); ok('unread count for the cashier after the owner writes again', (await call('GET', '/api/inbox/channels', null, c1.tok)).j.find(c => c.id === bch.id).unread === 1);
  // direct messages are private
  const dm = (await call('POST', '/api/inbox/channels', { kind: 'dm', members: ['owner'] }, c1.tok)).j; ok('direct message created', dm.kind === 'dm' && dm.name === 'Owner', JSON.stringify(dm));
  ok('the same DM is reused, not duplicated', (await call('POST', '/api/inbox/channels', { kind: 'dm', members: [c1.id] }, owner)).j.id === dm.id);
  await call('POST', `/api/inbox/channels/${dm.id}/messages`, { text: 'Boss, salary question' }, c1.tok);
  ok('a third person cannot read it', (await call('GET', `/api/inbox/channels/${dm.id}/messages`, null, c2.tok)).s === 404);
  ok('barber cannot read it either', (await call('GET', `/api/inbox/channels/${dm.id}/messages`, null, b1.tok)).s === 404);
  const grp = (await call('POST', '/api/inbox/channels', { kind: 'group', name: 'Trainers', members: [c1.id, b1.id] }, owner)).j; ok('owner makes a group', grp.kind === 'group' && grp.members.length === 3);
  ok('group members can read, others cannot', (await call('GET', `/api/inbox/channels/${grp.id}/messages`, null, b1.tok)).s === 200 && (await call('GET', `/api/inbox/channels/${grp.id}/messages`, null, c2.tok)).s === 404);
  // attachments
  const AUD = 'data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsggHk';
  const up = (await call('POST', '/api/inbox/upload', { data: AUD, name: 'voice.webm' }, c1.tok)); ok('voice message upload accepted', up.s === 201 && up.j.type === 'audio/webm', JSON.stringify(up));
  r = await call('POST', `/api/inbox/upload`, { data: 'data:application/x-msdownload;base64,AAAA', name: 'virus.exe' }, c1.tok); ok('executables are refused', r.s === 400);
  r = await call('POST', `/api/inbox/channels/${allb.id}/messages`, { text: '', attachments: [{ id: up.j.id, name: 'voice.webm', type: 'audio/webm' }] }, c1.tok); ok('a message can be only an attachment', r.s === 201 && r.j.attachments.length === 1);
  r = await call('GET', '/api/files/' + up.j.id, null, c2.tok, true); ok('other branches can play company-wide attachments', r.s === 200 && r.type === 'audio/webm', JSON.stringify(r));
  r = await call('GET', '/api/files/' + up.j.id, null, '', true); ok('attachments are not public', r.s === 401 || r.s === 403);
  r = (await call('GET', '/api/inbox/search?q=towels', null, c1.tok)).j; ok('search finds messages in channels you can access', r.length === 1 && r[0].channelName.includes('Branch Chat'));
  ok('search never leaks other branch/private chats', (await call('GET', '/api/inbox/search?q=salary', null, c2.tok)).j.length === 0);
  ok('announce-only can be toggled by management', (await call('PUT', `/api/inbox/channels/${allb.id}`, { announceOnly: true }, owner)).j.announceOnly === true && (await call('POST', `/api/inbox/channels/${allb.id}/messages`, { text: 'x' }, c1.tok)).s === 403);
} finally { srv.kill(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
