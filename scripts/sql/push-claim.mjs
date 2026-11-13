/**
 * 0170: every notification is pushed by the database — once, only while fresh,
 * and only by the push function (service role), never by a signed-in user.
 *
 *   node <repo>/scripts/sql/push-claim.mjs "<repo>"   (from a dir with pglite installed)
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
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const M = 'a9700000-0000-4000-8000-000000000001';

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${M}', 'push@claim-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${M}', 'Pia', 'Test', 'push@claim-test.com', 'active', 'member') on conflict (id) do nothing;`);

// An insert must succeed whatever the push does (no pg_net here: the trigger skips the call).
let err = null;
try { await db.exec(`insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'booking', 'Session confirmed', 'Friday 7am')`); }
catch (e) { err = describe(e); }
check('a notification is saved whatever happens to its push', err === null, err ?? '');
const id = (await one(`select id from notifications where user_id = '${M}' order by created_at desc limit 1`)).id;

await db.exec(`set role service_role`);
const first = await one(`select * from claim_notification_push('${id}')`);
const second = await one(`select * from claim_notification_push('${id}')`);
check('the push function claims it, with the row\'s own title, message and recipient',
  first?.user_id === M && first?.title === 'Session confirmed' && first?.message === 'Friday 7am', JSON.stringify(first));
check('…once: a second claim gets nothing', !second, JSON.stringify(second));

await db.exec(`reset role; insert into notifications (gym_id, user_id, type, title, message, created_at)
  values ('${GYM}', '${M}', 'system', 'Old news', 'from yesterday', now() - interval '1 day')`);
const old = (await one(`select id from notifications where title = 'Old news'`)).id;
await db.exec(`set role service_role`);
check('a notification older than two minutes is never pushed', !(await one(`select * from claim_notification_push('${old}')`)));

await db.exec(`reset role; insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Fresh', 'now')`);
const fresh = (await one(`select id from notifications where title = 'Fresh'`)).id;
await db.exec(`select set_config('request.jwt.claim.sub', '${M}', false); set role authenticated;`);
let refused = false;
try { await db.exec(`select claim_notification_push('${fresh}')`); } catch { refused = true; }
check('a signed-in user cannot claim a push', refused);
await db.exec(`reset role`);
check('…so it is still there for the push function', (await one(`select pushed_at from notifications where id = '${fresh}'`)).pushed_at === null);

// ---- 0249: no push to someone signed out everywhere ----
await db.exec(`reset role;
  create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, not_after timestamptz);
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${M}', 'https://push.test/old', 'k', 'a'), ('${M}', 'https://push.test/new', 'k', 'a');
  insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Signed out', 'now');`);
const so = (await one(`select id from notifications where title = 'Signed out'`)).id;
await db.exec(`set role service_role`);
check('0249: signed out everywhere, the push is not sent', !(await one(`select * from claim_notification_push('${so}')`)));
await db.exec(`reset role`);
check('…the notification is still kept, and marked so it is not retried', (await one(`select pushed_at from notifications where id = '${so}'`)).pushed_at !== null);
check('…and every leftover registration of the account is removed', (await one(`select count(*)::int n from push_subscriptions where user_id = '${M}'`)).n === 0);
await db.exec(`insert into auth.sessions (user_id) values ('${M}');
  insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Signed in', 'now');`);
const si = (await one(`select id from notifications where title = 'Signed in'`)).id;
await db.exec(`set role service_role`);
check('signed in somewhere, the push goes', (await one(`select * from claim_notification_push('${si}')`))?.title === 'Signed in');
await db.exec(`reset role; update auth.sessions set not_after = now() - interval '1 minute' where user_id = '${M}';
  insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Ran out', 'now');`);
const ro = (await one(`select id from notifications where title = 'Ran out'`)).id;
await db.exec(`set role service_role`);
check('a session that has run out counts as signed out', !(await one(`select * from claim_notification_push('${ro}')`)));
await db.exec(`reset role`);

// ---- 0252: the hand-off reads its address from push_endpoint (staging QA, NOTIF-PUSH-HANDOFF) ----
const src = await one(`select string_agg(prosrc, ' ') s from pg_proc where proname in ('trg_push_notification', 'gym_chat_send')`);
check('neither the notification trigger nor the chat send names a project URL any more', !/supabase\.co/.test(src.s));
check('both hand off through push_hand_off()', (src.s.match(/push_hand_off\(/g) ?? []).length === 2);
const ep = await one(`select url from push_endpoint`);
check('production keeps its own address (seeded)', /ifwxtekyjgeljerslnzr\.supabase\.co\/functions\/v1\/send-push$/.test(ep?.url ?? ''), ep?.url);
let bad = null;
try { await db.exec(`update push_endpoint set url = 'https://evil.example.com/x'`); } catch (e) { bad = e.message; }
check('a copy can only point it at a Supabase send-push address', !!bad);
await db.exec(`update push_endpoint set url = 'https://hmntmopvrmpufzvvjrsg.supabase.co/functions/v1/send-push'`);
check('…which a copy (staging) sets to itself', /hmntmopvrmpufzvvjrsg/.test((await one(`select url from push_endpoint`)).url));
await db.exec(`update push_endpoint set url = 'https://ifwxtekyjgeljerslnzr.supabase.co/functions/v1/send-push'`);
await db.exec(`select set_config('request.jwt.claim.sub', '${M}', false); set role authenticated`);
let seen = 'readable';
try { await db.query(`select * from push_endpoint`); } catch { seen = 'refused'; }
check('a signed-in user cannot read or change it', seen === 'refused');
let call = 'callable';
try { await db.query(`select push_hand_off('{}'::jsonb)`); } catch { call = 'refused'; }
check('…nor call the hand-off directly', call === 'refused');
await db.exec(`reset role`);
await db.exec(`insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Still saved', 'with no pg_net here')`);
check('a notification is still saved when the hand-off cannot send', !!(await one(`select 1 x from notifications where title = 'Still saved'`)));
check('marker 0252', (await one(`select migration_0252_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0170 checks passed');
process.exit(failures ? 1 : 0);
