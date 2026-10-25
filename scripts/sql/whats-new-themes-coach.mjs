/**
 * 0212: What's new is shown once per person (in the database), never to an
 * account newer than the note, and written by the platform alone; saved colour
 * themes need the ₱499 custom-colours unlock and valid colours; a coach's setup
 * reads what is really set and is finished by the coach alone.
 *
 *   node <repo>/scripts/sql/whats-new-themes-coach.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2120000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), CO = id('0c'), AD = id('0d'), ST = id('0e'), NEWM = id('0b');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['coach', CO, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@wn-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id, created_at)
      values ('${u}', '${k}', 'T', '${k}@wn-test.com', 'active', '${role}', '${GYM}', now() - interval '30 days') on conflict (id) do update set active_gym_id = excluded.active_gym_id, created_at = excluded.created_at;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${CO}', '${GYM}', null) on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-WN1') on conflict do nothing;
  -- The seed notes are made at migration time; for this test they are a day old, as on any later day.
  update app_releases set published_at = now() - interval '1 day';`);

// ---- What's new -----------------------------------------------------------------------------------------
await as(M);
let r = (await one(`select my_whats_new('member') w`)).w;
check('a member is shown the newest member note', r && r.app === 'member' && r.items.length >= 1, JSON.stringify(r));
await db.exec(`select mark_release_seen('${r.id}')`);
check('…once: after seeing it, nothing more', (await one(`select my_whats_new('member') w`)).w === null);
check('the admin note is not the member\'s', (await one(`select my_whats_new('admin') w`)).w?.app === 'admin');
await as(ST);
check('the desk sees the admin note too', (await one(`select my_whats_new('admin') w`)).w?.app === 'admin');

// An account made after the note is not told what changed before it arrived.
await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${NEWM}', 'new@wn-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${NEWM}', 'new', 'T', 'new@wn-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${NEWM}';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${NEWM}', 'member', 'active');`);
await as(NEWM);
check('a newer account is not shown older notes', (await one(`select my_whats_new('member') w`)).w === null);

await as(AD);
check('a gym owner cannot write release notes', /Only Core Fitness/.test((await tryOne(`select platform_save_release(null, 'member', 'Hi', array['x'])`)).err ?? ''));
check('nobody writes a "seen" row directly', !!(await tryOne(`insert into app_release_reads (user_id, release_id) select '${AD}', id from app_releases limit 1`)).err);

// ---- Saved themes ---------------------------------------------------------------------------------------
await as(AD);
const theme = (t) => tryOne(`select save_gym_themes('${JSON.stringify(t)}'::jsonb)`);
check('without the colour unlock, saving a theme is refused', /unlock them on Your app/.test((await theme([{ name: 'Night', accent: '#123456', action: 'amber' }])).err ?? ''));
await owner();
await db.exec(`insert into gym_theme_unlocks (gym_id, theme_key, how) values ('${GYM}', 'custom_colours', 'platform') on conflict do nothing;`);
await as(AD);
r = await theme([{ name: 'Night', accent: '#123456', action: 'amber' }, { name: 'Classic', accent: 'violet', action: 'amber' }]);
check('with the unlock, the owner saves two themes', r.err === null, r.err ?? '');
check('…and reads them back', (await one(`select my_gym_themes() t`)).t.themes.length === 2);
check('a bad colour is refused', /presets or colour codes/.test((await theme([{ name: 'X', accent: 'red-ish', action: 'amber' }])).err ?? ''));
check('more than eight is refused', /eight/.test((await theme(Array.from({ length: 9 }, (_, i) => ({ name: 'T' + i, accent: 'violet', action: 'amber' })))).err ?? ''));
await as(ST);
check('the desk cannot save themes', /Only the gym owner/.test((await theme([])).err ?? ''));

// ---- A coach's first steps --------------------------------------------------------------------------------
await as(CO);
let s = (await one(`select my_coach_setup() s`)).s;
check('a new coach is not yet set up, and nothing is ticked', s && s.onboarded === false && s.photo === false && s.bio === false && Number(s.hours) === 0, JSON.stringify(s));
await owner();
await db.exec(`update trainer_profiles set bio = 'Strength coach', specialization = 'Strength' where profile_id = '${CO}';
  insert into trainer_availability (trainer_id, gym_id, day_of_week, start_time, end_time, slot_minutes) values ('${CO}', '${GYM}', 1, '08:00', '12:00', 60);`);
await as(CO);
s = (await one(`select my_coach_setup() s`)).s;
check('the steps tick from what is really set', s.bio === true && Number(s.hours) === 1, JSON.stringify(s));
r = await tryOne(`select finish_coach_setup()`);
check('the coach finishes it', r.err === null && (await one(`select my_coach_setup() s`)).s.onboarded === true, r.err ?? '');
await as(M);
check('a member has no coach setup', (await one(`select my_coach_setup() s`)).s === null);
check('…and cannot finish one', /Only a coach/.test((await tryOne(`select finish_coach_setup()`)).err ?? ''));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'my_whats_new(text)', 'execute') x`)).x
  && !(await one(`select has_function_privilege('anon', 'save_gym_themes(jsonb)', 'execute') x`)).x
  && !(await one(`select has_function_privilege('anon', 'finish_coach_setup()', 'execute') x`)).x);
check('marker', (await one(`select migration_0212_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0212 checks passed');
process.exit(failures ? 1 : 0);
