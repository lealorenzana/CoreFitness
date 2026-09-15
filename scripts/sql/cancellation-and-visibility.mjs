/**
 * 0081 and 0082, as SQL, against the real schema.
 *
 * Replays **every** migration rather than a hand-written fixture — both of these
 * lean on `is_front_desk()`, `get_my_role()`, `notify_once()` and the 0071/0074
 * decision triggers, and a fixture written from memory is how a migration passes
 * locally and fails live.
 *
 * Everything below runs as a real `authenticated` role. A table owner bypasses
 * RLS, so 0082's assertions would pass whether or not the policy works;
 * `current_user` is asserted before any of it is believed.
 *
 *   cd <scratch dir with @electric-sql/pglite installed>
 *   node <repo>/scripts/sql/cancellation-and-visibility.mjs "<repo>"
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromCwd = createRequire(pathToFileURL(process.cwd() + '/'));
let PGlite;
try {
  ({ PGlite } = await import(pathToFileURL(requireFromCwd.resolve('@electric-sql/pglite')).href));
} catch {
  console.error('Could not load @electric-sql/pglite from ' + process.cwd() +
    '\n  npm install @electric-sql/pglite   # then run this again from that directory');
  process.exit(2);
}

const REPO = process.argv[2];
const MIG = `${REPO}/supabase/migrations`;
const db = await PGlite.create();
const describe = (e) => [e.message, e.detail && `detail: ${e.detail}`, e.hint && `hint: ${e.hint}`]
  .filter(Boolean).join(' | ');

// ── Supabase's own furniture, same as replay-migrations.mjs ─────────────────
await db.exec(`
create role anon; create role authenticated; create role service_role;
create role supabase_admin; create role authenticator; create role supabase_auth_admin;
create role supabase_storage_admin; create role dashboard_user;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb, path_tokens text[],
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), version text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create schema extensions;
create publication supabase_realtime;
`);

const prep = (sql) => sql.replace(/create\s+extension[^;]*;/gi, 'select 1;');
const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of files) {
  try { await db.exec(prep(readFileSync(`${MIG}/${f}`, 'utf8'))); }
  catch (e) { console.log(`MIGRATION FAILED: ${f}\n   ${describe(e)}`); process.exit(2); }
}
console.log(`applied ${files.length} migrations`);

// Supabase grants these to `authenticated` on its own; pglite does not, and
// without them every assertion below fails 42501 for the wrong reason — a
// permission error, not the policy decision being tested.
await db.exec(`
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all sequences in schema public to authenticated;
`);

// ── The cast ────────────────────────────────────────────────────────────────
const M1 = '11111111-1111-1111-1111-111111111111';   // Lea   — trains with TA
const M2 = '22222222-2222-2222-2222-222222222222';   // Miguel— trains with TB
const M3 = '33333333-3333-3333-3333-333333333333';   // Ana   — trains with nobody
const TA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AD = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const PT_SOON  = 'e0000000-0000-4000-8000-000000000001'; // M1 + TA, future, pending
const PT_PAST  = 'e0000000-0000-4000-8000-000000000002'; // M1 + TA, already started
const PT_OTHER = 'e0000000-0000-4000-8000-000000000003'; // M2 + TB, future
const CLS      = 'c0000000-0000-4000-8000-000000000001';
// A second class at a different hour: 0068 refuses two bookings that overlap,
// and it is right to — the member cannot be in two rooms at once.
const CLS2     = 'c0000000-0000-4000-8000-000000000002';
const BK       = 'f0000000-0000-4000-8000-000000000001'; // M1 on TA's class
const BK2      = 'f0000000-0000-4000-8000-000000000002'; // M1 again, left live

await db.exec(`
insert into auth.users (id, email) values
  ('${M1}','lea@corefitness-test.com'), ('${M2}','miguel@corefitness-test.com'),
  ('${M3}','ana@corefitness-test.com'), ('${TA}','tere@corefitness-test.com'),
  ('${TB}','marco@corefitness-test.com'), ('${AD}','admin@corefitness-test.com');
insert into profiles (id, role, first_name, last_name, email, status) values
  ('${M1}','member','Lea','Lorenzana','lea@corefitness-test.com','active'),
  ('${M2}','member','Miguel','Santos','miguel@corefitness-test.com','active'),
  ('${M3}','member','Ana','Reyes','ana@corefitness-test.com','active'),
  ('${TA}','trainer','Tere','Bautista','tere@corefitness-test.com','active'),
  ('${TB}','trainer','Marco','Dela Cruz','marco@corefitness-test.com','active'),
  ('${AD}','admin','Gabrielle','Facalarin','admin@corefitness-test.com','active')
on conflict (id) do nothing;
insert into member_profiles (profile_id) values ('${M1}'),('${M2}'),('${M3}') on conflict do nothing;
insert into trainer_profiles (profile_id) values ('${TA}'),('${TB}') on conflict do nothing;

-- 0017 refuses a class booking without a usable membership, and it is right to.
insert into membership_plans (id, name, tier, price, duration_days, can_book_classes, can_book_pt)
  values ('91111111-0000-4000-8000-000000000001','Premium','premium',1500,30,true,true);
insert into memberships (member_id, plan_id, status, start_date, expiry_date)
  select p, '91111111-0000-4000-8000-000000000001', 'active',
         current_date - 10, current_date + 20
    from unnest(array['${M1}','${M2}','${M3}']::uuid[]) p;

insert into classes (id, name, trainer_id, scheduled_at, capacity) values
  ('${CLS}','Morning Strength','${TA}', now() + interval '3 days', 12),
  ('${CLS2}','Evening Mobility','${TA}', now() + interval '5 days', 10);
insert into bookings (id, member_id, class_id, status) values
  ('${BK}','${M1}','${CLS}','approved'),
  ('${BK2}','${M1}','${CLS2}','pending');

insert into attendance (member_id, check_in_time, method) values
  ('${M1}', now() - interval '1 day', 'qr'),
  ('${M1}', now() - interval '3 days', 'qr'),
  ('${M2}', now() - interval '2 days', 'qr');

insert into pt_sessions (id, member_id, trainer_id, starts_at, status) values
  ('${PT_SOON}','${M1}','${TA}', now() + interval '2 days','approved'),
  ('${PT_PAST}','${M1}','${TA}', now() - interval '2 hours','approved'),
  ('${PT_OTHER}','${M2}','${TB}', now() + interval '2 days','approved');
`).catch((e) => { console.log('SEED FAILED: ' + describe(e)); process.exit(2); });

// ── Runner ──────────────────────────────────────────────────────────────────
const results = [];
const rec = (id, name, pass, detail) => results.push({ id, name, pass, detail });

async function as(uid) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  const who = await db.query('select current_user as u;');
  if (who.rows[0].u !== 'authenticated') {
    throw new Error(`SET ROLE did not take — still ${who.rows[0].u}. Every RLS assertion after this would pass for the wrong reason.`);
  }
}
const asOwner = () => db.exec('reset role;');

async function refuses(id, name, sql, fragment) {
  try {
    await db.exec(sql);
    rec(id, name, false, 'ACCEPTED — it should have been refused');
  } catch (e) {
    const msg = String(e.message || e);
    const ok = !fragment || msg.includes(fragment);
    rec(id, name, ok, ok ? `refused: ${msg.split('\n')[0]}` : `refused, but said: ${msg.split('\n')[0]}`);
  }
}
async function allows(id, name, sql) {
  try { await db.exec(sql); rec(id, name, true, 'allowed'); }
  catch (e) { rec(id, name, false, `REFUSED: ${String(e.message || e).split('\n')[0]}`); }
}
async function count(sql) {
  const r = await db.query(sql);
  return Number(r.rows[0].n);
}

// ══ 0081  CANCELLATION ══════════════════════════════════════════════════════
rec('C0', 'the eight reasons are seeded and active',
  (await count('select count(*)::int as n from cancellation_reasons where is_active')) === 8,
  `${await count('select count(*)::int as n from cancellation_reasons where is_active')} active`);

await as(M1);
await refuses('C1', 'a member cannot cancel someone else\'s session',
  `select cancel_booking('pt', '${PT_OTHER}', 'changed_plans');`,
  'not yours');

await refuses('C2', '"other" with no note is refused',
  `select cancel_booking('pt', '${PT_SOON}', 'other');`,
  'in your own words');

await refuses('C3', 'a reason that does not exist is refused',
  `select cancel_booking('pt', '${PT_SOON}', 'because_i_said_so');`,
  'Choose a reason');

await refuses('C4', 'a session that has already started cannot be cancelled',
  `select cancel_booking('pt', '${PT_PAST}', 'changed_plans');`,
  'already started');

await refuses('C5', 'a member cannot give a trainer-only reason',
  `select cancel_booking('pt', '${PT_SOON}', 'trainer_unavailable');`,
  'not one you can give');

await allows('C6', 'a member cancels their own session with a real reason',
  `select cancel_booking('pt', '${PT_SOON}', 'changed_plans');`);

await refuses('C7', 'cancelling twice is refused',
  `select cancel_booking('pt', '${PT_SOON}', 'changed_plans');`,
  'already been cancelled');

await asOwner();
{
  const r = await db.query(`select status::text, cancelled_by_role, cancellation_reason,
                                   cancelled_by, cancelled_at is not null as stamped
                              from pt_sessions where id = '${PT_SOON}'`);
  const row = r.rows[0];
  rec('C8', 'the row records status, actor, role, reason and time',
    row.status === 'cancelled' && row.cancelled_by_role === 'member'
      && row.cancellation_reason === 'changed_plans' && row.cancelled_by === M1 && row.stamped,
    JSON.stringify(row));

  const n = await count(`select count(*)::int as n from notifications
                          where user_id = '${TA}' and title = 'A booking was cancelled'`);
  rec('C9', 'the trainer is told, once', n === 1, `${n} notification(s)`);
}

// The trainer cancels the class booking, and the member hears about it.
await as(TA);
await allows('C10', 'a trainer cancels a booking on their own class',
  `select cancel_booking('class', '${BK}', 'trainer_unavailable', 'Clinic appointment');`);

await asOwner();
{
  const r = await db.query(`select cancelled_by_role, cancellation_note from bookings where id = '${BK}'`);
  rec('C11', 'the cancellation is attributed to the trainer, with their note',
    r.rows[0].cancelled_by_role === 'trainer' && r.rows[0].cancellation_note === 'Clinic appointment',
    JSON.stringify(r.rows[0]));
  const n = await count(`select count(*)::int as n from notifications
                          where user_id = '${M1}' and title = 'Your coach cancelled a session'`);
  rec('C12', 'the member is told it was the coach', n === 1, `${n} notification(s)`);
}

// A trainer may not reach into another trainer's booking.
await as(TB);
await refuses('C13', 'a trainer cannot cancel another trainer\'s session',
  `select cancel_booking('pt', '${PT_PAST}', 'trainer_unavailable');`,
  'not yours');

// The desk can, and is stamped as itself.
await as(AD);
await allows('C14', 'the front desk can cancel any live booking',
  `select cancel_booking('pt', '${PT_OTHER}', 'schedule_conflict');`);
await asOwner();
rec('C15', 'the desk\'s cancellation is attributed to admin',
  (await db.query(`select cancelled_by_role from pt_sessions where id = '${PT_OTHER}'`))
    .rows[0].cancelled_by_role === 'admin', '');

// The rule has to survive a client that skips the dialog entirely — which is
// what 0016's policy and the admin app both used to do.
await as(M1);
await refuses('C16', 'a raw PATCH to cancelled, with no reason, is refused',
  `update bookings set status = 'cancelled' where id = '${BK2}';`,
  'so a reason is recorded');

await asOwner();
rec('C17', 'and that booking is still live afterwards',
  (await db.query(`select status::text as s from bookings where id = '${BK2}'`)).rows[0].s !== 'cancelled',
  (await db.query(`select status::text as s from bookings where id = '${BK2}'`)).rows[0].s);

// ══ 0082  TRAINER VISIBILITY ════════════════════════════════════════════════
await as(TA);
{
  const n = await count('select count(*)::int as n from member_profiles');
  rec('V1', 'trainer A sees only their own trainees', n === 1, `${n} member row(s), expected 1 (Lea)`);

  const seesLea = await count(`select count(*)::int as n from member_profiles where profile_id = '${M1}'`);
  rec('V2', 'trainer A can see Lea, who trains with them', seesLea === 1, `${seesLea}`);

  // The direct-id probe the brief asks about: RLS filters, it does not raise.
  const probe = await count(`select count(*)::int as n from member_profiles where profile_id = '${M2}'`);
  rec('V3', 'asking for another trainer\'s member by id returns nothing (no error)',
    probe === 0, `${probe} row(s)`);

  const unrelated = await count(`select count(*)::int as n from member_profiles where profile_id = '${M3}'`);
  rec('V4', 'a member who trains with nobody is invisible to trainers', unrelated === 0, `${unrelated}`);

  const names = await count(`select count(*)::int as n from profiles where role = 'member'`);
  rec('V5', 'the profiles join is narrowed too, not just member_profiles',
    names === 1, `${names} member profile row(s)`);

  const self = await count(`select count(*)::int as n from profiles where id = '${TA}'`);
  rec('V6', 'a trainer can still see their own profile row', self === 1, `${self}`);

  const roster = await count('select count(*)::int as n from my_trainer_members');
  rec('V7', 'my_trainer_members returns the same one member', roster === 1, `${roster}`);

  // The roster reads three tables, not one. Narrowing only the first would have
  // left the other two handing over the whole gym.
  const ms = await count('select count(*)::int as n from memberships');
  rec('V12', 'memberships are narrowed to this trainer only', ms === 1, `${ms} of 3`);

  const att = await count('select count(*)::int as n from attendance');
  rec('V13', 'attendance is narrowed the same way', att === 2, `${att} rows, expected 2`);
}

await as(TB);
{
  const n = await count('select count(*)::int as n from member_profiles');
  rec('V8', 'trainer B sees only Miguel, a different set', n === 1, `${n}`);
  const lea = await count(`select count(*)::int as n from member_profiles where profile_id = '${M1}'`);
  rec('V9', 'trainer B cannot see trainer A\'s member', lea === 0, `${lea}`);
}

await as(AD);
{
  const n = await count('select count(*)::int as n from member_profiles');
  rec('V10', 'admin still sees every member', n === 3, `${n} of 3`);
}

await as(M1);
{
  const n = await count('select count(*)::int as n from member_profiles');
  rec('V11', 'a member still sees only themselves', n === 1, `${n}`);
}

// ══ 0083  THE DESK'S ATTENTION QUEUE ════════════════════════════════════════
// A fresh cast: the earlier sessions are all cancelled by now.
await asOwner();
const PT_WAIT = 'e0000000-0000-4000-8000-000000000010';  // pending 4 days, TA
const TC      = 'cccccccc-cccc-cccc-cccc-cccccccccccc';  // free then
const TD      = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';  // busy then
await db.exec(`
insert into auth.users (id, email) values
  ('${TC}','carla@corefitness-test.com'), ('${TD}','dino@corefitness-test.com');
insert into profiles (id, role, first_name, last_name, email, status) values
  ('${TC}','trainer','Carla','Mendoza','carla@corefitness-test.com','active'),
  ('${TD}','trainer','Dino','Alvarez','dino@corefitness-test.com','active')
on conflict (id) do nothing;
insert into trainer_profiles (profile_id, focus_areas) values
  ('${TC}', array['Strength']), ('${TD}', array['Strength'])
on conflict (profile_id) do update set focus_areas = excluded.focus_areas;

-- The member asked four days ago for a session three days out at 10:00.
insert into pt_sessions (id, member_id, trainer_id, starts_at, duration_minutes, status, requested_at)
values ('${PT_WAIT}','${M3}','${TA}',
        date_trunc('day', now() + interval '3 days') + interval '10 hours',
        60, 'pending', now() - interval '4 days');

-- All three coaches work that weekday, 08:00-17:00.
insert into trainer_availability (trainer_id, day_of_week, start_time, end_time, slot_minutes)
select t, extract(dow from date_trunc('day', now() + interval '3 days'))::int,
       '08:00', '17:00', 60
  from unnest(array['${TA}','${TC}','${TD}']::uuid[]) t;

-- ...but Dino already has 10:30, which OVERLAPS a 10:00 hour.
insert into pt_sessions (member_id, trainer_id, starts_at, duration_minutes, status)
values ('${M2}','${TD}',
        date_trunc('day', now() + interval '3 days') + interval '10 hours 30 minutes',
        60, 'approved');
`);

await as(AD);
{
  const q = await db.query(`select kind, member_name, days_waiting, urgency
                              from bookings_needing_attention where id = '${PT_WAIT}'`);
  const row = q.rows[0];
  rec('A1', 'the pending session appears in the attention queue', row != null, JSON.stringify(row ?? null));
  rec('A2', 'it counts whole days waiting', row && row.days_waiting === 4, `${row?.days_waiting}`);
  rec('A3', 'four days pending reads as overdue', row && row.urgency === 'overdue', `${row?.urgency}`);

  const sug = await db.query(`select trainer_name, shared_focus, upcoming_load
                                from suggest_trainers_for_session('${PT_WAIT}')`);
  const names = sug.rows.map((r) => r.trainer_name);
  rec('A4', 'a free, qualified coach is suggested', names.includes('Carla Mendoza'), names.join(', ') || 'none');
  rec('A5', 'a coach whose hour OVERLAPS is not suggested', !names.includes('Dino Alvarez'),
    names.join(', ') || 'none');
  rec('A6', 'the current trainer is not suggested to replace themselves',
    !names.includes('Tere Bautista'), names.join(', ') || 'none');

  await refuses('A7', 'reassigning to a busy trainer is refused at the write',
    `select reassign_pt_session('${PT_WAIT}', '${TD}');`, 'no longer free');

  await allows('A8', 'reassigning to the free coach is allowed',
    `select reassign_pt_session('${PT_WAIT}', '${TC}');`);
}

await asOwner();
{
  const r = await db.query(`select trainer_id, previous_trainer_id, status::text as s,
                                   reassigned_by, requested_at < now() - interval '3 days' as clock_kept
                              from pt_sessions where id = '${PT_WAIT}'`);
  const row = r.rows[0];
  rec('A9', 'the move is recorded, with who it used to be',
    row.trainer_id === TC && row.previous_trainer_id === TA && row.reassigned_by === AD,
    JSON.stringify(row));
  rec('A10', 'it stays pending — the new coach still accepts', row.s === 'pending', row.s);
  rec('A11', 'the waiting clock is NOT reset by the move', row.clock_kept === true, `${row.clock_kept}`);

  const n = await count(`select count(*)::int as n from notifications
                          where user_id = '${TC}' and title = 'A session was assigned to you'`);
  rec('A12', 'the new coach is told', n === 1, `${n}`);
}

await as(AD);
{
  const first = await db.query(`select remind_trainer('pt', '${PT_WAIT}') as ok`);
  rec('A13', 'the desk can send a reminder', first.rows[0].ok === true, `${first.rows[0].ok}`);
  const again = await db.query(`select remind_trainer('pt', '${PT_WAIT}') as ok`);
  rec('A14', 'a second reminder the same day is not sent twice', again.rows[0].ok === false,
    `${again.rows[0].ok}`);
}

await as(M1);
await refuses('A15', 'a member cannot reassign anybody',
  `select reassign_pt_session('${PT_WAIT}', '${TD}');`, 'front desk');
await refuses('A16', 'a member cannot fish for trainer suggestions',
  `select suggest_trainers_for_session('${PT_WAIT}');`, 'front desk');

// ── Report ──────────────────────────────────────────────────────────────────
await asOwner();
const pad = (s, n) => String(s).padEnd(n);
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${pad(r.id, 4)} ${pad(r.name, 62)} ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
