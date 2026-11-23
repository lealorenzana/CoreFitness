/**
 * 0270: the coach's gym facts carry how the gym runs (booking approvals, package rules, closed
 * days, day passes, freeze limits, refund tiers, switches), read from the member's own gym only.
 *
 *   node <repo>/scripts/sql/coach-knows-gym.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-000000000270';
const M = 'a2700000-0000-4000-8000-00000000000a', M2 = 'a2700000-0000-4000-8000-00000000000b';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM2}', 'other-0270-gym', 'Other Gym') on conflict do nothing;
  insert into gym_settings (gym_id, gym_name) select '${GYM2}', 'Other Gym' where not exists (select 1 from gym_settings where gym_id = '${GYM2}');
  ${[['m', M, GYM], ['m2', M2, GYM2]].map(([k, u, g]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@0270-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@0270-test.com', 'active', 'member', '${g}') on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', 'member', 'active') on conflict do nothing;`).join('\n')}
  update gym_settings set closed_days = '{0}', pt_booking_approval = 'coach_desk', coaching_approval = 'coach',
    coaching_lengths = '{1,3,6}', day_pass_on = true, day_pass_price = 150, max_freeze_days_at_once = 30,
    refund_processing_fee = 0 where gym_id = '${GYM}';
  update gym_settings set day_pass_on = false where gym_id = '${GYM2}';
  insert into refund_rules (gym_id, priority, label, min_days, max_days, percent) values
    ('${GYM}', 10, 'First week 0270', 0, 7, 100), ('${GYM2}', 10, 'Other gym rule 0270', 0, 7, 50);
`);

await as(M);
const info = (await one(`select ai_coach_gym_info() i`)).i;
const h = info.how_this_gym_runs;
check('the gym facts carry how_this_gym_runs', h && typeof h === 'object', JSON.stringify(info).slice(0, 200));
check('…and still everything before it (plans, gym, equipment key)', Array.isArray(info.plans) && 'gym' in info && 'equipment' in info);
check('who approves a session is the gym\'s mode', ['instant', 'coach', 'desk', 'coach_desk', 'off'].includes(h.session_approval), h.session_approval);
check('package approval and lengths come from settings', h.package_pick_approval === 'coach' && JSON.stringify(h.package_months) === '[1,3,6]');
check('closed days are named', JSON.stringify(h.closed_days) === '["Sunday"]', JSON.stringify(h.closed_days));
check('day pass price read', Number(h.day_pass?.one_day_php) === 150, JSON.stringify(h.day_pass));
check('freeze guideline read', h.freeze_guideline.max_days_at_once === 30);
check('refund tiers are this gym\'s only', h.refund.tiers.some((t) => t.label === 'First week 0270')
  && !h.refund.tiers.some((t) => t.label === 'Other gym rule 0270'), JSON.stringify(h.refund.tiers));
check('switches are listed', typeof h.switched_on.classes === 'boolean' && typeof h.switched_on.slots === 'boolean');

await as(M2);
const h2 = (await one(`select ai_coach_gym_info() i`)).i.how_this_gym_runs;
check('another gym\'s member reads their own gym', h2.day_pass === null && h2.refund.tiers.every((t) => t.label !== 'First week 0270'), JSON.stringify(h2));

await owner();
await db.exec(`set role anon`);
let refused = false;
try { await db.query(`select ai_coach_gym_info()`); } catch { refused = true; }
check('a visitor cannot call it', refused);
await owner();
check('the renamed reader is not callable by members', !(await one(`select has_function_privilege('authenticated', 'ai_coach_gym_info_v2()', 'execute') ok`)).ok);
check('marker', (await one(`select migration_0270_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0270 checks passed');
process.exit(failures ? 1 : 0);
