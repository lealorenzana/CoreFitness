/**
 * 0120: a file belongs to a gym, and only that gym may touch it.
 *
 * The tenancy harness proves ~50 tables are gym-scoped and never looked at
 * storage.objects — which is how three buckets kept pre-tenancy policies that
 * let *any* gym's admin read every trainer's credential files and delete any
 * gym's logo. This asserts each of those as a refusal, and each legitimate
 * action (own gym, own folder) as still allowed, so the fix cannot be "nobody
 * can do anything".
 *
 * RLS filters rows and does not raise: a forbidden delete is zero rows and no
 * error, so every write here is counted, never just "did it throw".
 *
 *   node <repo>/scripts/sql/storage-tenancy.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', staffA: 'a1000000-0000-4000-8000-000000000002',
  trainerA: 'a1000000-0000-4000-8000-000000000003', memberA: 'a1000000-0000-4000-8000-000000000004',
  adminB: 'b1000000-0000-4000-8000-000000000001', staffB: 'b1000000-0000-4000-8000-000000000002',
  trainerB: 'b1000000-0000-4000-8000-000000000003', memberB: 'b1000000-0000-4000-8000-000000000004',
  both: 'ab000000-0000-4000-8000-000000000005',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
/** Rows a statement touched, as the caller. A refusal by RLS is 0, not an error. */
// An error is NOT a zero: a statement that fails to parse would otherwise pass
// every "cannot" check here. It comes back as text, which equals no number.
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};

await asOwner();
// Supabase grants these on storage.objects; pglite's stub does not.
await db.exec(`grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;`);

const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@storage-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'), ('${GYM_A}', '${P.staffA}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainerA}', 'trainer', 'active'), ('${GYM_A}', '${P.memberA}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.staffB}', 'staff', 'active'),
    ('${GYM_B}', '${P.trainerB}', 'trainer', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active'),
    ('${GYM_A}', '${P.both}', 'trainer', 'active'), ('${GYM_B}', '${P.both}', 'trainer', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.staffB}', '${P.trainerB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}','${P.staffB}','${P.trainerB}','${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.adminA}','${P.staffA}','${P.trainerA}','${P.memberA}','${P.both}');
  insert into trainer_profiles (profile_id, gym_id) values
    ('${P.trainerA}', '${GYM_A}'), ('${P.trainerB}', '${GYM_B}'), ('${P.both}', '${GYM_A}'), ('${P.both}', '${GYM_B}')
    on conflict do nothing;
`);

// The files. Media: one per gym plus a legacy one with no gym folder.
// Credentials: each trainer's, plus the two-gym trainer's upload *to gym B*.
const media = (name) => `('media', '${name}')`;
await db.exec(`
  insert into storage.objects (bucket_id, name) values
    ${media(`gyms/${GYM_A}/logos/a.jpg`)}, ${media(`gyms/${GYM_B}/logos/b.jpg`)}, ${media('logos/legacy.jpg')},
    ('credentials', '${P.trainerA}/cert.pdf'), ('credentials', '${P.trainerB}/cert.pdf'),
    ('credentials', '${P.both}/for-b.pdf'),
    ('avatars', '${P.memberA}/me.jpg'), ('avatars', '${P.memberB}/me.jpg');
  insert into trainer_credentials (trainer_id, gym_id, title, file_path) values
    ('${P.trainerA}', '${GYM_A}', 'CPR', '${P.trainerA}/cert.pdf'),
    ('${P.trainerB}', '${GYM_B}', 'CPR', '${P.trainerB}/cert.pdf'),
    ('${P.both}',     '${GYM_B}', 'NASM', '${P.both}/for-b.pdf');
`);

const exists = async (bucket, name) => {
  await asOwner();
  return (await one(`select count(*)::int as n from storage.objects where bucket_id = '${bucket}' and name = '${name}'`)).n === 1;
};

// ---- credentials: the private one ----------------------------------------------------
await as(P.adminA);
const seenA = (await db.query(`select name from storage.objects where bucket_id = 'credentials' order by name`)).rows.map((r) => r.name);
check("gym A's owner reads gym A's trainer's certificate", seenA.includes(`${P.trainerA}/cert.pdf`), JSON.stringify(seenA));
check("gym A's owner cannot read gym B's trainer's certificate", !seenA.includes(`${P.trainerB}/cert.pdf`), JSON.stringify(seenA));
check("nor what a trainer who works at both sent to gym B", !seenA.includes(`${P.both}/for-b.pdf`), JSON.stringify(seenA));
check("gym A's owner cannot delete gym B's trainer's certificate",
  (await touched(`delete from storage.objects where bucket_id = 'credentials' and name = '${P.trainerB}/cert.pdf'`)) === 0
  && await exists('credentials', `${P.trainerB}/cert.pdf`));

await as(P.staffA);
check('the desk cannot read credentials at all',
  (await one(`select count(*)::int as n from storage.objects where bucket_id = 'credentials'`)).n === 0);

await as(P.trainerB);
check('a trainer still reads their own documents',
  (await one(`select count(*)::int as n from storage.objects where bucket_id = 'credentials' and name like '${P.trainerB}/%'`)).n === 1);

await as(P.adminB);
check("gym B's owner reads what the two-gym trainer sent gym B",
  (await one(`select count(*)::int as n from storage.objects where bucket_id = 'credentials' and name = '${P.both}/for-b.pdf'`)).n === 1);

// ---- media: logos and pictures -------------------------------------------------------
await as(P.adminA);
check("gym A's owner cannot delete gym B's logo",
  (await touched(`delete from storage.objects where bucket_id = 'media' and name = 'gyms/${GYM_B}/logos/b.jpg'`)) === 0
  && await exists('media', `gyms/${GYM_B}/logos/b.jpg`));
await as(P.staffA);
{
  const n = await touched(`update storage.objects set metadata = '{"x":1}' where bucket_id = 'media' and name = 'gyms/${GYM_B}/logos/b.jpg'`);
  check("gym A's desk cannot overwrite gym B's logo", n === 0, String(n));
}
check("gym A's desk cannot upload into gym B's folder",
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_B}/logos/planted.jpg')`)));
check('nor to a path with no gym at all',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'logos/planted.jpg')`)));
check("gym A's desk uploads into its own folder",
  !(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/events/e.jpg')`)));
