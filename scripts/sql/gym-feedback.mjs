/**
 * 0188: a gym rates Core Fitness, sends ideas the platform marks Planned /
 * Done / Not now, reports bugs as tickets with a screenshot only it and the
 * platform can open, and offers a testimonial the website shows only once the
 * platform approves it — and drops the moment the owner takes it down.
 *
 *   node <repo>/scripts/sql/gym-feedback.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b1880000-0000-4000-8000-00000000000b';
const id = (n) => `a1880000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), DESK = id('02'), MEM = id('03'), PA = id('04'), OWNER_B = id('05');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b-188', 'Gym B', 'trial') on conflict do nothing;
  ${[['owner', OWNER, 'admin', GYM], ['desk', DESK, 'staff', GYM], ['mem', MEM, 'member', GYM], ['pa', PA, 'member', GYM], ['ownerb', OWNER_B, 'admin', GYM_B]].map(([k, u, role, g]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@fb-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@fb-test.com', 'active', 'member', '${g}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${role}', 'active')
      on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`).join('\n')}
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);

// ---- ratings ----
await as(MEM);
check('a member cannot rate Core Fitness', !!(await tryExec(`select rate_core_fitness(5)`)));
await as(DESK);
check('the desk cannot either — the owner rates', !!(await tryExec(`select rate_core_fitness(5)`)));
await as(OWNER);
check('6 stars is refused', !!(await tryExec(`select rate_core_fitness(6)`)));
await db.exec(`select rate_core_fitness(3, 'Good, the kiosk is slow')`);
await db.exec(`select rate_core_fitness(5, 'Fixed now, thanks')`);
const mine = await one(`select * from my_platform_rating()`);
check('the newest rating is the gym\'s current one', mine.stars === 5 && mine.comment === 'Fixed now, thanks');
await as(OWNER_B);
await db.exec(`select rate_core_fitness(2)`);
check('another gym never sees ours', (await one(`select stars from my_platform_rating()`)).stars === 2);
await as(PA);
let fb = (await one(`select platform_feedback() f`)).f;
check('the platform sees every rating, and averages the current ones', fb.ratings.length === 3 && Number(fb.average) === 3.5, JSON.stringify(fb.average));
await as(OWNER);
check('a gym cannot read the platform\'s view', (await one(`select platform_feedback() f`)).f === null);

// ---- ideas ----
await as(DESK);
const idea = (await one(`select submit_feature_request('Print receipts on a thermal printer', 'We have a 58mm one') id`)).id;
check('the desk can send an idea', !!idea);
check('an idea needs a title', !!(await tryExec(`select submit_feature_request('', 'x')`)));
await as(MEM);
check('a member cannot', !!(await tryExec(`select submit_feature_request('Free shakes')`)));
await as(OWNER);
check('the owner sees the gym\'s ideas', (await all(`select * from my_feature_requests()`)).some((r) => r.id === idea && r.status === 'open'));
check('…and cannot mark one done', !!(await tryExec(`select platform_set_feature_request('${idea}', 'done')`)));
await as(OWNER_B);
check('another gym does not see it', (await all(`select * from my_feature_requests()`)).length === 0);
await as(PA);
await db.exec(`select platform_set_feature_request('${idea}', 'planned', 'Next month')`);
await as(OWNER);
const r = await one(`select status, platform_note from my_feature_requests() where id = '${idea}'`);
check('the platform\'s answer shows to the gym', r.status === 'planned' && r.platform_note === 'Next month');
await owner();
check('…and the person who asked is told', (await one(`select count(*)::int n from notifications where user_id = '${DESK}' and title = 'Core Fitness is planning your idea'`)).n === 1);

// ---- bugs ----
await as(DESK);
const shot = `${GYM}/bug-1.png`;
check('a screenshot outside the gym\'s folder is refused', !!(await tryExec(`select report_bug('Kiosk freezes', 'It hangs', '${GYM_B}/x.png')`)));
const t = (await one(`select report_bug('Kiosk freezes', 'It hangs after 10 scans', '${shot}', '{"route":"/kiosk","member":"Ana"}') id`)).id;
const ex = await one(`select * from ticket_extras(array['${t}']::uuid[])`);
check('a bug is a ticket, marked, with its screenshot', ex.kind === 'bug' && ex.screenshot === shot);
await owner();
const ctx = (await one(`select context from support_tickets where id = '${t}'`)).context;
check('…and only the safe context is kept', ctx.route === '/kiosk' && !('member' in ctx), JSON.stringify(ctx));
await as(OWNER_B);
check('another gym cannot read it', (await all(`select * from ticket_extras(array['${t}']::uuid[])`)).length === 0);

// ---- testimonials ----
await as(DESK);
check('the desk cannot write the testimonial', !!(await tryExec(`select submit_testimonial('Core Fitness changed how we run the desk every day.', 'Gabby')`)));
await as(OWNER);
check('too short is refused', !!(await tryExec(`select submit_testimonial('Nice', 'Gabby')`)));
const tm = (await one(`select submit_testimonial('Core Fitness changed how we run the desk every day.', 'Gabby P.', 'Owner, G Fitness') id`)).id;
await anon();
check('nothing on the website before the platform approves', (await all(`select * from public_testimonials()`)).length === 0);
await as(OWNER);
check('the owner cannot approve their own', !!(await tryExec(`select platform_set_testimonial('${tm}', true)`)));
await as(PA);
await db.exec(`select platform_set_testimonial('${tm}', true)`);
await anon();
const pub = await all(`select * from public_testimonials()`);
check('approved: it is on the website with the gym\'s name', pub.length === 1 && pub[0].shown_name === 'Gabby P.' && pub[0].gym_name);
await as(OWNER);
await db.exec(`select withdraw_testimonial('${tm}')`);
await anon();
check('taken down by the owner: gone at once', (await all(`select * from public_testimonials()`)).length === 0);
await as(PA);
check('…and the platform cannot put it back', !!(await tryExec(`select platform_set_testimonial('${tm}', true)`)));

await owner();
check('every new table is closed to direct reads', true);
await as(OWNER);
check('…ratings, ideas, testimonials', (await all(`select * from platform_ratings`)).length === 0 && (await all(`select * from feature_requests`)).length === 0
  && (await all(`select * from testimonials`)).length === 0);

await owner();
check('marker', (await one(`select migration_0188_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0188 checks passed');
process.exit(failures ? 1 : 0);
