/**
 * 0264: clean-ups. Only the platform; a count first; the word "delete" typed; the last week always kept; only
 * handled crash reports go, open ones and everything else stay.
 *
 *   node <repo>/scripts/sql/capacity-cleanup.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const PA = 'a1000000-0000-4000-8000-000000000319';
const MEM = 'a1000000-0000-4000-8000-000000000314';
const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; };
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); }

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@cl-test.com', '{}'), ('${MEM}', 'mem@cl-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${PA}', 'P', 'A', 'pa@cl-test.com', 'active', 'member', '${GYM_A}'),
    ('${MEM}', 'M', 'E', 'mem@cl-test.com', 'active', 'member', '${GYM_A}') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_A}', '${MEM}', 'member', 'active') on conflict do nothing;
  delete from client_errors;
  insert into client_errors (app, message, created_at, resolved_at) values
    ('admin', 'old handled', now() - interval '60 days', now() - interval '50 days'),
    ('admin', 'old handled 2', now() - interval '40 days', now() - interval '39 days'),
    ('member', 'old but open', now() - interval '60 days', null),
    ('member', 'recent handled', now() - interval '2 days', now() - interval '1 day');`);

const monthAgo = (await one(`select to_char((now() at time zone 'Asia/Manila')::date - 30, 'YYYY-MM-DD') as d`)).d;
const yesterday = (await one(`select to_char((now() at time zone 'Asia/Manila')::date - 1, 'YYYY-MM-DD') as d`)).d;

await as(MEM);
check('a gym member sees no count', (await one(`select platform_cleanup_preview('${monthAgo}') as p`)).p === null);
check('a gym member cannot delete', !!(await tryExec(`select platform_cleanup_crashes('${monthAgo}', 'delete')`)));

await as(PA);
const p = (await one(`select platform_cleanup_preview('${monthAgo}') as p`)).p;
check('the count comes first: 2 handled before the date, 1 open', p.handled_crashes === 2 && p.open_crashes === 1, JSON.stringify(p));
check('without the typed word nothing goes', !!(await tryExec(`select platform_cleanup_crashes('${monthAgo}', 'yes')`)));
check('the last week is always kept', !!(await tryExec(`select platform_cleanup_crashes('${yesterday}', 'delete')`)));
check('the platform deletes them', Number((await one(`select platform_cleanup_crashes('${monthAgo}', 'delete') as n`)).n) === 2);
await db.exec('reset role;');
const left = (await db.query(`select message from client_errors order by message`)).rows.map((r) => r.message);
check('the open one and the recent one stay', JSON.stringify(left) === JSON.stringify(['old but open', 'recent handled']), JSON.stringify(left));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
