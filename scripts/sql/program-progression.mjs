/**
 * 0173: programs that build week on week, and one member's own program.
 *
 *   node <repo>/scripts/sql/program-progression.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1730000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const P = { admin: id(1), coach: id(2), coach2: id(3), mine: id(4), other: id(5) };

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const rows = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await asOwner();
const person = (pid, name, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${pid}', '${name}@prog-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${pid}', '${name}', 'T', '${name}@prog-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${pid}', '${role}', 'active') on conflict (gym_id, user_id) do update set role = excluded.role;`;
await db.exec(`
  ${person(P.admin, 'admin', 'admin')} ${person(P.coach, 'coach', 'trainer')} ${person(P.coach2, 'coach2', 'trainer')}
  ${person(P.mine, 'mine', 'member')} ${person(P.other, 'other', 'member')}
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM}'), ('${P.coach2}', '${GYM}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mine}', '${GYM}', 'QR-M1'), ('${P.other}', '${GYM}', 'QR-M2') on conflict do nothing;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select m, '${GYM}', (select id from membership_plans where gym_id = '${GYM}' and tier = 'premium' limit 1), 'active', current_date - 1, current_date + 29
      from unnest(array['${P.mine}'::uuid, '${P.other}'::uuid]) m;
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status)
    values ('${GYM}', '${P.mine}', '${P.coach}', now() + interval '2 days', 60, 'approved');
`);
const squat = (await one(`select id from exercises where gym_id is null and name = 'Back Squat'`)).id;
const plank = (await one(`select id from exercises where gym_id is null and name = 'Plank'`)).id;

// ---- the owner's program: squat +2.5 kg a week, plank +5 s, every 3rd week lighter ----
await as(P.admin);
const w = (await one(`insert into gym_workouts (name, published) values ('Legs', true) returning id`)).id;
await db.exec(`insert into gym_workout_items (workout_id, position, exercise_id, target_sets, target_reps, target_weight_kg, progress_kind, progress_step, rest_seconds)
  values ('${w}', 0, '${squat}', 3, 8, 40, 'weight', 2.5, 90);
  insert into gym_workout_items (workout_id, position, exercise_id, target_sets, target_seconds, progress_kind, progress_step, rest_seconds)
  values ('${w}', 1, '${plank}', 3, 30, 'seconds', 5, 60);`);
const prog = (await one(`insert into gym_programs (name, weeks, published, deload_every) values ('Strength Base', 4, true, 3) returning id`)).id;
const day = {};
for (const wk of [1, 2, 3, 4]) day[wk] = (await one(`insert into gym_program_days (program_id, week, day, workout_id) values ('${prog}', ${wk}, 1, '${w}') returning id`)).id;

await as(P.mine);
const t = async (wk) => rows(`select * from program_day_targets('${day[wk]}') order by item_position`);
const w1 = await t(1), w2 = await t(2), w3 = await t(3), w4 = await t(4);
check('week 1 is the base: 40 kg, 30 s', Number(w1[0].weight_kg) === 40 && w1[1].seconds === 30, JSON.stringify(w1));
check('week 2 steps up: 42.5 kg, 35 s', Number(w2[0].weight_kg) === 42.5 && w2[1].seconds === 35, JSON.stringify(w2));
check('…and says what last week was', Number(w2[0].prev_weight_kg) === 40 && w1[0].prev_weight_kg === null);
check('week 3 is the lighter week: back to 40 kg', Number(w3[0].weight_kg) === 40, JSON.stringify(w3[0]));
check('week 4 carries on: 47.5 kg', Number(w4[0].weight_kg) === 47.5, JSON.stringify(w4[0]));
check('sets and reps not stepped stay put', w4[0].sets === 3 && w4[0].reps === 8);

// ---- a coach's program for one trainee ----
await as(P.coach);
const own = await tryExec(`insert into gym_programs (name, weeks, published, source, member_id) values ('Mine only', 2, true, 'trainer', '${P.mine}')`);
check("a coach writes a program for their own trainee", own === null, own ?? '');
const forOther = await tryExec(`insert into gym_programs (name, weeks, published, source, member_id) values ('Not mine', 2, true, 'trainer', '${P.other}')`);
check("…but not for someone they don't coach", forOther !== null);
const gymWide = await tryExec(`insert into gym_programs (name, weeks, published) values ('For everyone', 2, true)`);
check('…and not a program for the whole gym', gymWide !== null);
await asOwner();
const personal = (await one(`select id, author_id from gym_programs where name = 'Mine only'`));
check('the author is stamped by the database', personal.author_id === P.coach);

await as(P.mine);
check('the member sees their own program', (await rows(`select 1 from gym_programs where id = '${personal.id}'`)).length === 1);
await as(P.other);
check('another member does not', (await rows(`select 1 from gym_programs where id = '${personal.id}'`)).length === 0);
check("…but still sees the gym's program", (await rows(`select 1 from gym_programs where id = '${prog}'`)).length === 1);
await as(P.coach2);
check('another coach does not see it', (await rows(`select 1 from gym_programs where id = '${personal.id}'`)).length === 0);
const edit = await db.query(`update gym_programs set name = 'Taken' where id = '${personal.id}'`);
check('…nor change it', (edit.affectedRows ?? 0) === 0);
await as(P.admin);
check('the owner sees it', (await rows(`select 1 from gym_programs where id = '${personal.id}'`)).length === 1);

await asOwner();
check('marker', (await one(`select migration_0173_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0173 checks passed');
process.exit(failures ? 1 : 0);
