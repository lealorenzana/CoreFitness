/**
 * 0148 + 0149: applying with a plan, talking to an applicant, paying from far
 * away and the platform verifying it; the check-in drill-down, AI per gym,
 * support access that shows the gym, and the SQL password reset's refusals.
 *
 *   node <repo>/scripts/sql/onboarding-payments.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  pa: 'a1000000-0000-4000-8000-000000000009', ownerA: 'a1000000-0000-4000-8000-000000000001',
  deskA: 'a1000000-0000-4000-8000-000000000002', memA: 'a1000000-0000-4000-8000-000000000004',
  ownerB: 'b1000000-0000-4000-8000-000000000001',
};

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
async function asAnon() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const TODAY = `(now() at time zone 'Asia/Manila')::date`;

await db.exec(`reset role;
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b', 'Gym B', 'trial') on conflict do nothing;
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@pay-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@pay-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'),
    ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.pa}', '${P.ownerA}', '${P.deskA}', '${P.memA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';
  update gyms set onboarded_at = now();
  update platform_plans set price_monthly = 999, is_public = true, is_active = true where key = 'standard';`);

// ---- 1. applying, from the website -------------------------------------------------------------
await asAnon();
const token = (await one(`select submit_gym_application('Iron Den', 'Ana Cruz', 'Ana@IronDen.ph', '09171234567',
  'Calapan, Oriental Mindoro', 80, 'Hello', 'standard', 'yearly', 'Facebook', 'viber', '09171234567') as t`)).t;
check('a stranger can apply and gets a status link', typeof token === 'string' && token.length === 64, String(token));
check('a plan that is not on offer is refused',
  !!(await tryExec(`select submit_gym_application('X Gym', 'Ana Cruz', 'x@x.ph', '09171234567', null, null, null, 'nope')`)));
check('anon still cannot read the applications table', !!(await tryExec(`select * from gym_applications`))
  || (await all(`select * from gym_applications`)).length === 0);
const st = (await one(`select application_status('${token}') as s`)).s;
check('the link shows their application', st.gym_name === 'Iron Den' && st.status === 'pending' && st.plan.key === 'standard'
  && st.billing === 'yearly', JSON.stringify(st));
check('no payment details before they are let in', st.pay === null, JSON.stringify(st.pay));
check('a wrong token shows nothing', (await one(`select application_status('${'0'.repeat(64)}') as s`)).s === null);
check('a short token is not even looked up', (await one(`select application_status('abc') as s`)).s === null);
await db.exec(`select application_reply('${token}', 'How much for 200 members?')`);
check('they can write to us', (await one(`select jsonb_array_length(application_status('${token}') -> 'messages') as n`)).n === 1);
check('an empty message is refused', !!(await tryExec(`select application_reply('${token}', '   ')`)));
await db.exec(`reset role; insert into gym_applications (gym_name, owner_name, email, phone, status_token)
  values ('Chosen Token', 'Bob Ruiz', 'bob@x.ph', '09170000000', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')`);
check('a client cannot choose its own token', (await one(`select status_token from gym_applications where gym_name = 'Chosen Token'`)).status_token
  !== 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

// ---- 2. the platform answers --------------------------------------------------------------------
await as(P.ownerA);
check('a gym owner sees no applications', (await all(`select * from platform_applications()`)).length === 0);
check('a gym owner cannot answer one', !!(await tryExec(`select platform_application_reply((select id from gym_applications limit 1), 'hi')`)) );
await as(P.pa);
const app = await one(`select * from platform_applications('pending') where gym_name = 'Iron Den'`);
check('the platform sees plan, source, channel and one unread message', app.plan_name === 'Standard' && app.heard_from === 'Facebook'
  && app.contact_pref === 'viber' && app.unread === 1 && app.messages === 1, JSON.stringify(app));
check('the bell says an applicant is waiting', (await all(`select * from platform_bell() where kind = 'application_messages'`)).length === 1);
await db.exec(`select * from platform_application_thread('${app.id}')`);
check('reading the thread marks it read', (await one(`select unread from platform_applications() where id = '${app.id}'`)).unread === 0);
await db.exec(`select platform_application_reply('${app.id}', 'Standard is ₱999 a month.')`);
await asAnon();
const msgs = (await one(`select application_status('${token}') -> 'messages' as m`)).m;
check('the applicant reads our answer', msgs.length === 2 && msgs[1].from_platform === true && msgs[1].pay === null, JSON.stringify(msgs));

// ---- 3. how to pay ---------------------------------------------------------------------------------
await as(P.ownerA);
check('a gym owner cannot set how to pay us', !!(await tryExec(`select save_payment_method(null, 'gcash', 'GCash', 'Core Fitness', '0917', null, null, 1, true)`)));
await as(P.pa);
const gcash = (await one(`select save_payment_method(null, 'gcash', 'GCash', 'J. Dela Cruz', '0917 555 0101', 'data:image/png;base64,AAAA', 'Send the exact amount.', 1, true) as id`)).id;
const off = (await one(`select save_payment_method(null, 'bank', 'Old bank', 'J. Dela Cruz', '123', null, null, 2, false) as id`)).id;
check('a QR that is not an image is refused', !!(await tryExec(`select save_payment_method(null, 'gcash', 'Bad', null, null, 'javascript:alert(1)', null, 3, true)`)));
await asAnon();
const opts = await all(`select * from platform_payment_options()`);
check('anyone sees the active ways to pay, not the switched-off one', opts.length === 1 && opts[0].id === gcash, JSON.stringify(opts.map((o) => o.label)));

// ---- 3b. 0158: how to pay, sent in the conversation before they are let in ----------------------------
await as(P.ownerA);
check('a gym owner cannot send an applicant how to pay', !!(await tryExec(`select platform_application_send_payment('${app.id}', '${gcash}')`)));
await as(P.pa);
check('a switched-off method cannot be sent', !!(await tryExec(`select platform_application_send_payment('${app.id}', '${off}')`)));
await db.exec(`select platform_application_send_payment('${app.id}', '${gcash}', 'Pay the first month here and we will let you in today.')`);
const thr = await all(`select * from platform_application_thread('${app.id}')`);
check('the platform\'s thread names the method sent', thr.at(-1).method_label === 'GCash' && thr.at(-1).method_kind === 'gcash', JSON.stringify(thr.at(-1)));
await asAnon();
const sm = (await one(`select application_status('${token}') as s`)).s;
const card = sm.messages.at(-1);
check('the applicant sees the method as a card in the message, while still pending', sm.status === 'pending' && card.sent_method === true
  && card.pay.account_number === '0917 555 0101' && card.pay.qr_image.startsWith('data:image/'), JSON.stringify(card));
check('still no full payment list before they are let in', sm.pay === null);
await db.exec(`reset role; update platform_payment_methods set account_number = '0917 555 0202' where id = '${gcash}'`);
await asAnon();
check('a corrected number is corrected in the conversation', (await one(`select application_status('${token}') -> 'messages' -> -1 -> 'pay' ->> 'account_number' as n`)).n === '0917 555 0202');
await db.exec(`reset role; update platform_payment_methods set active = false where id = '${gcash}'`);
await asAnon();
const gone = (await one(`select application_status('${token}') -> 'messages' -> -1 as m`)).m;
check('a switched-off method is no longer shown, but the message says one was sent', gone.sent_method === true && gone.pay === null, JSON.stringify(gone));
await db.exec(`reset role; update platform_payment_methods set active = true, account_number = '0917 555 0101' where id = '${gcash}'`);

// ---- 4. a gym pays and says so ---------------------------------------------------------------------
await db.exec(`reset role; update gyms set paid_until = ${TODAY} - 20 where id = '${GYM_A}'`);
await as(P.deskA);
check('the desk cannot claim a payment', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'REF-0001')`)));
await as(P.memA);
check('a member cannot claim a payment', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'REF-0001')`)));
await as(P.ownerA);
check('a switched-off method is refused', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${off}', 'REF-0002')`)));
check('a reference under 4 characters is refused', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'R1')`)));
check('a date in the future is refused', !!(await tryExec(`select submit_gym_payment(999, ${TODAY} + 5, '${gcash}', 'REF-0003')`)));
const claim = (await one(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'GC 1234 5678', 'data:image/jpeg;base64,BBBB', 1, 'March') as id`)).id;
check('a read-only (overdue) gym\'s owner can still say they paid', typeof claim === 'string');
check('the same reference cannot be sent twice', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'gc 1234 5678 ')`)) );
await as(P.ownerB);
check('nor by another gym', !!(await tryExec(`select submit_gym_payment(999, ${TODAY}, '${gcash}', 'GC 1234 5678')`)));
check('another gym\'s owner does not see the claim', (await all(`select * from my_gym_payment_claims()`)).length === 0);
await as(P.ownerA);
check('the owner sees it, pending', (await one(`select status from my_gym_payment_claims() where id = '${claim}'`)).status === 'pending');
await as(P.ownerA);
check('an owner cannot verify their own payment', !!(await tryExec(`select verify_gym_payment('${claim}', ${TODAY} + 30)`)));

// ---- 5. the platform verifies ------------------------------------------------------------------------
await as(P.pa);
const pc = await all(`select * from platform_payment_claims('pending')`);
check('the platform sees the claim with its proof', pc.length === 1 && pc[0].proof_image.startsWith('data:image/') && pc[0].gym_name, JSON.stringify(pc.map((c) => c.reference)));
check('the bell says a payment is waiting', (await all(`select * from platform_bell() where kind = 'payments'`)).length === 1);
const pay = (await one(`select verify_gym_payment('${claim}', ${TODAY} + 30) as id`)).id;
await db.exec('reset role');
const g = await one(`select paid_until = ${TODAY} + 30 as moved from gyms where id = '${GYM_A}'`);
check('verifying records the payment and moves paid-until', !!pay && g.moved);
const gp = await one(`select amount, method, reference from gym_payments where id = '${pay}'`);
check('the payment carries the method and reference', Number(gp.amount) === 999 && gp.method === 'GCash' && gp.reference === 'GC 1234 5678', JSON.stringify(gp));
check('the owner is told', (await all(`select 1 from notifications where user_id = '${P.ownerA}' and (metadata ->> 'dedupe') = 'claim:${claim}'`)).length === 1);
await as(P.pa);
check('a verified claim cannot be verified again', !!(await tryExec(`select verify_gym_payment('${claim}', ${TODAY} + 60)`)));
await as(P.ownerA);
const c2 = (await one(`select submit_gym_payment(500, ${TODAY}, '${gcash}', 'TYPO-9999') as id`)).id;
await as(P.pa);
check('a rejection needs a reason', !!(await tryExec(`select reject_gym_payment('${c2}', '')`)));
await db.exec(`select reject_gym_payment('${c2}', 'No transfer with that reference.')`);
await as(P.ownerA);
check('a rejected reference can be sent again, corrected', !!(await one(`select submit_gym_payment(500, ${TODAY}, '${gcash}', 'TYPO-9999') as id`)).id);

// ---- 6. approved applicants see how to pay ------------------------------------------------------------
await as(P.pa);
await db.exec(`select create_gym('Iron Den', 'iron-den', '${app.id}')`);
await asAnon();
const st2 = (await one(`select application_status('${token}') as s`)).s;
check('once let in, the link shows the gym and how to pay', st2.status === 'approved' && st2.gym_slug === 'iron-den'
  && Array.isArray(st2.pay) && st2.pay.length === 1 && st2.pay[0].account_number === '0917 555 0101', JSON.stringify(st2.pay));

// ---- 7. the check-in drill-down and AI per gym ----------------------------------------------------------
await db.exec(`reset role;
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${GYM_A}', '${P.memA}', '${P.memA}') on conflict do nothing;
  insert into attendance (gym_id, member_id, check_in_time) values
    ('${GYM_A}', '${P.memA}', now() - interval '1 day'), ('${GYM_A}', '${P.memA}', now() - interval '2 days'),
    ('${GYM_A}', '${P.memA}', now() - interval '40 days');`);
await as(P.ownerA);
check('a gym owner gets no platform drill-down', (await all(`select * from platform_checkins_breakdown(30)`)).length === 0);
await as(P.pa);
const br = await one(`select * from platform_checkins_breakdown(30) where gym_id = '${GYM_A}'`);
const total = (await one(`select coalesce(sum(checkins), 0)::int as n from platform_checkins_daily(30)`)).n;
const sumGyms = (await one(`select coalesce(sum(checkins), 0)::int as n from platform_checkins_breakdown(30)`)).n;
check('per gym: 2 in 30 days, 1 person, 0 demo', br.checkins === 2 && br.people === 1 && br.demo === 0, JSON.stringify(br));
check('the days add up to the gyms', total === sumGyms, `${total} vs ${sumGyms}`);
check('the 30 days are 30 rows', (await all(`select * from platform_checkins_daily(30)`)).length === 30);
const ai = await all(`select * from platform_ai_overview(30)`);
check('AI overview lists every gym, zero when unused', ai.length >= 2 && ai.every((r) => Number(r.coach_messages) >= 0), JSON.stringify(ai[0]));
check('adoption includes the coach and the assistant', (await all(`select feature from platform_feature_adoption() where feature in ('coach', 'assistant')`)).length === 2);

// ---- 8. support access shows the gym, only while granted ----------------------------------------------
await as(P.pa);
check('no grant: no look', !!(await tryExec(`select platform_support_snapshot('${GYM_A}')`)));
await as(P.ownerA);
await db.exec(`select * from grant_support_access(2, 'the member invite not working')`);
await db.exec(`reset role; insert into gym_invitations (gym_id, email, role, token) values ('${GYM_A}', 'lea@x.ph', 'member', 'secret-token-value-123')`);
await as(P.pa);
const snap = (await one(`select platform_support_snapshot('${GYM_A}') as s`)).s;
check('with a grant, the gym is shown', snap.gym.id === GYM_A && Array.isArray(snap.members) && snap.grant.reason.includes('invite'), Object.keys(snap).join());
check('invitations are listed without their token', snap.invitations.length >= 1 && !JSON.stringify(snap).includes('secret-token-value-123'));
await db.exec('reset role');
check('the visit is in the gym\'s own log', (await one(`select count(*)::int as n from activity_log where gym_id = '${GYM_A}' and action = 'gym.support_entered'`)).n === 1);
await as(P.pa);
await db.exec(`select platform_support_snapshot('${GYM_A}')`);
await db.exec('reset role');
check('a reload within the hour is not a second visit', (await one(`select count(*)::int as n from activity_log where gym_id = '${GYM_A}' and action = 'gym.support_entered'`)).n === 1);
await as(P.ownerA);
check('a gym owner cannot use it on their own or another gym', !!(await tryExec(`select platform_support_snapshot('${GYM_A}')`)));
await db.exec(`select revoke_support_access()`);
await as(P.pa);
check('withdrawn: no look', !!(await tryExec(`select platform_support_snapshot('${GYM_A}')`)));

// ---- 9. password reset refusals ------------------------------------------------------------------------
await as(P.ownerA);
check('a gym owner cannot reset passwords', !!(await tryExec(`select * from platform_reset_gym_password('${GYM_A}', '${P.deskA}', 'abcdefghijk')`)));
await as(P.pa);
check('a member cannot be reset by the platform', !!(await tryExec(`select * from platform_reset_gym_password('${GYM_A}', '${P.memA}', 'abcdefghijk')`)));
check('a short password is refused', !!(await tryExec(`select * from platform_reset_gym_password('${GYM_A}', '${P.deskA}', 'short')`)));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
