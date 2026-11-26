/**
 * 0283: Help for the owner and the desk. Only they may ask; a member or coach may not; it is off when
 * the gym's Assistant is off; each staff account has its own daily limit (the owner's setting, 1 to
 * 200) and spends the gym's monthly allowance, then its top-ups, exactly as members do; only the
 * service role claims; only the owner changes the limit.
 *
 *   node <repo>/scripts/sql/staff-help.mjs "<repo>"   (from a dir with pglite + pglite-pgvector)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2830000-0000-4000-8000-0000000000${n}`;
const OWN = id('0a'), DESK = id('0b'), COACH = id('0c'), MEM = id('0d');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const service = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['own', OWN, 'admin'], ['desk', DESK, 'staff'], ['coach', COACH, 'trainer'], ['mem', MEM, 'member']].map(([k, u, r]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@0283-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@0283-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${r}', 'active') on conflict do nothing;`).join('\n')}
  update gym_settings set ai_staff_daily_messages = 2, ai_monthly_messages = 1500 where gym_id = '${GYM}';
  delete from ai_usage_days where gym_id = '${GYM}';
`);
const assistantOn = (on) => db.exec(`select set_config('request.jwt.claim.sub', '', false);`).then(() => owner()).then(() =>
  db.exec(`insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'assistant', ${on})
           on conflict (gym_id, feature_key) do update set enabled = excluded.enabled`));
await assistantOn(true);

const status = async (u) => { await as(u); return (await one(`select staff_help_status() s`)).s; };
check('the owner may ask', (await status(OWN)).allowed === true, JSON.stringify(await status(OWN)));
check('the desk may ask', (await status(DESK)).allowed === true);
check('a coach may not', (await status(COACH)).reason === 'not_staff');
check('a member may not', (await status(MEM)).reason === 'not_staff');

const claim = async (u) => { await service(); return (await one(`select staff_help_claim('${GYM}', '${u}') c`)).c; };
check('a member cannot be claimed for', (await claim(MEM)) === false);
check('the desk claims a message', (await claim(DESK)) === true);
check('…and a second', (await claim(DESK)) === true);
check('the third passes the desk\'s daily limit (2) and is refused', (await claim(DESK)) === false);
check('…which the status says', (await status(DESK)).reason === 'daily_limit');
check('the owner\'s own count is separate', (await claim(OWN)) === true);
await owner();
check('Help counts in the gym\'s month like the members\' messages',
  Number((await one(`select sum(messages) n from ai_usage_days where gym_id = '${GYM}'`)).n) === 3);

// The month used: top-ups pay, then nothing.
await db.exec(`update gym_settings set ai_monthly_messages = 3, ai_staff_daily_messages = 50 where gym_id = '${GYM}';
  insert into gym_ai_credits (gym_id, balance) values ('${GYM}', 1) on conflict (gym_id) do update set balance = 1;`);
check('past the month, a top-up pays for one', (await claim(OWN)) === true);
await owner();
check('…spending it', Number((await one(`select balance from gym_ai_credits where gym_id = '${GYM}'`)).balance) === 0);
check('…then nothing is left', (await claim(OWN)) === false);
check('…and the status says the month is used', (await status(OWN)).reason === 'monthly_limit');

// The owner's setting.
await as(DESK);
check('the desk cannot change the limit', /Only the gym's owner/.test(await tryExec(`select set_staff_help_limit(10)`) ?? ''));
await as(OWN);
check('the owner sets it', (await tryExec(`select set_staff_help_limit(10)`)) === null);
check('…within 1 to 200', /1 to 200/.test(await tryExec(`select set_staff_help_limit(500)`) ?? ''));
check('…and the status reads it', (await status(OWN)).daily_limit === 10);
await as(OWN);
check('nobody but the service role claims', !!(await tryExec(`select staff_help_claim('${GYM}', '${OWN}')`)));

await owner();
await db.exec(`update gym_settings set ai_monthly_messages = 1500 where gym_id = '${GYM}'`);
await assistantOn(false);
check('off when the gym\'s Assistant is off', (await status(OWN)).reason === 'switched_off', JSON.stringify(await status(OWN)));

await owner();
check('0283 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0283_staff_help.sql'), 'utf-8'))) === null);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
