/**
 * 0134: platform_gyms() carries each gym's logo and colour — to the platform
 * admin only; a gym's own owner still reads nothing from it.
 *
 *   node <repo>/scripts/sql/platform-logos.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const PA = 'a1000000-0000-4000-8000-000000000009';
const OWNER_B = 'b1000000-0000-4000-8000-000000000001';

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
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@logo-test.com', '{}'), ('${OWNER_B}', 'ob@logo-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values
    ('${PA}', 'Plat', 'Form', 'pa@logo-test.com', 'active', 'member'), ('${OWNER_B}', 'Own', 'B', 'ob@logo-test.com', 'active', 'member')
    on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_B}', '${OWNER_B}', 'admin', 'active') on conflict do nothing;
  update profiles set active_gym_id = '${GYM_B}' where id = '${OWNER_B}';
  update profiles set active_gym_id = '${GYM_A}' where id = '${PA}';
  insert into gym_settings (gym_id, gym_name, logo_url, accent) values ('${GYM_B}', 'Gym B', 'https://example.test/gyms/b/logo.png', 'teal')
    on conflict (gym_id) do update set logo_url = excluded.logo_url, accent = excluded.accent;
  update gym_settings set logo_url = null where gym_id = '${GYM_A}';`);

await as(PA);
const rows = await all(`select id, logo_url, accent from platform_gyms()`);
const b = rows.find((r) => r.id === GYM_B);
const a = rows.find((r) => r.id === GYM_A);
check("the platform sees a gym's logo and colour", b?.logo_url === 'https://example.test/gyms/b/logo.png' && b?.accent === 'teal', JSON.stringify(b));
check('a gym with no logo: none, never a stand-in', a && a.logo_url === null, JSON.stringify(a));
await as(OWNER_B);
check("a gym's own owner still reads nothing from it", (await all(`select * from platform_gyms()`)).length === 0);
await db.exec(`reset role; set role anon;`);
check('anon cannot call it', !!(await tryExec(`select * from platform_gyms()`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0134 checks passed');
process.exit(failures ? 1 : 0);
