/**
 * 0258: who approves a member's pick of a coach — coach (default, as before) · desk · coach then desk.
 * The coach's yes under coach_desk waits for the desk (coach_ok_at), the desk is told, and only the desk's
 * confirmation assigns the coach; a decline by either is final; the desk cannot jump ahead of the coach; under
 * 'coach' the desk stays out while the coach is active; only the owner sets the mode.
 *
 *   node <repo>/scripts/sql/coaching-approval.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0258 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const T = 'a2580000-0000-4000-8000-00000000000c';
const AD = 'a2580000-0000-4000-8000-00000000000d';
const ST = 'a2580000-0000-4000-8000-00000000000e';
const M = ['a2580000-0000-4000-8000-0000000000a1', 'a2580000-0000-4000-8000-0000000000a2', 'a2580000-0000-4000-8000-0000000000a3', 'a2580000-0000-4000-8000-0000000000a4'];
const PLAN = 'a2580000-0000-4000-8000-0000000000f1';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const tryOne = async (sql) => { try { return { row: await one(sql) }; } catch (e) { return { err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = [['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff'], ...M.map((id, i) => [`m${i}`, id, 'member'])];
await db.exec(`
  ${people.map(([k, id, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@ca-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k}', 'T', '${k}@ca-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${PLAN}', '${GYM}', 'Coached', 1500, 30, 'premium', true, true, true);
  ${M.map((id, i) => `
    insert into member_profiles (profile_id, gym_id, qr_code) values ('${id}', '${GYM}', 'QR-CA-${i}') on conflict do nothing;
    insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
      values ('${id}', '${GYM}', '${PLAN}', 'active', manila_today() - 1, manila_today() + 60);`).join('\n')}`);
await as(AD);
await db.exec(`select set_coaching_settings(array['pick_pt'], array[1, 3, 6], 'included')`);

const ask = async (m) => { await as(m); return (await one(`select request_coaching('${T}', 'pt', 3, null) id`)).id; };
const status = async (id) => (await owner(), await one(`select status, coach_ok_at from coachings where id = '${id}'`));
const setMode = async (mode) => { await as(AD); return tryExec(`select set_coaching_approval('${mode}')`); };

// 1 — default: the coach decides, the desk stays out while the coach is active.
const c1 = await ask(M[0]);
await as(ST);
check('default (coach): the desk cannot decide while the coach is active', /coach decides/.test((await tryExec(`select desk_decide_coaching('${c1}', true)`)) ?? ''));
await as(T);
await db.exec(`select respond_coaching('${c1}', true)`);
check('…the coach says yes and the package starts, as before', (await status(c1)).status === 'active', JSON.stringify(await status(c1)));

// 2 — the desk decides.
check('the owner sets "desk"', (await setMode('desk')) === null);
const c2 = await ask(M[1]);
await as(T);
check('desk: the coach cannot answer', /front desk decides/.test((await tryExec(`select respond_coaching('${c2}', true)`)) ?? ''));
await as(ST);
await db.exec(`select desk_decide_coaching('${c2}', true)`);
check('…the desk confirms and the package starts', (await status(c2)).status === 'active');
await owner();
check('…and the coach is told the trainee is theirs', ((await one(`select count(*)::int n from notifications where user_id = '${T}' and title = 'A trainee is yours'`)).n) === 1);

// 3 — the coach, then the desk.
check('the owner sets "coach_desk"', (await setMode('coach_desk')) === null);
const c3 = await ask(M[2]);
await as(AD);
check('coach_desk: the desk cannot confirm before the coach', /coach says yes first/.test((await tryExec(`select desk_decide_coaching('${c3}', true)`)) ?? ''));
await as(T);
const r3 = await one(`select respond_coaching('${c3}', true) r`);
const s3 = await status(c3);
check('…the coach’s yes waits for the desk (still requested, coach_ok_at kept)', r3.r === 'coach_ok' && s3.status === 'requested' && s3.coach_ok_at !== null, JSON.stringify({ r3, s3 }));
await owner();
const told = (await one(`select count(distinct user_id)::int n from notifications where title = 'A coach said yes — confirm it' and user_id in ('${AD}', '${ST}')`)).n;
check('…the owner and the desk are each told', told === 2, String(told));
await as(T);
check('…the coach cannot say yes twice', /already said yes/.test((await tryExec(`select respond_coaching('${c3}', true)`)) ?? ''));
await as(ST);
await db.exec(`select desk_decide_coaching('${c3}', true)`);
check('…then the desk confirms and the coach is assigned', (await status(c3)).status === 'active');
await as(M[2]);
const mine = await tryOne(`select coach_ok_at from my_coachings() where id = '${c3}'`);
check('the member’s own list carries the coach’s yes', !mine.err && mine.row && mine.row.coach_ok_at !== null, JSON.stringify(mine));

// 4 — a decline by the desk is final.
const c4 = await ask(M[3]);
await as(ST);
await db.exec(`select desk_decide_coaching('${c4}', false)`);
check('a decline by the desk is final, and the member is told', (await status(c4)).status === 'declined'
  && ((await (async () => { await owner(); return one(`select count(*)::int n from notifications where user_id = '${M[3]}' and title = 'Coaching request declined'`); })()).n) === 1);
await as(T);
check('…the coach cannot revive it', !!(await tryExec(`select respond_coaching('${c4}', true)`)));

// 5 — who sets it, who decides.
await as(ST);
check('the desk cannot change the setting', /Only the gym owner/.test((await tryExec(`select set_coaching_approval('coach')`)) ?? ''));
check('only the three choices', /Choose the coach/.test((await setMode('member')) ?? ''));
await as(M[0]);
check('a member cannot decide for the desk', /Only the owner or the front desk/.test((await tryExec(`select desk_decide_coaching('${c4}', true)`)) ?? ''));
check('anyone in the gym can read the mode', (await one(`select my_coaching_approval() m`)).m === 'coach_desk');
await db.exec(`reset role; set role anon;`);
check('a visitor cannot', !!(await tryExec(`select set_coaching_approval('desk')`)));
await owner();
check('the inner helpers are closed', !(await one(`select has_function_privilege('authenticated', 'coaching_approval_mode(uuid)', 'execute') or has_function_privilege('authenticated', 'coaching_tell_desk(uuid, text, text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0258_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0258 checks passed');
process.exit(failures ? 1 : 0);