check('the desk cannot delete, even in its own gym',
  (await touched(`delete from storage.objects where bucket_id = 'media' and name = 'gyms/${GYM_A}/events/e.jpg'`)) === 0);
await as(P.memberA);
check('a member cannot upload into their gym folder',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/events/m.jpg')`)));
await as(P.trainerA);
check('nor can a trainer (yet — 0121 decides that)',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/events/t.jpg')`)));
await as(P.adminA);
check('no gym can delete a legacy file with no gym folder',
  (await touched(`delete from storage.objects where bucket_id = 'media' and name = 'logos/legacy.jpg'`)) === 0
  && await exists('media', 'logos/legacy.jpg'));
check('but everybody can still read it — existing logos keep working',
  (await one(`select count(*)::int as n from storage.objects where bucket_id = 'media' and name = 'logos/legacy.jpg'`)).n === 1);
check("gym A's owner deletes gym A's own picture",
  (await touched(`delete from storage.objects where bucket_id = 'media' and name = 'gyms/${GYM_A}/events/e.jpg'`)) === 1);

// A member of two gyms switching does not carry rights across: the path decides.
await as(P.both);
await db.exec(`select set_active_gym('${GYM_B}')`);
check('switching gym does not grant a trainer upload rights anywhere',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_B}/events/x.jpg')`)));

// ---- avatars ---------------------------------------------------------------------------
await as(P.adminA);
check("gym A's owner cannot delete a gym B member's photo",
  (await touched(`delete from storage.objects where bucket_id = 'avatars' and name = '${P.memberB}/me.jpg'`)) === 0
  && await exists('avatars', `${P.memberB}/me.jpg`));
await as(P.adminA);
check("gym A's owner can remove a gym A member's photo (moderation, unchanged)",
  (await touched(`delete from storage.objects where bucket_id = 'avatars' and name = '${P.memberA}/me.jpg'`)) === 1);
await as(P.memberB);
check('a person still deletes their own photo',
  (await touched(`delete from storage.objects where bucket_id = 'avatars' and name = '${P.memberB}/me.jpg'`)) === 1);

// ---- the rule, as a query ------------------------------------------------------------
await as(P.adminA);
const loose = await db.query('select * from storage_policies_without_gym()').catch(() => null);
check('no storage policy trusts a role without asking which gym',
  loose !== null && loose.rows.length === 0, loose ? JSON.stringify(loose.rows) : 'function missing');

console.log(failures ? `\n${failures} FAILED` : '\nall 0120 checks passed');
process.exit(failures ? 1 : 0);
