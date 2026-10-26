/**
 * 0214: the ready-made colour pairs are free, codes and all; any other colour code still needs the
 * ₱499 unlock (0191). The database's list must be exactly the codes in the admin app's pair file.
 *
 *   node <repo>/scripts/sql/free-pair-colours.mjs "<repo>"   (from a dir with pglite installed)
 */
import fs from 'node:fs';
import path from 'node:path';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const AD = 'a2140000-0000-4000-8000-00000000000d';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

// ---- the list matches the pairs the owner is shown ------------------------------------------------------
const file = fs.readFileSync(path.join(REPO, 'g-fitness-admin/src/lib/themePairs.ts'), 'utf-8');
const inFile = [...new Set((file.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((c) => c.toUpperCase()))].sort();
await owner();
const inDb = [...(await db.query(`select unnest(free_pair_colours()) c`)).rows.map((r) => r.c)].sort();
check('the free list is exactly the codes the ready-made pairs use', JSON.stringify(inFile) === JSON.stringify(inDb),
  `file only: ${inFile.filter((c) => !inDb.includes(c)).join(' ')} | db only: ${inDb.filter((c) => !inFile.includes(c)).join(' ')}`);

// ---- an owner who has not bought custom colours ---------------------------------------------------------
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${AD}', 'own@fp-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${AD}', 'Own', 'T', 'own@fp-test.com', 'active', 'admin', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${AD}';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${AD}', 'admin', 'active');
  delete from gym_theme_unlocks where gym_id = '${GYM}' and theme_key = 'custom_colours';
  update gym_settings set accent = 'violet', accent_action = null where gym_id = '${GYM}';`);
await as(AD);
let err = await tryExec(`update gym_settings set accent = '#7C3AED', accent_action = '#A3E635' where gym_id = '${GYM}'`);
check('a ready-made pair written as codes (Volt) publishes without the unlock', err === null, err ?? '');
err = await tryExec(`update gym_settings set accent = '#4338ca', accent_action = '#eab308' where gym_id = '${GYM}'`);
check('…in lower case too (Royal)', err === null, err ?? '');
err = await tryExec(`update gym_settings set accent = '#1F8A70' where gym_id = '${GYM}'`);
check('a code of their own still needs the unlock', /one-time purchase/.test(err ?? ''), err ?? 'no error');
err = await tryExec(`update gym_settings set accent_action = '#123456' where gym_id = '${GYM}'`);
check('…for the action colour as well', /one-time purchase/.test(err ?? ''), err ?? 'no error');

await owner();
await db.exec(`insert into gym_theme_unlocks (gym_id, theme_key, how) values ('${GYM}', 'custom_colours', 'platform') on conflict do nothing;`);
await as(AD);
err = await tryExec(`update gym_settings set accent = '#1F8A70' where gym_id = '${GYM}'`);
check('with the unlock, their own code is saved', err === null, err ?? '');
check('the 0214 marker answers', (await db.query(`select migration_0214_applied() a`)).rows[0].a === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
