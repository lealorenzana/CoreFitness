/**
 * The security checklist, as attacks (2026-10-18). There is no API server here —
 * the browser talks to Supabase with the public anon key — so the database is
 * the only guard, and "the AI says it is protected" is not evidence. Each check
 * below is a real attempt, made as a real `anon` / `authenticated` role, and it
 * passes only when the attempt FAILS (an error, zero rows, or the value forced back).
 *
 *   node <repo>/scripts/sql/security-red-team.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'OPEN'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const root = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GB = 'b0000000-0000-4000-8000-0000000000bb';
const M = 'e1000000-0000-4000-8000-000000000001';    // a member of Gym #1
const M2 = 'e1000000-0000-4000-8000-000000000002';   // another member there
const T = 'e1000000-0000-4000-8000-000000000003';    // a coach there
const MB = 'e1000000-0000-4000-8000-000000000004';   // a member of another gym
const person = (id, email, role, gym) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}') on conflict do nothing;
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${id}', 'X', 'Y', '${email}', 'active', '${role}', '${gym}')
    on conflict (id) do update set status = 'active', role = excluded.role, active_gym_id = excluded.active_gym_id;
  insert into gym_roles (gym_id, user_id, role, status) values ('${gym}', '${id}', '${role}', 'active') on conflict (gym_id, user_id) do update set role = excluded.role;`;

await root();
await db.exec(`
  insert into gyms (id, slug, name) values ('${GB}', 'other-gym', 'Other Gym') on conflict do nothing;
  ${person(M, 'm@red.test', 'member', GYM)}
  ${person(M2, 'm2@red.test', 'member', GYM)}
  ${person(T, 't@red.test', 'trainer', GYM)}
  ${person(MB, 'mb@red.test', 'member', GB)}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-M'), ('${M2}', '${GYM}', 'QR-M2'), ('${MB}', '${GB}', 'QR-MB') on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${T}', '${GYM}') on conflict do nothing;`);
const plan = (await one(`select id from membership_plans where gym_id = '${GYM}' and is_active and price > 0 and can_book_classes order by price desc limit 1`)).id;
await db.exec(`
  insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date) values
    ('${GYM}', '${M}', '${plan}', 'active', current_date - 3, current_date + 27), ('${GYM}', '${M2}', '${plan}', 'active', current_date - 3, current_date + 27);
  insert into classes (id, gym_id, name, trainer_id, level, capacity, scheduled_at, duration_minutes)
    values ('e1000000-0000-4000-8000-0000000000c1', '${GYM}', 'HIIT', '${T}', 'beginner', 10, now() + interval '2 days', 45);`);
await db.exec(`insert into rewards (id, gym_id, name, cost_points, stock, is_active) values ('e1000000-0000-4000-8000-0000000000a1', '${GYM}', 'Shirt', 500, 5, true) on conflict do nothing;
  insert into challenges (id, gym_id, title, metric_key, target, starts_on, ends_on, reward_points, is_active)
    values ('e1000000-0000-4000-8000-0000000000b1', '${GYM}', 'Twelve', 'training_days', 12, current_date - 1, current_date + 20, 100, true) on conflict do nothing;
  insert into achievement_unlocks (user_id, achievement_key, gym_id) select '${M}', key, '${GYM}' from achievements where gym_id = '${GYM}' order by key limit 1;
  insert into trainer_credentials (id, trainer_id, title, file_path, status, gym_id) values ('e1000000-0000-4000-8000-0000000000d1', '${T}', 'CPT', 'x/y.pdf', 'pending', '${GYM}');`);
const BADGE = (await one(`select achievement_key k from achievement_unlocks where user_id = '${M}'`)).k;
const OTHER_BADGE = (await one(`select key k from achievements where gym_id = '${GYM}' and key <> '${BADGE}' order by key desc limit 1`)).k;

// ---- slide 3/7: a visitor with the public key reads nothing personal -------------------------
await anon();
const personal = ['profiles', 'member_profiles', 'payments', 'memberships', 'attendance', 'notifications', 'messages', 'bookings',
  'pt_sessions', 'point_ledger', 'body_measurements', 'workout_logs', 'trainer_credentials', 'gym_roles', 'pending_registrations', 'gym_applications'];
const leaks = [];
for (const t of personal) {
  try { const c = await n(`select count(*) n from ${t}`); if (c > 0) leaks.push(`${t}=${c}`); } catch { /* no grant: fine */ }
}
check('a signed-out visitor reads no personal row from ' + personal.length + ' tables', leaks.length === 0, leaks.join(' '));
check('a visitor cannot write a row (insert attendance)', !!(await tryExec(`insert into attendance (gym_id, member_id, method) values ('${GYM}', '${M}', 'qr')`))
  && (await (async () => { await root(); return n(`select count(*) n from attendance where member_id = '${M}'`); })()) === 0);

