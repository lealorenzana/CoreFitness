/**
 * 0195: a coach message that never reached the model is given back — today's
 * count down by one, and a top-up returned when that claim had spent one.
 * Members cannot call it.
 *
 *   node <repo>/scripts/sql/ai-release.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1950000-0000-4000-8000-0000000000${n}`;
const M1 = id('01'), M2 = id('02');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const claim = async (m) => { await owner(); return (await one(`select ai_claim_message('${GYM}', '${m}') ok`)).ok; };
const release = async (m) => { await owner(); await db.exec(`select ai_release_message('${GYM}', '${m}')`); };
const today = async (m) => { await owner(); return (await one(`select coalesce(sum(messages), 0)::int n from ai_usage_days where member_id = '${m}' and day = manila_today()`)).n; };
const credits = async () => { await owner(); return (await one(`select coalesce((select balance from gym_ai_credits where gym_id = '${GYM}'), 0)::int n`)).n; };

await owner();
await db.exec(`
  ${[['m1', M1], ['m2', M2]].map(([k, u]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@rel-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@rel-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', 'member', 'active')
      on conflict (gym_id, user_id) do update set status = 'active';`).join('\n')}
  delete from ai_usage_days where gym_id = '${GYM}';
  update gym_settings set ai_daily_messages = 10, ai_monthly_messages = 2 where gym_id = '${GYM}';
  insert into gym_ai_credits (gym_id, balance) values ('${GYM}', 3)
    on conflict (gym_id) do update set balance = 3;`);

check('a claim counts a message', (await claim(M1)) && (await today(M1)) === 1);
await release(M1);
check('a failed message is given back', (await today(M1)) === 0);
await release(M1);
check('giving back twice never goes below zero', (await today(M1)) === 0);

// The month's allowance (2) used, a third claim spends a top-up; releasing it returns the top-up.
await claim(M1); await claim(M2);
check('within the allowance no top-up is spent', (await credits()) === 3);
check('past the allowance a top-up is spent', (await claim(M2)) && (await credits()) === 2);
await release(M2);
check('…and given back with the message', (await credits()) === 3 && (await today(M2)) === 1);
await release(M2);
check('a message inside the allowance gives back no top-up', (await credits()) === 3 && (await today(M2)) === 0);

await as(M1);
check('a member cannot give messages back', !!(await tryExec(`select ai_release_message('${GYM}', '${M1}')`)));
await owner();
check('marker', (await one(`select migration_0195_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0195 checks passed');
process.exit(failures ? 1 : 0);
