/**
 * 0272: the Streaks switch, restores, a lapsed membership and a closed week.
 *
 * Ways it could go wrong, each checked:
 *   - a member restoring on the wrong day, more often than their streak allows, or twice;
 *   - a restore adding a week (and so earning a milestone by itself);
 *   - the desk restoring without a reason, past 14 days, or a member/coach posing as the desk;
 *   - an expired membership breaking a streak inside the owner's grace, or never breaking it after;
 *   - a week the whole gym was closed breaking everyone's streak;
 *   - Streaks off still showing a card, paying a milestone, unlocking a badge or nudging;
 *   - a helper or the restore table reachable by the wrong role.
 *
 * "Today" is pinned to Monday 2026-11-23 by redefining manila_today()/manila_week_start().
 *
 *   node <repo>/scripts/sql/streak-restore.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const M = [1, 2, 3, 4, 5, 6, 7].map((i) => `a5200000-0000-4000-8000-00000000000${i}`);
const STAFF = 'a5200000-0000-4000-8000-0000000000a2';
const COACH = 'a5200000-0000-4000-8000-0000000000c1';
const MB = 'b5200000-0000-4000-8000-000000000001';

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
const pin = (day) => db.exec(`
  create or replace function manila_today() returns date language sql stable as $$ select date '${day}' $$;
  create or replace function manila_week_start(p_offset_weeks int default 0) returns date language sql stable as
    $$ select (date_trunc('week', date '${day}')::date + 7 * p_offset_weeks)::date $$;`);

await asOwner();
await pin('2026-11-23');   // a Monday
const person = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@restore-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@restore-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B') on conflict do nothing;
  ${M.map((id, i) => person(id, 'r' + (i + 1))).join('\n')}
  ${person(STAFF, 'rdesk')} ${person(COACH, 'rcoach')} ${person(MB, 'rmb')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ${M.map((id) => `('${GYM_A}', '${id}', 'member', 'active')`).join(', ')},
    ('${GYM_A}', '${STAFF}', 'staff', 'active'), ('${GYM_A}', '${COACH}', 'trainer', 'active'),
    ('${GYM_B}', '${MB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_B}' where id = '${MB}';
  update profiles set active_gym_id = '${GYM_A}' where id in (${[...M, STAFF, COACH].map((x) => `'${x}'`).join(',')});
  insert into member_profiles (profile_id, gym_id, qr_code, created_at) values
    ${M.map((id, i) => `('${id}', '${GYM_A}', 'QR-RS${i}', '2025-01-01')`).join(', ')}, ('${MB}', '${GYM_B}', 'QR-RSB', '2025-01-01')
    on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
// Everyone covered, except m7, whose membership ended three weeks ago (on that week's Sunday).
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ${M.slice(0, 6).map((id) => `('${id}', '${GYM_A}', '${prem}', 'active', date '2025-01-01', date '2027-06-01')`).join(', ')},
  ('${M[6]}', '${GYM_A}', '${prem}', 'expired', date '2025-01-01', manila_week_start(-3) + 6)`);

const checkin = (m, weeksAgo, d, gym = GYM_A) => `insert into attendance (gym_id, member_id, check_in_time)
  values ('${gym}', '${m}', ((manila_week_start(${-weeksAgo}) + ${d}) + time '12:00') at time zone 'Asia/Manila');`;
const hit = (m, weeksAgo, gym) => checkin(m, weeksAgo, 0, gym) + checkin(m, weeksAgo, 2, gym);
const hits = (m, from, to) => Array.from({ length: from - to + 1 }, (_, i) => hit(m, from - i)).join('\n');
const state = async (m, gym = GYM_A) => one(`select * from streak_state('${m}', '${gym}')`);

// m6 keeps the gym open every week, so no week here counts as closed.
await db.exec(hits(M[5], 30, 0));
await db.exec(hits(M[0], 4, 2));          // m1: 3 weeks, missed last week
await db.exec(hits(M[1], 14, 2));         // m2: 13 weeks, missed last week
await db.exec(hits(M[2], 4, 2));          // m3: 3 weeks, missed last week, restore already used
await db.exec(hits(M[3], 5, 2));          // m4: 4 weeks, missed last week (the desk)
await db.exec(hits(M[4], 8, 5));          // m5: missed four weeks ago, nothing since
await db.exec(hits(M[6], 6, 3));          // m7: 4 weeks while a member, then the membership ended

// ---- 1. what broke, and what it allows ---------------------------------------------------
let s = await state(M[0]);
check('a missed week breaks it: current 0, lost 3, last miss = last week',
  s.current_run === 0 && s.lost_run === 3 && new Date(s.last_miss).toISOString().slice(0, 10) === '2026-11-16', JSON.stringify(s));
const allow = await one(`select streak_restore_allowance(11) a, streak_restore_allowance(12) b, streak_restore_allowance(26) c,
  streak_restore_allowance(52) d, streak_restore_allowance(103) e, streak_restore_allowance(104) f, streak_restore_allowance(400) g`);
check('restores a month: 1 / 2 at 12 / 3 at 26 / 4 at 52 / 5 at 104, never more',
  [allow.a, allow.b, allow.c, allow.d, allow.e, allow.f, allow.g].join() === '1,2,3,4,4,5,5', JSON.stringify(allow));

// ---- 2. the Monday nudge, then the member restores ----------------------------------------
await as(STAFF);
const swept = (await db.query(`select * from streak_nudge_sweep()`)).rows;
check('Monday: the sweep tells m1 to restore their 3-week streak',
  swept.some((r) => r.member_id === M[0] && /Restore your 3-week streak/.test(r.title)), JSON.stringify(swept));
check('…and running it again sends nothing new', (await db.query(`select * from streak_nudge_sweep()`)).rows.length === 0);

await as(M[0]);
let card = (await one(`select my_streak() c`)).c;
check('m1\'s card offers the restore: 3 weeks, 1 this month, until today',
  card.restore && card.restore.lost === 3 && card.restore.left === 1 && card.restore.until === '2026-11-23', JSON.stringify(card.restore));
card = (await one(`select restore_my_streak() c`)).c;
check('m1 restores: the streak is 3 again', card.current === 3 && card.best === 3, JSON.stringify({ c: card.current, b: card.best }));
check('…the restored week adds no week (best stays 3, no milestone by itself)', card.best === 3);
check('…and the history draws it restored', card.history.some((w) => w.week === '2026-11-16' && w.state === 'restored'), JSON.stringify(card.history.slice(-3)));
check('a second restore is refused', /no streak to restore/i.test(await tryExec(`select restore_my_streak()`) ?? ''));
await asOwner();
const row = await one(`select kind, restored_by, lost_weeks, reason from streak_restores where member_id = '${M[0]}'`);
check('the restore is recorded: by the member, 3 weeks, no reason needed', row.kind === 'member' && row.restored_by === M[0] && row.lost_weeks === 3 && row.reason === null, JSON.stringify(row));
check('…and it is in the activity log', !!(await one(`select 1 x from activity_log where action = 'streak.restore' and member_id = '${M[0]}'`)));

// m2: 13 weeks → 2 a month; one used already this month → 1 left.
await db.exec(`insert into streak_restores (gym_id, member_id, week, kind, lost_weeks, restored_by)
  values ('${GYM_A}', '${M[1]}', date '2024-01-01', 'member', 1, '${M[1]}'),
         ('${GYM_A}', '${M[2]}', date '2024-01-01', 'member', 1, '${M[2]}')`);
await as(M[1]);
card = (await one(`select my_streak() c`)).c;
check('13 weeks: allowance 2, one used, one left', card.restore?.allowance === 2 && card.restore?.used === 1 && card.restore?.left === 1, JSON.stringify(card.restore));
check('…so it restores', (await one(`select restore_my_streak() c`)).c.current === 13);
await as(M[2]);
check('3 weeks with this month\'s one restore used: refused', /used your restores/i.test(await tryExec(`select restore_my_streak()`) ?? ''));

// ---- 3. after Monday it is gone; the desk has 14 days ---------------------------------------
await asOwner();
await pin('2026-11-24');   // Tuesday
await as(M[3]);
check('Tuesday: the member can no longer restore (m4)', (await one(`select my_streak() c`)).c.restore === null
  && /no streak to restore/i.test(await tryExec(`select restore_my_streak()`) ?? ''));
check('…and the streak has reset to 0', (await one(`select my_streak() c`)).c.current === 0);
check('a member cannot restore for the desk', /Only the desk/.test(await tryExec(`select restore_member_streak('${M[3]}', 'sick')`) ?? ''));
await as(COACH);
check('nor can a coach', /Only the desk/.test(await tryExec(`select restore_member_streak('${M[3]}', 'sick')`) ?? ''));
await as(STAFF);
check('the desk must choose a reason', /Choose a reason/.test(await tryExec(`select restore_member_streak('${M[3]}', null)`) ?? ''));
check('"other" needs words', /Write the reason/.test(await tryExec(`select restore_member_streak('${M[3]}', 'other', '  ')`) ?? ''));
card = (await one(`select restore_member_streak('${M[3]}', 'sick') c`)).c;
check('the desk restores m4 for being sick: 4 weeks again', card.current === 4, JSON.stringify({ c: card.current }));
check('…the card names who restored it and why', card.restores?.[0]?.kind === 'desk' && card.restores[0].reason === 'sick' && /rdesk/.test(card.restores[0].by ?? ''), JSON.stringify(card.restores));
check('a missed week older than 14 days cannot be restored (m5)', /last 14 days/.test(await tryExec(`select restore_member_streak('${M[4]}', 'injury')`) ?? ''));

// A coach of m4 sees the restore, never its reason (health is desk-only).
await asOwner();
const linkErr = await tryExec(`insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by) values ('${GYM_A}', '${M[3]}', '${COACH}', 'pt', 1, 'active', 'included', 'desk')`);
if (linkErr) console.log('coaching link: ' + linkErr);
await as(COACH);
const coachCard = (await one(`select member_streak('${M[3]}') c`)).c;
check('a coach sees the restored week, without the reason or the note',
  coachCard?.restores?.length === 1 && !('reason' in coachCard.restores[0]) && !('note' in coachCard.restores[0]), JSON.stringify(coachCard?.restores));
check('a coach cannot read the restore table directly', (await db.query(`select * from streak_restores`)).rows.length === 0);

// ---- 4. a lapsed membership -------------------------------------------------------------------
await asOwner();
await db.exec(`update gym_settings set streak_grace_weeks = 3 where gym_id = '${GYM_A}'`);
s = await state(M[6]);
check('expired 3 weeks ago, grace 3: the weeks since pause, the streak holds at 4', s.current_run === 4, JSON.stringify(s));
await as(STAFF);
card = (await one(`select member_streak('${M[6]}') c`)).c;
check('…the card says when it ended and the last day to renew', card.lapse?.ended_on === '2026-11-08' && card.lapse?.renew_by === '2026-11-29' && card.lapse?.in_grace === true, JSON.stringify(card.lapse));
check('…and never calls it at risk while it is paused', card.at_risk === false && card.out_of_reach === false);
check('…weeks in the grace are drawn paused', card.history.filter((w) => w.state === 'paused').length === 2, JSON.stringify(card.history.slice(-4)));
await asOwner();
await db.exec(`update gym_settings set streak_grace_weeks = 1 where gym_id = '${GYM_A}'`);
s = await state(M[6]);
check('grace 1: the second week after it ended is a miss, the streak breaks', s.current_run === 0 && s.lost_run === 4, JSON.stringify(s));
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
  values ('${M[6]}', '${GYM_A}', '${prem}', 'active', manila_week_start(-2), date '2027-06-01')`);
s = await state(M[6]);
check('renewed two weeks ago but did not train: that week is a plain miss, not paused', s.current_run === 0, JSON.stringify(s));
await db.exec(`update gym_settings set streak_grace_weeks = 2 where gym_id = '${GYM_A}'`);

// ---- 5. a week the whole gym was closed -------------------------------------------------------
await db.exec(hit(MB, 3, GYM_B) + hit(MB, 1, GYM_B));   // nobody at Gym B checked in two weeks ago
s = await state(MB, GYM_B);
check('a week nobody at the gym checked in pauses the streak: 2 weeks, not 1', s.current_run === 2 && s.last_miss === null, JSON.stringify(s));

// ---- 6. the switch --------------------------------------------------------------------------
await asOwner();
await db.exec(`insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM_A}', 'streaks', false)
  on conflict (gym_id, feature_key) do update set enabled = false`);
await as(M[0]);
check('Streaks off: no card for the member', (await one(`select my_streak() c`)).c === null);
check('…no calendar', (await one(`select my_streak_month(date '2026-11-01') c`)).c === null);
check('…no milestones paid', (await one(`select settle_my_streak() c`)).c.length === 0);
check('…no restore', /switched off/.test(await tryExec(`select restore_my_streak()`) ?? ''));
const stats = await one(`select current_week_streak c, best_week_streak b from member_training_stats('${M[0]}')`);
check('…the streak badges read 0, so none unlock', stats.c === 0 && stats.b === 0, JSON.stringify(stats));
await as(STAFF);
check('…no card for the desk', (await one(`select member_streak('${M[0]}') c`)).c === null);
check('…no nudges', (await db.query(`select * from streak_nudge_sweep()`)).rows.length === 0);
await asOwner();
await db.exec(`update gym_modules set enabled = true where gym_id = '${GYM_A}' and feature_key = 'streaks'`);
await as(M[0]);
check('switched back on: the streak is where it was', (await one(`select my_streak() c`)).c?.current === 3);

// ---- 7. the calendar --------------------------------------------------------------------------
const cal = (await one(`select my_streak_month(date '2026-11-15') c`)).c;
check('the calendar holds the whole month (30 days of November)', cal.month === '2026-11-01' && cal.days.length === 30, JSON.stringify({ m: cal.month, n: cal.days.length }));
check('…marks check-in days', cal.days.find((d) => d.d === '2026-11-02')?.checkin === true && cal.days.find((d) => d.d === '2026-11-03')?.checkin === false);
check('…and every week touching the month, with the restored one drawn restored',
  cal.weeks.length === 6 && cal.weeks.some((w) => w.week === '2026-11-16' && w.state === 'restored') && cal.weeks.some((w) => w.state === 'future'),
  JSON.stringify(cal.weeks));

// ---- 8. who can touch what ----------------------------------------------------------------------
check('a member cannot write a restore', !!(await tryExec(`insert into streak_restores (gym_id, member_id, week, kind, lost_weeks) values ('${GYM_A}', '${M[0]}', date '2026-01-05', 'member', 9)`)));
check('…cannot call the inner helpers', !!(await tryExec(`select streak_state('${M[0]}', '${GYM_A}')`))
  && !!(await tryExec(`select streak_restore_offer('${M[0]}', '${GYM_A}', true)`)) && !!(await tryExec(`select streak_card('${M[0]}', '${GYM_A}')`)));
check('…and sees only their own restores', (await db.query(`select member_id from streak_restores`)).rows.every((r) => r.member_id === M[0]));
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
check('a visitor cannot restore', !!(await tryExec(`select restore_my_streak()`)));
await asOwner();
check('the marker is live', (await one(`select migration_0272_applied() m`)).m === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
