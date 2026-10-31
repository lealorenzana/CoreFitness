/**
 * 0225: deleting your own account. The only owner of an open gym is refused,
 * and so is a coach with a package running (then allowed once it ends); asking
 * locks the account, cancels future sessions with the reason "Account deleted"
 * and tells the other side and the gym; within 7 days it can be kept; after
 * them the sweep keeps payments and visits under "Deleted member" and erases
 * workouts, chats, photos (queued for Storage), health answers and the sign-in;
 * a second sweep does nothing; strangers can do none of it; 0225 runs twice.
 *
 *   node <repo>/scripts/sql/delete-account.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0225' });
const G = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2250000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), COACH = id('02'), MEM = id('03'), KEEP = id('04'), PA = id('05'), OTHER = id('06');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = { [OWNER]: 'Olga', [COACH]: 'Carlo', [MEM]: 'Mia', [KEEP]: 'Kim', [PA]: 'Pat', [OTHER]: 'Otto' };
await db.exec(Object.entries(people).map(([u, nm]) => `
  insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${nm.toLowerCase()}@del-test.ph', '{"first_name":"${nm}"}');
  insert into profiles (id, first_name, last_name, email, phone, photo_url, status, role, active_gym_id)
    values ('${u}', '${nm}', 'Test', '${nm.toLowerCase()}@del-test.ph', '0917000000', '${u}/me.jpg', 'active', 'member', '${G}')
    on conflict (id) do update set first_name = excluded.first_name, phone = excluded.phone, photo_url = excluded.photo_url, active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${u}';`).join('\n') + `
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  delete from gym_roles where gym_id = '${G}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${G}', '${OWNER}', 'admin', 'active'), ('${G}', '${COACH}', 'trainer', 'active'),
    ('${G}', '${MEM}', 'member', 'active'), ('${G}', '${KEEP}', 'member', 'active'), ('${G}', '${OTHER}', 'member', 'active');
  insert into member_profiles (gym_id, profile_id, qr_code, address, emergency_contact_name, date_of_birth)
    values ('${G}', '${MEM}', 'qr-mia', 'Mamburao', 'Mama Mia', '1999-01-01'), ('${G}', '${KEEP}', 'qr-kim', null, null, null),
           ('${G}', '${OTHER}', 'qr-otto', null, null, null)
    on conflict do nothing;
  insert into trainer_profiles (gym_id, profile_id, bio) values ('${G}', '${COACH}', 'Strength coach') on conflict do nothing;
  set session_replication_role = replica;
  insert into workout_logs (id, gym_id, member_id, performed_on, activity) values ('${id('a1')}', '${G}', '${MEM}', current_date, 'Run');
  insert into progress_photos (gym_id, member_id, path, pose) values ('${G}', '${MEM}', '${G}/${MEM}/p1.jpg', 'front');
  insert into conversations (id, gym_id, member_id, trainer_id) values ('${id('c1')}', '${G}', '${MEM}', '${COACH}');
  insert into messages (gym_id, conversation_id, sender_id, body) values ('${G}', '${id('c1')}', '${MEM}', 'Hi coach');
  insert into attendance (gym_id, member_id, check_in_time) values ('${G}', '${MEM}', now() - interval '2 days');
  insert into payments (gym_id, member_id, amount, method, status, invoice_number) values ('${G}', '${MEM}', 500, 'Cash', 'completed', 'INV-DEL-1');
  insert into pt_sessions (id, gym_id, member_id, trainer_id, starts_at, status) values
    ('${id('b1')}', '${G}', '${MEM}', '${OWNER}', now() + interval '3 days', 'approved'),
    ('${id('b2')}', '${G}', '${OTHER}', '${COACH}', now() + interval '4 days', 'approved');
  insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by)
    values ('${id('d1')}', '${G}', '${OTHER}', '${COACH}', 'pt', 1, 'active', 'included', 'desk');
  set session_replication_role = origin;`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0225'); } catch (e) { err = String(e); }
check('0225 applies', err === null, err);

await as(OWNER);
check('the only owner of an open gym is refused, and told what to do', /close the gym or hand it to another owner/.test(await tryExec(`select request_account_deletion()`) ?? ''));
check('…and the settings screen can say so before asking', /close the gym/.test((await one(`select my_account_deletion() s`)).s.blocked ?? ''));
await as(PA);
check('the platform\'s admin account is refused', /cannot be deleted here/.test(await tryExec(`select request_account_deletion()`) ?? ''));
await as(COACH);
check('a coach with a package running is refused', /End or hand over each package/.test(await tryExec(`select request_account_deletion()`) ?? ''));
await owner();
await db.exec(`update coachings set status = 'ended' where id = '${id('d1')}'`);

// The coach deletes: their future sessions are cancelled and members told; then keeps the account.
await as(COACH);
const when = (await one(`select request_account_deletion() w`)).w;
check('a coach with no package running can ask; erased in 7 days', when && Math.round((new Date(when) - Date.now()) / 86400000) === 7, String(when));
check('asking twice returns the same date', String((await one(`select request_account_deletion() w`)).w) === String(when));
await owner();
const s2 = await one(`select status::text, cancellation_reason from pt_sessions where id = '${id('b2')}'`);
check('their future sessions are cancelled with the reason "Account deleted"', s2.status === 'cancelled' && s2.cancellation_reason === 'account_deleted', JSON.stringify(s2));
check('…and the member is told', await n(`select count(*) n from notifications where user_id = '${OTHER}' and title = 'Your coach cancelled a session'`) === 1);
check('the gym\'s owner is told', await n(`select count(*) n from notifications where user_id = '${OWNER}' and title = 'An account is being deleted'`) >= 1);
await as(COACH);
check('within 7 days they can keep it', (await one(`select cancel_account_deletion() k`)).k === true
  && (await one(`select my_account_deletion() s`)).s.pending === null);

// The member deletes, and 7 days pass.
await as(MEM);
await db.exec(`select request_account_deletion()`);
await owner();
check('their own future session is cancelled, and its coach told', (await one(`select status::text s from pt_sessions where id = '${id('b1')}'`)).s === 'cancelled'
  && await n(`select count(*) n from notifications where user_id = '${OWNER}' and title = 'A booking was cancelled'`) >= 1);
await as(KEEP);
check('before the 7 days, the sweep erases nobody', (await one(`select erase_due_accounts() n`)).n === 0);
await owner();
await db.exec(`update account_deletions set erase_after = now() - interval '1 minute' where person = '${MEM}'`);
await as(KEEP);
check('after them, the sweep erases the member', (await one(`select erase_due_accounts() n`)).n === 1);
check('…and a second sweep does nothing', (await one(`select erase_due_accounts() n`)).n === 0);
await owner();
const pr = await one(`select first_name, last_name, email, phone, photo_url, status from profiles where id = '${MEM}'`);
check('the name becomes "Deleted member", and contact details go', pr.first_name === 'Deleted' && pr.last_name === 'member' && pr.phone === null
  && pr.photo_url === null && /@deleted\.invalid$/.test(pr.email), JSON.stringify(pr));
check('payments stay in the gym\'s books', await n(`select count(*) n from payments where member_id = '${MEM}' and invoice_number = 'INV-DEL-1'`) === 1);
check('visits stay', await n(`select count(*) n from attendance where member_id = '${MEM}'`) === 1);
check('workouts, photos and chats are erased', await n(`select count(*) n from workout_logs where member_id = '${MEM}'`) === 0
  && await n(`select count(*) n from progress_photos where member_id = '${MEM}'`) === 0
  && await n(`select count(*) n from conversations where member_id = '${MEM}'`) === 0);
const mp = await one(`select address, emergency_contact_name, date_of_birth, qr_code from member_profiles where profile_id = '${MEM}'`);
check('address, birthday, emergency contact and check-in code go', !mp.address && !mp.emergency_contact_name && !mp.date_of_birth && !mp.qr_code, JSON.stringify(mp));
check('their files are queued for Storage (avatar folder and progress photo)', await n(`select count(*) n from erasure_files where person = '${MEM}'
  and ((bucket = 'avatars' and is_prefix) or (bucket = 'progress' and path = '${G}/${MEM}/p1.jpg'))`) === 2);
const gr = await one(`select string_agg(gym_id || ':' || status, ' ') s from gym_roles where user_id = '${MEM}'`);
check('their place in the gym is archived', gr.s === `${G}:archived`, gr.s);
check('the sign-in address is freed', /@deleted\.invalid$/.test((await one(`select email from auth.users where id = '${MEM}'`)).email));

await anon();
check('a visitor can do none of it', !!(await tryExec(`select request_account_deletion()`)) && !!(await tryExec(`select my_account_deletion()`)));
await as(KEEP);
check('nobody can read the queue or the list', !!(await tryExec(`select * from erasure_files_due()`))
  && (await db.query(`select * from platform_account_deletions()`)).rows.length === 0);
await as(PA);
check('the platform sees who asked', (await db.query(`select * from platform_account_deletions()`)).rows.length === 2);
await anon();
check('the probe marker answers a visitor', (await one(`select migration_0225_applied() ok`)).ok === true);
await owner();
check('0225 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0225_delete_my_account.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
