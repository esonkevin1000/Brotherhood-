// Database migrations: numbered .sql files in src/db/migrations run once per database, in order, and are recorded in the
// "migrations" table. Brotherhood's database and every partner shop's database each keep their own record.
//
// Rules for a migration file:
//   - Only ADD things (tables, columns, indexes) or fill new columns. Never drop or rewrite existing data.
//   - One statement per ";" at the end of a line. Use "create ... if not exists".
//   - "alter table ... add column" is safe to repeat: a column that is already there is skipped
//     (a partner database gets its columns copied from the main one before its migrations run).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort().map(f => ({ id: f.replace(/\.sql$/, ''), sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}
const statements = sql => sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);

// Runs every migration this database has not seen yet. Each file is all-or-nothing: if a statement fails, the file is rolled back
// and the error stops the server from starting half-migrated.
export function migrate(d, dir = MIGRATIONS_DIR) {
  d.exec('create table if not exists migrations(id text primary key, appliedAt text)');
  const done = new Set(d.prepare('select id from migrations').all().map(r => r.id)), ran = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.id)) continue;
    d.exec('begin immediate');
    try {
      for (const s of statements(m.sql)) {
        try { d.exec(s); }
        catch (e) { if (!(/^alter\s+table\s+\S+\s+add\s+column/i.test(s) && /duplicate column name/i.test(e.message))) throw e; }
      }
      d.prepare('insert into migrations(id, appliedAt) values(?, ?)').run(m.id, new Date().toISOString());
      d.exec('commit');
    } catch (e) { try { d.exec('rollback'); } catch { } throw new Error(`Migration ${m.id} failed: ${e.message}`); }
    ran.push(m.id);
  }
  return ran;
}
