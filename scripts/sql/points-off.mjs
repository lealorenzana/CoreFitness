/**
 * 0253: with the gym's Points switched off, nothing promises or announces points it does not pay;
 * Invite a friend gives the gym's desk reward instead. Also: with Points on, referrals still pay points.
 *
 *   node <repo>/scripts/sql/points-off.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0253 … replays the schema without the fix, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2530000-0000-4000-8000-0000000000${n}`;
const M = id('01'), F1 = id('02'), F2 = id('03'), ST = id('04'), AD = id('05');
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; };
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const lastNote = async (user, type) => (await one(`select title, message from notifications where user_id = '${user}' and type = '${type}' order by created_at desc limit 1`)) ?? {};

await owner();
await db.exec(`
  ${[['pom', M, 'member'], ['pof1', F1, 'member'], ['pof2', F2, 'member'], ['podesk', ST, 'staff'], ['poown', AD, 'admin']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@po-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@po-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  delete from gym_roles where gym_id = '${GYM}' and role = 'admin' and user_id <> '${AD}';
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-PO1'), ('${F1}', '${GYM}', 'QR-PO2'), ('${F2}', '${GYM}', 'QR-PO3') on conflict do nothing;
  select act_as_gym('${GYM}');
  update point_rules set is_active = true, points = greatest(points, 5) where gym_id = '${GYM}' and key in ('personal_record', 'achievement', 'referral', 'referral_welcome');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'PO Premium', 900, 30, 'premium', true, true, true);
  insert into plan_features (plan_id, feature_key, enabled) values ('${id('f1')}', 'points_earn', true), ('${id('f1')}', 'workout_tracker', true)
    on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 30, manila_today() + 30, false),
    ('${F1}', '${GYM}', '${id('f1')}', 'active', manila_today(), manila_today() + 30, false),
    ('${F2}', '${GYM}', '${id('f1')}', 'active', manila_today(), manila_today() + 30, false);
  insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'points', false)
    on conflict (gym_id, feature_key) do update set enabled = false;
  select act_as_gym(null);`);
const ledger = async (rule) => Number((await one(`select coalesce(sum(points), 0)::int p from point_ledger where member_id = '${M}' and rule_key = '${rule}'`)).p);

// ---- a personal record, points OFF ----
const ex = (await one(`select id from exercises limit 1`)).id;
const workout = async (logId, kg) => {
  await as(M);
  await db.exec(`insert into workout_logs (id, gym_id, member_id, activity, performed_on, started_at) values ('${logId}', '${GYM}', '${M}', 'Legs', manila_today(), now() - interval '40 minutes')`);
  for (let i = 1; i <= 3; i++) await db.exec(`insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${logId}', '${ex}', ${i}, 5, ${kg})`);
  await db.exec(`update workout_logs set completed_at = now() where id = '${logId}'`);
  await owner();
};
await workout(id('71'), 40);
await workout(id('72'), 50);
const pr = await one(`select points_awarded from personal_records where member_id = '${M}' and value = 50`);
check('a personal record is still recorded with points off', !!pr, 'no record');
check('…but it stores 0 points, not the rule’s amount', pr?.points_awarded === 0, JSON.stringify(pr));
const prNote = await lastNote(M, 'personal_record');
check('…and its message promises no points', prNote.message && !/point/i.test(prNote.message), prNote.message);

// ---- a badge, points OFF ----
await db.exec(`insert into achievements (gym_id, key, audience, title, description, requirement, icon, tier, category, rule_kind, metric, threshold, points, secret, tell_member, sort_order, active)
  values ('${GYM}', 'po_badge', 'member', 'PO Badge', 'You did it.', 'Given by the gym.', 'Star', 'bronze', 'Test', 'manual', null, null, 40, false, true, 950, true)`);
const ach = { key: 'po_badge' };
await db.exec(`insert into achievement_unlocks (gym_id, user_id, achievement_key) values ('${GYM}', '${M}', '${ach.key}')`);
const badge = await one(`select message from notifications where user_id = '${M}' and title like 'New badge:%' order by created_at desc limit 1`);
check('a badge’s message says no "+N points" with points off', badge && !/point/i.test(badge.message), badge?.message);
check('…and nothing reached the ledger', (await ledger('achievement')) === 0);

// ---- invite a friend, points OFF: the desk reward ----
await as(M);
check('the member’s terms say points are off', (await one(`select my_referral_terms() t`)).t?.points_on === false);
check('a member cannot set the desk rewards', !!(await tryExec(`select set_referral_rewards('x', 'y')`)));
await as(AD);
check('the owner sets the desk rewards', (await tryExec(`select set_referral_rewards('1 free day pass', '₱100 off your first renewal')`)) === null);
await owner();
await db.exec(`insert into referrals (gym_id, referrer_id, referred_id, code, status) values ('${GYM}', '${M}', '${F1}', 'ABCDEF', 'pending');
  insert into payments (member_id, gym_id, amount, method, status, paid_on) values ('${F1}', '${GYM}', 900, 'cash', 'completed', manila_today());`);
const ref = await one(`select status, referrer_points, desk_reward_referrer, desk_reward_friend from referrals where referred_id = '${F1}'`);
check('the friend’s first payment rewards the referral', ref.status === 'rewarded', JSON.stringify(ref));
check('…with the gym’s desk rewards, no points', ref.referrer_points === 0 && ref.desk_reward_referrer === '1 free day pass' && ref.desk_reward_friend === '₱100 off your first renewal', JSON.stringify(ref));
const rn = await lastNote(M, 'referral'); const fn = await lastNote(F1, 'referral');
check('the inviter is told the desk reward, no points', /1 free day pass/.test(rn.message ?? '') && !/point/i.test(rn.message ?? ''), rn.message);
check('the friend is told theirs', /₱100 off your first renewal/.test(fn.message ?? '') && !/point/i.test(fn.message ?? ''), fn.message);
await as(M);
const mine = await one(`select desk_reward, desk_given_at from my_referrals() limit 1`);
check('the member sees the reward waiting at the desk', mine?.desk_reward === '1 free day pass' && mine.desk_given_at === null, JSON.stringify(mine));
check('a member cannot mark it given', !!(await tryExec(`select give_referral_reward((select id from referrals where referred_id = '${F1}'), 'referrer')`)));
await as(ST);
const rid = (await one(`select id from gym_referrals() where friend_name like 'pof1%'`))?.id;
check('the desk sees it in gym_referrals', !!rid);
check('the desk marks the inviter’s reward given', (await tryExec(`select give_referral_reward('${rid}', 'referrer')`)) === null);
await as(M);
check('…and the member sees it given', (await one(`select desk_given_at from my_referrals() limit 1`))?.desk_given_at !== null);

// ---- points ON again: points as before, no desk reward ----
await owner();
await db.exec(`update gym_modules set enabled = true where gym_id = '${GYM}' and feature_key = 'points';
  insert into referrals (gym_id, referrer_id, referred_id, code, status) values ('${GYM}', '${M}', '${F2}', 'ABCDEF', 'pending');
  insert into payments (member_id, gym_id, amount, method, status, paid_on) values ('${F2}', '${GYM}', 900, 'cash', 'completed', manila_today());`);
const ref2 = await one(`select referrer_points, desk_reward_referrer from referrals where referred_id = '${F2}'`);
check('with points on, the inviter earns points and no desk reward', ref2.referrer_points > 0 && ref2.desk_reward_referrer === null, JSON.stringify(ref2));
check('…and the points landed in the ledger', (await ledger('referral')) === ref2.referrer_points, String(await ledger('referral')));

await owner();
check('the helpers are closed to visitors', !(await one(`select has_function_privilege('anon', 'give_referral_reward(uuid, text)', 'execute') or has_function_privilege('anon', 'gym_points_on(uuid)', 'execute') x`)).x);
check('marker', (await one(`select migration_0253_applied() ok`).catch(() => ({ ok: false }))).ok === true);
// 0255: Invite a friend's own description (shown on What you run) no longer promises points only.
const desc = (await one(`select description d from platform_features where key = 'referrals'`))?.d ?? '';
check('Invite a friend is described with the desk reward too (0255)', /desk reward/.test(desc) && !/both earn points/.test(desc), desc);
console.log(failures ? `\n${failures} FAILED` : '\nall 0253 checks passed');
process.exit(failures ? 1 : 0);
