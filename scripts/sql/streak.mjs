/**
 * 0151: the gym streak.
 *
 * Ways it could go wrong, each checked:
 *   - counting differently from the badges (two definitions of one streak);
 *   - a week still in progress breaking a streak, or a frozen week breaking it;
 *   - a target outside 2–5, or a member setting someone else's;
 *   - a streak card readable by a stranger, another member, or a coach who does
 *     not train them;
 *   - a milestone paid twice; a nudge sent twice, sent when not at risk, or sent
 *     to someone who switched it off.
 *
 *   node <repo>/scripts/sql/streak.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const M = [1, 2, 3, 4, 5, 6].map((i) => `a5100000-0000-4000-8000-00000000000${i}`);
const ADMIN = 'a5100000-0000-4000-8000-0000000000a1';
const STAFF = 'a5100000-0000-4000-8000-0000000000a2';
const COACH = 'a5100000-0000-4000-8000-0000000000c1';
const MB = 'b5100000-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await asOwner();
const person = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@streak-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@streak-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B') on conflict do nothing;
  ${M.map((id, i) => person(id, 'm' + (i + 1))).join('\n')}
  ${person(ADMIN, 'owner')} ${person(STAFF, 'desk')} ${person(COACH, 'coach')} ${person(MB, 'mb')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ${M.map((id) => `('${GYM_A}', '${id}', 'member', 'active')`).join(', ')},
    ('${GYM_A}', '${ADMIN}', 'admin', 'active'), ('${GYM_A}', '${STAFF}', 'staff', 'active'),
    ('${GYM_A}', '${COACH}', 'trainer', 'active'), ('${GYM_B}', '${MB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_B}' where id = '${MB}';
  update profiles set active_gym_id = '${GYM_A}' where id in (${[...M, ADMIN, STAFF, COACH].map((x) => `'${x}'`).join(',')});
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ${M.map((id, i) => `('${id}', '${GYM_A}', 'QR-ST${i}')`).join(', ')}, ('${MB}', '${GYM_B}', 'QR-STB')
    on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ${M.map((id) => `('${id}', '${GYM_A}', '${prem}', 'active', current_date - 400, current_date + 29)`).join(', ')}`);

/** A training day `weeksAgo` weeks back (0 = this week), on weekday `d` (0 = Monday), as a check-in or a workout. */
const dayOf = (weeksAgo, d) => `(manila_week_start(${-weeksAgo}) + ${d})`;
const checkin = (m, weeksAgo, d) => `insert into attendance (gym_id, member_id, check_in_time)
  values ('${GYM_A}', '${m}', (${dayOf(weeksAgo, d)} + time '12:00') at time zone 'Asia/Manila');`;
const workout = (m, weeksAgo, d) => `insert into workout_logs (gym_id, member_id, activity, performed_on)
  values ('${GYM_A}', '${m}', 'Run', ${dayOf(weeksAgo, d)});`;
const streakOf = async (m) => (await one(`select * from streak_weeks('${m}', '${GYM_A}')`));

// ---- 1. the count -------------------------------------------------------------------------
await asOwner();
// m1: the last three weeks at two days each — one a check-in, one a workout — and nothing yet this week.
await db.exec([3, 2, 1].map((w) => checkin(M[0], w, 0) + workout(M[0], w, 2)).join('\n'));
let s = await streakOf(M[0]);
check('two days a week for three weeks: a 3-week streak (default target 2)', s.current_run === 3 && s.best_run === 3 && s.target === 2, JSON.stringify(s));
check('a check-in and a logged workout both count as training days', s.current_run === 3);
check('this week, not reached yet, does not break it', s.current_run === 3);
await db.exec(checkin(M[0], 0, 0) + workout(M[0], 0, 1));
s = await streakOf(M[0]);
check('reaching this week makes it 4', s.current_run === 4 && s.best_run === 4, JSON.stringify(s));
await db.exec(checkin(M[0], 0, 3));
s = await streakOf(M[0]);
check('two visits on one day count once (a training day is a day)', (await one(`select training_days_between('${M[0]}', '${GYM_A}', manila_week_start(), manila_week_start() + 6) as n`)).n === 3);

