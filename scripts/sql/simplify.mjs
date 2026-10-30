/**
 * 0220: simplify. The world before it (class and group rooms, a room for someone who never had a
 * package, a group coaching term, Friends, Classes switched on) is seeded first, then 0220 runs:
 * classes, squads, seasons and events are off by default and come back with the owner's switch;
 * events follow their switch for members; only package rooms remain (an ended package's archived,
 * never deleted); sync_gym_rooms makes rooms for running packages only; Friends is gone; 0220 can
 * run twice.
 *
 *   node <repo>/scripts/sql/simplify.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0220' });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2200000-0000-4000-8000-0000000000${n}`;
const O = id('01'), T = id('0a'), A = id('0b'), B = id('0c'), C = id('0d'), D = id('0e');
const CT = id('c1'), RC = id('a1'), RG = id('a2'), RA = id('a3'), RE = id('a4'), RN = id('a5'), EV = id('e1'), CL = id('c2');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const count = async (sql) => Number((await one(`select count(*)::int n from (${sql}) x`)).n);

// ── The world before 0220 ────────────────────────────────────────────────────
await owner();
let err = await tryExec(`
  ${[['olga', O, 'admin'], ['tess', T, 'trainer'], ['ana', A, 'member'], ['ben', B, 'member'], ['cy', C, 'member'], ['dee', D, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@simplify-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k[0].toUpperCase() + k.slice(1)}', 'Test', '${k}@simplify-test.com', 'active', '${role}', '${GYM}')
      on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id) values ('${T}', '${GYM}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${A}', '${GYM}', 'QR-S-A'), ('${B}', '${GYM}', 'QR-S-B'), ('${C}', '${GYM}', 'QR-S-C'), ('${D}', '${GYM}', 'QR-S-D') on conflict do nothing;

  set session_replication_role = replica;
  insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'classes', true)
    on conflict (gym_id, feature_key) do update set enabled = true;
  insert into class_templates (id, gym_id, name, trainer_id, day_of_week, start_time) values ('${CT}', '${GYM}', 'S HIIT', '${T}', 1, '07:00');
  insert into rooms (id, gym_id, kind, trainer_id, template_id, name) values ('${RC}', '${GYM}', 'class', '${T}', '${CT}', 'S HIIT');
  insert into rooms (id, gym_id, kind, trainer_id, name, join_code) values ('${RG}', '${GYM}', 'group', '${T}', 'Coaching group · Tess', 'SIMPLX');
  insert into rooms (id, gym_id, kind, trainer_id, member_id, name) values
    ('${RA}', '${GYM}', 'pt', '${T}', '${A}', 'Ana Test · 1-on-1'),
    ('${RE}', '${GYM}', 'pt', '${T}', '${C}', 'Cy Test · 1-on-1'),
    ('${RN}', '${GYM}', 'pt', '${T}', '${D}', 'Dee Test · 1-on-1');
  insert into room_posts (gym_id, room_id, author_id, body) values
    ('${GYM}', '${RC}', '${T}', 'Class post'), ('${GYM}', '${RA}', '${T}', 'Package post'), ('${GYM}', '${RN}', '${T}', 'Single post');
  insert into coachings (gym_id, member_id, trainer_id, kind, room_id, months, status, fee_mode, started_by, starts_on, ends_on) values
    ('${GYM}', '${A}', '${T}', 'pt', '${RA}', 3, 'active', 'included', 'member', current_date - 10, current_date + 80),
    ('${GYM}', '${C}', '${T}', 'pt', '${RE}', 1, 'ended', 'included', 'desk', current_date - 60, current_date - 30),
    ('${GYM}', '${B}', '${T}', 'group', '${RG}', 1, 'active', 'included', 'member', current_date - 5, current_date + 25);
  insert into coaching_prices (gym_id, kind, months, price) values ('${GYM}', 'group', 1, 800), ('${GYM}', 'pt', 1, 1500);
  insert into pt_sessions (gym_id, trainer_id, member_id, starts_at, duration_minutes, status)
    values ('${GYM}', '${T}', '${D}', now() - interval '3 days', 60, 'approved');
  update gym_settings set friends_on = true, coaching_modes = array['pick_pt', 'pick_group', 'desk_assigns'] where gym_id = '${GYM}';
  insert into friendships (gym_id, requester, addressee, status, accepted_at) values ('${GYM}', '${A}', '${B}', 'accepted', now());
  insert into cheers (gym_id, from_member, to_member, win_kind, win_ref, win_title) values ('${GYM}', '${A}', '${B}', 'badge', 'x', 'A badge');
  insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${B}', 'friends', 'Ana cheered you on', 'A badge');
  insert into events (id, gym_id, title, starts_at) values ('${EV}', '${GYM}', 'S Fun run', now() + interval '5 days');
  insert into classes (id, gym_id, name, trainer_id, level, capacity, scheduled_at, duration_minutes)
    values ('${CL}', '${GYM}', 'S HIIT', '${T}', 'beginner', 10, now() + interval '2 days', 45);
  set session_replication_role = origin;`);
check('setup: the world before 0220', err === null, err ?? '');

err = await tryExec('select 1').then(() => applyMigrationsFrom(db, REPO, '0220')).then(() => null, (e) => e.message);
check('0220 runs', err === null, err ?? '');

// ── 1. Switches ──────────────────────────────────────────────────────────────
await owner();
const on = async (k) => (await one(`select gym_module_on('${GYM}', '${k}') v`)).v;
const offs = await Promise.all(['classes', 'squads', 'seasons', 'events'].map(on));
check('classes, squads, seasons and events are off by default', offs.every((v) => v === false), JSON.stringify(offs));
const ons = await Promise.all(['coaching', 'push', 'points', 'chat', 'rooms'].map(on));
check('coaching, push, points, chat and rooms stay on', ons.every((v) => v === true), JSON.stringify(ons));
check('a gym that had Classes switched on is back to the default (its row is gone)',
  (await count(`select 1 from gym_modules where gym_id = '${GYM}' and feature_key = 'classes'`)) === 0);

await as(O);
const owned = await one(`select state from my_gym_modules() where feature_key = 'events'`);
check('the owner sees Events, off', owned?.state === 'off', JSON.stringify(owned));
err = await tryExec(`select set_gym_module('classes', true)`);
check('the owner switches Classes back on', err === null && (await one(`select (modules->>'classes')::boolean v from my_gym_app()`)).v === true, err ?? '');

// With Classes on, nothing in 0220 stands between a member and a class booking.
await owner();
await db.exec(`set session_replication_role = replica; reset role; select set_config('request.jwt.claim.sub', '${A}', false); set role authenticated;`);
err = await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${A}', '${CL}', 'pending')`);
await owner(); await db.exec('set session_replication_role = origin;');
check('…and a member books a class', err === null, err ?? '');

// ── 2. Events follow their switch ────────────────────────────────────────────
await as(A);
check('Events off: a member reads no events', (await count(`select 1 from events`)) === 0);
await as(T);
check('…nor does a coach', (await count(`select 1 from events`)) === 0);
await as(O);
check('…while the desk still sees them', (await count(`select 1 from events`)) === 1);
await tryExec(`select set_gym_module('events', true)`);
await as(A);
check('Events on: the member reads them', (await count(`select 1 from events`)) === 1);

// ── 3. Rooms are only for packages ───────────────────────────────────────────
await owner();
const left = (await db.query(`select id from rooms where gym_id = '${GYM}' order by id`)).rows.map((r) => r.id);
check('the class room, the group room and the room with no package are gone; both package rooms stay',
  left.length === 2 && left.includes(RA) && left.includes(RE), JSON.stringify(left));
check('…their posts went with them; the package room keeps its own',
  (await count(`select 1 from room_posts where body in ('Class post', 'Single post')`)) === 0
  && (await count(`select 1 from room_posts where room_id = '${RA}'`)) === 1);
check('group coaching terms and group prices are gone; 1-on-1 ones stay',
  (await count(`select 1 from coachings where kind = 'group'`)) === 0 && (await count(`select 1 from coaching_prices where kind = 'group'`)) === 0
  && (await count(`select 1 from coachings where gym_id = '${GYM}'`)) === 2);
check('members can no longer pick a group', (await one(`select coaching_modes m from gym_settings where gym_id = '${GYM}'`)).m.join(',') === 'pick_pt,desk_assigns');
check('the group functions are gone',
  (await one(`select to_regprocedure('join_room(text)') a, to_regprocedure('create_group_room(text,text)') b, to_regprocedure('reset_room_code(uuid)') c`)
    .then((r) => r.a === null && r.b === null && r.c === null)));

await as(T);
let made = (await one(`select sync_gym_rooms() n`)).n;
check('sync: a class timetable and a single session make no room', made === 0
  && (await count(`select 1 from rooms where kind <> 'pt' or member_id = '${D}'`)) === 0, `made ${made}`);
await owner();
const arch = await one(`select (select archived_at is not null from rooms where id = '${RE}') ended, (select archived_at is null from rooms where id = '${RA}') running`);
check('…an ended package’s room is archived, never deleted; a running one stays open', arch.ended === true && arch.running === true, JSON.stringify(arch));
await db.exec(`set session_replication_role = replica;
  insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by, starts_on, ends_on)
  values ('${GYM}', '${D}', '${T}', 'pt', 1, 'active', 'included', 'desk', current_date, current_date + 30);
  set session_replication_role = origin;`);
await as(T);
made = (await one(`select sync_gym_rooms() n`)).n;
check('…a new running package gets its room', made === 1 && (await count(`select 1 from rooms where kind = 'pt' and member_id = '${D}'`)) === 1, `made ${made}`);
made = (await one(`select sync_gym_rooms() n`)).n;
check('…once', made === 0 && (await count(`select 1 from rooms where gym_id = '${GYM}'`)) === 3, `made ${made}`);

await owner();
err = await tryExec(`insert into rooms (gym_id, kind, trainer_id, template_id, name) values ('${GYM}', 'class', '${T}', '${CT}', 'Back?')`);
check('a class room can no longer be made', err !== null, 'it was made');
err = await tryExec(`insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by) values ('${GYM}', '${B}', '${T}', 'group', 1, 'requested', 'included', 'member')`);
check('…nor a group coaching term', err !== null, 'it was made');

// ── 4. Friends ───────────────────────────────────────────────────────────────
const gone = await one(`select to_regclass('friendships') f, to_regclass('cheers') c,
  (select count(*)::int from information_schema.columns where table_name = 'member_profiles' and column_name in ('friend_code', 'findable', 'share_wins')) mp,
  (select count(*)::int from information_schema.columns where table_name = 'gym_settings' and column_name = 'friends_on') gs,
  (select count(*)::int from notifications where type = 'friends') n,
  (select count(*)::int from pg_proc where proname in ('friend_wins', 'cheer_win', 'my_friends', 'is_active_member', 'member_social_counts')) fn`);
check('Friends is gone: tables, columns, switch, notifications and functions',
  gone.f === null && gone.c === null && gone.mp === 0 && gone.gs === 0 && gone.n === 0 && gone.fn === 0, JSON.stringify(gone));
const tt = (await one(`select tenancy_gym_tables() t`)).t;
check('…and from the tenancy list', !tt.includes('friendships') && !tt.includes('cheers') && tt.includes('rooms'));

// ── 5. Notes, marker, and running it again ───────────────────────────────────
const notes = await one(`select
  (select count(*)::int from app_releases where app = 'member' and title = 'A simpler app') m,
  (select count(*)::int from app_releases where app = 'trainer' and title = 'Personal training, simpler') t,
  (select count(*)::int from app_releases where app = 'admin' and title = 'Personal training only, unless you want more') a,
  (select count(*)::int from app_releases where title = 'Friends and cheers, if you want them') f`);
check('one What’s new note per app, and the Friends note is gone', notes.m === 1 && notes.t === 1 && notes.a === 1 && notes.f === 0, JSON.stringify(notes));
check('the marker answers', (await one(`select migration_0220_applied() v`)).v === true);
err = await tryExec(readFileSync(`${REPO}/supabase/migrations/0220_simplify.sql`, 'utf8'));
check('0220 can run twice', err === null, err ?? '');
check('…without undoing the owner’s switches', (await on('classes')) === true && (await on('events')) === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
