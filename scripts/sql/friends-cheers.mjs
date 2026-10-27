/**
 * 0217: friends, wins and cheers. Off until the owner switches it on; both people agree; findable
 * members by name, anyone by friend code, the squad and referral pairs always; wins only from people
 * who share them; a cheer only on a win the cheerer can see; no direct writes for anyone; the desk
 * sees counts only; a member cannot choose their own friend code.
 *
 *   node <repo>/scripts/sql/friends-cheers.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2170000-0000-4000-8000-0000000000${n}`;
const A = id('0a'), B = id('0b'), C = id('0c'), D = id('0d'), DESK = id('0e'), OWN = id('0f');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const tryOne = async (sql) => { try { return { row: await one(sql) }; } catch (e) { return { err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['ana', A, 'member'], ['ben', B, 'member'], ['cy', C, 'member'], ['dee', D, 'member'], ['desk', DESK, 'staff'], ['own', OWN, 'admin']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@fc-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k[0].toUpperCase() + k.slice(1)}', 'Test', '${k}@fc-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${A}', '${GYM}', 'QR-FC-A'), ('${B}', '${GYM}', 'QR-FC-B'),
    ('${C}', '${GYM}', 'QR-FC-C'), ('${D}', '${GYM}', 'QR-FC-D') on conflict do nothing;
  update member_profiles set findable = false where profile_id in ('${C}', '${D}');
  insert into squads (id, gym_id, name, code, weekly_target, created_by) values ('${id('51')}', '${GYM}', 'Early crew', 'FCSQDA', 3, '${A}');
  insert into squad_members (gym_id, squad_id, member_id) values ('${GYM}', '${id('51')}', '${A}'), ('${GYM}', '${id('51')}', '${D}');`);

const codes = await all(`select profile_id, friend_code from member_profiles where profile_id in ('${A}','${B}','${C}','${D}')`);
check('every member has a friend code, all different', codes.every((r) => r.friend_code && r.friend_code.length === 7) && new Set(codes.map((r) => r.friend_code)).size === 4, JSON.stringify(codes));
const codeOf = (u) => codes.find((r) => r.profile_id === u).friend_code;

// Off until the owner switches it on.
await as(A);
let err = await tryExec(`select send_friend_request('${B}')`);
check('switched off: a request is refused', /switched off/.test(err ?? ''), err ?? 'no error');
check('switched off: no wins, no friends', (await all(`select * from friend_wins()`)).length === 0 && (await all(`select * from my_friends()`)).length === 0);
await as(A);
await tryExec(`update gym_settings set friends_on = true where gym_id = '${GYM}'`);
await owner();
check('a member cannot switch it on', (await one(`select friends_on o from gym_settings where gym_id = '${GYM}'`)).o === false);
await as(OWN);
err = await tryExec(`update gym_settings set friends_on = true where gym_id = '${GYM}'`);
await owner();
check('the owner switches it on', err === null && (await one(`select friends_on o from gym_settings where gym_id = '${GYM}'`)).o === true, err ?? '');

// A asks B; B accepts.
await as(A);
check('a request is sent', (await one(`select send_friend_request('${B}') s`)).s === 'sent');
await as(B);
const reqs = await all(`select * from my_friend_requests()`);
check('…B sees it waiting', reqs.length === 1 && reqs[0].direction === 'in' && reqs[0].member_id === A, JSON.stringify(reqs));
err = await tryExec(`select respond_friend_request('${reqs[0]?.request_id}', true)`);
check('…and accepts', err === null, err ?? '');
await as(A);
check('…now they are friends, on both sides', (await all(`select * from my_friends()`)).some((f) => f.member_id === B));
await owner();
check('…and A was told', (await one(`select count(*)::int n from notifications where user_id = '${A}' and title like '%accepted your friend request'`)).n === 1);

// Findable, by code, the squad.
await as(A);
err = await tryExec(`select send_friend_request('${C}')`);
check('C is not findable: asking by name is refused', /friend code/.test(err ?? ''), err ?? 'no error');
check('…and search does not list C', !(await all(`select * from find_members('Cy')`)).some((r) => r.member_id === C));
check('…but lists findable B', (await all(`select * from find_members('Be')`)).some((r) => r.member_id === B && r.state === 'friends'));
const byCode = await one(`select send_friend_request_by_code('${codeOf(C).toLowerCase()}') r`);
check('…a scanned friend code reaches C', byCode.r.state === 'sent', JSON.stringify(byCode));
check('D (squad, not findable) is suggested', (await all(`select * from people_you_may_know()`)).some((r) => r.member_id === D && r.reason === 'squad'));
check('…and may be asked by name', (await one(`select send_friend_request('${D}') s`)).s === 'sent');

// No direct writes, for anyone.
err = await tryExec(`insert into friendships (gym_id, requester, addressee, status) values ('${GYM}', '${A}', '${C}', 'accepted')`);
check('a member cannot write a friendship directly', err !== null, 'insert went through');
err = await tryExec(`update member_profiles set friend_code = 'VANITY1' where profile_id = '${A}'`);
check('a member cannot choose their own friend code', /made by the gym/.test(err ?? ''), err ?? 'no error');

// Wins: B sets a record; A sees it; B stops sharing; A does not.
await owner();
const ex = await one(`select id from exercises limit 1`);
// A real workout: an earlier 75 kg set, then 80 kg — the record trigger (0123) decides what is a record.
await db.exec(`
  insert into workout_logs (id, gym_id, member_id, activity, performed_on, completed_at) values
    ('${id('71')}', '${GYM}', '${B}', 'Legs', current_date - 3, now() - interval '3 days'),
    ('${id('72')}', '${GYM}', '${B}', 'Legs', current_date, now());
  insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${id('71')}', '${ex.id}', 1, 5, 75);
  insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${id('72')}', '${ex.id}', 1, 5, 80);`);
const pr = await one(`select value, previous from personal_records where member_id = '${B}' and removed_at is null order by achieved_at desc limit 1`);
check('the record trigger made B’s 80 kg a record', pr && Number(pr.value) === 80, JSON.stringify(pr));
await as(A);
let wins = await all(`select * from friend_wins()`);
const rec = wins.find((w) => w.member_id === B && w.kind === 'record');
check('A sees friend B\'s new record', !!rec && /New record/.test(rec.title) && /80 kg/.test(rec.detail ?? ''), JSON.stringify(wins));
check('…and their own wins are not in their feed', !wins.some((w) => w.member_id === A));

// Cheers.
check('A cheers it', (await one(`select cheer_win('${B}', 'record', '${rec?.ref}') c`)).c === true);
check('…twice is still one cheer', (await one(`select cheer_win('${B}', 'record', '${rec?.ref}') c`)).c === false);
check('…the feed says A cheered it', (await all(`select * from friend_wins()`)).find((w) => w.ref === rec?.ref)?.cheered === true);
await owner();
check('…and B was told, with what was cheered', (await one(`select count(*)::int n from notifications where user_id = '${B}' and title like '%cheered you on' and message like 'New record%'`)).n === 1);
await as(C);
const cheerC = await tryOne(`select cheer_win('${B}', 'record', '${rec?.ref}') c`);
check('C (not friends with B) cannot cheer B\'s win', /not one you can see/.test(cheerC.err ?? ''), JSON.stringify(cheerC));
err = await tryExec(`insert into cheers (gym_id, from_member, to_member, win_kind, win_ref, win_title) values ('${GYM}', '${C}', '${B}', 'record', 'x', 'x')`);
check('…nor write a cheer directly', err !== null, 'insert went through');

await as(B);
await db.exec(`update member_profiles set share_wins = false where profile_id = '${B}'`);
await as(A);
check('B stops sharing: A no longer sees B\'s wins', !(await all(`select * from friend_wins()`)).some((w) => w.member_id === B));

// Counts for the desk, nothing for a member.
await as(DESK);
const counts = await one(`select * from member_social_counts('${B}')`);
check('the desk sees counts only', counts && counts.friends === 1 && counts.cheers_received === 1, JSON.stringify(counts));
await as(A);
check('a member gets no counts about another', (await all(`select * from member_social_counts('${B}')`)).length === 0);

// Unfriend; switch off again.
check('unfriending works', (await tryExec(`select remove_friend('${B}')`)) === null && !(await all(`select * from my_friends()`)).some((f) => f.member_id === B));
await as(OWN);
await db.exec(`update gym_settings set friends_on = false where gym_id = '${GYM}'`);
await as(A);
check('switched off again: requests refused, lists empty', /switched off/.test((await tryExec(`select send_friend_request('${B}')`)) ?? '') && (await all(`select * from my_friend_requests()`)).length === 0);

await owner();
check('the owners\' note is there, once', (await one(`select count(*)::int n from app_releases where title = 'Friends and cheers, if you want them'`)).n === 1);
check('the 0217 marker answers', (await one(`select migration_0217_applied() a`)).a === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