// m2: a missed week breaks the current run but not the best.
await db.exec([5, 4, 2, 1].map((w) => checkin(M[1], w, 0) + checkin(M[1], w, 3)).join('\n'));
s = await streakOf(M[1]);
check('a missed week breaks it: current 2, best 2', s.current_run === 2 && s.best_run === 2, JSON.stringify(s));
await db.exec(checkin(M[1], 3, 1));
s = await streakOf(M[1]);
check('one day in a week is not the target of two', s.current_run === 2, JSON.stringify(s));

// m3: a frozen week neither counts nor breaks.
await db.exec([3, 1].map((w) => checkin(M[2], w, 0) + checkin(M[2], w, 4)).join('\n'));
s = await streakOf(M[2]);
check('before the freeze is recorded, the empty week breaks it', s.current_run === 1, JSON.stringify(s));
const ms3 = (await one(`select id from memberships where member_id = '${M[2]}'`)).id;
const ev = async (kind, at) => {
  const id = (await one(`insert into membership_events (gym_id, membership_id, member_id, kind, reason)
    values ('${GYM_A}', '${ms3}', '${M[2]}', '${kind}', ${kind === 'unfreeze' ? 'null' : "'Travelling'"}) returning id`)).id;
  await db.exec(`update membership_events set created_at = (${at} + time '09:00') at time zone 'Asia/Manila' where id = '${id}'`);
};
await ev('freeze', dayOf(2, 0));
await ev('unfreeze', dayOf(2, 6));
await db.exec(`update memberships set status = 'active' where id = '${ms3}'`);
s = await streakOf(M[2]);
check('a frozen week is skipped: the streak is 2, not 1', s.current_run === 2 && s.best_run === 2, JSON.stringify(s));

// ---- 2. the badges read the same number ---------------------------------------------------
await as(M[0]);
const stats = await one(`select current_week_streak, best_week_streak from member_training_stats('${M[0]}')`);
check('member_training_stats (the badges) reads the same streak', stats.current_week_streak === 4 && stats.best_week_streak === 4, JSON.stringify(stats));

// ---- 3. the member's own target -----------------------------------------------------------
await as(M[3]);
check('a target of 1 is refused', /2 to 5/.test(await tryExec(`select set_streak_target(1)`) ?? ''));
check('a target of 6 is refused', /2 to 5/.test(await tryExec(`select set_streak_target(6)`) ?? ''));
check('a target of 3 is accepted', !(await tryExec(`select set_streak_target(3)`)));
await asOwner();
check('it is stored on their own row only', (await one(`select streak_target from member_profiles where profile_id = '${M[3]}' and gym_id = '${GYM_A}'`)).streak_target === 3
  && (await one(`select streak_target from member_profiles where profile_id = '${M[0]}' and gym_id = '${GYM_A}'`)).streak_target === 2);
await db.exec([2, 1].map((w) => checkin(M[3], w, 0) + checkin(M[3], w, 2)).join('\n'));
s = await streakOf(M[3]);
check('with a target of 3, two days a week is not a streak', s.current_run === 0 && s.target === 3, JSON.stringify(s));
await db.exec([2, 1].map((w) => workout(M[3], w, 4)).join('\n'));
s = await streakOf(M[3]);
check('three days a week is', s.current_run === 2, JSON.stringify(s));
await as(MB);
await tryExec(`select set_streak_target(4)`);
await asOwner();
check("a member of another gym sets only their own gym's row, never this gym's",
  (await one(`select count(*)::int as n from member_profiles where gym_id = '${GYM_A}' and streak_target = 4`)).n === 0);

