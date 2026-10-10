/**
 * 0182: where each gym is, the finder list (how each gym is joined, never its
 * code), OpenStreetMap's gyms readable by anyone but written by no one here,
 * and suggesting a gym that is not on Core Fitness.
 *
 *   node <repo>/scripts/sql/gym-finder.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-0000000001a2';
const AD = 'a1820000-0000-4000-8000-00000000000a';
const ST = 'a1820000-0000-4000-8000-00000000000b';
const M = 'a1820000-0000-4000-8000-00000000000c';
const PA = 'a1820000-0000-4000-8000-00000000000d';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['own', AD, 'admin'], ['desk', ST, 'staff'], ['mem', M, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@finder-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@finder-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@finder-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@finder-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gyms (id, slug, name) values ('${GYM2}', 'desk-only-gym', 'Desk Only Gym') on conflict do nothing;
  insert into gym_settings (gym_id, join_policy, join_code, address) values ('${GYM2}', 'closed', 'SECRET', 'Mamburao, Occidental Mindoro')
    on conflict (gym_id) do update set join_policy = 'closed', join_code = 'SECRET', address = excluded.address;
  insert into osm_gyms (osm_id, name, latitude, longitude, tile) values ('node/1', 'Iron Den', 13.2232, 120.5960, '13.25:120.50');`);

// ---- the pin ----
await as(ST);
check('the front desk cannot move the gym', (await tryExec(`select set_gym_location(13.22, 120.59)`)) !== null);
await as(AD);
check('a place off the map is refused', (await tryExec(`select set_gym_location(120.59, 13.22)`)) !== null);
check('half a place is refused', (await tryExec(`select set_gym_location(13.22, null)`)) !== null);
await db.exec(`select set_gym_location(13.223456, 120.596789)`);
await owner();
const g = await one(`select latitude::float lat, longitude::float lng from gyms where id = '${GYM}'`);
check('the owner pins the gym', Math.abs(g.lat - 13.223456) < 1e-6 && Math.abs(g.lng - 120.596789) < 1e-6, JSON.stringify(g));

// ---- the finder, signed out ----
await anon();
const rows = await all(`select * from gym_finder(null)`);
const desk = rows.find((r) => r.id === GYM2);
check('signed out, the finder lists a front-desk-only gym too, saying so', desk?.join_policy === 'closed', JSON.stringify(desk));
check('…with its address, never its join code', desk?.address === 'Mamburao, Occidental Mindoro' && !('join_code' in desk));
check('…and the pinned gym has its place', rows.some((r) => r.id === GYM && Number(r.latitude) > 13));
check('a search matches the address', (await all(`select id from gym_finder('Occidental')`)).some((r) => r.id === GYM2));
check("OpenStreetMap's gyms are readable by anyone", (await one(`select count(*)::int n from osm_gyms where osm_id = 'node/1'`)).n === 1);
check('…and written by no one through the API', (await tryExec(`insert into osm_gyms (osm_id, name, latitude, longitude, tile) values ('node/2', 'Fake', 1, 1, 'x')`)) !== null);

// ---- suggesting ----
await db.exec(`select suggest_gym('node/1', 'Iron Den', 13.2232, 120.5960, 'Please add them')`);
check("suggestions are not readable by the public (RLS, no policy: zero rows)", (await all(`select * from gym_suggestions`)).length === 0);
await as(M);
await db.exec(`select suggest_gym('node/1', 'Iron Den', 13.2232, 120.5960, null)`);
await db.exec(`select suggest_gym('node/1', 'Iron Den', 13.2232, 120.5960, null)`);
check('a member suggesting twice counts once', (await (async () => { await owner(); return one(`select count(*)::int n from gym_suggestions where suggested_by = '${M}'`); })()).n === 1);
await as(AD);
check('a gym owner does not read the platform\'s suggestions', (await all(`select * from platform_gym_suggestions()`)).length === 0);
await as(PA);
const sug = await all(`select * from platform_gym_suggestions()`);
check('the platform sees each suggested gym once, with how many asked and the notes', sug.length === 1 && sug[0].asks === 2 && sug[0].notes.includes('Please add them'), JSON.stringify(sug));

// ---- 0183: the platform fills the cache from its own browser ----
const ROWS = `'[{"osm_id":"node/9","name":"Barako Gym","latitude":13.21,"longitude":120.61,"address":null},{"osm_id":"evil","name":"Fake","latitude":1,"longitude":1}]'::jsonb`;
await as(AD);
check('a gym owner cannot write map data', (await tryExec(`select platform_store_osm_tile('13.00:120.50', ${ROWS})`)) !== null);
await anon();
check('nor can anyone signed out', (await tryExec(`select platform_store_osm_tile('13.00:120.50', ${ROWS})`)) !== null);
await as(PA);
check('a made-up area is refused', (await tryExec(`select platform_store_osm_tile('anywhere', ${ROWS})`)) !== null);
const stored = (await one(`select platform_store_osm_tile('13.00:120.50', ${ROWS}) n`)).n;
check('the platform stores an area — and a row that is not an OpenStreetMap id is dropped', stored === 1, String(stored));
await owner();
check('…and the area is marked fresh', (await one(`select count::int c from osm_tiles where tile = '13.00:120.50'`)).c === 1);
await as(PA);
check('the platform reads where gyms are pinned', (await all(`select * from platform_pinned_gyms()`)).some((r) => r.id === GYM));
await as(AD);
check('…a gym owner does not', (await all(`select * from platform_pinned_gyms()`)).length === 0);

await owner();
check('marker', (await one(`select migration_0182_applied() ok`)).ok === true && (await one(`select migration_0183_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0182 + 0183 checks passed');
process.exit(failures ? 1 : 0);
