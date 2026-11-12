/**
 * 0245: reels — off until the owner switches them on; the owner, the desk and
 * coaches post a link (YouTube, TikTok, Facebook, Instagram) or an uploaded
 * video (10 a gym); the owner manages any, the others their own; members only
 * watch and like; another gym sees nothing; files go only into the gym's folder.
 *
 *   node <repo>/scripts/sql/reels.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-0000000002e5';
const id = (n) => `a2450000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c'), M2 = id('0d'), T = id('0e'), OTHER = id('0f');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
// Supabase grants these; the stub does not, and without them a refusal proves nothing.
await db.exec(`grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;`);
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM2}', 'other-reels-gym', 'Other Gym') on conflict do nothing;
  ${[['own', AD, 'admin', GYM], ['desk', ST, 'staff', GYM], ['m', M, 'member', GYM], ['m2', M2, 'member', GYM], ['coach', T, 'trainer', GYM], ['other', OTHER, 'admin', GYM2]].map(([k, u, role, g]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@reels-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@reels-test.com', 'active', '${role}', '${g}') on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}`);

const YT = 'https://www.youtube.com/shorts/abcDEF12345';
const post = (title, url, path = null, cover = null) =>
  `select post_reel('${title}', 'cap', '${url}', ${path ? `'${path}'` : 'null'}, ${cover ? `'${cover}'` : 'null'}) id`;

// ---- which links count ----
const src = async (u) => (await one(`select reel_link_source('${u}') s`)).s;
check('YouTube Shorts, watch and youtu.be are YouTube',
  (await src(YT)) === 'youtube' && (await src('https://youtube.com/watch?v=abc')) === 'youtube' && (await src('https://youtu.be/abc')) === 'youtube');
check('TikTok, with its short links', (await src('https://www.tiktok.com/@gym/video/7300000000000000000')) === 'tiktok' && (await src('https://vm.tiktok.com/ZSabc/')) === 'tiktok');
check('Facebook and fb.watch', (await src('https://www.facebook.com/reel/1234567890')) === 'facebook' && (await src('https://fb.watch/abc/')) === 'facebook');
check('Instagram reels', (await src('https://www.instagram.com/reel/Cabc123/')) === 'instagram');
check('http, another site, a look-alike host and words are refused',
  (await src('http://www.youtube.com/shorts/abc')) === null && (await src('https://example.com/shorts/abc')) === null
  && (await src('https://youtube.com.evil.test/shorts/abc')) === null && (await src('hello')) === null
  && (await src('https://eviltiktok.com/x')) === null);

// ---- off until the owner switches it on ----
await as(AD);
check('reels start off: the owner cannot post yet', /owner, front desk and coaches/.test((await tryExec(post('Early', YT))) ?? ''));
check('…and the switch list says off', (await one(`select state from my_gym_modules() where feature_key = 'reels'`))?.state === 'off');
await db.exec(`select set_gym_module('reels', true)`);
check('the owner switches reels on', (await one(`select state from my_gym_modules() where feature_key = 'reels'`))?.state === 'on');

// ---- who posts ----
await as(M);
check('a member cannot post', /owner, front desk and coaches/.test((await tryExec(post('Mine', YT))) ?? ''));
check('…nor insert straight into the table', (await tryExec(`insert into gym_reels (title, source, url, created_by) values ('x', 'youtube', '${YT}', '${M}')`)) !== null);
await as(AD);
const r1 = (await one(post('Squat form', YT))).id;
check('the owner posts a link', !!r1 && (await one(`select source from gym_reels where id = '${r1}'`)).source === 'youtube');
check('a link from elsewhere is refused in words', /YouTube, TikTok, Facebook or Instagram/.test((await tryExec(post('Bad', 'https://example.com/v/1'))) ?? ''));
check('a reel needs a title', /title/.test((await tryExec(post('', YT))) ?? ''));
await as(ST);
const r2 = (await one(post('Desk tip', 'https://www.tiktok.com/@gym/video/7300000000000000000'))).id;
await as(T);
const r3 = (await one(post('Coach drill', 'https://www.instagram.com/reel/Cabc123/'))).id;
check('the desk and a coach post too', !!r2 && !!r3);

// ---- uploads ----
await as(AD);
const P = (n) => `gyms/${GYM}/reels/v${n}.mp4`;
const U = (n) => `https://x.supabase.co/storage/v1/object/public/reels/${P(n)}`;
check("a file in another gym's folder is refused", /not in this gym/.test((await tryExec(post('Stolen', `https://x/gyms/${GYM2}/reels/v.mp4`, `gyms/${GYM2}/reels/v.mp4`))) ?? ''));
check('…and one whose address does not match the file', /does not match/.test((await tryExec(post('Mismatch', 'https://elsewhere.test/v.mp4', P(0)))) ?? ''));
for (let i = 1; i <= 10; i++) await db.exec(post(`Upload ${i}`, U(i), P(i)));
check('ten uploads fit', (await one(`select count(*)::int n from gym_reels where source = 'upload'`)).n === 10);
// ---- 0247: the plan's storage is the limit, not a count ----
check('an eleventh upload is no longer refused for being the eleventh', !!(await one(post('Upload 11', U(11), P(11)))).id);
await db.exec(`select remove_reel(id) from gym_reels where video_path = '${P(11)}'`);
await owner();
const PA = id('1a');
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@reels-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Plat', 'Form', 'pa@reels-test.com', 'active', 'admin') on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  update gyms set plan = 'starter' where id = '${GYM}';`);
const starts = await all(`select plan_key, storage_mb from platform_plan_storage() order by 1`);
const mb = (k) => starts.find((r) => r.plan_key === k)?.storage_mb;
check('plans start with their storage: trial 500 MB, Starter 2 GB, Growth 10 GB, Pro 50 GB', mb('trial') === 500 && mb('starter') === 2048 && mb('growth') === 10240 && mb('pro') === 51200, JSON.stringify(starts));
await as(AD);
check("a gym's owner cannot set a plan's storage", /Only Core Fitness/.test((await tryExec(`select set_platform_plan_storage('starter', 999999)`)) ?? ''));
await as(PA);
check('the platform cannot set a silly number', /between 100 MB and 1 TB/.test((await tryExec(`select set_platform_plan_storage('starter', 5)`)) ?? ''));
await db.exec(`select set_platform_plan_storage('starter', 100)`);
const file = (name, bytes, bucket = 'reels') => `insert into storage.objects (bucket_id, name, metadata) values ('${bucket}', '${name}', '{"size": ${bytes}}')`;
await owner();
await db.exec(`${file(`gyms/${GYM}/reels/a.mp4`, 60 * 1048576)}; ${file(`gyms/${GYM}/chat/${M}/p.jpg`, 1048576, 'chat')}; ${file(`gyms/${GYM}/logos/l.jpg`, 1048576, 'media')};
  ${file(`gyms/${GYM2}/reels/other.mp4`, 500 * 1048576)}; ${file(`someone/else.mp4`, 500 * 1048576)};`);
await as(AD);
let st = await one(`select * from my_gym_storage()`);
check("the owner sees the gym's use against its plan: its own reels, chat photos and pictures, nobody else's",
  st?.plan_name === 'Starter' && Number(st.limit_bytes) === 100 * 1048576 && Number(st.used_bytes) === 62 * 1048576, JSON.stringify(st));
await as(M);
check('a member is not shown it', (await all(`select * from my_gym_storage()`)).length === 0);
await as(T);
check('under the limit, a coach uploads and posts', (await tryExec(file(`gyms/${GYM}/reels/b.mp4`, 30 * 1048576))) === null
  && !!(await one(post('Coach upload', `https://x/storage/gyms/${GYM}/reels/b.mp4`, `gyms/${GYM}/reels/b.mp4`))).id);
await owner();
await db.exec(file(`gyms/${GYM}/reels/c.mp4`, 20 * 1048576));   // 112 MB of 100
await as(T);
const full = await tryExec(post('Over the line', `https://x/storage/gyms/${GYM}/reels/c.mp4`, `gyms/${GYM}/reels/c.mp4`));
check('the video that crosses the limit is refused, in words that say what to do', /storage is full/.test(full ?? '') && /links use none/.test(full ?? ''), String(full));
check('…and at the limit, a new file is refused before it is stored', (await tryExec(file(`gyms/${GYM}/reels/d.mp4`, 1048576))) !== null);
check('a link still posts with the storage full', !!(await one(post('Another link', 'https://fb.watch/abc/'))).id);
await as(PA);
check('the platform sees every gym against its plan', (await all(`select * from platform_gym_storage()`)).some((g) => g.gym_id === GYM && Number(g.used_bytes) === 112 * 1048576));
await db.exec(`select set_platform_plan_storage('starter', null)`);
await as(T);
check('no limit on the plan means no limit', (await tryExec(file(`gyms/${GYM}/reels/d.mp4`, 1048576))) === null);
await as(AD);
check('an owner cannot ask about every gym', (await all(`select * from platform_gym_storage()`)).length === 0);
await db.exec(`select remove_reel(id) from gym_reels where title = 'Coach upload'`);

// ---- 0247: a cover from the link's own page ----
await as(T);
check("a coach cannot set the cover of the owner's reel", (await tryExec(`select set_reel_cover('${r1}', 'gyms/${GYM}/reels/cov.jpg')`)) !== null);
check("…and on their own, not a picture from another gym's folder", /not in this gym/.test((await tryExec(`select set_reel_cover('${r3}', 'gyms/${GYM2}/reels/cov.jpg')`)) ?? ''));
check('a first cover replaces nothing', (await one(`select set_reel_cover('${r3}', 'gyms/${GYM}/reels/cov1.jpg') old`)).old === null);
check('a second hands back the first to delete', (await one(`select set_reel_cover('${r3}', 'gyms/${GYM}/reels/cov2.jpg') old`)).old === `gyms/${GYM}/reels/cov1.jpg`);
check("the full address must be the same site as the reel's link", /not the same site/.test((await tryExec(`select set_reel_cover('${r3}', null, 'https://www.tiktok.com/@a/video/7300000000000000001')`)) ?? ''));
await db.exec(`select set_reel_cover('${r3}', null, 'https://www.instagram.com/reel/Cfull999/')`);
await owner();
const cov = await one(`select url, cover_path from gym_reels where id = '${r3}'`);
check('the full address and the cover are kept', cov.url === 'https://www.instagram.com/reel/Cfull999/' && cov.cover_path === `gyms/${GYM}/reels/cov2.jpg`, JSON.stringify(cov));
await as(M);
check('a member sets no cover', (await tryExec(`select set_reel_cover('${r1}', 'gyms/${GYM}/reels/x.jpg')`)) !== null);
await as(AD);

// ---- members watch and like ----
await as(M);
let feed = await all(`select * from gym_reels_feed()`);
check('a member sees every reel, newest first', feed.length === 14 && feed[0].title === 'Another link', String(feed.length));
check('…and cannot manage any', feed.every((f) => f.can_manage === false));
check('a like turns on', (await one(`select toggle_reel_like('${r1}') on_`)).on_ === true);
await as(M2);
await db.exec(`select toggle_reel_like('${r1}')`);
feed = await all(`select * from gym_reels_feed()`);
check('the hearts are counted, and each sees their own', feed.find((f) => f.id === r1).likes === 2 && feed.find((f) => f.id === r1).liked === true);
check('a second tap takes it off', (await one(`select toggle_reel_like('${r1}') on_`)).on_ === false
  && (await one(`select likes from gym_reels_feed() where id = '${r1}'`)).likes === 1);
check('the hearts are counted, never listed: nobody reads who liked', (await one(`select count(*)::int n from reel_likes`)).n === 0);
check('a member cannot like for someone else', (await tryExec(`insert into reel_likes (reel_id, user_id) values ('${r1}', '${M}')`)) !== null);
check('a member cannot edit, hide or remove', (await tryExec(`select edit_reel('${r1}', 'Hacked', null, true)`)) !== null
  && (await tryExec(`select remove_reel('${r1}')`)) !== null);
await db.exec(`update gym_reels set title = 'Hacked' where id = '${r1}'`);
await db.exec(`delete from gym_reels where id = '${r1}'`);
await owner();
check('…and a direct update or delete changes nothing', (await one(`select title from gym_reels where id = '${r1}'`))?.title === 'Squat form');

// ---- who manages what ----
await as(T);
check("a coach cannot change the owner's reel", (await tryExec(`select edit_reel('${r1}', 'Mine now', null, false)`)) !== null);
await db.exec(`select edit_reel('${r3}', 'Coach drill 2', 'new words', true)`);
check('a coach edits and hides their own', (await one(`select title, hidden from gym_reels where id = '${r3}'`)).hidden === true);
await as(M);
check('a hidden reel leaves the member feed', !(await all(`select id from gym_reels_feed()`)).some((f) => f.id === r3)
  && (await one(`select count(*)::int n from gym_reels where id = '${r3}'`)).n === 0);
check('…and cannot be liked', (await tryExec(`select toggle_reel_like('${r3}')`)) !== null);
await as(ST);
check('the desk still sees it', (await all(`select id from gym_reels_feed()`)).some((f) => f.id === r3));
check("…but cannot remove the coach's reel", (await tryExec(`select remove_reel('${r3}')`)) !== null);
await as(AD);
const gone = (await one(`select remove_reel('${r2}') files`)).files;
check("the owner removes the desk's reel", (await one(`select count(*)::int n from gym_reels where id = '${r2}'`)).n === 0 && gone.length === 0);
const files = (await one(`select remove_reel(id) files from gym_reels where video_path = '${P(1)}'`)).files;
check('removing an upload hands back its file to delete', files.length === 1 && files[0] === P(1), JSON.stringify(files));
await owner();
check('posting and removing are in the activity log',
  (await one(`select count(*)::int n from activity_log where action = 'reel.posted'`)).n >= 14
  && (await one(`select count(*)::int n from activity_log where action = 'reel.removed'`)).n === 4);
check("removing a reel removes its likes", (await one(`select count(*)::int n from reel_likes l where not exists (select 1 from gym_reels r where r.id = l.reel_id)`)).n === 0);

// ---- another gym ----
await as(OTHER);
check('another gym sees no reel and no like', (await all(`select * from gym_reels_feed()`)).length === 0
  && (await one(`select count(*)::int n from gym_reels`)).n === 0 && (await one(`select count(*)::int n from reel_likes`)).n === 0);
check("…and cannot like or remove this gym's", (await tryExec(`select toggle_reel_like('${r1}')`)) !== null && (await tryExec(`select remove_reel('${r1}')`)) !== null);

// ---- the bucket ----
const put = (name) => tryExec(`insert into storage.objects (bucket_id, name, owner) values ('reels', '${name}', nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)`);
await as(M);
check('a member cannot put a file in the bucket', (await put(`gyms/${GYM}/reels/m.mp4`)) !== null);
await as(T);
const coachPut = await put(`gyms/${GYM}/reels/t.mp4`);
check("a coach can, in the gym's reels folder", coachPut === null, String(coachPut));
check("…not in another gym's, nor another folder", (await put(`gyms/${GYM2}/reels/t.mp4`)) !== null && (await put(`gyms/${GYM}/other/t.mp4`)) !== null);
await as(ST);
await db.exec(`delete from storage.objects where bucket_id = 'reels' and name = 'gyms/${GYM}/reels/t.mp4'`);
await owner();
check("the desk cannot delete a coach's file", (await one(`select count(*)::int n from storage.objects where name = 'gyms/${GYM}/reels/t.mp4'`)).n === 1);
await as(AD);
await db.exec(`delete from storage.objects where bucket_id = 'reels' and name = 'gyms/${GYM}/reels/t.mp4'`);
await owner();
check('the owner can', (await one(`select count(*)::int n from storage.objects where name = 'gyms/${GYM}/reels/t.mp4'`)).n === 0);
const b = await one(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'reels'`);
check('the bucket is public, 15 MB (0248), video and cover images only', b.public === true && Number(b.file_size_limit) === 15728640 && b.allowed_mime_types.includes('video/mp4') && !b.allowed_mime_types.includes('text/html'));

// ---- switched off again ----
await as(AD);
await db.exec(`select set_gym_module('reels', false)`);
await as(M);
check('switched off, a member reads nothing and cannot like', (await all(`select * from gym_reels_feed()`)).length === 0
  && (await one(`select count(*)::int n from gym_reels`)).n === 0 && (await tryExec(`select toggle_reel_like('${r1}')`)) !== null);
await as(T);
check('…and nobody posts or uploads', (await tryExec(post('Off', YT))) !== null && (await put(`gyms/${GYM}/reels/off.mp4`)) !== null);

// ---- furniture ----
await owner();
check('both tables are gym tables (tenancy)', (await one(`select tenancy_gym_tables() @> array['gym_reels','reel_likes'] ok`)).ok);
check('every plan has reels', (await one(`select bool_and(enabled) ok from platform_plan_features where feature_key = 'reels'`)).ok === true);
await db.exec(`set role anon`);
check('a visitor cannot call the writers', (await tryExec(post('Anon', YT))) !== null && (await tryExec(`select * from gym_reels_feed()`)) !== null);
await owner();
check('0245 and 0247 are marked applied', (await one(`select migration_0245_applied() and migration_0247_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
