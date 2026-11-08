/**
 * 0241: the website's words. Anyone (a visitor) reads them; only a platform admin saves; the keys are a fixed
 * list with a length each; an empty save goes back to the built-in words; each change is logged; the detail
 * (who, when) is the platform's only; the table cannot be written or read around the functions.
 *
 *   node <repo>/scripts/sql/site-texts.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

const PLAT = 'a2410000-0000-4000-8000-0000000000a1';
const OWN = 'a2410000-0000-4000-8000-0000000000b1';
await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PLAT}', 'p@s.test', '{}'), ('${OWN}', 'o@s.test', '{}');
  insert into profiles (id, role, first_name, last_name, email, status) values
    ('${PLAT}', 'admin', 'Plat', 'Form', 'p@s.test', 'active'), ('${OWN}', 'admin', 'Olive', 'Owner', 'o@s.test', 'active') on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PLAT}') on conflict do nothing;`);

await anon();
check('a visitor reads an empty set at first (the built-in words show)', JSON.stringify((await one(`select site_texts() as t`)).t) === '{}');
let err = await tryExec(`select save_site_text('hero_title_1', 'Hacked')`);
check('a visitor cannot save', err !== null, String(err));

await as(OWN);
err = await tryExec(`select save_site_text('hero_title_1', 'Owner words')`);
check('a gym owner cannot change the website', err !== null && /Only Core Fitness/.test(err), String(err));
err = await tryExec(`insert into site_texts (key, value) values ('hero_title_1', 'around')`);
check('…nor write the table directly', err !== null, String(err));

await as(PLAT);
err = await tryExec(`select save_site_text('made_up_key', 'x')`);
check('a key the site does not have is refused', err !== null && /no text called/.test(err), String(err));
err = await tryExec(`select save_site_text('hero_title_1', '${'x'.repeat(41)}')`);
check('words over the limit are refused', err !== null && /under 40/.test(err), String(err));
err = await tryExec(`select save_site_text('hero_title_1', '  Run a better gym,  ')`);
check('the platform admin saves', err === null, String(err));
await tryExec(`select save_site_text('notice', 'Closed on Christmas Day.')`);

await anon();
const t = (await one(`select site_texts() as t`)).t;
check('a visitor now reads the saved words, trimmed', t.hero_title_1 === 'Run a better gym,' && t.notice === 'Closed on Christmas Day.', JSON.stringify(t));
check('…but not who changed them', (await db.query(`select * from site_texts`).catch(() => ({ rows: [] }))).rows.length === 0);
const d0 = await tryExec(`select * from site_texts_detail()`);
check('a visitor cannot call the detail', d0 !== null, String(d0));

await as(PLAT);
const d = await one(`select value, updated_by from site_texts_detail() where key = 'hero_title_1'`);
check('the platform sees who changed it', d && /Plat/.test(d.updated_by), JSON.stringify(d));
await db.exec(`select save_site_text('notice', '   ')`);
await anon();
check('saving empty goes back to the built-in words', !('notice' in (await one(`select site_texts() as t`)).t));

await owner();
const logs = Number((await one(`select count(*) as n from platform_events where action = 'site_text'`)).n);
check('each change is logged for the platform', logs === 3, String(logs));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
