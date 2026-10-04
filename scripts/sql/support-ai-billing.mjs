/**
 * 0162 support access inside a ticket, 0163 AI allowance from the plan, 0164 start billing.
 *
 *   node <repo>/scripts/sql/support-ai-billing.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const PA = 'a8000000-0000-4000-8000-000000000009';
const OWN = 'a8000000-0000-4000-8000-000000000001';
const DESK = 'a8000000-0000-4000-8000-000000000002';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const TODAY = `(now() at time zone 'Asia/Manila')::date`;

await asOwner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@sab-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@sab-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${person(PA, 'pat', 'admin')} ${person(OWN, 'olga', 'admin')} ${person(DESK, 'dina', 'staff')}
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${DESK}', 'staff', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${PA}', '${OWN}', '${DESK}');
`);

// ---- 0162: a ticket from a crash, access asked and given on it, the fix written down ----------------
await as(DESK);
const ticket = (await one(`select open_support_ticket_with_context('The payments page crashed', 'It went blank when I saved',
  '{"message":"TypeError: x is null","route":"/payments","build":"abc123","members":["Ana Reyes"]}'::jsonb) as id`)).id;
await asOwner();
const ctx = (await one(`select context from support_tickets where id = '${ticket}'`)).context;
check('a crash ticket carries the error, the screen and the build', ctx.message === 'TypeError: x is null' && ctx.route === '/payments' && ctx.build === 'abc123', JSON.stringify(ctx));
check('…and nothing else it was handed', !('members' in ctx));
await as(OWN);
check('a gym cannot ask itself for access', !!(await tryExec(`select platform_request_ticket_access('${ticket}', 4, 'x')`)));
await as(PA);
check('the platform must say why', !!(await tryExec(`select platform_request_ticket_access('${ticket}', 4, '  ')`)));
await db.exec(`select platform_request_ticket_access('${ticket}', 4, 'To see the payment that will not save')`);
await asOwner();
check('the owner is told on the bell', (await one(`select count(*)::int as n from notifications where user_id = '${OWN}' and title = 'Core Fitness asks to look at your gym'`)).n === 1);
await as(DESK);
check('the desk cannot approve it', !!(await tryExec(`select approve_ticket_access('${ticket}')`)));
check('…or decline it', !!(await tryExec(`select decline_ticket_access('${ticket}')`)));
await as(OWN);
await db.exec(`select approve_ticket_access('${ticket}')`);
const st = (await one(`select ticket_access_state('${ticket}') as s`)).s;
check('one tap opens 0113\'s read-only window, linked to the ticket', st.answer === 'approved' && st.live === true && !!st.expires_at, JSON.stringify(st));
await asOwner();
check('the grant is a real support grant for 4 hours', (await one(`select count(*)::int as n from support_grants where gym_id = '${GYM_A}' and revoked_at is null
  and expires_at > now() + interval '3 hours 50 minutes' and reason like 'Ticket: The payments page crashed%'`)).n === 1);
await as(OWN);
check('approving twice is refused', !!(await tryExec(`select approve_ticket_access('${ticket}')`)));
await as(PA);
check('resolving needs the fix written', !!(await tryExec(`select resolve_ticket('${ticket}', '')`)));
await db.exec(`select resolve_ticket('${ticket}', 'A plan with no price made the form divide by zero; fixed in build abc124.')`);
await as(OWN);
const done = (await one(`select ticket_access_state('${ticket}') as s`)).s;
check('the gym reads what was fixed', /divide by zero/.test(done.resolution) && done.live === false, JSON.stringify(done));
await asOwner();
check('the ticket is closed and its access ended', (await one(`select status from support_tickets where id = '${ticket}'`)).status === 'closed'
  && (await one(`select count(*)::int as n from support_grants where gym_id = '${GYM_A}' and revoked_at is null`)).n === 0);

// ---- 0163: the plan sets the AI ceiling ----------------------------------------------------------------
await asOwner();
const plan = (await one(`select plan from gyms where id = '${GYM_A}'`)).plan;
await db.exec(`insert into gym_settings (gym_id) values ('${GYM_A}') on conflict do nothing;
  update gym_settings set ai_daily_messages = 30, ai_monthly_messages = 1500 where gym_id = '${GYM_A}';`);
await as(OWN);
check('only the platform sets a plan\'s allowance', !!(await tryExec(`select set_plan_ai_caps('${plan}', 10, 500)`)));
await as(PA);
await db.exec(`select set_plan_ai_caps('${plan}', 20, 1000)`);
await asOwner();
const lim = await one(`select ai_daily_messages d, ai_monthly_messages m from gym_settings where gym_id = '${GYM_A}'`);
check('lowering the plan\'s ceiling brings the gym\'s limits under it', lim.d === 20 && lim.m === 1000, JSON.stringify(lim));
await as(OWN);
const over = await tryExec(`select set_ai_coach_limits(25, 900)`);
check('the owner cannot go above the plan, and is told to upgrade', /allows up to 20/.test(over ?? '') && /Upgrade/.test(over ?? ''), over ?? 'no error');
check('…but can lower it', !(await tryExec(`select set_ai_coach_limits(10, 600)`)));
const use = (await one(`select gym_ai_usage() as u`)).u;
check('Your app reads the ceiling with the limits', use.plan_daily_cap === 20 && use.plan_monthly_cap === 1000 && use.daily_limit === 10, JSON.stringify(use));

// ---- 0164: start billing ------------------------------------------------------------------------------------
await as(OWN);
check('a gym cannot set its own covered-until', !!(await tryExec(`select platform_set_billing('${GYM_A}', ${TODAY} + 30)`)));
await as(PA);
check('a past date is refused', !!(await tryExec(`select platform_set_billing('${GYM_A}', ${TODAY} - 1)`)));
await db.exec(`select platform_set_billing('${GYM_A}', ${TODAY} + 30, 'Founding period ends')`);
await asOwner();
check('billing starts: covered until a date', (await one(`select paid_until = ${TODAY} + 30 as ok from gyms where id = '${GYM_A}'`)).ok);
check('the owner is told', (await one(`select count(*)::int as n from notifications where user_id = '${OWN}' and title like 'Your Core Fitness plan is covered until%'`)).n === 1);
await as(PA);
await db.exec(`select platform_set_billing('${GYM_A}', null)`);
await asOwner();
check('and can be cleared again', (await one(`select paid_until from gyms where id = '${GYM_A}'`)).paid_until === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
