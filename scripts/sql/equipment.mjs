/**
 * 0184: the gym's equipment — the owner keeps the list, members read it and
 * report a problem (once per item until it is fixed), the desk marks it under
 * repair or fixed and the reporters are told, exercises link to items, and the
 * AI coach's gym facts carry the list.
 *
 *   node <repo>/scripts/sql/equipment.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-0000000001b4';
const id = (n) => `a1840000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c'), M2 = id('0d'), T = id('0e'), OTHER = id('0f');
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
  insert into gyms (id, slug, name) values ('${GYM2}', 'other-equip-gym', 'Other Gym') on conflict do nothing;
  ${[['own', AD, 'admin', GYM], ['desk', ST, 'staff', GYM], ['m', M, 'member', GYM], ['m2', M2, 'member', GYM], ['coach', T, 'trainer', GYM], ['other', OTHER, 'admin', GYM2]].map(([k, u, role, g]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@equip-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@equip-test.com', 'active', '${role}', '${g}') on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}`);
const press = (await one(`select id from exercises where gym_id is null and name ilike 'leg press%' limit 1`))?.id
  ?? (await one(`select id from exercises where gym_id is null limit 1`)).id;

// ---- the owner keeps the list ----
await as(M);
check('a member cannot add equipment', (await tryExec(`insert into gym_equipment (name) values ('Fake rack')`)) !== null);
await as(ST);
check('nor can the front desk', (await tryExec(`insert into gym_equipment (name) values ('Fake rack')`)) !== null);
await as(AD);
const item = (await one(`insert into gym_equipment (name, category, quantity, location_note) values ('Leg press', 'machines', 2, '2nd floor, machines') returning id`)).id;
await db.exec(`insert into equipment_exercises (equipment_id, exercise_id) values ('${item}', '${press}')`);
check('the owner adds an item and links an exercise', !!item);

// ---- members read it ----
await as(M);
const seen = await one(`select name, quantity, location_note, status from gym_equipment where id = '${item}'`);
check('a member reads the item, where it is, and that it is available', seen?.location_note === '2nd floor, machines' && seen.status === 'available', JSON.stringify(seen));
check('…and which exercises use it', (await one(`select count(*)::int n from equipment_exercises where equipment_id = '${item}'`)).n === 1);
await as(OTHER);
check("another gym's owner does not see it", (await one(`select count(*)::int n from gym_equipment where id = '${item}'`)).n === 0);

// ---- reporting ----
await as(M);
check('a report needs words', (await tryExec(`select report_equipment('${item}', 'x')`)) !== null);
await db.exec(`select report_equipment('${item}', 'The seat pin is stuck')`);
check('one open report per member per item, said in words', /already reported/.test((await tryExec(`select report_equipment('${item}', 'Still stuck')`)) ?? ''));
await as(M2);
await db.exec(`select report_equipment('${item}', 'Makes a grinding noise')`);
check('a member sees only their own report', (await one(`select count(*)::int n from equipment_reports`)).n === 1);
await owner();
check('the desk is told', (await one(`select count(*)::int n from notifications where user_id = '${ST}' and title = 'Equipment problem: Leg press'`)).n === 2);
await as(ST);
check("the desk's queue has both", (await all(`select * from open_equipment_reports()`)).length === 2);
await as(M);
check('a member cannot set the status', (await tryExec(`select set_equipment_status('${item}', 'repair')`)) !== null);
check("…nor read the desk's queue", (await all(`select * from open_equipment_reports()`)).length === 0);

// ---- the desk fixes it ----
await as(ST);
await db.exec(`select set_equipment_status('${item}', 'repair')`);
await as(M);
check('under repair, members see it', (await one(`select status from gym_equipment where id = '${item}'`)).status === 'repair');
await owner();
check('…and the reporters are told it is being repaired', (await one(`select count(*)::int n from notifications where user_id in ('${M}', '${M2}') and title = 'Leg press is being repaired'`)).n === 2);
await as(ST);
await db.exec(`select set_equipment_status('${item}', 'available')`);
await owner();
check('fixed: the reports close', (await one(`select count(*)::int n from equipment_reports where status = 'open'`)).n === 0);
check('…and the reporters are told', (await one(`select count(*)::int n from notifications where user_id = '${M}' and title = 'Leg press is fixed'`)).n === 1);
await as(M);
await db.exec(`select report_equipment('${item}', 'Broken again')`);
check('once fixed, it can be reported again', (await one(`select count(*)::int n from equipment_reports where status = 'open'`)).n === 1);

// ---- the AI coach reads it ----
await as(M);
const info = (await one(`select ai_coach_gym_info() i`)).i;
check("the coach's gym facts carry the equipment, where it is and its status", Array.isArray(info.equipment)
  && info.equipment.some((e) => e.name === 'Leg press' && e.where === '2nd floor, machines' && e.how_many === 2), JSON.stringify(info.equipment));
check('…and still everything 0177 gave it', Array.isArray(info.plans) && 'gym' in info);
await owner();
await db.exec(`insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'equipment', false)
  on conflict (gym_id, feature_key) do update set enabled = false`);
await as(M);
check('a gym with the switch off gives the coach no list', (await one(`select ai_coach_gym_info() i`)).i.equipment === null);

await owner();
check('marker', (await one(`select migration_0184_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0184 checks passed');
process.exit(failures ? 1 : 0);
