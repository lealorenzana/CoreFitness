/**
 * scripts/fresh-start: part 1 deletes every gym and person except the platform
 * admins and Gym #1's rules; parts 2–5 build Core Fitness Lab with four real
 * sign-ins and a full history. Run on a database shaped like production:
 * every migration, G Fitness with a member's two years (demo part 3), a second
 * gym with its own owner, members, money and a gym-owned exercise.
 *
 *   node <repo>/scripts/sql/fresh-start.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const FS = `${REPO}/scripts/fresh-start`;
const run = async (file) => {
  try { await db.exec('reset role'); const r = await db.exec(readFileSync(`${FS}/${file}`, 'utf8')); return { ok: true, r }; }
  catch (e) { return { ok: false, err: describe(e) }; }
};

// pglite cannot load pgcrypto; on Supabase extensions.crypt/gen_salt are real bcrypt.
// A stand-in with the same shape, so "crypt(password, stored) = stored" still proves the match.
await db.exec(`reset role;
  create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create or replace function extensions.crypt(text, text) returns text language sql as $$ select 'h:' || md5($1) $$;`);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const PA = 'a1000000-0000-4000-8000-0000000000aa';
const LEA = '0e4caf37-0f2a-4b11-9c22-1234567890ab';
const COACH = '5eed0002-0000-4000-8000-000000000001';
const MATES = [1, 2, 3, 4, 5].map((i) => `5eed0001-0000-4000-8000-00000000000${i}`);

// ---- production, roughly --------------------------------------------------------------------
const person = (id, email, role, gym = GYM) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}') on conflict do nothing;
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${id}', 'X', 'Y', '${email}', 'active', '${role}', '${gym}')
    on conflict (id) do update set status = 'active';
  insert into gym_roles (gym_id, user_id, role, status) values ('${gym}', '${id}', '${role}', 'active') on conflict (gym_id, user_id) do update set role = excluded.role;`;
await db.exec(`reset role;
  update gyms set name = 'G Fitness', slug = 'g-fitness' where id = '${GYM}';
  ${person(PA, 'super@corefitness.test', 'admin')}
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  ${person(LEA, 'lealorenzanaa@gmail.com', 'member')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${LEA}', '${GYM}', '${LEA}') on conflict do nothing;
  ${person(COACH, 'marco@seed.corefitness-test.com', 'trainer')}
  insert into trainer_profiles (profile_id, gym_id) values ('${COACH}', '${GYM}') on conflict do nothing;
  ${MATES.map((m, i) => person(m, `mate${i}@seed.corefitness-test.com`, 'member') + ` insert into member_profiles (profile_id, gym_id, qr_code) values ('${m}', '${GYM}', '${m}') on conflict do nothing;`).join('\n')}
  insert into classes (id, gym_id, name, trainer_id, level, capacity, scheduled_at, duration_minutes)
    select ('5eed0020-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'HIIT', '${COACH}', 'beginner', 20, now() + (i - 50) * interval '2 days', 45 from generate_series(1, 55) i;
  insert into events (id, gym_id, title, starts_at, duration_minutes, capacity, cancelled)
    select ('5eed0010-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Event ' || i, now() + (i - 4) * interval '20 days', 60, 30, false from generate_series(1, 6) i;
  insert into challenges (id, gym_id, title, metric_key, target, starts_on, ends_on, reward_points, is_active)
    select ('5eed0030-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Challenge ' || i, 'training_days', 12, current_date - 60 * i, current_date - 60 * i + 30 + (case when i = 1 then 60 else 0 end), 100, true from generate_series(1, 3) i;
  insert into rewards (id, gym_id, name, cost_points, stock, is_active)
    select ('5eed0040-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Reward ' || i, 100 * i, 20, true from generate_series(1, 4) i;
  insert into gym_workouts (id, gym_id, name, level, published, hidden, created_by) values ('5eed0050-0000-4000-8000-000000000001', '${GYM}', 'Full body A', 'beginner', true, false, '${LEA}');
  insert into gym_programs (id, gym_id, name, level, weeks, premium, published, hidden, created_by) values ('5eed0051-0000-4000-8000-000000000001', '${GYM}', 'Starter Strength', 'beginner', 4, false, true, false, '${LEA}');
  insert into gym_program_days (id, gym_id, program_id, week, day, workout_id)
    select ('5eed0052-0000-4000-8000-' || lpad(d::text, 12, '0'))::uuid, '${GYM}', '5eed0051-0000-4000-8000-000000000001', 1, d, '5eed0050-0000-4000-8000-000000000001' from generate_series(1, 3) d;`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM}' and is_active and price > 0 order by price limit 1`)).id;
await db.exec(`insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date) values ('${GYM}', '${LEA}', '${prem}', 'active', current_date - 29, current_date)`);
for (const f of readdirSync(`${REPO}/scripts/demo-data/part3`).sort()) {
  try { await db.exec(readFileSync(`${REPO}/scripts/demo-data/part3/${f}`, 'utf8')); } catch (e) { check(`setup: demo part 3 ${f}`, false, describe(e)); }
}
// A second gym, with an owner, a member, money and its own exercise.
const OB = 'b1000000-0000-4000-8000-000000000001', MB = 'b1000000-0000-4000-8000-000000000002';
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${PA}', false); set role authenticated;`);
const GB = (await one(`select create_gym('Iron Temple', 'iron-temple') as id`)).id;
await db.exec(`reset role;
  ${person(OB, 'owner@irontemple.test', 'admin', GB)}
  ${person(MB, 'member@irontemple.test', 'member', GB)}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${MB}', '${GB}', '${MB}') on conflict do nothing;
  insert into attendance (gym_id, member_id, method) values ('${GB}', '${MB}', 'qr');
  insert into gym_payments (gym_id, amount, covers_until, receipt_no) values ('${GB}', 1499, current_date + 20, 'CF-TEST-FS');
  insert into exercises select (jsonb_populate_record(null::exercises, to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'gym_id', '${GB}', 'name', 'Iron Temple Squat'))).*
    from exercises e where e.gym_id is null limit 1;`);

const before = {
  badges: await n(`select count(*) n from achievements where gym_id = '${GYM}'`),
  points: await n(`select count(*) n from point_rules where gym_id = '${GYM}'`),
  shared: await n(`select count(*) n from exercises where gym_id is null`),
  plans: await n(`select count(*) n from platform_plans`),
  lea: await n(`select count(*) n from attendance where member_id = '${LEA}'`),
};
check('setup: production-like data is there', before.lea > 200 && before.badges > 0 && before.shared > 0, JSON.stringify(before));

// ---- part 1 ----------------------------------------------------------------------------------
let r = await run('1-wipe.sql');
check('part 1 runs', r.ok, r.err);
check('only the platform admin is left — sign-in, profile, admin row', await n(`select count(*) n from auth.users`) === 1
  && await n(`select count(*) n from profiles`) === 1 && await n(`select count(*) n from platform_admins where user_id = '${PA}'`) === 1);
check('only Gym #1 is left', await n(`select count(*) n from gyms`) === 1 && await n(`select count(*) n from gyms where id = '${GYM}'`) === 1);
check('Gym #1 keeps the rules new gyms copy', await n(`select count(*) n from achievements where gym_id = '${GYM}'`) === before.badges
  && await n(`select count(*) n from point_rules where gym_id = '${GYM}'`) === before.points);
check('the shared exercise library and platform plans stay', await n(`select count(*) n from exercises where gym_id is null`) === before.shared
  && await n(`select count(*) n from platform_plans`) === before.plans);
check('no member data is left anywhere', await n(`select (select count(*) from attendance) + (select count(*) from payments) + (select count(*) from memberships)
  + (select count(*) from workout_logs) + (select count(*) from messages) + (select count(*) from shop_sales) + (select count(*) from gym_roles)
  + (select count(*) from gym_payments) + (select count(*) from membership_plans) + (select count(*) from exercises where gym_id is not null) as n`) === 0);
check('every trigger is back on', await n(`select count(*) n from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled = 'D'`) === 0);
r = await run('1-wipe.sql');
check('part 1 runs again harmlessly', r.ok && await n(`select count(*) n from profiles`) === 1, r.err);

// ---- refuses with no platform admin ----------------------------------------------------------
await db.exec(`reset role; create table _pa as select * from platform_admins; delete from platform_admins;`);
r = await run('1-wipe.sql');
check('with no platform admin it refuses and deletes nothing', !r.ok && /No platform admin/.test(r.err) && await n(`select count(*) n from profiles`) === 1, r.err);
await db.exec(`reset role; insert into platform_admins select * from _pa; drop table _pa;`);

// ---- part 2 ----------------------------------------------------------------------------------
r = await run('2-test-gym.sql');
check('part 2 runs', r.ok, r.err);
const logins = r.ok ? r.r[r.r.length - 1].rows : [];
check('it shows four sign-ins with passwords', logins.length === 4 && logins.every((l) => /^Lab-[0-9A-F]{4}-\d{4}-[0-9a-f]{4}$/.test(l.password)), JSON.stringify(logins.map((l) => l.email)));
let pwOk = true;
for (const l of logins) {
  const ok = (await one(`select encrypted_password = extensions.crypt('${l.password}', encrypted_password) as ok from auth.users where email = '${l.email}'`))?.ok;
  if (!ok) pwOk = false;
}
check('each password signs that account in (bcrypt matches)', pwOk && logins.length === 4);
check('each has an email identity and a confirmed address', await n(`select count(*) n from auth.identities where provider = 'email' and user_id::text like 'cf1ab000-%'`) === 4
  && await n(`select count(*) n from auth.users where id::text like 'cf1ab000-%' and email_confirmed_at is not null and confirmation_token = ''`) === 4);
const ctx = async (id) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
  const c = await one(`select role, status, gym_name, lock_reason from my_gym_context()`); await db.exec('reset role'); return c; };
const roles = [];
for (const [id, want] of [['1', 'admin'], ['2', 'staff'], ['3', 'trainer'], ['4', 'member']]) {
  const c = await ctx(`cf1ab000-0000-4000-8000-00000000000${id}`);
  roles.push(c?.role === want && c?.status === 'active' && c?.gym_name === 'Core Fitness Lab' && c?.lock_reason == null ? 'ok' : JSON.stringify(c));
}
check('owner, desk, coach and member each land in Core Fitness Lab as themselves', roles.every((x) => x === 'ok'), roles.join(' '));
check('the gym is full: 41 members, 4 coaches, classes behind and ahead, check-ins, payments',
  await n(`select count(*) n from gym_roles where role = 'member'`) === 41 && await n(`select count(*) n from gym_roles where role = 'trainer'`) === 4
  && await n(`select count(*) n from classes where scheduled_at > now()`) > 10 && await n(`select count(*) n from classes where scheduled_at < now()`) > 50
  && await n(`select count(*) n from attendance`) > 500 && await n(`select count(*) n from payments`) > 40);
const coachQ = [
  await n(`select count(*) n from coachings where trainer_id = 'cf1ab000-0000-4000-8000-000000000003' and status = 'active'`),
  await n(`select count(*) n from pt_sessions where trainer_id = 'cf1ab000-0000-4000-8000-000000000003' and status = 'pending'`),
  await n(`select count(*) n from bookings b join classes c on c.id = b.class_id where c.trainer_id = 'cf1ab000-0000-4000-8000-000000000003' and b.status = 'pending'`)];
check('…the test coach has trainees, sessions, requests and classes', coachQ[0] === 7 && coachQ[1] >= 3 && coachQ[2] > 0, coachQ.join(' / '));
check('…plans are priced, nothing unset', await n(`select count(*) n from membership_plans where price_unset`) === 0 && await n(`select count(*) n from membership_plans where price > 0`) === 3);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
check('the lab is not in Find your gym or the public list', (await db.query(`select * from gym_finder(null)`)).rows.length === 0 && (await db.query(`select * from list_gyms(null)`)).rows.length === 0);
await db.exec('reset role');

// ---- parts 3–5 -------------------------------------------------------------------------------
for (const f of ['3-member-history.sql', '4-member-coaching.sql', '5-gym-life.sql']) {
  r = await run(f);
  check(`${f} runs`, r.ok, r.err);
}
const ME = 'cf1ab000-0000-4000-8000-000000000004';
check('the member sign-in has two years: visits, receipts, workouts, points', await n(`select count(*) n from attendance where member_id = '${ME}'`) > 250
  && await n(`select count(*) n from payments where member_id = '${ME}'`) >= 22 && await n(`select count(*) n from workout_logs where member_id = '${ME}'`) > 120
  && await n(`select count(*) n from point_ledger where member_id = '${ME}'`) > 300);
check('…coached by the test coach: sessions, notes, chat', await n(`select count(*) n from pt_sessions where member_id = '${ME}' and trainer_id = 'cf1ab000-0000-4000-8000-000000000003'`) >= 19
  && await n(`select count(*) n from messages where sender_id = '${ME}'`) >= 3);
check('…and the gym has a shop, squads and a season', await n(`select count(*) n from shop_sales`) >= 140 && await n(`select count(*) n from squad_members`) >= 4);

// ---- part 2 again: new passwords ------------------------------------------------------------
r = await run('2-test-gym.sql');
const again = r.ok ? r.r[r.r.length - 1].rows : [];
check('part 2 again gives new passwords and adds nobody', r.ok && again.length === 4 && again[0].password !== logins[0]?.password
  && await n(`select count(*) n from gym_roles where role = 'member'`) === 41, r.err);

// ---- and the whole thing can be wiped again ------------------------------------------------
r = await run('1-wipe.sql');
check('part 1 clears the lab too, keeping the platform admin', r.ok && await n(`select count(*) n from profiles`) === 1 && await n(`select count(*) n from attendance`) === 0, r.err);

console.log(failures ? `\n${failures} FAILED` : '\nall fresh-start checks passed');
process.exit(failures ? 1 : 0);
