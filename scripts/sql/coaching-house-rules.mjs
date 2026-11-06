/**
 * 0235: coaching house rules — does coaching pause when the membership
 * freezes (never / with the membership / the coach decides), the gym's cut of
 * what members pay coaches directly, and coach dues. Who may set, see and
 * record each; the trigger that pauses and credits back; the sweep that holds
 * a paused term still.
 *
 *   node <repo>/scripts/sql/coaching-house-rules.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2350000-0000-4000-8000-0000000000${n}`;
const A = id('0a'), B = id('0b'), C = id('0c'), D = id('0d');
const T = id('1a'), T2 = id('1b'), AD = id('2a'), ST = id('2b');
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
const PLAN = id('f1');
const MS = { A: id('5a'), B: id('5b'), C: id('5c'), D: id('5d') };
const CO = { A: id('6a'), B: id('6b'), C: id('6c'), D: id('6d') };

await owner();
await db.exec(`
  ${[['a', A, 'member'], ['b', B, 'member'], ['c', C, 'member'], ['d', D, 'member'],
     ['rae', T, 'trainer'], ['ben', T2, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@rules-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@rules-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength'), ('${T2}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${A}', '${GYM}', 'QR-HA'), ('${B}', '${GYM}', 'QR-HB'), ('${C}', '${GYM}', 'QR-HC'), ('${D}', '${GYM}', 'QR-HD') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${PLAN}', '${GYM}', 'With coach', 900, 30, 'premium', true, true, true);
  insert into memberships (id, member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ${Object.entries(MS).map(([k, m]) => `('${m}', '${({ A, B, C, D })[k]}', '${GYM}', '${PLAN}', 'active', manila_today() - 1, manila_today() + 30)`).join(',\n    ')};
  -- Each member on a package with Rae, paid to Rae directly; D's is with Ben.
  insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, price, paid_at, starts_on, ends_on, started_by) values
    ('${CO.A}', '${GYM}', '${A}', '${T}', 'pt', 1, 'active', 'trainer_direct', 3000, now(), manila_today() - 20, manila_today() + 10, 'member'),
    ('${CO.B}', '${GYM}', '${B}', '${T}', 'pt', 1, 'active', 'trainer_direct', 2000, now(), manila_today() - 25, manila_today() + 2, 'member'),
    ('${CO.C}', '${GYM}', '${C}', '${T}', 'pt', 1, 'active', 'trainer_direct', 1000, now(), manila_today() - 20, manila_today() + 10, 'member'),
    ('${CO.D}', '${GYM}', '${D}', '${T2}', 'pt', 1, 'active', 'trainer_direct', 4000, now(), manila_today() - 20, manila_today() + 10, 'member');`);

const freeze = async (m, daysAgo = 0) => { await owner(); await db.exec(`update memberships set status = 'frozen', frozen_at = manila_today() - ${daysAgo} where id = '${m}'`); };
const unfreeze = async (m) => { await owner(); await db.exec(`update memberships set status = 'active', frozen_at = null where id = '${m}'`); };
const endsIn = async (c) => { await owner(); return (await one(`select ends_on - manila_today() d from coachings where id = '${c}'`)).d; };
const setRules = (pause, cutOn, cut, duesOn, dues) => `select set_coaching_house_rules('${pause}', ${cutOn}, ${cut}, ${duesOn}, ${dues})`;

// ---- defaults: nothing changes until the owner says so ----
await as(AD);
let r = await one(`select * from coaching_house_rules()`);
check('a gym that chose nothing: coaching never pauses, no share, no dues',
  r.pause === 'never' && r.cut_on === false && r.dues_on === false, JSON.stringify(r));
await as(A);
r = await one(`select * from coaching_house_rules()`);
check('a member reads the pause rule but not the money (share and dues are null)',
  r.pause === 'never' && r.cut_on === null && r.cut_percent === null && r.dues_on === null && r.dues_amount === null, JSON.stringify(r));

// ---- who may set them ----
for (const [who, uid] of [['the desk', ST], ['a coach', T], ['a member', A]]) {
  await as(uid);
  check(`${who} cannot change the rules`, /Only the gym owner/.test((await tryExec(setRules('with_membership', false, 0, false, 0))) ?? ''));
}
await db.exec(`reset role; set role anon;`);
check('a visitor cannot change the rules', !!(await tryExec(setRules('never', false, 0, false, 0))));
await as(AD);
check('a made-up pause rule is refused, in words', /Choose never, with the membership/.test((await tryExec(setRules('sometimes', false, 0, false, 0))) ?? ''));
check('a share switched on needs a percent (0.1–50)', /0.1 to 50/.test((await tryExec(setRules('never', true, 0, false, 0))) ?? ''));
check('a share over 50% is refused', /0.1 to 50/.test((await tryExec(setRules('never', true, 60, false, 0))) ?? ''));
check('dues switched on need an amount', /above zero/.test((await tryExec(setRules('never', false, 0, true, 0))) ?? ''));

// ---- 1a. never: a freeze leaves coaching alone (today's behaviour) ----
await freeze(MS.A);
await owner();
check('never: freezing opens no pause', !(await one(`select 1 x from coaching_pauses where coaching_id = '${CO.A}'`)));
await unfreeze(MS.A);
check("never: unfreezing doesn't move the coaching's end", (await endsIn(CO.A)) === 10, String(await endsIn(CO.A)));

// ---- 1b. with the membership ----
await as(AD);
await db.exec(setRules('with_membership', false, 0, false, 0));
await freeze(MS.B, 5); // frozen five days ago
await owner();
r = await one(`select decision, frozen_on = manila_today() - 5 f from coaching_pauses where coaching_id = '${CO.B}'`);
check('with the membership: freezing pauses the coaching at once', r?.decision === 'pause' && r?.f, JSON.stringify(r));
check('…and the member is told', !!(await one(`select 1 x from notifications where user_id = '${B}' and title = 'Your coaching is paused too'`)));
// Its end date falls inside the freeze: the sweep must not end it or remind about it.
await db.exec(`update coachings set ends_on = manila_today(), reminded_at = null where id = '${CO.B}'`);
await as(B);
await db.exec(`select coaching_sweep()`);
await owner();
check('a paused term is not ended by the sweep, even past its date', (await one(`select status from coachings where id = '${CO.B}'`)).status === 'active');
check('…and gets no "ends soon" reminder', !(await one(`select 1 x from notifications where user_id = '${B}' and title = 'Your coaching ends soon'`)));
await unfreeze(MS.B);
r = await one(`select resumed_on = manila_today() back, days_credited from coaching_pauses where coaching_id = '${CO.B}'`);
check('unfreezing closes the pause and credits the 5 days frozen', r.back && r.days_credited === 5, JSON.stringify(r));
check("…the coaching's end moves by those 5 days", (await endsIn(CO.B)) === 5, String(await endsIn(CO.B)));

// ---- 1c. the coach decides ----
await as(AD);
await db.exec(setRules('coach_decides', false, 0, false, 0));
await freeze(MS.C, 3);
await owner();
const pc = (await one(`select id, decision from coaching_pauses where coaching_id = '${CO.C}'`));
check('the coach decides: freezing opens a pause that waits for the coach', pc?.decision === 'pending', JSON.stringify(pc));
check('…and the coach is asked', !!(await one(`select 1 x from notifications where user_id = '${T}' and title = 'Pause their coaching?'`)));
await as(T2);
check('another coach cannot decide it', /Only their coach or the gym owner/.test((await tryExec(`select decide_coaching_pause('${pc.id}', true)`)) ?? ''));
await as(C);
check('the member cannot decide it', /Only their coach or the gym owner/.test((await tryExec(`select decide_coaching_pause('${pc.id}', true)`)) ?? ''));
await as(T);
r = await all(`select * from my_coaching_pauses()`);
check('the coach sees the pause waiting for them', r.some((x) => x.id === pc.id && x.decision === 'pending'), JSON.stringify(r));
await db.exec(`select decide_coaching_pause('${pc.id}', true)`);
check('a decided pause cannot be decided again', /already decided/.test((await tryExec(`select decide_coaching_pause('${pc.id}', false)`)) ?? ''));
await owner();
check('the member is told the coach paused it', !!(await one(`select 1 x from notifications where user_id = '${C}' and title = 'Your coaching is paused too'`)));
await unfreeze(MS.C);
check('the coach said pause: unfreezing credits the 3 days', (await endsIn(CO.C)) === 13, String(await endsIn(CO.C)));
// A coach who never answered: the pause counts as keep, no days.
await freeze(MS.D, 4);
await unfreeze(MS.D);
await owner();
r = await one(`select decision, days_credited from coaching_pauses where coaching_id = '${CO.D}'`);
check('a coach who never answered: it counts as keep, and no days are credited', r.decision === 'keep' && r.days_credited === 0, JSON.stringify(r));
check("…the coaching's end stays put", (await endsIn(CO.D)) === 10, String(await endsIn(CO.D)));
await as(T);
check("Rae does not see Ben's trainee's pause", !(await all(`select * from my_coaching_pauses()`)).some((x) => x.coaching_id === CO.D));

// ---- 2. the gym's cut ----
await as(T);
check('share switched off: coaches see no earnings rows', (await all(`select * from coach_earnings()`)).length === 0);
await as(AD);
await db.exec(setRules('never', true, 5, false, 0));
await as(T);
let e = await all(`select * from coach_earnings() where month = date_trunc('month', manila_today())::date`);
check("a coach sees only their own months", e.length === 1 && e[0].trainer_id === T, JSON.stringify(e));
check('…paid ₱6,000 for 3 packages this month, the gym\'s 5% is ₱300, not settled',
  Number(e[0].paid_total) === 6000 && e[0].packages === 3 && Number(e[0].owed) === 300 && e[0].settled === false, JSON.stringify(e[0]));
await as(ST);
e = await all(`select * from coach_earnings() where month = date_trunc('month', manila_today())::date order by trainer_name`);
check('the desk sees every coach', e.length === 2 && e.some((x) => x.trainer_id === T2 && Number(x.owed) === 200), JSON.stringify(e));
await as(A);
check('a member cannot read coaching earnings', /Only coaches and the front desk/.test((await tryExec(`select * from coach_earnings()`)) ?? ''));
await as(T);
check('a coach cannot mark their own share paid', /front desk records/.test((await tryExec(`select settle_coach_cut('${T}', manila_today())`)) ?? ''));
await as(ST);
await db.exec(`select settle_coach_cut('${T}', manila_today())`);
check('a month is marked paid once', /already marked paid/.test((await tryExec(`select settle_coach_cut('${T}', manila_today())`)) ?? ''));
check('a month that has not happened cannot be settled', /not happened yet/.test((await tryExec(`select settle_coach_cut('${T}', (manila_today() + interval '2 months')::date)`)) ?? ''));
await as(AD);
await db.exec(setRules('never', true, 10, false, 0));
await as(T);
e = await all(`select * from coach_earnings() where month = date_trunc('month', manila_today())::date`);
check('a settled month keeps what was settled when the percent changes later (₱300 at 5%)',
  e[0].settled === true && Number(e[0].owed) === 300 && Number(e[0].percent) === 5, JSON.stringify(e[0]));
await as(ST);
check('the desk cannot undo a settled month', /Only the gym owner/.test((await tryExec(`select unsettle_coach_cut('${T}', manila_today())`)) ?? ''));
await as(AD);
check('the owner can', (await tryExec(`select unsettle_coach_cut('${T}', manila_today())`)) === null);

// ---- 3. coach dues ----
await as(ST);
check('dues switched off: nothing to record', /does not charge coach dues/.test((await tryExec(`select record_coach_dues('${T}', manila_today(), 500, 'cash')`)) ?? ''));
await as(AD);
await db.exec(setRules('never', false, 0, true, 500));
await as(ST);
let d = await all(`select * from coach_dues() order by trainer_name`);
check('dues switched on: both coaches owe ₱500 this month, nothing paid yet',
  d.length === 2 && d.every((x) => Number(x.due) === 500 && x.paid === null), JSON.stringify(d));
check('months before dues were switched on are not owed', /Dues start in/.test((await tryExec(`select record_coach_dues('${T}', (manila_today() - interval '1 month')::date, 500, 'cash')`)) ?? ''));
await as(T);
check('a coach cannot record their own dues', /front desk records/.test((await tryExec(`select record_coach_dues('${T}', manila_today(), 500, 'cash')`)) ?? ''));
check('a coach sees only their own dues', (await all(`select * from coach_dues()`)).every((x) => x.trainer_id === T));
await as(A);
check('a member cannot read coach dues', /Only coaches and the front desk/.test((await tryExec(`select * from coach_dues()`)) ?? ''));
await as(ST);
check('only a coach here can be recorded', /not a coach here/.test((await tryExec(`select record_coach_dues('${A}', manila_today(), 500, 'cash')`)) ?? ''));
check('a made-up way of paying is refused', /how it was paid/.test((await tryExec(`select record_coach_dues('${T}', manila_today(), 500, 'barter')`)) ?? ''));
await db.exec(`select record_coach_dues('${T}', manila_today(), 500, 'gcash', 'Paid at the desk')`);
check('a month is recorded once', /already recorded/.test((await tryExec(`select record_coach_dues('${T}', manila_today(), 500, 'cash')`)) ?? ''));
d = await all(`select * from coach_dues() where trainer_id = '${T}'`);
check("the desk sees Rae's month paid, by GCash", Number(d[0].paid) === 500 && d[0].method === 'gcash', JSON.stringify(d));
check('the desk cannot undo it', /Only the gym owner/.test((await tryExec(`select undo_coach_dues('${T}', manila_today())`)) ?? ''));
await as(AD);
check('the owner can', (await tryExec(`select undo_coach_dues('${T}', manila_today())`)) === null);

// ---- no back doors ----
await as(T);
check('a coach cannot write a settlement row directly', (await tryExec(`insert into coach_cut_settlements (gym_id, trainer_id, month, paid_total, percent, amount) values ('${GYM}', '${T}', date_trunc('month', manila_today())::date, 0, 0, 0)`)) !== null);
check('a coach cannot write a dues row directly', (await tryExec(`insert into coach_dues_payments (gym_id, trainer_id, month, amount, method) values ('${GYM}', '${T}', date_trunc('month', manila_today())::date, 1, 'cash')`)) !== null);
check('a coach cannot open or close a pause directly', (await tryExec(`update coaching_pauses set decision = 'pause'`)) !== null
  || (await (async () => { await owner(); return (await one(`select count(*)::int n from coaching_pauses where decision = 'pause' and coaching_id = '${CO.D}'`)).n === 0; })()));
await db.exec(`reset role; set role anon;`);
check('the probe marker answers a visitor', (await one(`select migration_0235_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
