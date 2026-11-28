/**
 * 0284: a gym's own lists (areas and four kinds of category). Anyone in the gym reads them; owner and desk add,
 * a coach adds areas only, a member adds nothing; adding a name already there (any case) returns it; renaming is
 * the owner's and renames every row that used the old name; retiring is the owner's; nobody writes the table
 * directly.
 *
 *   node <repo>/scripts/sql/gym-choices.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0284 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (s) => `a2840000-0000-4000-8000-0000000000${s}`;
const AD = id('ad'), ST = id('5e'), CO = id('c0'), ME = id('01');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = [['own', AD, 'admin'], ['desk', ST, 'staff'], ['coach', CO, 'trainer'], ['mem', ME, 'member']];
await db.exec(`
  ${people.map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@choices-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@choices-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  select act_as_gym('${GYM}');
  insert into class_templates (gym_id, name, day_of_week, start_time, duration_minutes, capacity, location)
    values ('${GYM}', 'Choices HIIT', 1, '06:00', 60, 10, 'studio a');
  insert into gym_equipment (gym_id, name, category, quantity, location_note) values ('${GYM}', 'Choices rack', 'machines', 1, 'Studio A');`);

// 1. Adding.
await as(AD);
const a1 = await tryOne(`select gym_choice_add('area', 'Studio A') id`);
check('the owner adds an area', a1.err === null && !!a1.row.id, a1.err ?? '');
const a2 = await tryOne(`select gym_choice_add('area', '  studio a ') id`);
check('…the same name in another case returns the same entry, no duplicate', a2.row?.id === a1.row?.id, JSON.stringify(a2));
await as(ST);
check('the desk adds a shop category', (await tryOne(`select gym_choice_add('shop', 'Drinks') id`)).err === null);
await as(CO);
check('a coach adds an area (they run their own classes)', (await tryOne(`select gym_choice_add('area', 'Mat area') id`)).err === null);
check('…but not a shop category', /Only the gym/.test((await tryOne(`select gym_choice_add('shop', 'Coach snacks') id`)).err ?? ''));
await as(ME);
check('a member adds nothing', /Only the gym/.test((await tryOne(`select gym_choice_add('area', 'My corner') id`)).err ?? ''));
check('…but reads the gym’s list', Number((await one(`select count(*) n from gym_choices where kind = 'area'`)).n) === 2);
check('nobody writes the table directly', (await tryOne(`insert into gym_choices (gym_id, kind, name) values ('${GYM}', 'area', 'Sneaky')`)).err !== null);
await as(AD);
check('a name over 60 characters is refused', /1 to 60/.test((await tryOne(`select gym_choice_add('area', '${'x'.repeat(61)}') id`)).err ?? ''));

// 2. Renaming: the owner's, and every row that used the old name follows.
await as(ST);
check('the desk cannot rename', /Only the gym owner/.test((await tryOne(`select gym_choice_rename('${a1.row.id}', 'Studio 1') n`)).err ?? ''));
await as(AD);
const mat = (await one(`select id from gym_choices where kind = 'area' and name = 'Mat area'`)).id;
check('renaming onto a name already on the list is refused', /already on this list/.test((await tryOne(`select gym_choice_rename('${a1.row.id}', 'mat AREA') n`)).err ?? ''));
const r = await tryOne(`select gym_choice_rename('${a1.row.id}', 'Studio 1') n`);
check('the owner renames Studio A to Studio 1: the class and the rack both follow', r.err === null && Number(r.row.n) === 2, JSON.stringify(r));
await owner();
const after = await one(`select (select location from class_templates where name = 'Choices HIIT') c, (select location_note from gym_equipment where name = 'Choices rack') e`);
check('…both rows now say Studio 1', after.c === 'Studio 1' && after.e === 'Studio 1', JSON.stringify(after));

// 3. Retiring.
await as(ST);
check('the desk cannot retire', /Only the gym owner/.test((await tryOne(`select gym_choice_retire('${mat}', true)`)).err ?? ''));
await as(AD);
await db.exec(`select gym_choice_retire('${mat}', true)`);
check('the owner retires an area; the entry stays, marked', (await one(`select retired_at is not null r from gym_choices where id = '${mat}'`)).r === true);
await db.exec(`select gym_choice_add('area', 'Mat Area')`);
check('…adding it again brings it back', (await one(`select retired_at is null r from gym_choices where id = '${mat}'`)).r === true);

console.log(failures ? `\n${failures} check(s) failed` : '\nall passed');
process.exit(failures ? 1 : 0);
