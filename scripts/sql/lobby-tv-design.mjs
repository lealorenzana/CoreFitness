/**
 * 0209: the lobby TV is a plan feature and the gym designs its screen. Only the
 * owner saves a design, only on a plan that includes the TV; every value is
 * checked by a trigger (so a direct update cannot slip past the editor); a
 * background must be a photo in this gym's own media folder; the desk can read
 * the design (it runs the TV), a member cannot.
 *
 *   node <repo>/scripts/sql/lobby-tv-design.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2090000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const save = (design) => tryOne(`select save_tv_design('${JSON.stringify(design).replace(/'/g, "''")}'::jsonb)`);
const BG = `https://x.supabase.co/storage/v1/object/public/media/gyms/${GYM}/logos/tv.jpg`;

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@tv-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@tv-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-TV1') on conflict do nothing;
  update gyms set plan = 'starter' where id = '${GYM}';`);

check('the TV is a platform feature', !!(await one(`select 1 x from platform_features where key = 'lobby_tv'`)));
check('it starts on Pro, Premium and the trial, not Starter or Growth',
  (await one(`select string_agg(plan_key, ',' order by plan_key) s from platform_plan_features where feature_key = 'lobby_tv' and enabled`)).s
    .split(',').filter((k) => ['pro', 'premium', 'trial', 'starter', 'growth'].includes(k)).join(',') === 'premium,pro,trial');

// On Starter: the owner reads "not sold", and cannot save.
await as(AD);
let d = (await one(`select my_tv_design() d`)).d;
check('on Starter the owner is told it is not on the plan', d.allowed === false && d.sold === false, JSON.stringify(d));
check('…and cannot save a design', /not on your Core Fitness plan/.test((await save({ theme: 'light' })).err ?? ''));

await owner();
await db.exec(`update gyms set plan = 'pro' where id = '${GYM}';`);
await as(AD);
d = (await one(`select my_tv_design() d`)).d;
check('on Pro the TV is allowed', d.allowed === true && d.sold === true, JSON.stringify(d));
let r = await save({ theme: 'brand', seconds: 15, panels: ['classes', 'goal'], headline: 'Open till 10pm', show_clock: true, show_count: false, show_qr: true, background_url: BG });
check('the owner saves a full design', r.err === null, r.err ?? '');
d = (await one(`select my_tv_design() d`)).d;
check('…and reads it back', d.design.theme === 'brand' && d.design.seconds === 15 && d.design.panels.join() === 'classes,goal' && d.design.show_count === false);

check('a theme that does not exist is refused', /dark, brand or light/.test((await save({ theme: 'neon' })).err ?? ''));
check('2 seconds a panel is refused', /6 to 60 seconds/.test((await save({ seconds: 2 })).err ?? ''));
check('an unknown panel is refused', /no panel called ads/.test((await save({ panels: ['ads'] })).err ?? ''));
check('an unknown setting is refused', /no setting called font/.test((await save({ font: 'Comic Sans' })).err ?? ''));
check('a long headline is refused', /140 characters/.test((await save({ headline: 'x'.repeat(141) })).err ?? ''));
check('a background from elsewhere is refused', /uploaded to this gym/.test((await save({ background_url: 'https://evil.example.com/a.jpg' })).err ?? ''));
check('another gym\'s photo is refused', /uploaded to this gym/.test((await save({ background_url: BG.replace(GYM, 'ffffffff-0000-4000-8000-000000000000') })).err ?? ''));

// The trigger is the rule: a direct update that skips save_tv_design still meets it.
await owner();
r = await tryOne(`update gym_settings set tv_design = '{"theme":"neon"}'::jsonb where gym_id = '${GYM}'`);
check('a direct update meets the same rule', /dark, brand or light/.test(r.err ?? ''), r.err ?? 'went through');

// Who may do what.
await as(ST);
d = (await one(`select my_tv_design() d`)).d;
check('the desk reads the design (it runs the TV)', d && d.design.theme === 'brand');
check('…but cannot save one', /Only the gym owner/.test((await save({ theme: 'dark' })).err ?? ''));
await as(M);
check('a member reads nothing', (await one(`select my_tv_design() d`)).d === null);
check('…and cannot save', /Only the gym owner/.test((await save({ theme: 'dark' })).err ?? ''));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'save_tv_design(jsonb)', 'execute') x`)).x
  && !(await one(`select has_function_privilege('anon', 'my_tv_design()', 'execute') x`)).x);
check('marker', (await one(`select migration_0209_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0209 checks passed');
process.exit(failures ? 1 : 0);
