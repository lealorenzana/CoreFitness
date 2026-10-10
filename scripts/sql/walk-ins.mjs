/**
 * 0185: day passes and walk-ins at the desk — the gym's price, never the
 * screen's; packs; the phone finds the guest next time; walk-in cash in the
 * drawer; a same-day void; never a member; the platform sees a count.
 *
 *   node <repo>/scripts/sql/walk-ins.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1850000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c'), PA = id('0d');
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
  ${[['own', AD, 'admin'], ['desk', ST, 'staff'], ['mem', M, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@walkin-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@walkin-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@walkin-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@walkin-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);
const membersBefore = (await one(`select count(*)::int n from gym_roles where gym_id = '${GYM}'`)).n;
const visit = (guest, name, phone, kind) => `select * from record_guest_visit(${guest ? `'${guest}'` : 'null'}, ${name ? `'${name}'` : 'null'}, ${phone ? `'${phone}'` : 'null'}, '${kind}', 'cash')`;

// ---- off until the owner sets a price ----
await as(ST);
check('day passes are off until the owner turns them on, said in words', /Turn them on/.test((await tryExec(visit(null, 'Ana', null, 'day'))) ?? ''));
await as(ST);
check('the desk cannot set prices', (await tryExec(`select set_day_pass_settings(true, 150, 650, 1200, 4)`)) !== null);
await as(AD);
check('turning them on needs a day price', (await tryExec(`select set_day_pass_settings(true, null, null, null, null)`)) !== null);
await db.exec(`select set_day_pass_settings(true, 150, 650, null, 3)`);

// ---- a walk-in ----
await as(M);
check('a member cannot record a walk-in', (await tryExec(visit(null, 'Ana', null, 'day'))) !== null);
await as(ST);
let r = await one(visit(null, 'Ana Cruz', '0917 555 0101', 'day'));
check("a day pass is the gym's price", Number(r.amount) === 150, JSON.stringify(r));
const ana = r.guest_id;
const found = await one(`select * from find_guest('+63 917-555-0101')`);
check('the phone finds the same guest next time, however it is typed', found?.id === ana && found.visits_this_month === 1, JSON.stringify(found));
check('a second guest with that phone is refused, in words', /already on the list/.test((await tryExec(visit(null, 'Someone', '+639175550101', 'day'))) ?? ''));
check('a 10-visit pack the gym does not sell is refused', /does not sell a 10-visit pack/.test((await tryExec(visit(ana, null, null, 'pack10'))) ?? ''));
r = await one(visit(ana, null, null, 'pack5'));
check('a 5-visit pack: the pack price, and 4 visits left after today', Number(r.amount) === 650 && r.visits_left === 4, JSON.stringify(r));
r = await one(visit(ana, null, null, 'pack_visit'));
check('a visit from the pack costs nothing and leaves 3', Number(r.amount) === 0 && r.visits_left === 3, JSON.stringify(r));
check('…and at 3 visits this month the desk is told to suggest a membership', r.suggest_membership === true && r.visits_this_month === 3);

// ---- the drawer, the day's list, a void ----
let cash = await one(`select * from cash_day_summary(manila_today())`);
check('walk-in cash is in the drawer (₱150 + ₱650)', Number(cash.cash_in) >= 800, JSON.stringify(cash));
const list = await all(`select * from guest_visits_on(manila_today())`);
check("today's walk-ins for the desk's list", list.length === 3 && list.every((v) => v.name === 'Ana Cruz'));
const packRow = list.find((v) => v.kind === 'pack5');
const before = Number(cash.cash_in);
await db.exec(`select void_guest_visit('${packRow.id}')`);
cash = await one(`select * from cash_day_summary(manila_today())`);
check('a same-day void takes it out of the drawer', Number(cash.cash_in) === before - 650, `${before} → ${cash.cash_in}`);
check('…and the pack visits with it', (await one(`select * from find_guest('09175550101')`)).visits_left === 0);

// ---- never a member ----
await owner();
check('a walk-in is not a member: no account, no role', (await one(`select count(*)::int n from gym_roles where gym_id = '${GYM}'`)).n === membersBefore);
await as(M);
check('a member cannot see the guest list', (await all(`select * from guests`)).length === 0);

// ---- the platform's count ----
await as(PA);
const use = await all(`select * from platform_gym_usage(30) where feature = 'guests'`);
check('the platform sees guest visits as a number (voided ones not counted)', use.some((u) => u.gym_id === GYM && Number(u.n) === 2), JSON.stringify(use));
check('…and still everything else 0149 counted', (await all(`select distinct feature from platform_gym_usage(30)`)).length >= 1);

await owner();
check('marker', (await one(`select migration_0185_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0185 checks passed');
process.exit(failures ? 1 : 0);
