/**
 * 0221: the tours. A person's seen tours live on their account, one column per
 * app: mark_tour_seen() adds one (twice is still once), my_tours_seen() reads
 * them back for that app only, nobody reads or writes another person's row, a
 * visitor can do neither, a made-up app or tour name is refused, and 0221 can
 * run twice.
 *
 *   node <repo>/scripts/sql/tours.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0221' });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const A = 'a2210000-0000-4000-8000-0000000000a1', B = 'a2210000-0000-4000-8000-0000000000b2';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
let err = await tryExec(`
  ${[['ana', A], ['ben', B]].map(([k, u]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@tours-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'Test', '${k}@tours-test.com', 'active', 'member', '${GYM}')
      on conflict (id) do update set active_gym_id = excluded.active_gym_id;`).join('\n')}
`);
check('the world before 0221', err === null, err);

err = await applyMigrationsFrom(db, REPO, '0221');
check('0221 applies', !err, err);

await as(A);
check('nothing seen yet', (await one(`select my_tours_seen('member') t`)).t.length === 0);
err = await tryExec(`select mark_tour_seen('member', 'today'); select mark_tour_seen('member', 'today'); select mark_tour_seen('admin', 'dashboard');`);
check('marking a tour works, twice is fine', err === null, err);
check('…kept once', JSON.stringify((await one(`select my_tours_seen('member') t`)).t) === JSON.stringify(['today']));
check('…apart per app', JSON.stringify((await one(`select my_tours_seen('admin') t`)).t) === JSON.stringify(['dashboard'])
  && (await one(`select my_tours_seen('coach') t`)).t.length === 0);
check('a made-up app is refused', /Unknown app/.test(await tryExec(`select mark_tour_seen('desk', 'today')`) ?? ''));
check('a made-up tour name is refused', /Unknown tour/.test(await tryExec(`select mark_tour_seen('member', 'Today; drop table x')`) ?? ''));
const writeOwn = await tryExec(`update tours_seen set member = '{x}' where person_id = '${A}'`);
const rowAfter = await one(`select member from tours_seen where person_id = '${A}'`);
check('no direct write, even to your own row (only mark_tour_seen)', writeOwn !== null || JSON.stringify(rowAfter.member) === JSON.stringify(['today']), JSON.stringify(rowAfter));

await as(B);
check("another person sees none of Ana's", (await one(`select my_tours_seen('member') t`)).t.length === 0);
check("…and cannot read her row", Number((await one(`select count(*)::int n from tours_seen where person_id = '${A}'`)).n) === 0);

await anon();
check('a visitor cannot read', (await tryExec(`select my_tours_seen('member')`)) !== null);
check('a visitor cannot mark', (await tryExec(`select mark_tour_seen('member', 'today')`)) !== null);
check('the probe marker answers a visitor', (await one(`select migration_0221_applied() ok`)).ok === true);

await owner();
err = await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0221_tours.sql'), 'utf-8'));
check('0221 can run twice', err === null, err);
check('its notes are added once', Number((await one(`select count(*)::int n from app_releases where title like '%quick tour%'`)).n) === 3);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