// ---- 4. who can see a streak --------------------------------------------------------------
await as(M[0]);
const card = (await one(`select my_streak() as c`)).c;
check('my_streak: a card with the target, the run and seven days', card && card.current === 4 && card.target === 2 && Array.isArray(card.week) && card.week.length === 7, JSON.stringify(card));
check("…this week's days marked on the right days", card.week[0] === true && card.week[1] === true && card.week[3] === true && card.week[2] === false);
check('…3 training days this week, none needed', card.days_this_week === 3 && card.needed === 0 && card.at_risk === false);
check('…the next milestone is 12 weeks', card.next_milestone === 12, card.next_milestone);
check('a member cannot read another member\'s streak', !!(await tryExec(`select member_streak('${M[1]}')`)));
await as(STAFF);
check('the desk can', (await one(`select member_streak('${M[1]}') as c`)).c?.current === 2);
await as(COACH);
check('a coach who does not train them cannot', !!(await tryExec(`select member_streak('${M[1]}')`)));
await as(MB);
check('a member of another gym gets no card for this gym', (await one(`select my_streak() as c`)).c === null || (await one(`select my_streak() as c`)).c.current === 0);
await asOwner();
check('nobody can call the inner helpers directly', !(await one(`select has_function_privilege('authenticated', 'streak_card(uuid,uuid)', 'execute') as x`)).x
  && !(await one(`select has_function_privilege('authenticated', 'streak_weeks(uuid,uuid)', 'execute') as x`)).x);

// ---- 5. milestones pay once ---------------------------------------------------------------
await as(M[0]);
const first = (await one(`select settle_my_streak() as m`)).m;
check('a 4-week best pays the 4-week milestone', JSON.stringify(first) === '[4]', JSON.stringify(first));
const again = (await one(`select settle_my_streak() as m`)).m;
check('settling again pays nothing more', JSON.stringify(again) === '[]', JSON.stringify(again));
await asOwner();
check('one ledger row, for the gym\'s streak_milestone points', (await one(`select count(*)::int as n, max(points) as p from point_ledger
   where member_id = '${M[0]}' and rule_key = 'streak_milestone'`)).n === 1);
check('a member cannot write a milestone themselves', (await (async () => { await as(M[1]);
  return !!(await tryExec(`insert into streak_milestones (gym_id, member_id, weeks) values ('${GYM_A}', '${M[1]}', 52)`)); })()));
await asOwner();
check('badges at 26 and 52 weeks exist alongside 4 and 12', (await one(`select count(*)::int as n from achievements
   where gym_id = '${GYM_A}' and key in ('streak_4', 'streak_12', 'streak_26', 'streak_52') and metric = 'best_week_streak'`)).n === 4);

// ---- 6. the nudge -------------------------------------------------------------------------
// m5 aims for 5 days. Weeks 2 and 1 reached; this week has exactly enough days left to keep it,
// when that is possible today (days left ≤ 5); otherwise nobody is at risk and nobody is told.
await as(M[4]);
await db.exec(`select set_streak_target(5)`);
await asOwner();
await db.exec([2, 1].map((w) => [0, 1, 2, 3, 4].map((d) => checkin(M[4], w, d)).join('\n')).join('\n'));
const left = (await one(`select (manila_week_start() + 6) - (now() at time zone 'Asia/Manila')::date + 1 as n`)).n;
const have = Math.max(0, 5 - left);
for (let d = 0; d < have; d++) await db.exec(checkin(M[4], 0, d));
await as(M[4]);
const c5 = (await one(`select my_streak() as c`)).c;
check(`the card agrees on what is needed (${left} days left)`, c5.needed === 5 - Math.min(have, 5) && c5.days_left === left, JSON.stringify(c5));
// m6 is also at risk the same way, but switched the nudge off.
await as(M[5]);
await db.exec(`select set_streak_target(5, false)`);
await asOwner();
await db.exec([1].map((w) => [0, 1, 2, 3, 4].map((d) => checkin(M[5], w, d)).join('\n')).join('\n'));
for (let d = 0; d < have; d++) await db.exec(checkin(M[5], 0, d));

