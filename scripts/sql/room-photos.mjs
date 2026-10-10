/**
 * 0178: room pictures (a 1-on-1 shows the member; class and group rooms a picture
 * their coach sets) and the coach's status (Available / Away / On leave).
 *
 *   node <repo>/scripts/sql/room-photos.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1780000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const P = { coach: id(1), coach2: id(2), mem: id(3) };
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const rows = async (sql) => (await db.query(sql)).rows;
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await db.exec(`reset role;
  ${[['coach', P.coach, 'trainer'], ['coach2', P.coach2, 'trainer'], ['mem', P.mem, 'member']].map(([k, uid, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${uid}', '${k}@rp-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id, photo_url)
      values ('${uid}', '${k}', 'T', '${k}@rp-test.com', 'active', '${role}', '${GYM}', ${k === 'mem' ? "'https://x/avatars/mem.jpg'" : 'null'}) on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${uid}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM}'), ('${P.coach2}', '${GYM}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mem}', '${GYM}', 'QR-RP') on conflict do nothing;`);
const pt = (await one(`insert into rooms (gym_id, kind, trainer_id, member_id, name) values ('${GYM}', 'pt', '${P.coach}', '${P.mem}', 'Coach · Mem') returning id`)).id;
const grp = (await one(`insert into rooms (gym_id, kind, trainer_id, name, join_code) values ('${GYM}', 'group', '${P.coach}', 'Fat loss', 'ABCDEF') returning id`)).id;
const ok = `https://p.supabase.co/storage/v1/object/public/media/gyms/${GYM}/content/pic.jpg`;

await as(P.coach);
const ph = await rows(`select * from my_room_photos()`);
check("a 1-on-1 room shows the member's own photo", ph.some((r) => r.room_id === pt && r.photo_url === 'https://x/avatars/mem.jpg'), JSON.stringify(ph));
check('the coach sets their group room picture', (await tryExec(`select set_room_photo('${grp}', '${ok}')`)) === null);
check('…and it shows', (await one(`select photo_url from my_room_photos() where room_id = '${grp}'`)).photo_url === ok);
check("…but not a 1-on-1's (it is the member's photo)", (await tryExec(`select set_room_photo('${pt}', '${ok}')`)) !== null);
check('a picture from outside this gym is refused', (await tryExec(`select set_room_photo('${grp}', 'https://evil/x.jpg')`)) !== null);
await as(P.coach2);
check("another coach cannot set it", (await tryExec(`select set_room_photo('${grp}', '${ok}')`)) !== null);

await as(P.coach);
await db.exec(`select set_my_presence('on_leave')`);
await db.exec('reset role');
check("a coach's status is saved", (await one(`select presence from trainer_profiles where profile_id = '${P.coach}'`)).presence === 'on_leave');
await as(P.coach);
check('an unknown status is refused', (await tryExec(`select set_my_presence('sleeping')`)) !== null);
await as(P.mem);
check('a member cannot set one', (await tryExec(`select set_my_presence('away')`)) !== null);

await db.exec('reset role');
check('marker', (await one(`select migration_0178_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0178 checks passed');
process.exit(failures ? 1 : 0);
