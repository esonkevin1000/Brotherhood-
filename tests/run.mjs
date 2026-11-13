// Runs every tests/*.test.mjs suite. Each suite starts its own server on its own port with a temporary database,
// prints PASS/FAIL lines and ends with "ALL PASSED". Usage: npm test            (all suites)
//                                                         npm test -- booking  (only suites whose file name contains "booking")
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort();
const PARALLEL = +process.env.TEST_PARALLEL || 4;
if (!files.length) { console.log('No test suite matches "' + filter + '".'); process.exit(1); }

// The suites use fixed ports. A second run at the same time, or a server left over from an earlier run, would make suites talk to
// the wrong server and report wrong results. So: one run at a time, and no test port may already be in use.
import net from 'node:net'; import os from 'node:os';
const LOCK = path.join(os.tmpdir(), 'brotherhood-tests.lock');
try { const pid = +fs.readFileSync(LOCK, 'utf8'); if (pid && pid !== process.pid) { try { process.kill(pid, 0); console.log('Another test run is active (process ' + pid + '). Wait for it to finish.'); process.exit(1); } catch (e) { if (e.code === 'EPERM') { console.log('Another test run is active.'); process.exit(1); } } } } catch { }
fs.writeFileSync(LOCK, String(process.pid)); process.on('exit', () => { try { if (+fs.readFileSync(LOCK, 'utf8') === process.pid) fs.rmSync(LOCK); } catch { } });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));
const inUse = port => new Promise(r => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); s.setTimeout(400, () => { s.destroy(); r(false); }); });
{ const ports = [2525, 3198, 3199]; for (let p = 3120; p <= 3215; p++) ports.push(p);
  const busy = (await Promise.all(ports.map(async p => (await inUse(p)) ? p : 0))).filter(Boolean);
  if (busy.length) { console.log('These test ports are already in use: ' + busy.join(', ') + '. Close the leftover server(s) and run again.'); process.exit(1); } }

function runOne(f) {
  return new Promise(resolve => {
    const t0 = Date.now(), p = spawn(process.execPath, [path.join(DIR, f)], { cwd: path.dirname(DIR) });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nTIMEOUT after 180 s'; p.kill(); }, 180_000);
    p.on('close', code => {
      clearTimeout(timer);
      const passed = code === 0 && /ALL PASSED\s*$/.test(out.trim()) && !/^FAIL /m.test(out);
      resolve({ f, passed, out, secs: ((Date.now() - t0) / 1000).toFixed(1), checks: (out.match(/^PASS /gm) || []).length });
    });
  });
}

const results = [], queue = [...files];
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
  while (queue.length) { const r = await runOne(queue.shift()); results.push(r); console.log(`${r.passed ? 'ok  ' : 'FAIL'} ${r.f} (${r.checks} checks, ${r.secs}s)`); }
}));
const bad = results.filter(r => !r.passed);
for (const r of bad) console.log(`\n----- ${r.f} -----\n` + r.out.split('\n').filter(l => !l.startsWith('PASS ')).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} suites passed, ${results.reduce((a, r) => a + r.checks, 0)} checks`);
process.exit(bad.length ? 1 : 0);
