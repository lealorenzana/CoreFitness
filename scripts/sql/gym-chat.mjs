/**
 * 0246: the gym chat — off until the owner switches it on; in it the owner, the
 * desk, coaches and members whose membership is usable; send (idempotent by id),
 * reply, mention, react, seen, typing, pin; remove your own or — staff, with a
 * reason — anyone's; stop a person posting; announcements-only; reports; who a
 * push goes to; photos only in your own folder; nothing readable or writable
 * straight from the tables; another gym sees nothing.
 *
 *   node <repo>/scripts/sql/gym-chat.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-0000000002e6';
const id = (n) => `a2460000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c'), M2 = id('0d'), T = id('0e'), OTHER = id('0f');
const EXPIRED = id('1a'), FROZEN = id('1b'), NOPLAN = id('1c'), PENDING = id('1d');
const msg = (n) => `b2460000-0000-4000-8000-0000000000${n}`;
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
const sync = async (args = '') => (await one(`select gym_chat_sync(${args}) j`)).j;
const send = (n, body, extra = '') => `select gym_chat_send('${msg(n)}', ${body === null ? 'null' : `'${body}'`}${extra}) j`;

await owner();
await db.exec(`grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;`);
const people = [['own', AD, 'admin', GYM, 'active'], ['desk', ST, 'staff', GYM, 'active'], ['mia', M, 'member', GYM, 'active'],
  ['max', M2, 'member', GYM, 'active'], ['coach', T, 'trainer', GYM, 'active'], ['other', OTHER, 'admin', GYM2, 'active'],
  ['expired', EXPIRED, 'member', GYM, 'active'], ['frozen', FROZEN, 'member', GYM, 'active'],
  ['noplan', NOPLAN, 'member', GYM, 'active'], ['pending', PENDING, 'member', GYM, 'pending_approval']];
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM2}', 'other-chat-gym', 'Other Gym') on conflict do nothing;
  ${people.map(([k, u, role, g, st]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@chat-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@chat-test.com', 'active', '${role}', '${g}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    update profiles set first_name = '${k}', last_name = 'T' where id = '${u}';
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${role}', '${st}') on conflict do nothing;`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ${[M, M2, EXPIRED, FROZEN, NOPLAN, PENDING].map((u, i) => `('${u}', '${GYM}', 'QR-CHAT${i}')`).join(',')} on conflict do nothing;
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Chat Premium', 900, 30, 'premium', true, true, true),
           ('${id('f2')}', '${GYM}', 'Chat Free', 0, null, 'free', false, false, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
    ('${M2}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, null, true),
    ('${EXPIRED}', '${GYM}', '${id('f1')}', 'active', manila_today() - 40, manila_today() - 10, false),
    ('${FROZEN}', '${GYM}', '${id('f1')}', 'frozen', manila_today() - 1, manila_today() + 30, false),
    ('${PENDING}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false);
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values
    ${[AD, ST, M, M2, T, EXPIRED, OTHER].map((u, i) => `('${u}', 'https://push.test/${i}', 'k', 'a')`).join(',')};`);

// ---- off until the owner switches it on ----
await as(M);
let s = await sync();
check('the chat starts off, and says so', s.open === false && /not on at this gym/.test(s.why), JSON.stringify(s));
check('…nobody sends', (await tryExec(send('01', 'hello'))) !== null);
await as(ST);
check('the desk cannot switch it on', (await tryExec(`select set_gym_module('gym_chat', true)`)) !== null);
await as(AD);
await db.exec(`select set_gym_module('gym_chat', true)`);
check('the owner switches it on', (await sync()).open === true);

// ---- who is in ----
const openFor = async (u) => { await as(u); return (await sync()).open; };
check('a paying member and a free-plan member are in', (await openFor(M)) && (await openFor(M2)));
check('the desk and a coach are in', (await openFor(ST)) && (await openFor(T)));
check('an expired member is out', (await openFor(EXPIRED)) === false);
check('a frozen member is out', (await openFor(FROZEN)) === false);
check('a member with no membership is out', (await openFor(NOPLAN)) === false);
check('a member not yet approved is out', (await openFor(PENDING)) === false);
await as(EXPIRED);
check('…and out means no sending, reacting or reading history',
  (await tryExec(send('02', 'let me in'))) !== null
  && (await one(`select gym_chat_history(now()) j`)).j.length === 0 && (await one(`select gym_chat_unread() n`)).n === 0);
await as(M);
const list = await all(`select * from gym_chat_members()`);
// (The fixture gym already has its own owner, so the five here are among them.)
check('the people list is the people in the chat and nobody else, owners first',
  [AD, ST, M, M2, T].every((u) => list.some((p) => p.user_id === u)) && list[0].role === 'admin' && !list.some((p) => [EXPIRED, FROZEN, NOPLAN, PENDING, OTHER].includes(p.user_id)),
  JSON.stringify(list.map((p) => p.name)));

// ---- sending ----
await as(M);
const m1 = (await one(send('10', 'Good morning everyone'))).j;
check('a member sends', m1.body === 'Good morning everyone' && m1.mine === true && m1.name === 'mia T' && m1.role === 'member');
const again = (await one(send('10', 'Good morning everyone'))).j;
await owner();
check('the same id sent twice is one message', again.id === m1.id && (await one(`select count(*)::int n from gym_chat_messages`)).n === 1);
await as(M2);
check("another person cannot reuse that id", /taken/.test((await tryExec(send('10', 'mine now'))) ?? ''));
check('an empty message is refused', /Write something/.test((await tryExec(send('11', '   '))) ?? ''));
check('a message over 2,000 characters is refused', /too long/.test((await tryExec(`select gym_chat_send('${msg('12')}', repeat('x', 2001))`)) ?? ''));
check("a photo from someone else's folder is refused", /not yours/.test((await tryExec(send('13', null, `, 'gyms/${GYM}/chat/${M}/a.jpg'`))) ?? ''));
const m2 = (await one(send('14', 'Morning! @mia leg day', `, null, '${msg('10')}', array['${M}', '${EXPIRED}', '${OTHER}', '${M2}']::uuid[]`))).j;
check('a reply carries what it answers', m2.reply?.id === msg('10') && m2.reply.name === 'mia T' && m2.reply.body === 'Good morning everyone');
check('only people in the chat are mentioned, never yourself', JSON.stringify(m2.mentions) === JSON.stringify([M]), JSON.stringify(m2.mentions));
await owner();
check('a mention is kept in the Inbox, with where to go', (await one(`select count(*)::int n from notifications where user_id = '${M}' and title = 'max T mentioned you in the gym chat' and action_url = '/member/gym-chat'`)).n === 1);
await as(M2);
check('a reply to a message that is not here is refused', /not in this chat/.test((await tryExec(send('15', 'hm', `, null, '${msg('99')}'`))) ?? ''));
const photo = (await one(send('16', null, `, 'gyms/${GYM}/chat/${M2}/p.jpg'`))).j;
check('a photo alone is a message', photo.photo_path === `gyms/${GYM}/chat/${M2}/p.jpg` && photo.body === null);

// ---- a direct read or write does nothing ----
await as(M);
check('the tables themselves read as empty', (await one(`select count(*)::int n from gym_chat_messages`)).n === 0
  && (await one(`select count(*)::int n from gym_chat_people`)).n === 0 && (await one(`select count(*)::int n from gym_chat_reactions`)).n === 0);
check('…and take no direct write', (await tryExec(`insert into gym_chat_messages (sender_id, body) values ('${M}', 'raw')`)) !== null
  && (await tryExec(`insert into gym_chat_reactions (message_id, user_id, emoji) values ('${msg('14')}', '${M}', '👍')`)) !== null);
await db.exec(`update gym_chat_messages set body = 'hacked'; delete from gym_chat_messages;`);
await owner();
check('a direct update or delete changes nothing', (await one(`select count(*)::int n from gym_chat_messages where body = 'hacked'`)).n === 0
  && (await one(`select count(*)::int n from gym_chat_messages`)).n === 3);

// ---- sync: first load, then only what changed ----
await as(T);
s = await sync();
check('the first load is the messages in order', s.messages.length === 3 && s.messages[0].id === msg('10') && s.messages[2].id === msg('16'));
check('…with what the caller may do', s.role === 'trainer' && s.can_post === true && s.can_moderate === false && s.emojis.length === 7);
check('…and three unread until looked at', s.unread === 3, String(s.unread));
const t0 = s.now;
s = await sync(`'${t0}'::timestamptz + interval '10 seconds'`);
check('nothing new means nothing sent again', s.messages.length === 0);
s = await sync(`'${t0}', false, true`);
check('looking at it marks it read', s.unread === 0 && (await one(`select gym_chat_unread() n`)).n === 0);
await as(M2);
s = await sync('null, false, true');
check('the newest message is seen by the coach (not its sender, not the caller)', s.seen.message_id === msg('16') && s.seen.count === 1 && s.seen.people[0].name === 'coach T', JSON.stringify(s.seen));

// ---- typing ----
await as(M);
await sync('null, true, false');
await as(T);
s = await sync();
check('typing shows to the others by first name', JSON.stringify(s.typing) === JSON.stringify(['mia']), JSON.stringify(s.typing));
await as(M);
check('…never to yourself', (await sync()).typing.length === 0);
await owner();
await db.exec(`update gym_chat_people set typing_at = now() - interval '10 seconds' where user_id = '${M}'`);
await as(T);
check('…and stops after a few seconds', (await sync()).typing.length === 0);

// ---- reactions ----
await as(T);
let r = (await one(`select gym_chat_react('${msg('10')}', '🔥') j`)).j;
check('a reaction goes on', r.reactions.length === 1 && r.reactions[0].emoji === '🔥' && r.reactions[0].count === 1 && r.reactions[0].mine === true);
await as(ST);
await db.exec(`select gym_chat_react('${msg('10')}', '🔥')`);
r = (await one(`select gym_chat_react('${msg('10')}', '👍') j`)).j;
check('one reaction a person: a second replaces the first', r.reactions.length === 2 && r.reactions.find((x) => x.emoji === '🔥').count === 1 && r.reactions.find((x) => x.emoji === '👍').mine === true, JSON.stringify(r.reactions));
r = (await one(`select gym_chat_react('${msg('10')}', '👍') j`)).j;
check('the same one again takes it off', r.reactions.length === 1);
check('a reaction outside the set is refused', /not one of the chat/.test((await tryExec(`select gym_chat_react('${msg('10')}', '💩')`)) ?? ''));
await as(M);
s = await sync(`'${t0}'`);
check('a reaction reaches the others on the next poll', s.messages.some((x) => x.id === msg('10') && x.reactions.length === 1));

// ---- pins ----
await as(M);
check('a member cannot pin', /owner and front desk/.test((await tryExec(`select gym_chat_pin('${msg('10')}', true)`)) ?? ''));
await as(T);
check('nor can a coach', (await tryExec(`select gym_chat_pin('${msg('10')}', true)`)) !== null);
await as(ST);
await db.exec(`select gym_chat_pin('${msg('10')}', true)`);
check('the desk pins, and everyone sees it', (await sync()).pinned.length === 1 && (await sync()).pinned[0].id === msg('10'));
await as(AD);
for (const n of ['20', '21', '22']) await db.exec(send(n, `Notice ${n}`));
await db.exec(`select gym_chat_pin('${msg('20')}', true); select gym_chat_pin('${msg('21')}', true);`);
check('a fourth pin is refused', /Three messages are pinned/.test((await tryExec(`select gym_chat_pin('${msg('22')}', true)`)) ?? ''));
await db.exec(`select gym_chat_pin('${msg('20')}', false)`);
check('unpinning makes room', (await sync()).pinned.length === 2);

// ---- removing ----
await as(M2);
check("a member cannot remove another's message", /remove your own/.test((await tryExec(`select gym_chat_remove('${msg('10')}')`)) ?? ''));
const path = (await one(`select gym_chat_remove('${msg('16')}') p`)).p;
check('you remove your own, and get its photo back to delete', path === `gyms/${GYM}/chat/${M2}/p.jpg`);
s = await sync(`'${t0}'`);
const gone = s.messages.find((x) => x.id === msg('16'));
check('"Message removed" stays in place, the content does not', gone.removed === true && gone.body === null && gone.photo_path === null && gone.removed_by_gym === false);
await as(ST);
check('the desk needs a reason to remove someone else\'s', /why it is removed/.test((await tryExec(`select gym_chat_remove('${msg('14')}')`)) ?? ''));
await db.exec(`select gym_chat_remove('${msg('14')}', 'Off topic')`);
await owner();
check('the words are gone from the table too', (await one(`select body, removed_reason from gym_chat_messages where id = '${msg('14')}'`)).body === null);
check('the author is told why', (await one(`select count(*)::int n from notifications where user_id = '${M2}' and title = 'A message of yours was removed from the gym chat' and message = 'The gym said: Off topic'`)).n === 1);
check('…and it is in the activity log', (await one(`select count(*)::int n from activity_log where action = 'chat.removed'`)).n === 1);
await as(M);
s = await sync(`'${t0}'`);
check('a reply to a removed message says it was removed', s.messages.find((x) => x.id === msg('14')).removed_by_gym === true);

// ---- reports ----
await as(M);
check('you cannot report your own message', /your own message/.test((await tryExec(`select gym_chat_report('${msg('10')}', 'spam spam')`)) ?? ''));
check('a report needs words', /what is wrong/.test((await tryExec(`select gym_chat_report('${msg('21')}', 'x')`)) ?? ''));
await db.exec(`select gym_chat_report('${msg('21')}', 'This is rude')`);
check('once per person per message', /already reported/.test((await tryExec(`select gym_chat_report('${msg('21')}', 'Still rude')`)) ?? ''));
check('a member does not see the reports', (await all(`select * from gym_chat_open_reports()`)).length === 0);
await as(T);
await db.exec(`select gym_chat_report('${msg('21')}', 'Agree, rude')`);
check('nor does a coach', (await all(`select * from gym_chat_open_reports()`)).length === 0);
await as(ST);
let reps = await all(`select * from gym_chat_open_reports()`);
check('the desk sees both, with who and what', reps.length === 2 && reps[0].reporter === 'mia T' && reps[0].sender === 'own T' && reps[0].body === 'Notice 21' && reps[0].reports === 2, JSON.stringify(reps[0]));
await as(M);
check('a member cannot close a report', (await tryExec(`select gym_chat_dismiss_report('${reps[0].report_id}')`)) !== null);
await as(ST);
await db.exec(`select gym_chat_dismiss_report('${reps[0].report_id}')`);
check('the desk closes one', (await all(`select * from gym_chat_open_reports()`)).length === 1);
await as(AD);
await db.exec(`select gym_chat_remove('${msg('21')}')`);
check('removing the message closes its reports', (await all(`select * from gym_chat_open_reports()`)).length === 0);

// ---- stopping a person ----
await as(T);
check('a coach cannot stop anyone', (await tryExec(`select gym_chat_silence('${M2}', true, 'spam')`)) !== null);
await as(ST);
check('stopping someone needs a reason', /why/.test((await tryExec(`select gym_chat_silence('${M2}', true, '')`)) ?? ''));
check('the owner cannot be stopped', /cannot be stopped/.test((await tryExec(`select gym_chat_silence('${AD}', true, 'no')`)) ?? ''));
await db.exec(`select gym_chat_silence('${M2}', true, 'Repeated spam')`);
await as(M2);
s = await sync();
check('a stopped person still reads, and is told why they cannot post', s.open === true && s.can_post === false && /stopped you from posting/.test(s.why_not));
check('…and cannot send', /stopped you from posting/.test((await tryExec(send('30', 'but'))) ?? ''));
check('…or upload a photo', (await tryExec(`insert into storage.objects (bucket_id, name) values ('chat', 'gyms/${GYM}/chat/${M2}/x.jpg')`)) !== null);
await owner();
check('they are told, with the reason', (await one(`select count(*)::int n from notifications where user_id = '${M2}' and title = 'You can no longer post in the gym chat' and message like 'The gym said: Repeated spam%'`)).n === 1);
await as(M);
check('members do not see who is stopped', (await all(`select * from gym_chat_members()`)).every((p) => p.silenced === false && p.silenced_reason === null));
await as(ST);
check('the desk does', (await all(`select * from gym_chat_members()`)).find((p) => p.user_id === M2)?.silenced_reason === 'Repeated spam');
await db.exec(`select gym_chat_silence('${M2}', false)`);
await as(M2);
check('let back in, they post again', !!(await one(send('31', 'Sorry all'))).j.id);

// ---- announcements-only ----
await as(ST);
check('only the owner sets announcements-only', (await tryExec(`select set_gym_chat_announce_only(true)`)) !== null);
await as(AD);
await db.exec(`select set_gym_chat_announce_only(true)`);
await as(M);
s = await sync();
check('a member reads and is told only the gym posts', s.can_post === false && s.announce_only === true && /Only the gym posts/.test(s.why_not));
check('…cannot send', (await tryExec(send('40', 'hi'))) !== null);
check('…but still reacts', (await tryExec(`select gym_chat_react('${msg('22')}', '💪')`)) === null);
await as(T);
check('a coach still posts', !!(await one(send('41', 'Class at 6'))).j.id);
await as(AD);
await db.exec(`select set_gym_chat_announce_only(false)`);
await as(M);
check('switched back, members post', !!(await one(send('42', 'Thanks coach'))).j.id);

// ---- who a push goes to ----
await as(M2);
await db.exec(`select gym_chat_set_muted(true)`);
await as(M);
await db.exec(send('50', 'Who is training tonight? @coach', `, null, null, array['${T}']::uuid[]`));
await as(M2);
check('an authenticated caller cannot ask who gets the push', (await tryExec(`select * from claim_gym_chat_push('${msg('50')}')`)) !== null);
await owner();
let push = await all(`select * from claim_gym_chat_push('${msg('50')}')`);
const urls = push.map((p) => p.url).sort();
check('the push goes to the owner and the desk — not the sender, the muted, the mentioned, the expired or another gym',
  push.length === 2 && JSON.stringify(urls) === JSON.stringify(['/gym-chat', '/gym-chat']), JSON.stringify(push.map((p) => p.endpoint)));
check('…titled with who and which gym', /^mia T · .+ chat$/.test(push[0]?.title ?? '') && push[0].body === 'Who is training tonight? @coach', push[0]?.title);
check('a message is pushed once', (await all(`select * from claim_gym_chat_push('${msg('50')}')`)).length === 0);
check('the mentioned coach got it through the Inbox instead', (await one(`select count(*)::int n from notifications where user_id = '${T}' and action_url = '/trainer/gym-chat' and title like '%mentioned you%'`)).n === 1);
await db.exec(`update gym_chat_messages set created_at = now() - interval '5 minutes', pushed_at = null where id = '${msg('42')}'`);
check('an old message is never pushed late', (await all(`select * from claim_gym_chat_push('${msg('42')}')`)).length === 0);

// ---- flooding ----
await as(T);
let flood = null;
for (let i = 0; i < 25 && !flood; i++) flood = await tryExec(`select gym_chat_send(gen_random_uuid(), 'spam ${i}')`);
check('twenty messages a minute, then wait', /very fast/.test(flood ?? ''), String(flood));

// ---- history ----
await as(M);
const hist = (await one(`select gym_chat_history(now() + interval '1 minute', 5) j`)).j;
check('history pages backwards, oldest first within the page', hist.length === 5 && hist[0].created_at <= hist[4].created_at);

// ---- photos ----
const put = (name) => tryExec(`insert into storage.objects (bucket_id, name) values ('chat', '${name}')`);
await as(M);
check('a member puts a photo in their own chat folder', (await put(`gyms/${GYM}/chat/${M}/a.jpg`)) === null);
check("…not in someone else's, another gym's, or another folder",
  (await put(`gyms/${GYM}/chat/${M2}/a.jpg`)) !== null && (await put(`gyms/${GYM2}/chat/${M}/a.jpg`)) !== null && (await put(`gyms/${GYM}/reels/${M}/a.jpg`)) !== null);
await as(EXPIRED);
check('someone out of the chat cannot upload or see the photos', (await put(`gyms/${GYM}/chat/${EXPIRED}/a.jpg`)) !== null
  && (await one(`select count(*)::int n from storage.objects where bucket_id = 'chat'`)).n === 0);
await as(M2);
check('people in the chat see them', (await one(`select count(*)::int n from storage.objects where bucket_id = 'chat'`)).n === 1);
await db.exec(`delete from storage.objects where bucket_id = 'chat'`);
check("…but cannot delete another's", (await one(`select count(*)::int n from storage.objects where bucket_id = 'chat'`)).n === 1);
await as(ST);
await db.exec(`delete from storage.objects where bucket_id = 'chat'`);
await owner();
check('the desk can (a removed message\'s photo)', (await one(`select count(*)::int n from storage.objects where bucket_id = 'chat'`)).n === 0);
check('the bucket is private, 3 MB, images only', await (async () => { const b = await one(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'chat'`);
  return b.public === false && Number(b.file_size_limit) === 3145728 && !b.allowed_mime_types.some((t) => !t.startsWith('image/')); })());

// ---- 0247: no chat photo while the gym is at its plan's storage ----
await owner();
await db.exec(`update gyms set plan = 'starter' where id = '${GYM}'; update platform_plans set storage_mb = 100 where key = 'starter';
  insert into storage.objects (bucket_id, name, metadata) values ('reels', 'gyms/${GYM}/reels/big.mp4', '{"size": 104857600}');`);
await as(M);
check('at the storage limit a chat photo is refused, words still send', (await put(`gyms/${GYM}/chat/${M}/full.jpg`)) !== null && !!(await one(send('70', 'Still talking'))).j.id);
await owner();
await db.exec(`delete from storage.objects where name = 'gyms/${GYM}/reels/big.mp4'; update platform_plans set storage_mb = null where key = 'starter';`);
await as(M);
check('with room again, the photo goes up', (await put(`gyms/${GYM}/chat/${M}/room.jpg`)) === null);
await owner();
await db.exec(`delete from storage.objects where bucket_id = 'chat'`);

// ---- another gym ----
await as(OTHER);
s = await sync();
check('another gym\'s owner has no chat here (theirs is off)', s.open === false);
await owner();
await db.exec(`insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM2}', 'gym_chat', true) on conflict (gym_id, feature_key) do update set enabled = true`);
await as(OTHER);
s = await sync();
check('with their own chat on, they see none of this gym\'s messages', s.open === true && s.messages.length === 0 && s.pinned.length === 0);
check("…and cannot react to, remove, pin or report this gym's",
  (await tryExec(`select gym_chat_react('${msg('10')}', '👍')`)) !== null && (await tryExec(`select gym_chat_remove('${msg('10')}', 'x')`)) !== null
  && (await tryExec(`select gym_chat_pin('${msg('10')}', true)`)) !== null && (await tryExec(`select gym_chat_report('${msg('10')}', 'bad words')`)) !== null);
check('…nor reply across gyms', (await tryExec(`select gym_chat_send(gen_random_uuid(), 'hi', null, '${msg('10')}')`)) !== null);
check("…nor stop this gym's member", (await tryExec(`select gym_chat_silence('${M}', true, 'x y z')`)) !== null);

// ---- a deleted account takes its chat with it ----
await owner();
await db.exec(`insert into storage.objects (bucket_id, name) values ('chat', 'gyms/${GYM}/chat/${M2}/keep.jpg');
  update gym_chat_messages set photo_path = 'gyms/${GYM}/chat/${M2}/keep.jpg' where id = '${msg('31')}';
  select set_gym_module('reels', true) where false;
  insert into gym_reels (gym_id, title, source, url, created_by) values ('${GYM}', 'Max reel', 'youtube', 'https://youtu.be/abcDEF12345', '${M2}');
  insert into reel_likes (gym_id, reel_id, user_id) select '${GYM}', id, '${M}' from gym_reels where title = 'Max reel';`);
const before = (await one(`select count(*)::int n from gym_chat_messages where sender_id = '${M2}'`)).n;
await db.exec(`select erase_account('${M2}')`);
check('an erased account had messages to lose', before > 0, String(before));
check('…and its messages, reactions, reports and chat row are gone',
  (await one(`select count(*)::int n from gym_chat_messages where sender_id = '${M2}'`)).n === 0
  && (await one(`select count(*)::int n from gym_chat_reactions where user_id = '${M2}'`)).n === 0
  && (await one(`select count(*)::int n from gym_chat_people where user_id = '${M2}'`)).n === 0);
check('…its chat photo is queued for removal', (await one(`select count(*)::int n from erasure_files where person = '${M2}' and bucket = 'chat' and path like '%keep.jpg'`)).n === 1);
check('…and the reel it posted, with its likes', (await one(`select count(*)::int n from gym_reels where created_by = '${M2}'`)).n === 0
  && (await one(`select count(*)::int n from reel_likes l where not exists (select 1 from gym_reels r where r.id = l.reel_id)`)).n === 0);
check("other people's messages stay", (await one(`select count(*)::int n from gym_chat_messages where sender_id = '${M}'`)).n > 0);
await as(M);
check('a reply to an erased message still loads', (await sync()).open === true);

// ---- switched off again ----
await as(AD);
await db.exec(`select set_gym_module('gym_chat', false)`);
await as(M);
check('switched off, the chat closes for everyone', (await sync()).open === false && (await tryExec(send('60', 'anyone?'))) !== null && (await one(`select gym_chat_unread() n`)).n === 0);

// ---- furniture ----
await owner();
check('the four tables are gym tables (tenancy)', (await one(`select tenancy_gym_tables() @> array['gym_chat_messages','gym_chat_reactions','gym_chat_people','gym_chat_reports','gym_reels'] ok`)).ok);
check('every plan has the gym chat', (await one(`select bool_and(enabled) ok from platform_plan_features where feature_key = 'gym_chat'`)).ok === true);
await db.exec(`set role anon`);
check('a visitor can call nothing', (await tryExec(`select gym_chat_sync()`)) !== null && (await tryExec(send('61', 'anon'))) !== null && (await tryExec(`select gym_chat_unread()`)) !== null);
await owner();
check('0246 is marked applied', (await one(`select migration_0246_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