// ---- functions anyone could call ------------------------------------------------------------
await anon();
check('a visitor cannot send a notification to a member (notify_once)', !!(await tryExec(`select notify_once('${M}', 'system', 'Your account is locked', 'Sign in again', 'https://evil.example', 'phish')`)));
check('a visitor cannot write the activity log (log_activity)', !!(await tryExec(`select log_activity('payment.recorded', 'payment', null, '${M}', 'Forged entry', null, '${GYM}')`)));
check('a visitor cannot burn invoice numbers (next_invoice_number)', !!(await tryExec(`select next_invoice_number(2026, '${GYM}')`)));
check('a visitor cannot build a gym’s timetable (generate_class_instances)', !!(await tryExec(`select generate_class_instances(4, '${GYM}')`)));
check('a visitor cannot run the request sweep (sweep_stale_requests)', !!(await tryExec(`select sweep_stale_requests('${GYM}')`)));
await as(M);
check('a member cannot send a notification to someone else (notify_once)', !!(await tryExec(`select notify_once('${M2}', 'system', 'Free shirt', 'Click', 'https://evil.example', 'x2')`)));
check('a member cannot write the activity log (log_activity)', !!(await tryExec(`select log_activity('payment.recorded', 'payment', null, '${M2}', 'Forged', null, '${GYM}')`)));
await as(MB);
check('another gym’s member cannot look up a name by id (display_name_of)', !!(await tryExec(`select display_name_of('${M}')`)));
check('…or a membership (current_membership_of)', !!(await tryExec(`select * from current_membership_of('${M}')`)));
await root();
check('no forged notification or log entry landed', await n(`select count(*) n from notifications where action_url = 'https://evil.example'`) === 0
  && await n(`select count(*) n from activity_log where summary ilike 'Forged%'`) === 0);

// ---- slide 4: a member writing fields only the gym may set ------------------------------------
await as(M);
await tryExec(`update profiles set role = 'admin' where id = '${M}'`);
await tryExec(`update gym_roles set role = 'admin' where user_id = '${M}'`);
await root();
check('a member cannot make themselves an admin (profiles.role / gym_roles.role)', (await one(`select role from gym_roles where user_id = '${M}' and gym_id = '${GYM}'`)).role === 'member');

await as(M);
await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${M}', 'e1000000-0000-4000-8000-0000000000c1', 'approved')`);
await root();
check('a member’s own booking sent as approved arrives pending', (await one(`select status from bookings where member_id = '${M}'`))?.status === 'pending',
  JSON.stringify(await one(`select status from bookings where member_id = '${M}'`)));
await as(M);
await tryExec(`update bookings set status = 'approved' where member_id = '${M}'`);
await root();
check('…and they cannot approve it afterwards', (await one(`select status from bookings where member_id = '${M}'`))?.status === 'pending');

await as(M);
await tryExec(`insert into pt_sessions (gym_id, trainer_id, member_id, starts_at, duration_minutes, status) values ('${GYM}', '${T}', '${M}', now() + interval '3 days', 60, 'approved')`);
await root();
const pt = await one(`select status from pt_sessions where member_id = '${M}'`);
check('a 1-on-1 request sent as approved is not approved', !pt || pt.status === 'pending', JSON.stringify(pt));
await as(M);
await tryExec(`update pt_sessions set status = 'approved' where member_id = '${M}'`);
await root();
const pt2 = await one(`select status from pt_sessions where member_id = '${M}'`);
check('…and they cannot approve it afterwards', !pt2 || pt2.status === 'pending', JSON.stringify(pt2));

await as(M);
await tryExec(`insert into reward_redemptions (gym_id, member_id, reward_id, cost_points, status) values ('${GYM}', '${M}', 'e1000000-0000-4000-8000-0000000000a1', 1, 'approved')`);
await root();
const red = await one(`select status, cost_points from reward_redemptions where member_id = '${M}'`);
check('a reward cannot be redeemed for 1 point or pre-approved', !red || (red.status !== 'approved' && Number(red.cost_points) === 500), JSON.stringify(red));
await as(M);
await tryExec(`update reward_redemptions set status = 'approved', cost_points = 1 where member_id = '${M}'`);
await root();
const red2 = await one(`select status, cost_points from reward_redemptions where member_id = '${M}'`);
check('…or approved afterwards', !red2 || (red2.status !== 'approved' && Number(red2.cost_points) === 500), JSON.stringify(red2));

await as(M);
await tryExec(`insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values ('${GYM}', '${M}', 'checkin', 10000, 'attendance', gen_random_uuid())`);
await tryExec(`insert into achievement_unlocks (user_id, achievement_key, gym_id) values ('${M}', '${OTHER_BADGE}', '${GYM}')`);
await root();
check('a member cannot give themselves points', await n(`select count(*) n from point_ledger where member_id = '${M}' and points = 10000`) === 0);
check('a member cannot give themselves a badge', await n(`select count(*) n from achievement_unlocks where user_id = '${M}' and achievement_key = '${OTHER_BADGE}'`) === 0);
await as(M);
await tryExec(`update achievement_unlocks set achievement_key = '${OTHER_BADGE}' where user_id = '${M}'`);
await tryExec(`update achievement_unlocks set unlocked_on = current_date - 999 where user_id = '${M}'`);
await root();
const ul = await one(`select achievement_key k, unlocked_on u from achievement_unlocks where user_id = '${M}'`);
check('…nor swap the badge they have for another, or backdate it (they may only mark it seen)', ul.k === BADGE && ul.u >= new Date(Date.now() - 86400000 * 5), JSON.stringify(ul));

