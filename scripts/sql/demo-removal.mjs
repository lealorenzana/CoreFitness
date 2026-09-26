/**
 * 0117: remove_demo_data() removes the demo, and only the demo.
 *
 * Run against **both real seeds**, so what is under test is the actual
 * 150-member fixture rather than a hand-made stand-in. The assertion that
 * matters is not "it ran" — it is that a real member created beside the demo
 * is still there afterwards, with their payment and their auth row.
 *
 * This one is worth having because the operation is irreversible and gets
 * pressed under time pressure. There is no undo to fall back on, so the proof
 * has to come before the button.
 *
 *   node <repo>/scripts/sql/demo-removal.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { seeds: ['seed-demo-data.sql', 'seed-demo-data-2.sql'] });

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const PLATFORM = 'aaaa0000-0000-4000-8000-00000000000a';
const REAL = 'cafe0000-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) =>
  db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const fails = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await asOwner();

// A real member, beside the demo: the whole point is that this one survives.
// Inserting into auth.users fires the signup trigger, which creates the
// profile — so these upsert rather than insert, or the second write collides
// with the trigger's own row.
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
    values ('${REAL}', 'real@example.test', '{}'),
           ('${PLATFORM}', 'ops@corefitness.test', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${REAL}', 'Real', 'Member', 'real@example.test', 'active', 'member', '${GYM_A}')
    on conflict (id) do update set first_name = excluded.first_name,
      email = excluded.email, status = 'active', active_gym_id = excluded.active_gym_id;
  insert into profiles (id, first_name, last_name, email, status, role)
    values ('${PLATFORM}', 'Ops', 'Core', 'ops@corefitness.test', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';
  insert into gym_roles (gym_id, user_id, role, status)
    values ('${GYM_A}', '${REAL}', 'member', 'active') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code)
    values ('${REAL}', '${GYM_A}', 'QR-REAL') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PLATFORM}') on conflict do nothing;
`);

const before = await one('select * from demo_data_summary()');
check('the summary sees the seeded demo', before.people > 100 && before.payments > 0,
  JSON.stringify(before));

// A real payment against the real member, so "only the demo" is testable.
await db.exec(`insert into payments (member_id, gym_id, amount, method, status, paid_on)
  values ('${REAL}', '${GYM_A}', 1500, 'cash', 'completed', current_date)`);
const realPayments = () => one(`select count(*)::int as n from payments where member_id = '${REAL}'`);
check('a real payment exists beside the demo', (await realPayments()).n === 1);

// ---- who may press it ----------------------------------------------------
await as('5eed0001-0000-4000-8000-000000000003');
check('a member cannot remove the demo data', !!(await fails('select remove_demo_data()')));

const owner = (await one(`select user_id from gym_roles
  where gym_id = '${GYM_A}' and role = 'admin' and status = 'active' limit 1`))?.user_id;
if (owner) {
  await as(owner);
  check('a gym owner cannot either — it reaches outside their gym',
    !!(await fails('select remove_demo_data()')));
  // But they may look, which is the whole reason the summary is separate.
  const seen = await one('select * from demo_data_summary()');
  check('a gym owner CAN see how much of their dashboard is seeded', seen.people > 100);
}

// ---- and what it does ----------------------------------------------------
await as(PLATFORM);
const said = await one('select remove_demo_data() as msg');
check('the platform removes it, and says what it removed',
  /Removed \d+ demo people/.test(said.msg), said.msg);

await asOwner();
const after = await one('select * from demo_data_summary()');
check('nothing seeded is left', Object.values(after).every((v) => Number(v) === 0),
  JSON.stringify(after));

check('the real member is still here', (await one(
  `select count(*)::int as n from profiles where id = '${REAL}'`)).n === 1);
check('and so is their payment', (await realPayments()).n === 1);
check('and their auth row', (await one(
  `select count(*)::int as n from auth.users where id = '${REAL}'`)).n === 1);

// A real class the demo coach was teaching keeps existing, uncoached — the
// rule the script always had, asserted now rather than described.
check('no class is left pointing at a coach who no longer exists', (await one(`
  select count(*)::int as n from classes c
   where c.trainer_id is not null
     and not exists (select 1 from profiles p where p.id = c.trainer_id)`)).n === 0);
check('no booking is left pointing at a member who no longer exists', (await one(`
  select count(*)::int as n from bookings b
   where not exists (select 1 from profiles p where p.id = b.member_id)`)).n === 0);

// Twice is safe: the evening-before-a-demo user will press it again to be sure.
await as(PLATFORM);
const again = await one('select remove_demo_data() as msg');
check('running it a second time is safe and says so', /No demo data found/.test(again.msg), again.msg);

console.log(failures ? `\n${failures} FAILED` : '\nall 0117 checks passed');
process.exit(failures ? 1 : 0);
