/**
 * 0256: how does your gym work? An owner picks styles; gym_style_changes() lists exactly what would change and
 * writes nothing; apply_gym_styles() makes those changes through the usual setters and records the styles.
 * Only the owner; a style the plan cannot run leaves that part as it is; customised approvals are kept.
 *
 *   node <repo>/scripts/sql/gym-styles.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0256 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const AD = 'a2560000-0000-4000-8000-00000000000d';
const ST = 'a2560000-0000-4000-8000-00000000000e';
const M = 'a2560000-0000-4000-8000-00000000000a';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['own', AD, 'admin'], ['desk', ST, 'staff'], ['mem', M, 'member']].map(([k, id, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@styles-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k}', 'T', '${k}@styles-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict do nothing;`).join('\n')}`);

const state = async () => {
  await owner();
  return one(`select gym_module_on('${GYM}', 'classes') classes, gym_module_on('${GYM}', 'coaching') coaching,
    booking_approval_mode('${GYM}', 'class') class_mode, booking_approval_mode('${GYM}', 'pt') pt_mode,
    (select 'pick_pt' = any(cs.modes) from coaching_settings('${GYM}') cs) pick, (select gym_styles from gym_settings where gym_id = '${GYM}') styles`);
};

// A known start: classes on, coaching on, class booking by the desk (customised), 1-on-1 coach approves, pick on.
await as(AD);
await db.exec(`select set_gym_module('classes', true); select set_gym_module('coaching', true); select set_booking_approval('desk', 'coach');`);
const before = await state();

// 1 — the G Fitness way: coaching packages only.
await as(AD);
const changes = await all(`select setting, now_value, next_value from gym_style_changes(array['coaching_packages'])`);
const after1 = await state();
check('the changes are listed, nothing written yet', JSON.stringify(after1) === JSON.stringify(before), JSON.stringify(after1));
const names = changes.map((c) => c.setting).sort().join(',');
check('coaching packages: classes off, class booking off, 1-on-1 booking off — coaches and picking stay',
  names === 'class_booking,classes,pt_booking', JSON.stringify(changes));
await as(AD);
await db.exec(`select apply_gym_styles(array['coaching_packages'])`);
const s1 = await state();
check('applied: classes off, both bookings off, coaches on, members pick', s1.classes === false && s1.class_mode === 'off' && s1.pt_mode === 'off'
  && s1.coaching === true && s1.pick === true, JSON.stringify(s1));
check('…and the style is recorded', JSON.stringify(s1.styles) === '["coaching_packages"]', JSON.stringify(s1.styles));

// 2 — add a class timetable and appointments: booking comes back at the usual defaults.
await as(AD);
await db.exec(`select apply_gym_styles(array['classes', 'pt_appointments', 'coaching_packages'])`);
const s2 = await state();
check('classes back on, class booking instant, 1-on-1 coach approves', s2.classes === true && s2.class_mode === 'instant' && s2.pt_mode === 'coach', JSON.stringify(s2));

// 3 — a customised approval is kept when the style still has that booking.
await as(AD);
await db.exec(`select set_booking_approval('coach_desk', 'desk')`);
await as(AD);
const none = await all(`select setting from gym_style_changes(array['classes', 'pt_appointments', 'coaching_packages'])`);
check('the same styles again change nothing — the owner’s own approvals stay', none.length === 0, JSON.stringify(none));

// 4 — open gym only: everything about booking and coaching goes off.
await as(AD);
await db.exec(`select apply_gym_styles(array['open_gym'])`);
const s4 = await state();
check('open gym: no classes, no coaches, nothing to book', s4.classes === false && s4.coaching === false && s4.class_mode === 'off' && s4.pt_mode === 'off' && s4.pick === false, JSON.stringify(s4));

// 5 — who may, and what is refused.
await as(ST);
check('the front desk cannot change the styles', /Only the gym owner/.test((await tryExec(`select apply_gym_styles(array['classes'])`)) ?? ''));
await as(M);
check('a member cannot even read the changes', !!(await tryExec(`select * from gym_style_changes(array['classes'])`)));
await as(AD);
check('at least one style', /at least one/.test((await tryExec(`select apply_gym_styles(array[]::text[])`)) ?? ''));
check('only known styles', /not one of the gym styles/.test((await tryExec(`select apply_gym_styles(array['karaoke'])`)) ?? ''));
await db.exec(`reset role; set role anon;`);
check('a visitor cannot', !!(await tryExec(`select apply_gym_styles(array['classes'])`)));

// 6 — the activity log says who changed it.
await owner();
check('the change is in the activity log', ((await one(`select count(*)::int n from activity_log where action = 'gym.styles' and gym_id = '${GYM}'`)).n) >= 3);
check('marker', (await one(`select migration_0256_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0256 checks passed');
process.exit(failures ? 1 : 0);
