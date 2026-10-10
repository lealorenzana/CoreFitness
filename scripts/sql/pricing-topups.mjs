/**
 * 0189: Starter / Growth / Pro at their launch prices with every switch on,
 * Standard and Premium no longer offered but still working for their gyms;
 * and the AI coach going on prepaid top-ups after the month's allowance —
 * bought at the platform's price, verified by the platform, the owner told at
 * 80%, 100% and when top-ups run out, the per-member daily limit always kept.
 *
 *   node <repo>/scripts/sql/pricing-topups.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1890000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), DESK = id('02'), M1 = id('03'), M2 = id('04'), PA = id('05');
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
const claim = async (m) => { await owner(); return (await one(`select ai_claim_message('${GYM}', '${m}') ok`)).ok; };
const notes = async (title) => { await owner(); return (await one(`select count(*)::int n from notifications where user_id = '${OWNER}' and title = '${title.replace(/'/g, "''")}'`)).n; };

await owner();
await db.exec(`
  ${[['owner', OWNER, 'admin'], ['desk', DESK, 'staff'], ['m1', M1, 'member'], ['m2', M2, 'member'], ['pa', PA, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@ai-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@ai-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active')
      on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`).join('\n')}
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into platform_billing (grace_days) select 7 where not exists (select 1 from platform_billing);`);

// ---- pricing ----
await anon();
const list = await all(`select * from platform_price_list()`);
const by = (k) => list.find((p) => p.key === k);
check('the website lists Starter, Growth and Pro at their launch prices', Number(by('starter')?.price_monthly) === 1499 && Number(by('growth')?.price_monthly) === 3499
  && Number(by('pro')?.price_monthly) === 6999 && Number(by('pro')?.price_yearly) === 69990, JSON.stringify(list.map((p) => [p.key, p.price_monthly])));
check('…and no longer Standard or Premium', !by('standard') && !by('premium'));
await owner();
const plans = await all(`select key, max_members, max_staff, ai_monthly_cap, is_active from platform_plans where key in ('starter','growth','pro','standard','premium','trial') order by key`);
const p = (k) => plans.find((x) => x.key === k);
check('each tier carries its size and AI allowance', p('starter').max_members === 100 && p('starter').max_staff === 3 && p('starter').ai_monthly_cap === 300
  && p('growth').max_members === 400 && p('growth').ai_monthly_cap === 1500 && p('pro').max_members === null && p('pro').ai_monthly_cap === 4000);
check('Standard and Premium still work for the gyms on them', p('standard').is_active && p('premium').is_active);
check('the trial keeps 30 days and 300 AI messages', p('trial').ai_monthly_cap === 300);
const off = (await one(`select count(*)::int n from platform_plan_features where plan_key in ('starter','growth','pro') and not enabled`)).n;
const on = (await one(`select count(*)::int n from platform_plan_features where plan_key in ('starter','growth','pro') and enabled`)).n;
check('every switch is on in every tier', off === 0 && on === 3 * (await one(`select count(*)::int n from platform_features`)).n);

// ---- the allowance and top-ups ----
await db.exec(`update gyms set plan = 'pro' where id = '${GYM}';
  update gym_settings set ai_daily_messages = 3, ai_monthly_messages = 5 where gym_id = '${GYM}';
  delete from ai_usage_days where gym_id = '${GYM}';`);
check('a member asks: counted', await claim(M1));
check('the per-member daily limit holds', (await claim(M1)) && (await claim(M1)) && !(await claim(M1)));
check('80% of the month: the owner is told once', (await claim(M2)) && (await notes("80% of this month's AI coach messages used")) === 1);
check('100%: told again', (await claim(M2)) && (await notes("Your AI coach messages for this month are used")) === 1);
check('past the allowance with no top-ups: the coach stops', !(await claim(M2)));
check('…and the owner is told it stopped', (await notes('The AI coach has stopped for this month')) === 1);

await as(DESK);
check('the desk cannot buy top-ups', !!(await tryExec(`select request_ai_topup(1, 'GC-1111')`)));
await as(OWNER);
check('0 packs is refused', !!(await tryExec(`select request_ai_topup(0, 'GC-1111')`)));
const t1 = (await one(`select request_ai_topup(1, 'GC-1111') id`)).id;
check('a reference is claimed once', !!(await tryExec(`select request_ai_topup(1, 'gc-1111')`)));
let a = (await one(`select my_ai_allowance() a`)).a;
check('Your app shows the allowance, what is used, and the price of more', a.monthly === 5 && Number(a.used) === 5 && a.credits === 0
  && a.topup_messages === 500 && Number(a.topup_price) === 699 && a.topups[0].status === 'pending' && Number(a.topups[0].amount) === 699, JSON.stringify(a));
check('the owner cannot verify their own', !!(await tryExec(`select platform_decide_topup('${t1}', true)`)));
await as(PA);
check('the platform sees it to verify', (await all(`select * from platform_ai_topups() where id = '${t1}'`)).length === 1);
// Small balance for the test: the platform sets the pack size.
await owner();
await db.exec(`update ai_topups set messages = 2 where id = '${t1}'`);
await as(PA);
await db.exec(`select platform_decide_topup('${t1}', true)`);
await owner();
check('verified: messages added', (await one(`select balance from gym_ai_credits where gym_id = '${GYM}'`)).balance === 2);
check('…and the owner is told', (await notes('2 AI coach messages added')) === 1);
await as(PA);
check('a decided top-up cannot be decided again', !!(await tryExec(`select platform_decide_topup('${t1}', true)`)));
check('past the allowance, a top-up message is used', (await claim(M2)) && (await one(`select balance from gym_ai_credits where gym_id = '${GYM}'`)).balance === 1);
check('the daily limit still holds on top-ups', !(await claim(M1)));
// M2 has reached the daily limit too by now; someone fresh asks.
check('the last top-up message: used, and the owner told', (await claim(DESK)) && (await notes('Your AI coach top-ups are used up')) === 1);
check('then the coach stops', !(await claim(DESK)));

await as(OWNER);
const t2 = (await one(`select request_ai_topup(2, 'GC-2222') id`)).id;
await as(PA);
check('a rejection needs a reason', !!(await tryExec(`select platform_decide_topup('${t2}', false, '')`)));
await db.exec(`select platform_decide_topup('${t2}', false, 'No transfer with that reference')`);
await as(OWNER);
a = (await one(`select my_ai_allowance() a`)).a;
check('a rejected top-up says why and adds nothing', a.credits === 0 && a.topups.some((x) => x.status === 'rejected' && x.reason === 'No transfer with that reference'));
await as(M1);
check('a member sees no allowance', (await one(`select my_ai_allowance() a`)).a === null);
check('…and cannot read the tables', (await all(`select * from ai_topups`)).length === 0 && (await all(`select * from gym_ai_credits`)).length === 0);

await as(OWNER);
check('a gym cannot price top-ups', !!(await tryExec(`select platform_set_topup(1000, 1)`)));
await as(PA);
await db.exec(`select platform_set_topup(1000, 1299)`);
await as(OWNER);
a = (await one(`select my_ai_allowance() a`)).a;
check('the platform prices the pack, and the owner sees it', a.topup_messages === 1000 && Number(a.topup_price) === 1299);

await owner();
check('marker', (await one(`select migration_0189_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0189 checks passed');
process.exit(failures ? 1 : 0);
