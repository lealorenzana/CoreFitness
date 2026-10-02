/**
 * 0145: the coach proposes, the member applies — and every applied change can be undone.
 *
 *   node <repo>/scripts/sql/ai-proposals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-000000000002';
const A = 'a1450000-0000-4000-8000-00000000000a';
const B = 'a1450000-0000-4000-8000-00000000000b';
const DESK = 'a1450000-0000-4000-8000-00000000000d';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const rows = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const owner = () => db.exec('reset role;');
const q = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const propose = async (kind, payload, summary = 'A change') =>
  (await one(`select create_ai_proposal('${kind}', ${q(payload)}, '${summary}') as id`)).id;
const tryPropose = (kind, payload, summary = 'A change') =>
  tryExec(`select create_ai_proposal('${kind}', ${q(payload)}, '${summary}')`);
const proposalRow = async (id) => { await owner(); return one(`select * from ai_proposals where id = '${id}'`); };

// ---- fixture: two members on the plan with the model and the tracker, a desk, a second gym ----
await db.exec(`reset role;
  ${[['a', A], ['b', B], ['desk', DESK]].map(([k, id]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@prop-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role)
      values ('${id}', '${k.toUpperCase()}', 'T', '${k}@prop-test.com', 'active', 'member')
      on conflict (id) do update set status = 'active';`).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${A}', 'member', 'active'), ('${GYM}', '${B}', 'member', 'active'), ('${GYM}', '${DESK}', 'staff', 'active')
    on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
  update profiles set active_gym_id = '${GYM}' where email like '%@prop-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level) values
    ('${A}', '${GYM}', 'QR-PR-A', 'beginner'), ('${B}', '${GYM}', 'QR-PR-B', 'advanced') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select m, '${GYM}', (select pf.plan_id from plan_features pf join membership_plans mp on mp.id = pf.plan_id
                          where pf.feature_key = 'ai_model' and pf.enabled and mp.gym_id = '${GYM}' limit 1),
           'active', manila_today() - 1, manila_today() + 30
      from unnest(array['${A}','${B}']::uuid[]) m;
  insert into gyms (id, slug, name) values ('${GYM2}', 'prop-gym-2', 'Prop Gym 2') on conflict do nothing;
  insert into exercises (gym_id, name, muscle_group, equipment) values ('${GYM2}', 'Gym2 Only Press', 'chest', 'machine');`);
{
  const plan = await one(`select mp.id from membership_plans mp join memberships m on m.plan_id = mp.id
    where m.member_id = '${A}'`);
  const tracker = await one(`select enabled from plan_features where plan_id = '${plan.id}' and feature_key = 'workout_tracker'`);
  if (!tracker?.enabled) { console.log('FIXTURE: the ai_model plan lacks workout_tracker'); process.exit(1); }
}
const shared = (await rows(`select e.id, e.name from exercises e where e.gym_id is null and e.is_active
    and not exists (select 1 from gym_exercise_media m where m.gym_id = '${GYM}' and m.exercise_id = e.id and m.hidden)
  order by e.name limit 5`));
const [E1, E2, E3, E4, E5] = shared.map((r) => r.id);
const GYM2_EX = (await one(`select id from exercises where name = 'Gym2 Only Press'`)).id;
// E5 becomes hidden at this gym, later.
const ex = (id, sets = 3, reps = 10) => ({ exercise_id: id, target_sets: sets, target_reps: reps, rest_seconds: 90 });
const leg = { name: 'Coach leg day', notes: 'From the coach', exercises: [ex(E1, 4, 8), ex(E2), ex(E3, 3, 12)] };
const routineOf = async (id) => {
  await owner();
  const r = await one(`select id, name, notes, source from workout_routines where id = '${id}'`);
  if (!r) return null;
  r.exercises = (await rows(`select exercise_id, custom_name, target_sets, target_reps, target_weight_kg::text as kg,
    target_seconds, rest_seconds from workout_routine_exercises where routine_id = '${id}' order by position`));
  return r;
};
const routinesOfA = async () => { await owner(); return (await one(`select count(*)::int as n from workout_routines where member_id = '${A}'`)).n; };

// 1 -------------------------------------------------------------------------------------------
await as(A);
const before1 = await routinesOfA();
await as(A);
const p1 = await propose('routine.create', leg, 'A leg day');
{
  const r = await proposalRow(p1);
  check('1. a proposal is pending and writes no routine', r?.status === 'pending' && (await routinesOfA()) === before1,
    JSON.stringify(r));
}

// 2 -------------------------------------------------------------------------------------------
await as(B);
{
  const seen = (await one(`select count(*)::int as n from ai_proposals where id = '${p1}'`)).n;
  const mine = (await rows(`select id from my_ai_proposals()`)).length;
  const ea = await tryExec(`select apply_ai_proposal('${p1}')`);
  const ed = await tryExec(`select discard_ai_proposal('${p1}')`);
  const eu = await tryExec(`select undo_ai_proposal('${p1}')`);
  const r = await proposalRow(p1);
  check('2. B cannot see, apply, discard or undo A\'s proposal',
    seen === 0 && mine === 0 && !!ea && !!ed && !!eu && r.status === 'pending' && (await routinesOfA()) === before1,
    JSON.stringify({ seen, mine, ea, ed, eu, status: r.status }));
}

// 3 -------------------------------------------------------------------------------------------
await as(A);
const res3 = (await one(`select apply_ai_proposal('${p1}') as r`)).r;
const R1 = res3?.routine_id;
{
  const r = await routineOf(R1);
  const p = await proposalRow(p1);
  check('3. apply makes the routine, source coach, 3 exercises in order; status applied',
    res3?.kind === 'routine.create' && r?.source === 'coach' && r?.name === 'Coach leg day'
      && r.exercises.map((e) => e.exercise_id).join() === [E1, E2, E3].join()
      && r.exercises[0].target_sets === 4 && r.exercises[0].target_reps === 8 && p.status === 'applied',
    JSON.stringify({ res3, r, status: p.status }));
}

// 4 -------------------------------------------------------------------------------------------
await as(A);
{
  const e = await tryExec(`select undo_ai_proposal('${p1}')`);
  const r = await routineOf(R1);
  const p = await proposalRow(p1);
  check('4. undo removes the routine; status undone', e === null && r === null && p.status === 'undone',
    JSON.stringify({ e, r, status: p.status }));
}

// 5 -------------------------------------------------------------------------------------------
await as(A);
const p5 = await propose('routine.create', { ...leg, name: 'Coach push day' });
await as(A);
const R5 = (await one(`select apply_ai_proposal('${p5}') as r`)).r.routine_id;
await db.exec(`reset role; insert into workout_logs (member_id, gym_id, activity, completed_at, routine_id)
  values ('${A}', '${GYM}', 'Push day', now(), '${R5}');`);
await as(A);
{
  const e = await tryExec(`select undo_ai_proposal('${p5}')`);
  const r = await routineOf(R5);
  const p = await proposalRow(p5);
  check('5. undo after training with it is refused; the routine stays',
    !!e && /already trained/.test(e) && r !== null && p.status === 'applied', JSON.stringify({ e, status: p.status }));
}

// 6 -------------------------------------------------------------------------------------------
await db.exec(`reset role; select act_as_gym('${GYM}');
  insert into workout_routines (id, gym_id, member_id, name, notes, position)
    values ('a1450000-0000-4000-8000-0000000000e6', '${GYM}', '${A}', 'My own pull day', 'mine', 5);
  insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, custom_name, target_sets, target_reps, target_weight_kg, rest_seconds)
    values ('${GYM}', 'a1450000-0000-4000-8000-0000000000e6', 0, '${E4}', null, 5, 5, 60, 120),
           ('${GYM}', 'a1450000-0000-4000-8000-0000000000e6', 1, null, 'Band pull-apart', 2, 20, null, 30);`);
const R6 = 'a1450000-0000-4000-8000-0000000000e6';
const before6 = await routineOf(R6);
await as(A);
const p6 = await propose('routine.replace', { routine_id: R6, name: 'Coach pull day', notes: null,
  exercises: [ex(E2, 3, 10), { custom_name: 'Dead hang', target_sets: 3, target_seconds: 30, rest_seconds: 60 }] });
await as(A);
await db.exec(`select apply_ai_proposal('${p6}')`);
{
  const mid = await routineOf(R6);
  const p = await proposalRow(p6);
  await as(A);
  const e = await tryExec(`select undo_ai_proposal('${p6}')`);
  const after = await routineOf(R6);
  check('6. replace snapshots and replaces; undo restores the old name and exercises exactly',
    mid.name === 'Coach pull day' && mid.source === 'coach' && mid.exercises.length === 2
      && mid.exercises[1].custom_name === 'Dead hang' && p.undo?.routine_id === R6
      && e === null && JSON.stringify(after) === JSON.stringify(before6),
    JSON.stringify({ mid, e, before6, after }));
}

// 7 -------------------------------------------------------------------------------------------
await db.exec(`reset role; select act_as_gym('${GYM}');
  insert into workout_routines (id, gym_id, member_id, name, position)
    values ('a1450000-0000-4000-8000-0000000000e7', '${GYM}', '${B}', 'B private', 0);`);
await as(A);
{
  const e = await tryPropose('routine.replace', { routine_id: 'a1450000-0000-4000-8000-0000000000e7', name: 'Hijack', exercises: [ex(E1)] });
  check('7. replacing another member\'s routine is refused at create', !!e && /not one of yours/.test(e), String(e));
}

// 8 -------------------------------------------------------------------------------------------
await db.exec(`reset role; insert into gym_exercise_media (gym_id, exercise_id, hidden, created_by)
  values ('${GYM}', '${E5}', true, '${DESK}') on conflict (gym_id, exercise_id) do update set hidden = true;`);
await as(A);
{
  const plain = (e) => !!e && !/violates|constraint|syntax|invalid input/i.test(e);
  const other = await tryPropose('routine.create', { name: 'X', exercises: [ex(GYM2_EX)] });
  const hidden = await tryPropose('routine.create', { name: 'X', exercises: [ex(E5)] });
  const many = await tryPropose('routine.create', { name: 'X', exercises: Array.from({ length: 13 }, () => ex(E1)) });
  const long = await tryPropose('routine.create', { name: 'x'.repeat(41), exercises: [ex(E1)] });
  const zero = await tryPropose('routine.create', { name: 'X', exercises: [ex(E1, 0)] });
  check('8. another gym\'s, a hidden exercise, 13 exercises, a 41-char name, 0 sets: each refused in plain words',
    plain(other) && /not available/.test(other) && plain(hidden) && /not available/.test(hidden)
      && plain(many) && plain(long) && plain(zero),
    JSON.stringify({ other, hidden, many, long, zero }));
}

// 9 -------------------------------------------------------------------------------------------
await db.exec(`reset role; select act_as_gym('${GYM}');
  insert into gym_plans (gym_id, member_id, day_of_week, remind_at) values
    ('${GYM}', '${A}', 0, '07:00'), ('${GYM}', '${A}', 2, '18:30');`);
const daysOfA = async () => { await owner(); return rows(`select day_of_week, remind_at::text as at, routine_id, source, active
  from gym_plans where member_id = '${A}' and gym_id = '${GYM}' order by day_of_week`); };
const before9 = await daysOfA();
await as(A);
const p9 = await propose('schedule.set', { days: [{ day_of_week: 1, routine_id: R5 }, { day_of_week: 3, remind_at: '06:30' }, { day_of_week: 5 }] });
await as(A);
await db.exec(`select apply_ai_proposal('${p9}')`);
{
  const mid = await daysOfA();
  await as(A);
  const e = await tryExec(`select undo_ai_proposal('${p9}')`);
  const after = await daysOfA();
  check('9. schedule.set makes exactly Mon/Wed/Fri (coach); undo restores the previous days exactly',
    mid.map((d) => d.day_of_week).join() === '1,3,5' && mid.every((d) => d.source === 'coach' && d.active)
      && mid[0].routine_id === R5 && mid[1].at === '06:30:00' && mid[2].at === '17:00:00'
      && e === null && JSON.stringify(after) === JSON.stringify(before9),
    JSON.stringify({ mid, e, before9, after }));
}

// 10 ------------------------------------------------------------------------------------------
await as(A);
const p10 = await propose('goal.create', { title: 'Five workouts a week', metric: 'workouts_per_week', target_value: 5 });
await as(A);
await db.exec(`select apply_ai_proposal('${p10}')`);
{
  const g = (await proposalRow(p10)).undo?.goal_id;
  const made = (await one(`select count(*)::int as n from fitness_goals where id = '${g}' and member_id = '${A}'`)).n;
  await as(A);
  const e = await tryExec(`select undo_ai_proposal('${p10}')`);
  await owner();
  const gone = (await one(`select count(*)::int as n from fitness_goals where id = '${g}'`)).n;
  await as(A);
  const p10b = await propose('goal.create', { title: 'Touch my toes', metric: 'custom' });
  await as(A);
  await db.exec(`select apply_ai_proposal('${p10b}')`);
  const g2 = (await proposalRow(p10b)).undo.goal_id;
  await db.exec(`update fitness_goals set achieved_on = manila_today() where id = '${g2}'`);
  await as(A);
  const e2 = await tryExec(`select undo_ai_proposal('${p10b}')`);
  await owner();
  const kept = (await one(`select count(*)::int as n from fitness_goals where id = '${g2}'`)).n;
  check('10. goal.create inserts; undo removes it; an achieved goal\'s undo is refused',
    made === 1 && e === null && gone === 0 && !!e2 && /reached that goal/.test(e2) && kept === 1,
    JSON.stringify({ made, e, gone, e2, kept }));
}

// 11 ------------------------------------------------------------------------------------------
await as(A);
const p11 = await propose('goal.create', { title: 'Discard me', metric: 'custom' });
await as(A);
{
  const e = await tryExec(`select discard_ai_proposal('${p11}')`);
  const st = (await proposalRow(p11)).status;
  await as(A);
  const ea = await tryExec(`select apply_ai_proposal('${p11}')`);
  await owner();
  const goals = (await one(`select count(*)::int as n from fitness_goals where title = 'Discard me'`)).n;
  check('11. discard marks it discarded; applying a discarded one is refused',
    e === null && st === 'discarded' && !!ea && goals === 0, JSON.stringify({ e, st, ea, goals }));
}

// 12 ------------------------------------------------------------------------------------------
await owner();
const pendingNow = (await one(`select count(*)::int as n from ai_proposals where member_id = '${A}' and status = 'pending'`)).n;
await as(A);
for (let i = pendingNow; i < 10; i++) await propose('goal.create', { title: `Goal ${i}`, metric: 'custom' });
{
  const e = await tryPropose('goal.create', { title: 'Eleventh', metric: 'custom' });
  check('12. an 11th pending proposal is refused', !!e && /10 changes waiting/.test(e), String(e));
}
await db.exec(`reset role; update ai_proposals set status = 'discarded' where member_id = '${A}' and status = 'pending';`);

// 13 ------------------------------------------------------------------------------------------
await db.exec(`reset role; select act_as_gym('${GYM}');
  insert into gym_plans (gym_id, member_id, day_of_week) values ('${GYM}', '${B}', 4);`);
await as(A);
await db.exec(`select set_ai_coach_consent(false)`);
{
  const r0 = (await one(`select ai_coach_routines() as r`)).r;
  const s0 = (await one(`select ai_coach_schedule() as s`)).s;
  const exs = await rows(`select * from ai_coach_exercises()`);
  const chest = await rows(`select * from ai_coach_exercises('chest')`);
  await db.exec(`select set_ai_coach_consent(true)`);
  const r1 = (await one(`select ai_coach_routines() as r`)).r;
  const s1 = (await one(`select ai_coach_schedule() as s`)).s;
  const blob = JSON.stringify([r1, s1]);
  const pull = r1?.find((r) => r.id === R6);
  check('13. without consent routines/schedule are null, exercises still listed; with consent A\'s data, never B\'s',
    r0 === null && s0 === null && exs.length > 0 && exs.length <= 80
      && !exs.some((e) => e.id === E5 || e.id === GYM2_EX) && chest.every((e) => e.muscle_group === 'chest')
      && Array.isArray(r1) && pull?.exercises?.length === 2 && pull.exercises[1].name === 'Band pull-apart'
      && Array.isArray(s1) && s1.map((d) => d.day_of_week).join() === '0,2'
      && !/B private/.test(blob) && !s1.some((d) => d.day_of_week === 4),
    JSON.stringify({ r0, s0, n: exs.length, r1, s1 }));
}

// 14 ------------------------------------------------------------------------------------------
await as(A);
const p14 = await propose('routine.create', { ...leg, name: 'No tracker day' });
await db.exec(`reset role; update plan_features set enabled = false where feature_key = 'workout_tracker'
  and plan_id = (select plan_id from memberships where member_id = '${A}');`);
await as(A);
{
  const e = await tryExec(`select apply_ai_proposal('${p14}')`);
  await owner();
  const made = (await one(`select count(*)::int as n from workout_routines where name = 'No tracker day'`)).n;
  const st = (await proposalRow(p14)).status;
  check('14. without the workout tracker a routine proposal cannot be applied (plain words)',
    !!e && /workout tracker/.test(e) && made === 0 && st === 'pending', JSON.stringify({ e, made, st }));
}
await db.exec(`reset role; update plan_features set enabled = true where feature_key = 'workout_tracker'
  and plan_id = (select plan_id from memberships where member_id = '${A}');`);

// 15 ------------------------------------------------------------------------------------------
await db.exec(`reset role; insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'assistant', false)
  on conflict (gym_id, feature_key) do update set enabled = false;`);
await as(A);
{
  const e = await tryPropose('goal.create', { title: 'Switched off', metric: 'custom' });
  await owner();
  const n = (await one(`select count(*)::int as n from ai_proposals where summary = 'A change' and payload->>'title' = 'Switched off'`)).n;
  check('15. with the assistant switched off no proposal can be made', !!e && /not available to you/.test(e) && n === 0, String(e));
}
await db.exec(`reset role; update gym_modules set enabled = true where gym_id = '${GYM}' and feature_key = 'assistant';`);
await as(DESK);
{
  const e = await tryPropose('goal.create', { title: 'Desk', metric: 'custom' });
  check('15b. a desk account cannot make a proposal', !!e && /Only members/.test(e), String(e));
}
// The reply that spent the day's last message can still propose: limits gate messages, not proposals.
await db.exec(`reset role; update gym_settings set ai_daily_messages = 1 where gym_id = '${GYM}';
  insert into ai_usage_days (gym_id, member_id, day, messages) values ('${GYM}', '${A}', manila_today(), 1)
  on conflict (gym_id, member_id, day) do update set messages = 1;`);
await as(A);
{
  const e = await tryPropose('goal.create', { title: 'Last message', metric: 'custom' });
  check('15c. at the daily limit, the reply that used the last message can still propose', e === null, String(e));
}
await db.exec(`reset role; update gym_settings set ai_daily_messages = 30 where gym_id = '${GYM}';`);

// Fix round 1 ---------------------------------------------------------------------------------
// 18. A waiting change stays listed however old: it still counts toward the 10.
await db.exec(`reset role; update ai_proposals set status = 'discarded' where member_id = '${A}' and status = 'pending';`);
await as(A);
{
  const old = await propose('goal.create', { title: 'Old but waiting', metric: 'custom' });
  const decided = await propose('goal.create', { title: 'Old and decided', metric: 'custom' });
  await db.exec(`select discard_ai_proposal('${decided}')`);
  await db.exec(`reset role; update ai_proposals set created_at = now() - interval '40 days' where id in ('${old}', '${decided}');`);
  await as(A);
  const ids = (await rows(`select id from my_ai_proposals()`)).map((r) => r.id);
  check('18. a pending proposal from 40 days ago is still listed; a decided one that old is not',
    ids.includes(old) && !ids.includes(decided), JSON.stringify({ old, decided, n: ids.length }));
}
// 19. 9999.995 rounds to 10000.00 and would overflow numeric(6,2): refused in plain words at create.
await as(A);
{
  const e = await tryPropose('goal.create', { title: 'Huge', metric: 'custom', target_value: 9999.995 });
  const ok = await tryPropose('goal.create', { title: 'Just fits', metric: 'custom', target_value: 9999.99 });
  check('19. a goal value of 9999.995 is refused in plain words; 9999.99 is accepted',
    !!e && /under 10,000/.test(e) && ok === null, JSON.stringify({ e, ok }));
}
await db.exec(`reset role; update ai_proposals set status = 'discarded' where member_id = '${A}' and status = 'pending';`);
// 20. Undoing an older schedule while a newer one is applied is refused; newest-first works.
await as(A);
{
  const before = await daysOfA();
  await as(A);
  const s1 = await propose('schedule.set', { days: [{ day_of_week: 2 }] });
  await db.exec(`select apply_ai_proposal('${s1}')`);
  const s2 = await propose('schedule.set', { days: [{ day_of_week: 6 }] });
  await db.exec(`select apply_ai_proposal('${s2}')`);
  const e = await tryExec(`select undo_ai_proposal('${s1}')`);
  const mid = await daysOfA();
  await as(A);
  const e2 = await tryExec(`select undo_ai_proposal('${s2}')`);
  const e3 = await tryExec(`select undo_ai_proposal('${s1}')`);
  const after = await daysOfA();
  check('20. undoing an older schedule under a newer one is refused; newest first restores the original',
    !!e && /newer change from the coach/.test(e) && mid.map((d) => d.day_of_week).join() === '6'
      && e2 === null && e3 === null && JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ e, mid, e2, e3, before, after }));
}
// 21. The same for two rewrites of one routine; a rewrite of a different routine does not block.
await as(A);
{
  const before = await routineOf(R6);
  await as(A);
  const r1 = await propose('routine.replace', { routine_id: R6, name: 'Rewrite one', exercises: [ex(E1)] });
  await db.exec(`select apply_ai_proposal('${r1}')`);
  const other = await propose('routine.replace', { routine_id: R5, name: 'Other routine', exercises: [ex(E2)] });
  await db.exec(`select apply_ai_proposal('${other}')`);
  const r2 = await propose('routine.replace', { routine_id: R6, name: 'Rewrite two', exercises: [ex(E2)] });
  await db.exec(`select apply_ai_proposal('${r2}')`);
  const e = await tryExec(`select undo_ai_proposal('${r1}')`);
  const mid = await routineOf(R6);
  await as(A);
  const eo = await tryExec(`select undo_ai_proposal('${other}')`);
  const e2 = await tryExec(`select undo_ai_proposal('${r2}')`);
  const e3 = await tryExec(`select undo_ai_proposal('${r1}')`);
  const after = await routineOf(R6);
  check('21. undoing an older rewrite of the same routine is refused; another routine\'s does not block',
    !!e && /newer change from the coach/.test(e) && mid.name === 'Rewrite two' && eo === null
      && e2 === null && e3 === null && JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ e, mid: mid.name, eo, e2, e3, before, after }));
}

// 16 ------------------------------------------------------------------------------------------
await owner();
{
  const pol = await rows(`select policyname, cmd from pg_policies where tablename = 'ai_proposals'
    and cmd in ('INSERT','UPDATE','DELETE','ALL')`);
  await as(A);
  const ins = await tryExec(`insert into ai_proposals (member_id, kind, payload, summary)
    values ('${A}', 'goal.create', '{}'::jsonb, 'forged')`);
  const upd = await tryExec(`update ai_proposals set status = 'applied' where member_id = '${A}'`);
  await owner();
  const forged = (await one(`select count(*)::int as n from ai_proposals where summary = 'forged'`)).n;
  const flipped = (await one(`select count(*)::int as n from ai_proposals where id = '${p11}' and status <> 'discarded'`)).n;
  check('16. no role has a write policy on ai_proposals, and a direct write changes nothing',
    pol.length === 0 && !!ins && forged === 0 && flipped === 0, JSON.stringify({ pol, ins, upd }));
}

// 17 ------------------------------------------------------------------------------------------
await owner();
{
  const t = (await one(`select tenancy_gym_tables() @> array['ai_proposals'] as ok`)).ok;
  const report = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0145.sql`, 'utf8'))) ?? '';
  check('17. ai_proposals is a tenant table; verify0145.sql reports OK',
    t && /REPORT 0145/.test(report) && !/NOT OK/.test(report), report);
}

// Stale: an exercise hidden after the proposal was made refuses at apply, and changes nothing.
await db.exec(`reset role; update gym_exercise_media set hidden = false where gym_id = '${GYM}' and exercise_id = '${E5}';`);
await as(A);
{
  const p = await propose('routine.create', { name: 'Stale day', exercises: [ex(E5)] });
  await db.exec(`reset role; update gym_exercise_media set hidden = true where gym_id = '${GYM}' and exercise_id = '${E5}';`);
  await as(A);
  const e = await tryExec(`select apply_ai_proposal('${p}')`);
  await owner();
  const made = (await one(`select count(*)::int as n from workout_routines where name = 'Stale day'`)).n;
  check('stale: an exercise hidden since refuses at apply and writes nothing',
    !!e && /not available/.test(e) && made === 0 && (await proposalRow(p)).status === 'pending', String(e));
}

console.log(failures ? `\n${failures} FAILED` : '\nall 0145 checks passed');
process.exit(failures ? 1 : 0);
