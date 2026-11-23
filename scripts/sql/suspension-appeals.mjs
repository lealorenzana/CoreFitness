/**
 * 0265: appealing a Core Fitness suspension. Only the suspended person appeals, once per suspension, in 20 to 2000
 * characters, with a file only from their own folder; they read where it stands; a gym owner can neither read nor
 * decide; a platform admin lists and decides with a note; upheld keeps the suspension and the person reads why;
 * lifted gives everything back and the gym is told as 0226 does; nobody reads the table directly; 0265 runs twice.
 *
 *   node <repo>/scripts/sql/suspension-appeals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0226' });
const G = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2650000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), OWNER = id('02'), MEM = id('03'), OTHER = id('04');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const LONG = 'I paid at the desk in cash and have the receipt; the report about me was a mix-up with another member.';

await owner();
const people = { [PA]: 'Pia', [OWNER]: 'Omar', [MEM]: 'Mara', [OTHER]: 'Olin' };
await db.exec(Object.entries(people).map(([u, nm]) => `
  insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${nm.toLowerCase()}@appeal-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${u}', '${nm}', 'Test', '${nm.toLowerCase()}@appeal-test.ph', 'active', 'member', '${G}')
    on conflict (id) do update set first_name = excluded.first_name, active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${u}';`).join('\n') + `
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  delete from gym_roles where gym_id = '${G}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${G}', '${OWNER}', 'admin', 'active'), ('${G}', '${MEM}', 'member', 'active'), ('${G}', '${OTHER}', 'member', 'active');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${G}', '${MEM}', 'qr-mara-a'), ('${G}', '${OTHER}', 'qr-olin-a') on conflict do nothing;
  update gyms set onboarded_at = coalesce(onboarded_at, now()) where id = '${G}';`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0226'); } catch (e) { err = String(e); }
check('0226 onward applies, 0265 with it', err === null, err);

await as(PA);
await db.exec(`select platform_suspend('${MEM}', 'Abusive messages to coaches at three gyms.')`);

await as(OTHER);
check('someone not suspended cannot appeal', /not suspended/.test(await tryExec(`select appeal_my_suspension('${LONG}')`) ?? ''));

await as(MEM);
check('the suspended person reads it with no appeal yet', (await one(`select my_platform_suspension() s`)).s.appeal === null);
check('a few words are refused', /at least 20/.test(await tryExec(`select appeal_my_suspension('Not me')`) ?? ''));
check('a file from someone else\'s folder is refused', /own folder/.test(await tryExec(`select appeal_my_suspension('${LONG}', '${OTHER}/x.png')`) ?? ''));
check('a proper appeal is sent, with their own file', (await tryExec(`select appeal_my_suspension('${LONG}', '${MEM}/receipt.png')`)) === null);
check('…once: a second is refused', /already appealed/.test(await tryExec(`select appeal_my_suspension('${LONG}')`) ?? ''));
check('…and they read it as pending', (await one(`select my_platform_suspension() s`)).s.appeal.status === 'pending');
check('nobody reads the table directly', !!(await tryExec(`select * from platform_appeals`)) || (await db.query(`select * from platform_appeals`)).rows.length === 0);

await as(OWNER);
check('a gym owner cannot list appeals', (await db.query(`select * from platform_appeals_list('all')`)).rows.length === 0);
const aid = async () => { await owner(); const r = (await one(`select id from platform_appeals where person = '${MEM}'`)).id; return r; };
const A1 = await aid();
await as(OWNER);
check('…nor decide one', /Only Core Fitness/.test(await tryExec(`select platform_decide_appeal('${A1}', true, 'Looks fine')`) ?? ''));
check('…and the gym is not told an appeal exists', await n(`select count(*) n from notifications where user_id = '${OWNER}' and (title ilike '%appeal%' or message ilike '%appeal%')`) === 0);

await as(PA);
const list = (await db.query(`select * from platform_appeals_list('pending')`)).rows;
check('the platform lists it with the statement, reason and email', list.length === 1 && list[0].statement === LONG
  && list[0].reason.startsWith('Abusive') && list[0].email === 'mara@appeal-test.ph' && list[0].attachment === `${MEM}/receipt.png`, JSON.stringify(list));
check('a decision needs a note', /Say why/.test(await tryExec(`select platform_decide_appeal('${A1}', false, '')`) ?? ''));
await db.exec(`select platform_decide_appeal('${A1}', false, 'Three gyms sent the same messages; the suspension stays.')`);
check('…deciding twice is refused', /already decided/.test(await tryExec(`select platform_decide_appeal('${A1}', true, 'Changed my mind')`) ?? ''));

await as(MEM);
const upheld = (await one(`select my_platform_suspension() s`)).s;
check('upheld: still suspended, and they read why', upheld.appeal.status === 'upheld' && /suspension stays/.test(upheld.appeal.decision_note)
  && (await one(`select current_gym_id() g`)).g === null, JSON.stringify(upheld));

// The other road: an appeal that lifts the suspension.
await as(PA);
await db.exec(`select platform_suspend('${OTHER}', 'Reported for sharing their login.')`);
await as(OTHER);
await db.exec(`select appeal_my_suspension('My brother used my phone once; I changed my password the same day.')`);
const A2 = await (async () => { await owner(); return (await one(`select id from platform_appeals where person = '${OTHER}'`)).id; })();
await as(PA);
await db.exec(`select platform_decide_appeal('${A2}', true, 'A one-off, and the password was changed.')`);
await as(OTHER);
check('lifted: their gym answers them again', (await one(`select current_gym_id() g`)).g === G && (await one(`select my_platform_suspension() s`)).s === null);
await as(OWNER);
check('…and the gym is told as 0226 tells it', await n(`select count(*) n from notifications where user_id = '${OWNER}' and title = 'Suspension lifted'`) === 1);
await as(PA);
check('the full list keeps both decisions', (await db.query(`select status from platform_appeals_list('all')`)).rows.map((r) => r.status).sort().join(',') === 'lifted,upheld');

await owner();
err = null;
try { await db.exec(readFileSync(join(REPO, 'supabase', 'migrations', '0265_suspension_appeals.sql'), 'utf8')); } catch (e) { err = describe(e); }
check('0265 runs twice', err === null, err);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