await as(M[0]);
check('a member cannot run the sweep', ((await db.query(`select * from streak_nudge_sweep()`)).rows.length) === 0);
await as(STAFF);
const sent = (await db.query(`select * from streak_nudge_sweep()`)).rows;
const toM5 = sent.filter((r) => r.member_id === M[4]);
check(c5.at_risk ? 'at risk: the member is nudged once, with their streak in the title' : 'not at risk today: nobody is nudged',
  c5.at_risk ? toM5.length === 1 && /Keep your 2-week streak/.test(toM5[0].title) : toM5.length === 0, JSON.stringify(sent));
check('a member who switched the nudge off is not nudged', !sent.some((r) => r.member_id === M[5]));
check('a member whose week is already out of reach, or already reached, is not nudged', !sent.some((r) => r.member_id === M[0] || r.member_id === M[1]), JSON.stringify(sent));
const twice = (await db.query(`select * from streak_nudge_sweep()`)).rows;
check('running the sweep again sends nothing new', twice.length === 0, JSON.stringify(twice));
await asOwner();
check('the notification row exists exactly once per nudge', (await one(`select count(*)::int as n from notifications
   where user_id = '${M[4]}' and metadata->>'dedupe' like 'streak:%'`)).n === (c5.at_risk ? 1 : 0));

// ---- 7. a gym that switched Progress off -------------------------------------------------
await asOwner();
await db.exec(`insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM_A}', 'progress', false)
  on conflict (gym_id, feature_key) do update set enabled = false`);
await as(M[0]);
check('Progress switched off: no card', (await one(`select my_streak() as c`)).c === null);
await as(STAFF);
check('…and no nudges', (await db.query(`select * from streak_nudge_sweep()`)).rows.length === 0);
await asOwner();
await db.exec(`update gym_modules set enabled = true where gym_id = '${GYM_A}' and feature_key = 'progress'`);

// ---- 7b. the last twelve weeks (0152) ---------------------------------------------------
await as(STAFF);
const h1 = (await one(`select member_streak('${M[0]}') as c`)).c.history;
check('history: twelve weeks, oldest first', Array.isArray(h1) && h1.length === 12 && h1[0].week < h1[11].week, JSON.stringify(h1?.length));
check("…m1's last four weeks are reached, this week included", h1.slice(-4).every((w) => w.state === 'hit'), JSON.stringify(h1.slice(-4)));
const h2 = (await one(`select member_streak('${M[1]}') as c`)).c.history;
check("…m2's gap three weeks ago is a miss, this week still in progress", h2[8].state === 'miss' && h2[11].state === 'current', JSON.stringify(h2.slice(-5)));
const h3 = (await one(`select member_streak('${M[2]}') as c`)).c.history;
check("…m3's frozen week is drawn frozen, not missed", h3[9].state === 'frozen' && h3[10].state === 'hit' && h3[8].state === 'hit', JSON.stringify(h3.slice(-4)));
check('…each week carries its training days', h1[11].days === 3 && h3[9].days === 0, JSON.stringify([h1[11], h3[9]]));
await asOwner();
const report52 = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0152.sql`, 'utf8'))) ?? '';
check('verify0152 reports every line OK', /REPORT 0152/.test(report52) && !/NOT OK/.test(report52), report52);

// ---- 8. tenancy and the paste-after verification -----------------------------------------
check('streak_milestones is on the tenancy list', (await one(`select 'streak_milestones' = any(tenancy_gym_tables()) as x`)).x);
const report = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0151.sql`, 'utf8'))) ?? '';
check('verify0151 reports every line OK', /REPORT 0151/.test(report) && !/NOT OK/.test(report), report);

console.log(failures ? `\n${failures} FAILED` : '\nall 0151 checks passed');
process.exit(failures ? 1 : 0);
