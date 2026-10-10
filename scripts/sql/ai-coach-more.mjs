/**
 * 0177: the AI coach reads the gym's own facts and the member's progress, and
 * proposes bookings, cancellations, multi-week programs and logged workouts —
 * each only on Apply, each undoable where it can be, and the old kinds unchanged.
 *
 *   node <repo>/scripts/sql/ai-coach-more.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-000000000002';
const A = 'a1770000-0000-4000-8000-00000000000a';
const B = 'a1770000-0000-4000-8000-00000000000b';
const T = 'a1770000-0000-4000-8000-00000000000c';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec('reset role;');
const q = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const propose = async (kind, payload) => (await one(`select create_ai_proposal('${kind}', ${q(payload)}, 'A change') as id`)).id;
const tryPropose = (kind, payload) => tryExec(`select create_ai_proposal('${kind}', ${q(payload)}, 'A change')`);

await db.exec(`reset role;
  ${[['a', A, 'member'], ['b', B, 'member'], ['coach', T, 'trainer']].map(([k, id, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@more-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k}', 'T', '${k}@more-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${A}', '${GYM}', 'QR-M-A'), ('${B}', '${GYM}', 'QR-M-B') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select m, '${GYM}', (select pf.plan_id from plan_features pf join membership_plans mp on mp.id = pf.plan_id
                          where pf.feature_key = 'ai_model' and pf.enabled and mp.gym_id = '${GYM}' limit 1),
           'active', manila_today() - 1, manila_today() + 30
      from unnest(array['${A}','${B}']::uuid[]) m;
  insert into gyms (id, slug, name) values ('${GYM2}', 'more-gym-2', 'More Gym 2') on conflict do nothing;
  insert into exercises (gym_id, name, muscle_group, equipment) values ('${GYM2}', 'Gym2 Only Row', 'back', 'machine');`);
const klass = (await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'HIIT 7am', '${T}', 10, now() + interval '2 days', 60) returning id`)).id;
const klass2 = (await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM2}', 'Elsewhere', null, 10, now() + interval '2 days', 60) returning id`)).id;
const squat = (await one(`select id from exercises where gym_id is null and name = 'Back Squat'`)).id;
const gym2ex = (await one(`select id from exercises where gym_id = '${GYM2}' limit 1`)).id;

// ---- readers ----
await as(A);
const info = (await one(`select ai_coach_gym_info() i`)).i;
check("the coach reads this gym's plans and the coming week's classes, with seats left",
  Array.isArray(info.plans) && info.plans.length > 0 && info.classes_next_7_days.some((c) => c.class_id === klass && c.seats_left === 10),
  JSON.stringify(info).slice(0, 300));
check('…and its coaches', info.coaches.some((c) => c.specialty === 'Strength'));
await db.exec(`select set_ai_coach_consent(false)`);
check('progress is not read without the member\'s consent', (await one(`select ai_coach_progress() p`)).p === null);
await db.exec(`select set_ai_coach_consent(true)`);
const prog = (await one(`select ai_coach_progress() p`)).p;
check('…and is with it', prog && 'workouts_per_week_last_8' in prog && 'targets' in prog, JSON.stringify(prog));

// ---- booking.create ----
check('a class at another gym cannot be proposed', (await tryPropose('booking.create', { class_id: klass2 })) !== null);
const pb = await propose('booking.create', { class_id: klass });
await db.exec(`select apply_ai_proposal('${pb}')`);
await owner();
const booking = await one(`select id, status from bookings where member_id = '${A}' and class_id = '${klass}'`);
check('Apply books the class, as Book would (pending until approved)', booking && ['pending', 'approved'].includes(booking.status), JSON.stringify(booking));
await as(A);
check('…and shows in the coach\'s view of their bookings', (await one(`select ai_coach_bookings() b`)).b.some((x) => x.booking_id === booking.id));
check('booking the same class again is refused', (await tryPropose('booking.create', { class_id: klass })) !== null);
await db.exec(`select undo_ai_proposal('${pb}')`);
await owner();
check('Undo cancels that booking', (await one(`select status from bookings where id = '${booking.id}'`)).status === 'cancelled');

// ---- booking.cancel ----
await db.exec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${A}', '${klass}', 'approved')`);
const b2 = (await one(`select id from bookings where member_id = '${A}' and class_id = '${klass}' and status = 'approved'`)).id;
await as(B);
check("another member's booking cannot be cancelled", (await tryPropose('booking.cancel', { booking_id: b2 })) !== null);
await as(A);
const pc = await propose('booking.cancel', { booking_id: b2 });
await db.exec(`select apply_ai_proposal('${pc}')`);
await owner();
check('Apply cancels it through cancel_booking', (await one(`select status from bookings where id = '${b2}'`)).status === 'cancelled');
await as(A);
check('…and says plainly it cannot be undone', /book the class again/.test(await tryExec(`select undo_ai_proposal('${pc}')`) ?? ''));

// ---- program.create ----
const program = { name: 'Strength Base', weeks: 4, deload_every: 4, notes: null, sessions: [
  { day_of_week: 1, name: 'Legs', exercises: [{ exercise_id: squat, target_sets: 3, target_reps: 8, target_weight_kg: 40, target_seconds: null, rest_seconds: 90, progress_kind: 'weight', progress_step: 2.5 }] },
  { day_of_week: 4, name: 'Legs B', exercises: [{ exercise_id: squat, target_sets: 4, target_reps: 6, target_weight_kg: 45, target_seconds: null, rest_seconds: 120, progress_kind: 'weight', progress_step: 2.5 }] },
] };
check('a program with another gym\'s exercise is refused',
  (await tryPropose('program.create', { ...program, sessions: [{ ...program.sessions[0], exercises: [{ ...program.sessions[0].exercises[0], exercise_id: gym2ex }] }] })) !== null);
const pp = await propose('program.create', program);
const res = (await one(`select apply_ai_proposal('${pp}') r`)).r;
await owner();
const made = await one(`select source, member_id, weeks, (select count(*) from gym_program_days d where d.program_id = g.id) days,
  (select status from program_enrolments e where e.program_id = g.id and e.member_id = '${A}') enrol from gym_programs g where id = '${res.program_id}'`);
check("Apply makes the member's own AI program, 4 weeks × 2 days, and starts it",
  made.source === 'ai' && made.member_id === A && Number(made.days) === 8 && made.enrol === 'active', JSON.stringify(made));
await as(A);
const wk2 = (await one(`select d.id from gym_program_days d where d.program_id = '${res.program_id}' and d.week = 2 and d.day = 2`)).id;
check('…whose week 2 is heavier (program_day_targets)', Number((await one(`select weight_kg from program_day_targets('${wk2}') limit 1`)).weight_kg) === 42.5);
await as(B);
check('another member cannot see it', !(await one(`select 1 x from gym_programs where id = '${res.program_id}'`)));
await as(A);
await db.exec(`select undo_ai_proposal('${pp}')`);
await owner();
check('Undo removes the program', !(await one(`select 1 x from gym_programs where id = '${res.program_id}'`)));

// ---- log.create ----
await as(A);
check('a workout 40 days back is refused', (await tryPropose('log.create', { performed_on: '2020-01-01', activity: 'Old', sets: [{ exercise_id: squat, reps: 10, weight_kg: 40, seconds: null }] })) !== null);
const today = (await one(`select manila_today()::text d`)).d;
const pl = await propose('log.create', { performed_on: today, activity: 'Bench day', sets: [
  { exercise_id: squat, reps: 10, weight_kg: 40, seconds: null }, { exercise_id: squat, reps: 10, weight_kg: 40, seconds: null }] });
const lr = (await one(`select apply_ai_proposal('${pl}') r`)).r;
await owner();
check('Apply logs the workout with its sets', Number((await one(`select count(*) n from workout_sets where log_id = '${lr.log_id}'`)).n) === 2);
await as(A);
await db.exec(`select undo_ai_proposal('${pl}')`);
await owner();
check('Undo removes it', !(await one(`select 1 x from workout_logs where id = '${lr.log_id}'`)));

// ---- the old kinds are untouched ----
await as(A);
const pr = await propose('routine.create', { name: 'Push', notes: null, exercises: [{ exercise_id: squat, custom_name: null, target_sets: 3, target_reps: 10, target_weight_kg: null, target_seconds: null, rest_seconds: 60 }] });
const rr = await tryExec(`select apply_ai_proposal('${pr}')`);
check('a routine proposal still applies through the original code', rr === null, rr ?? '');

await owner();
check('marker', (await one(`select migration_0177_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0177 checks passed');
process.exit(failures ? 1 : 0);
