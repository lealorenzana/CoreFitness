/**
 * 0257: a class from the gym's weekly timetable is the gym's to change. Its coach cannot change its name, level,
 * size or room (0085 allowed those; only the time was locked) — the owner can (the desk never edits classes). A coach still edits
 * the one-off class they made themselves, and still cannot touch another coach's class.
 *
 *   node <repo>/scripts/sql/timetable-classes.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0257 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const T = 'a2570000-0000-4000-8000-00000000000c';
const T2 = 'a2570000-0000-4000-8000-00000000000b';
const AD = 'a2570000-0000-4000-8000-00000000000d';
const ST = 'a2570000-0000-4000-8000-00000000000e';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['coach', T, 'trainer'], ['coach2', T2, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, id, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@tt-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k}', 'T', '${k}@tt-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength'), ('${T2}', '${GYM}', 'Yoga') on conflict do nothing;
  insert into class_templates (id, gym_id, name, trainer_id, level, capacity, location, day_of_week, start_time, duration_minutes, active)
    values ('a2570000-0000-4000-8000-0000000000a1', '${GYM}', 'Sunrise HIIT', '${T}', 'all_levels', 12, 'Studio', 1, '06:00', 60, true);
  insert into classes (id, gym_id, name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id) values
    ('a2570000-0000-4000-8000-0000000000c1', '${GYM}', 'Sunrise HIIT', '${T}', 'all_levels', 12, 'Studio', now() + interval '3 days', 60, 'a2570000-0000-4000-8000-0000000000a1'),
    ('a2570000-0000-4000-8000-0000000000c2', '${GYM}', 'Saturday mobility', '${T}', 'all_levels', 8, 'Studio', now() + interval '4 days', 45, null),
    ('a2570000-0000-4000-8000-0000000000c3', '${GYM}', 'Yoga flow', '${T2}', 'all_levels', 10, 'Studio', now() + interval '5 days', 60, null);`);

const name = async (id) => (await owner(), (await one(`select name, capacity from classes where id = '${id}'`)));
const TT = 'a2570000-0000-4000-8000-0000000000c1', MINE = 'a2570000-0000-4000-8000-0000000000c2', THEIRS = 'a2570000-0000-4000-8000-0000000000c3';

await as(T);
const e1 = await tryExec(`update classes set name = 'Renamed', capacity = 20 where id = '${TT}'`);
const after1 = await name(TT);
check('a coach cannot rename or resize a timetable class they teach', after1.name === 'Sunrise HIIT' && after1.capacity === 12, `${e1} ${JSON.stringify(after1)}`);
check('…and is told why', /only the gym owner changes it/.test(e1 ?? ''), e1);

await as(T);
const e2 = await tryExec(`update classes set name = 'Sat mobility', capacity = 10 where id = '${MINE}'`);
const after2 = await name(MINE);
check('a coach still edits the one-off class they made', !e2 && after2.name === 'Sat mobility' && after2.capacity === 10, `${e2} ${JSON.stringify(after2)}`);

await as(T);
await tryExec(`update classes set name = 'Mine now' where id = '${THEIRS}'`);
check("a coach still cannot touch another coach's class", (await name(THEIRS)).name === 'Yoga flow');

for (const [who, id] of [['the owner', AD]]) {   // the desk never edits classes (RLS, owner only)
  await as(id);
  const e = await tryExec(`update classes set location = 'Main floor' where id = '${TT}'`);
  await owner();
  const loc = (await one(`select location from classes where id = '${TT}'`)).location;
  check(`${who} can change a timetable class`, !e && loc === 'Main floor', `${e} ${loc}`);
  await db.exec(`update classes set location = 'Studio' where id = '${TT}'`);
}

await owner();
check('marker', (await one(`select migration_0257_applied() ok`).catch(() => ({ ok: false }))).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0257 checks passed');
process.exit(failures ? 1 : 0);
