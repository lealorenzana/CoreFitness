/**
 * 0143: the AI coach's foundation — who may use it, how much, and what it may read.
 *
 *   node <repo>/scripts/sql/ai-coach.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const A = 'a1430000-0000-4000-8000-00000000000a';
const B = 'a1430000-0000-4000-8000-00000000000b';
const DESK = 'a1430000-0000-4000-8000-00000000000d';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const status = async () => (await one(`select ai_coach_status() as s`)).s;

// Two members on a plan that includes the model, and a desk account.
await db.exec(`reset role;
  ${[['a', A], ['b', B], ['desk', DESK]].map(([k, id]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@coach-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role)
      values ('${id}', '${k.toUpperCase()}', 'T', '${k}@coach-test.com', 'active', 'member')
      on conflict (id) do update set status = 'active';`).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${A}', 'member', 'active'), ('${GYM}', '${B}', 'member', 'active'), ('${GYM}', '${DESK}', 'staff', 'active')
    on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
  update profiles set active_gym_id = '${GYM}' where email like '%@coach-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level) values
    ('${A}', '${GYM}', 'QR-AI-A', 'beginner'), ('${B}', '${GYM}', 'QR-AI-B', 'advanced') on conflict do nothing;
  select act_as_gym('${GYM}');
  -- A premium membership for both: the plan that includes ai_model.
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select m, '${GYM}', (select pf.plan_id from plan_features pf join membership_plans mp on mp.id = pf.plan_id
                          where pf.feature_key = 'ai_model' and pf.enabled and mp.gym_id = '${GYM}' limit 1),
           'active', manila_today() - 1, manila_today() + 30
      from unnest(array['${A}','${B}']::uuid[]) m;
  insert into fitness_goals (member_id, title) values ('${A}', 'Squat my bodyweight');`);

// ---- status and gates --------------------------------------------------------------------------
await as(A);
let s = await status();
check('an entitled member may use the coach', s.allowed === true && s.reason === null, JSON.stringify(s));
check('limits default to 30 a day and 1500 a month', s.daily_limit === 30 && s.monthly_limit === 1500, JSON.stringify(s));
check('consent starts unanswered', s.consent === null, JSON.stringify(s));

await db.exec(`reset role; update gym_modules set enabled = false where gym_id = '${GYM}' and feature_key = 'assistant';
  insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'assistant', false)
    on conflict (gym_id, feature_key) do update set enabled = false;`);
await as(A);
check('the gym switching the assistant off closes it', (await status()).reason === 'switched_off');
await db.exec(`reset role; update gym_modules set enabled = true where gym_id = '${GYM}' and feature_key = 'assistant';`);

await as(DESK);
check('a desk account is not a member', (await status()).reason === 'not_member');

// ---- context only with consent -----------------------------------------------------------------
await as(A);
check('no context before consent', (await one(`select ai_coach_context() as c`)).c === null);
await db.exec(`select set_ai_coach_consent(true)`);
const ctx = (await one(`select ai_coach_context() as c`)).c;
check('with consent: name, level and goals', ctx?.first_name === 'A' && ctx?.experience_level === 'beginner'
  && ctx?.goals?.includes('Squat my bodyweight'), JSON.stringify(ctx));
check('the context never carries health or payment keys',
  !/par_q|waiver|payment|amount|phone|email/i.test(JSON.stringify(ctx)), JSON.stringify(ctx));
// ---- a member of two gyms: the context is this gym's only --------------------------------------
{
  const GYM2 = 'c0f1e55e-0000-4000-8000-000000000002';
  await db.exec(`reset role;
    insert into gyms (id, slug, name) values ('${GYM2}', 'coach-gym-2', 'Coach Gym 2') on conflict do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM2}', '${A}', 'member', 'active')
      on conflict (gym_id, user_id) do update set status = 'active';
    insert into member_profiles (profile_id, gym_id, qr_code, experience_level)
      values ('${A}', '${GYM2}', 'QR-AI-A2', 'advanced') on conflict do nothing;
    insert into fitness_goals (member_id, gym_id, title) values ('${A}', '${GYM2}', 'GYM2 secret goal');
    insert into workout_routines (member_id, gym_id, name, position) values ('${A}', '${GYM2}', 'GYM2 secret routine', 0);
    insert into workout_logs (member_id, gym_id, activity, completed_at) values ('${A}', '${GYM2}', 'GYM2 run', now());`);
  await as(A);
  const err = await tryExec(`select ai_coach_context()`);
  check('a member of two gyms gets a context, not an error', err === null, String(err));
  const c2 = (await one(`select ai_coach_context() as c`)).c;
  const blob = JSON.stringify(c2);
  check('the context carries no goal of another gym or routine', !!c2 && !/GYM2/.test(blob), blob);
  check('the level comes from this gym only', c2?.experience_level === 'beginner', blob);
  check('workouts of another gym are not counted', c2?.workouts_30d === 0, blob);
}
await db.exec(`select set_ai_coach_consent(false)`);
check('withdrawing consent stops it at once', (await one(`select ai_coach_context() as c`)).c === null);

// ---- usage: only the service role writes it, and the limits bite -------------------------------
await as(A);
check('a member cannot record usage', !!(await tryExec(`select ai_record_usage('${GYM}', '${A}', 10, 10)`)));
check('a member cannot claim a message', !!(await tryExec(`select ai_claim_message('${GYM}', '${A}')`)));
check('a member cannot write the usage table', !!(await tryExec(
  `insert into ai_usage_days (gym_id, member_id, day, messages) values ('${GYM}', '${A}', manila_today(), -100)`))
  || (await one(`select count(*)::int as n from ai_usage_days where messages < 0`)).n === 0);

await db.exec(`reset role; update gym_settings set ai_daily_messages = 2 where gym_id = '${GYM}'; set role service_role;`);
const claim = async (m) => (await one(`select ai_claim_message('${GYM}', '${m}') as ok`)).ok;
check('claim 1 of 2 passes', (await claim(A)) === true);
check('claim 2 of 2 passes', (await claim(A)) === true);
check('claim 3 is refused exactly at the daily limit', (await claim(A)) === false);
await db.exec(`reset role;`);
check('a refused claim does not increment past the limit',
  (await one(`select messages from ai_usage_days where member_id = '${A}' and day = manila_today()`)).messages === 2);
await db.exec(`set role service_role;`);
check('the service role records tokens', !(await tryExec(`select ai_record_usage('${GYM}', '${A}', 1200, 300)`)));
await db.exec(`reset role;`);
{
  const r = await one(`select messages, tokens_in::int as ti, tokens_out::int as to_ from ai_usage_days
    where member_id = '${A}' and day = manila_today()`);
  check('recording adds tokens without changing messages', r.messages === 2 && r.ti === 1200 && r.to_ === 300, JSON.stringify(r));
}
await as(A);
s = await status();
check('the daily limit closes it at the boundary', s.used_today === 2 && s.reason === 'daily_limit', JSON.stringify(s));
await as(B);
s = await status();
check('one member at their limit does not close it for another', s.allowed === true && s.used_today === 0, JSON.stringify(s));
check('another member reads none of A\'s usage',
  (await one(`select count(*)::int as n from ai_usage_days where member_id = '${A}'`)).n === 0);
await db.exec(`reset role; update gym_settings set ai_daily_messages = 30, ai_monthly_messages = 2 where gym_id = '${GYM}';`);
await as(B);
check('the gym\'s monthly limit closes it for everyone', (await status()).reason === 'monthly_limit');
await db.exec(`reset role; set role service_role;`);
const refusedB = (await claim(B)) === false;
await db.exec(`reset role;`);
check('the monthly limit refuses a claim, without counting it', refusedB
  && (await one(`select count(*)::int as n from ai_usage_days where member_id = '${B}'`)).n === 0);
await db.exec(`reset role; update gym_settings set ai_monthly_messages = 1500 where gym_id = '${GYM}';`);

// ---- limits are bounded; the message source is checked -----------------------------------------
await db.exec('reset role;');
check('a daily limit of 0 is refused', !!(await tryExec(`update gym_settings set ai_daily_messages = 0 where gym_id = '${GYM}'`)));

// A real conversation of A's, so the source check is asserting on a row that exists.
await db.exec(`reset role; insert into assistant_conversations (id, user_id)
  values ('a1430000-0000-4000-8000-0000000000c1', '${A}');`);
await as(A);
const robot = await tryExec(`insert into assistant_messages (conversation_id, role, body, source)
  values ('a1430000-0000-4000-8000-0000000000c1', 'assistant', 'x', 'robot')`);
check('an unknown message source is refused', !!robot && /source|check/i.test(robot), String(robot));
const coach = await tryExec(`insert into assistant_messages (conversation_id, role, body, source)
  values ('a1430000-0000-4000-8000-0000000000c1', 'assistant', 'x', 'coach')`);
check('a message from the coach is accepted', coach === null, String(coach));
await db.exec('reset role;');
check('both tables are tenant tables',
  (await one(`select tenancy_gym_tables() @> array['ai_coach_profiles','ai_usage_days'] as ok`)).ok);

// ---- 0144: the coaching profile ----------------------------------------------------------------
await as(A);
check('status says not set up yet', (await status()).onboarded === false);
check('a bad goal is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"get huge","experience":"new","days_per_week":3,"minutes":45,"equipment":["dumbbells"],"has_injury":false}'::jsonb)`)));
check('8 days a week is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":8,"minutes":45,"equipment":["dumbbells"],"has_injury":false}'::jsonb)`)));
check('unknown equipment is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":3,"minutes":45,"equipment":["rocket"],"has_injury":false}'::jsonb)`)));
check('a missing answer is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength"}'::jsonb)`)));
check('empty equipment is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":3,"minutes":45,"equipment":[],"has_injury":false}'::jsonb)`)));
check('null answers are refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":null,"experience":null,"days_per_week":null,"minutes":null,"equipment":["dumbbells"],"has_injury":null}'::jsonb)`)));
{
  const bad = await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":"abc","minutes":45,"equipment":["dumbbells"],"has_injury":false}'::jsonb)`);
  check('a non-number is refused in plain words', !!bad && /answer every question/.test(bad), String(bad));
}
check('a 201-character note is refused', !!(await tryExec(`select save_ai_coach_profile(jsonb_build_object('goal','strength','experience','new','days_per_week',3,'minutes',45,'equipment',jsonb_build_array('dumbbells'),'has_injury',false,'likes',repeat('x',201)))`)));
check('a good profile saves', !(await tryExec(`select save_ai_coach_profile('{"goal":"muscle","experience":"some","days_per_week":4,"minutes":60,"equipment":["full_gym","dumbbells"],"likes":"lifting","avoid":"running","has_injury":true}'::jsonb)`)));
check('status says set up', (await status()).onboarded === true);
await db.exec(`select set_ai_coach_consent(false)`);
let c = (await one(`select ai_coach_context() as c`)).c;
check('without consent: the profile only', c?.profile?.goal === 'muscle' && c?.profile?.has_injury === true
  && c.goals === undefined && c.routines === undefined && c.experience_level === undefined, JSON.stringify(c));
check('the injury is a yes/no, never text', !/injur.*[a-z]{4,}/i.test(JSON.stringify(c?.profile ?? {}).replace('"has_injury":true', '')));
await db.exec(`select set_ai_coach_consent(true)`);
c = (await one(`select ai_coach_context() as c`)).c;
check('with consent: profile and history', c?.profile?.goal === 'muscle' && Array.isArray(c?.goals), JSON.stringify(c));
// An extra "injury_details" key is ignored: the words are stored nowhere and never reach the coach.
check('a profile with an injury_details key still saves', !(await tryExec(`select save_ai_coach_profile('{"goal":"muscle","experience":"some","days_per_week":4,"minutes":60,"equipment":["full_gym","dumbbells"],"likes":"lifting","avoid":"running","has_injury":true,"injury_details":"left knee"}'::jsonb)`)));
c = (await one(`select ai_coach_context() as c`)).c;
check('injury_details never reaches the coach', !JSON.stringify(c).includes('left knee'), JSON.stringify(c));
await db.exec('reset role;');
check('injury_details is stored nowhere in the profile row',
  !(await one(`select row_to_json(p)::text as t from ai_coach_profiles p where member_id = '${A}'`)).t.includes('left knee'));
await as(B);
check('another member sees none of A\'s profile',
  (await one(`select count(*)::int as n from ai_coach_profiles where member_id = '${A}'`)).n === 0);
check('a member with nothing set up gets no context', (await one(`select ai_coach_context() as c`)).c === null);

// The paste-after report, on this same replay.
{
  const { readFileSync } = await import('node:fs');
  await db.exec('reset role;');
  const report = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0143.sql`, 'utf8'))) ?? '';
  check('verify0143.sql reports OK', /REPORT 0143/.test(report) && !/NOT OK/.test(report), report);
  await db.exec('reset role;');
  const report44 = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0144.sql`, 'utf8'))) ?? '';
  check('verify0144.sql reports OK', /REPORT 0144/.test(report44) && !/NOT OK/.test(report44), report44);
}

console.log(failures ? `\n${failures} FAILED` : '\nall 0143/0144 checks passed');
process.exit(failures ? 1 : 0);
