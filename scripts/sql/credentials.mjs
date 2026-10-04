/**
 * 0160: a credential's issuer, number and dates; who may change them; members
 * see it only while in date; the expiry reminders.
 *
 *   node <repo>/scripts/sql/credentials.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const OWN = 'a6000000-0000-4000-8000-000000000001';
const T = 'a6000000-0000-4000-8000-000000000002';
const M = 'a6000000-0000-4000-8000-000000000003';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const TODAY = `(now() at time zone 'Asia/Manila')::date`;

await asOwner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@cred-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@cred-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${person(OWN, 'olga', 'admin')} ${person(T, 'tess', 'trainer')} ${person(M, 'mia', 'member')}
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${T}', 'trainer', 'active'), ('${GYM_A}', '${M}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${OWN}', '${T}', '${M}');
  insert into trainer_profiles (profile_id, gym_id) values ('${T}', '${GYM_A}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM_A}', 'QR-CM') on conflict do nothing;
`);

// ---- the trainer submits, with details ---------------------------------------------------------------
await as(T);
const ins = (title, file, extra = '') => `insert into trainer_credentials (trainer_id, title, file_path, issuer, credential_number, issued_on, expires_on)
  values ('${T}', '${title}', '${T}/${file}.pdf', 'Philippine Red Cross', 'PRC-12345', ${TODAY} - 300, ${extra || `${TODAY} + 400`})`;
check('a trainer submits a credential with issuer, number and dates', !(await tryExec(ins('First Aid', 'a'))));
check('an expiry before it was issued is refused', !!(await tryExec(ins('Bad dates', 'b', `${TODAY} - 400`))));
await asOwner();
const cred = (await one(`select id, status from trainer_credentials where title = 'First Aid'`));
check('it arrives pending', cred.status === 'pending');

// ---- the owner rejects, the trainer corrects, it is pending again --------------------------------------
await as(OWN);
await db.exec(`update trainer_credentials set status = 'rejected', review_note = 'The number is unreadable' where id = '${cred.id}'`);
await as(T);
check('a trainer cannot verify their own', !!(await tryExec(`update trainer_credentials set status = 'verified' where id = '${cred.id}'`)));
check('correcting a rejected one is allowed', !(await tryExec(`update trainer_credentials set credential_number = 'PRC-12346' where id = '${cred.id}'`)));
await asOwner();
const back = await one(`select status, review_note, reviewed_by from trainer_credentials where id = '${cred.id}'`);
check('…and sends it back for review, not stamped as reviewed by the trainer', back.status === 'pending' && back.review_note === null && back.reviewed_by === null, JSON.stringify(back));

// ---- verified: members see it with its issuer; the trainer can no longer change it ------------------------
await as(OWN);
await db.exec(`update trainer_credentials set status = 'verified' where id = '${cred.id}'`);
await asOwner();
check('the owner is stamped as the reviewer', (await one(`select reviewed_by from trainer_credentials where id = '${cred.id}'`)).reviewed_by === OWN);
await as(M);
const seen = await all(`select * from public_trainer_credentials where trainer_id = '${T}'`);
check('a member sees it, with the issuer and until when', seen.length === 1 && seen[0].issuer === 'Philippine Red Cross' && !!seen[0].expires_on, JSON.stringify(seen));
check('never the number or the file', !('credential_number' in seen[0]) && !('file_path' in seen[0]));
await as(T);
check('a verified credential cannot be edited by the trainer', !!(await tryExec(`update trainer_credentials set expires_on = ${TODAY} + 4000 where id = '${cred.id}'`)));

// ---- running out ---------------------------------------------------------------------------------------------
await asOwner();
await db.exec(`update trainer_credentials set expires_on = ${TODAY} + 10 where id = '${cred.id}'`);
await as(T);
await db.exec(`select credential_expiry_sweep()`);
await asOwner();
check('ten days out, the trainer is told once', (await one(`select count(*)::int as n from notifications where user_id = '${T}' and (metadata ->> 'dedupe') = 'credexp30:${cred.id}'`)).n === 1);
await as(OWN);
await db.exec(`select credential_expiry_sweep()`);
await asOwner();
check('…and not twice', (await one(`select count(*)::int as n from notifications where user_id = '${T}' and (metadata ->> 'dedupe') = 'credexp30:${cred.id}'`)).n === 1);
await db.exec(`update trainer_credentials set expires_on = ${TODAY} - 1 where id = '${cred.id}'`);
await as(M);
check('expired: members no longer see it', (await all(`select * from public_trainer_credentials where trainer_id = '${T}'`)).length === 0);
await as(OWN);
await db.exec(`select credential_expiry_sweep()`);
await asOwner();
check('…the trainer is told it lapsed', (await one(`select count(*)::int as n from notifications where user_id = '${T}' and (metadata ->> 'dedupe') = 'credexp:${cred.id}'`)).n === 1);
check('…and so is the owner', (await one(`select count(*)::int as n from notifications where user_id = '${OWN}' and (metadata ->> 'dedupe') like 'credexp-admin:${cred.id}%'`)).n === 1);
check('the view is still protected', (await all(`select * from views_without_protection()`)).length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
