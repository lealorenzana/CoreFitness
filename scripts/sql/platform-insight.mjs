/**
 * 0140: capacity over time, the searchable activity log, per-gym usage, and
 * the fenced gym export — who may, what leaves, and that the gym is told.
 *
 *   node <repo>/scripts/sql/platform-insight.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  pa: 'a1000000-0000-4000-8000-000000000009', ownerA: 'a1000000-0000-4000-8000-000000000001',
  memA: 'a1000000-0000-4000-8000-000000000004', ownerB: 'b1000000-0000-4000-8000-000000000001',
};
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await db.exec(`reset role;
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b', 'Gym B', 'trial');
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@insight-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@insight-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.pa}', '${P.ownerA}', '${P.memA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.memA}', '${GYM_A}', 'QR-INSIGHT');
  insert into attendance (member_id, gym_id, check_in_time) values
    ('${P.memA}', '${GYM_A}', now() - interval '2 days'), ('${P.memA}', '${GYM_A}', now() - interval '1 day'),
    ('${P.memA}', '${GYM_A}', now() - interval '60 days');
  insert into storage.buckets (id, name) values ('media', 'media') on conflict do nothing;
  insert into storage.objects (bucket_id, name, metadata) values
    ('media', 'gyms/${GYM_A}/logos/maria-santos-selfie.png', '{"size": 500000}'), ('media', 'gyms/${GYM_B}/logos/b.png', '{"size": 1000}');
  select platform_log('${GYM_A}', 'gym.paid', 'Gym A paid ₱999', null);
  select platform_log('${GYM_B}', 'gym.suspended', 'Gym B was suspended: unpaid', null);
  select platform_log(null, 'billing.settings', 'Billing settings changed', null);`);

// ---- 1. capacity over time -------------------------------------------------------------------
await as(P.ownerA);
await db.exec(`select snapshot_capacity()`);
check('a gym owner takes no snapshot and reads none', (await all(`select * from platform_capacity_history()`)).length === 0);
check('nor the details, nor the footprint', (await all(`select * from platform_capacity_details()`)).length === 0
  && (await all(`select * from platform_gym_footprint()`)).length === 0);
await as(P.pa);
await db.exec(`select snapshot_capacity(); select snapshot_capacity();`);
const hist = await all(`select * from platform_capacity_history()`);
check('one snapshot a day, however often the page opens', hist.length === 1 && Number(hist[0].db_bytes) > 0 && Number(hist[0].storage_bytes) === 501000, JSON.stringify(hist));
const det = await all(`select * from platform_capacity_details()`);
check('tables with sizes and row estimates', det.filter((d) => d.kind === 'table').length >= 8);
check('buckets with object counts', det.some((d) => d.kind === 'bucket' && d.key === 'media' && Number(d.n) === 2));
const files = det.filter((d) => d.kind === 'file');
check('largest files by size and gym, never by name', files[0]?.label === 'media · Gym #1' || /media · /.test(files[0]?.label ?? ''),
  JSON.stringify(files[0]));
check('a file name never leaves the database', !det.some((d) => /selfie/.test(d.label + d.key)));
const fp = await all(`select * from platform_gym_footprint()`);
const a = fp.find((r) => r.gym_id === GYM_A);
check('each gym\'s footprint: rows and files', Number(a?.rows) >= 3 && Number(a?.files) === 1 && Number(a?.file_bytes) === 500000, JSON.stringify(a));

// ---- 2. the activity log ---------------------------------------------------------------------
const s1 = await all(`select * from platform_events_search(p_q => 'paid')`);
check('search by words', s1.length >= 1 && s1.every((r) => /paid/i.test(r.summary + r.action)));
const s2 = await all(`select * from platform_events_search(p_gym => '${GYM_B}')`);
check('filter by gym, with its name', s2.length >= 1 && s2.every((r) => r.gym_id === GYM_B && r.gym_name === 'Gym B'));
const s3 = await all(`select * from platform_events_search(p_action => 'gym')`);
check('an action family matches its members', s3.some((r) => r.action === 'gym.paid') && s3.some((r) => r.action === 'gym.suspended') && !s3.some((r) => r.action === 'billing.settings'));
const s4 = await all(`select * from platform_events_search(p_limit => 1)`);
check('paged, with the total', s4.length === 1 && Number(s4[0].total) >= 3);
const today = (await one(`select (now() at time zone 'Asia/Manila')::date::text as d`)).d;
check('dates are Manila days', (await all(`select * from platform_events_search(p_from => '${today}', p_to => '${today}')`)).length >= 3
  && (await all(`select * from platform_events_search(p_to => '2000-01-01')`)).length === 0);
check('the actions, counted', (await all(`select * from platform_event_actions()`)).some((r) => r.action === 'gym.paid'));
await as(P.ownerA);
check('a gym owner searches nothing', (await all(`select * from platform_events_search()`)).length === 0);

// ---- 3. per-gym usage ------------------------------------------------------------------------
await as(P.pa);
const use = await all(`select * from platform_gym_usage(30)`);
check('check-ins counted per gym, inside the window', use.some((u) => u.gym_id === GYM_A && u.feature === 'checkins' && Number(u.n) === 2), JSON.stringify(use));
check('a wider window sees more', (await all(`select * from platform_gym_usage(90)`)).some((u) => u.gym_id === GYM_A && u.feature === 'checkins' && Number(u.n) === 3));
await as(P.ownerA);
check('a gym owner sees no other gym\'s usage', (await all(`select * from platform_gym_usage()`)).length === 0);

// ---- 4. the export -------------------------------------------------------------------------
await as(P.pa);
check('an active gym that has not asked: no export', /data is its own/.test(await tryExec(`select platform_export_gym('${GYM_A}')`) ?? ''));
await db.exec(`reset role; insert into support_grants (gym_id, granted_by, reason, expires_at) values ('${GYM_A}', '${P.ownerA}', 'help', now() + interval '1 day');`);
await as(P.pa);
const ex = (await one(`select platform_export_gym('${GYM_A}') as j`)).j;
const t = ex.tables;
check('with the gym\'s support grant: exported', ex.gym && Array.isArray(t.people) && t.people.some((p) => p.email === 'owna@insight-test.com' || p.email === 'ownerA@insight-test.com'));
check('its business records, its own rows only', Array.isArray(t.attendance) && t.attendance.length === 3 && t.attendance.every((r) => r.gym_id === GYM_A));
check('never chat, photos, health or workouts', !('messages' in t) && !('progress_photos' in t) && !('waiver_acceptances' in t)
  && !('body_measurements' in t) && !('workout_logs' in t) && !('gym_invitations' in t) && !('trainer_credentials' in t));
check('people carry contact and role, not the profile', t.people.every((p) => Object.keys(p).sort().join() === 'email,first_name,joined,last_name,phone,role,status,user_id'));
await db.exec(`reset role`);
check('the gym\'s owner is told', (await one(`select count(*)::int as n from notifications where user_id = '${P.ownerA}' and title = 'Core Fitness exported your gym''s data'`)).n === 1);
check('and it is in the log', (await one(`select count(*)::int as n from platform_events where action = 'gym.export' and gym_id = '${GYM_A}'`)).n === 1);
await db.exec(`update support_grants set revoked_at = now() where gym_id = '${GYM_A}'`);
await as(P.pa);
check('the grant withdrawn: no export', !!(await tryExec(`select platform_export_gym('${GYM_A}')`)));
await db.exec(`reset role; update gyms set status = 'cancelled' where id = '${GYM_B}';`);
await as(P.pa);
check('a gym that has left: exported', !(await tryExec(`select platform_export_gym('${GYM_B}')`)));
await as(P.ownerA);
check('a gym owner cannot export', !!(await tryExec(`select platform_export_gym('${GYM_B}')`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0140 checks passed');
process.exit(failures ? 1 : 0);