await as(M);
await tryExec(`insert into challenge_participants (gym_id, challenge_id, member_id, completed_on) values ('${GYM}', 'e1000000-0000-4000-8000-0000000000b1', '${M}', current_date)`);
await root();
const cp = await one(`select completed_on from challenge_participants where member_id = '${M}'`);
check('joining a challenge cannot mark it completed', !cp || cp.completed_on === null, JSON.stringify(cp));
await as(M);
await tryExec(`update challenge_participants set completed_on = current_date where member_id = '${M}'`);
await root();
const cp2 = await one(`select completed_on from challenge_participants where member_id = '${M}'`);
check('…nor complete it afterwards', !cp2 || cp2.completed_on === null, JSON.stringify(cp2));

await as(M);
await tryExec(`update member_profiles set qr_code = 'QR-M2' where profile_id = '${M}'`);
await tryExec(`update member_profiles set qr_code = 'MINE-NOW' where profile_id = '${M}'`);
await root();
check('a member cannot change their check-in code (to borrow another’s, or at all)', (await one(`select qr_code q from member_profiles where profile_id = '${M}'`)).q === 'QR-M');

await as(M);
await tryExec(`update memberships set expiry_date = current_date + 3650 where member_id = '${M}'`);
await tryExec(`insert into payments (gym_id, member_id, amount, method, status, invoice_number) values ('${GYM}', '${M}', 99999, 'Cash', 'completed', 'FAKE-1')`);
await tryExec(`insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M2}', 'system', 'Hi', 'x')`);
await root();
check('a member cannot extend their own membership', (await one(`select expiry_date - current_date as d from memberships where member_id = '${M}'`)).d <= 27);
check('a member cannot record a payment', await n(`select count(*) n from payments where invoice_number = 'FAKE-1'`) === 0);
check('a member cannot write into someone else’s inbox', await n(`select count(*) n from notifications where user_id = '${M2}' and title = 'Hi'`) === 0);

await as(M);
await tryExec(`insert into trainer_ratings (gym_id, member_id, trainer_id, stars, period) values ('${GYM}', '${M}', '${T}', 1, to_char(current_date, 'YYYY-MM'))`);
await root();
check('a member cannot rate a coach who never trained them', await n(`select count(*) n from trainer_ratings where member_id = '${M}'`) === 0);

// ---- a coach writing what the owner decides -----------------------------------------------
await as(T);
await tryExec(`update trainer_credentials set status = 'verified', reviewed_by = '${T}', reviewed_at = now() where trainer_id = '${T}'`);
await root();
check('a coach cannot verify their own credential', (await one(`select status from trainer_credentials where trainer_id = '${T}'`)).status !== 'verified');
await as(T);
await tryExec(`update gym_roles set role = 'admin' where user_id = '${T}'`);
await root();
check('a coach cannot make themselves an admin', (await one(`select role from gym_roles where user_id = '${T}' and gym_id = '${GYM}'`)).role === 'trainer');

// ---- across gyms ------------------------------------------------------------------------------
await as(MB);
check('another gym’s member sees none of this gym’s people or money',
  await n(`select count(*) n from profiles where id in ('${M}', '${M2}', '${T}')`) === 0
  && await n(`select count(*) n from memberships where gym_id = '${GYM}'`) === 0 && await n(`select count(*) n from bookings where gym_id = '${GYM}'`) === 0);
check('…and cannot write into it', !!(await tryExec(`insert into attendance (gym_id, member_id, method) values ('${GYM}', '${MB}', 'qr')`))
  || (await (async () => { await root(); return n(`select count(*) n from attendance where member_id = '${MB}'`); })()) === 0);

// ---- slide 6: the doors that cost money or mail -----------------------------------------------
await anon();
let sent = 0, stopped = null;
for (let i = 0; i < 60; i++) {
  const e = await tryExec(`select submit_gym_application('Spam Gym ${i}', 'Spammer', 'spam${i}@x.test', '0917 123 4567', null, null, null, null, null, null, null, null)`);
  if (e) { stopped = e; break; }
  sent++;
}
check('the public application form stops a flood from changing addresses', sent > 0 && sent <= 20 && /try again in an hour/.test(stopped ?? ''), `${sent} went through; ${stopped}`);

console.log(failures ? `\n${failures} OPEN` : '\nall red-team attacks failed, as they should');
process.exit(failures ? 1 : 0);
