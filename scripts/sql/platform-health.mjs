/**
 * 0136: the platform's gym-health radar and growth numbers — to the platform
 * admin only.
 *
 *   node <repo>/scripts/sql/platform-health.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const PA = 'a1000000-0000-4000-8000-000000000009';
const G = {
  dead: 'd0000000-0000-4000-8000-0000000000a1', late: 'd0000000-0000-4000-8000-0000000000a2',
  trial: 'd0000000-0000-4000-8000-0000000000a3', fine: 'd0000000-0000-4000-8000-0000000000a4',
  unset: 'd0000000-0000-4000-8000-0000000000a5',
};
const OWNER = (i) => `c1000000-0000-4000-8000-00000000000${i}`;
const MEM = (i) => `c2000000-0000-4000-8000-00000000000${i}`;

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}

const gyms = Object.entries(G);
await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@h-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'P', 'A', 'pa@h-test.com', 'active', 'member') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  update profiles set active_gym_id = 'c0f1e55e-0000-4000-8000-000000000001' where id = '${PA}';
  ${gyms.map(([k, id], i) => `
    insert into gyms (id, slug, name, plan, created_at, onboarded_at, paid_until) values
      ('${id}', 'h-${k}', 'Gym ${k}', '${k === 'trial' ? 'trial' : 'premium'}', now() - interval '60 days',
       ${k === 'unset' ? 'null' : "now() - interval '50 days'"},
       ${k === 'late' ? "current_date - 10" : k === 'trial' ? "current_date + 3" : 'null'});
    insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values ('${OWNER(i)}', 'o${i}@h-test.com', '{}', now() - interval '${k === 'dead' ? 40 : 1} days');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${OWNER(i)}', 'O', '${k}', 'o${i}@h-test.com', 'active', 'member') on conflict do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${id}', '${OWNER(i)}', 'admin', 'active');
    insert into auth.users (id, email, raw_user_meta_data) values ('${MEM(i)}', 'm${i}@h-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${MEM(i)}', 'M', '${k}', 'm${i}@h-test.com', 'active', 'member') on conflict do nothing;
    insert into gym_roles (gym_id, user_id, role, status, created_at) values ('${id}', '${MEM(i)}', 'member', 'active', now() - interval '55 days');
    insert into member_profiles (profile_id, gym_id, qr_code) values ('${MEM(i)}', '${id}', 'QR-H${i}');`).join('\n')}
  -- 'fine' and 'late' check in steadily; 'dead' used to, and stopped.
  insert into attendance (member_id, gym_id, check_in_time)
    select '${MEM(3)}', '${G.fine}', now() - (g || ' days')::interval from generate_series(1, 60, 3) g;
  insert into attendance (member_id, gym_id, check_in_time)
    select '${MEM(1)}', '${G.late}', now() - (g || ' days')::interval from generate_series(1, 60, 3) g;
  insert into attendance (member_id, gym_id, check_in_time)
    select '${MEM(0)}', '${G.dead}', now() - (g || ' days')::interval from generate_series(20, 60, 3) g;
  -- Prices are the platform owner's to set (NULL until then); give Premium one.
  update platform_plans set price_monthly = 1999 where key = 'premium';
  insert into gym_payments (gym_id, amount, paid_on, covers_from, covers_until) values ('${G.fine}', 1999, current_date - 5, current_date - 5, current_date + 25);`);

await as(PA);
const h = await all(`select * from platform_gym_health()`);
const of = (id) => h.find((r) => r.gym_id === id);
check('a gym that stopped checking in, whose owner is away: high', of(G.dead)?.level === 'high'
  && of(G.dead).reasons.includes('No check-ins in 14 days') && of(G.dead).reasons.some((r) => /Owner last signed in/.test(r)), JSON.stringify(of(G.dead)));
check('10 days past paid-until: listed with the reason', of(G.late)?.score >= 30 && of(G.late).reasons.includes('10 days past its paid-until date'), JSON.stringify(of(G.late)));
check('a trial ending in 3 days with nothing paid', of(G.trial)?.reasons.some((r) => /Free trial ends in 3 days/.test(r)), JSON.stringify(of(G.trial)));
check('let in 60 days ago and never set up', of(G.unset)?.reasons.some((r) => /not set up/.test(r)), JSON.stringify(of(G.unset)));
check('a steady, paid gym is healthy', of(G.fine)?.level === 'healthy' && of(G.fine).score === 0, JSON.stringify(of(G.fine)));
check('riskiest first', h[0].score >= h[h.length - 1].score);

const growth = await all(`select * from platform_growth(3)`);
check('three months, oldest first', growth.length === 3 && growth[0].month < growth[2].month);
check("this month's MRR counts the gym whose paid time covers it", Number(growth[2].mrr) >= 1999, JSON.stringify(growth[2]));
check("this month's revenue", Number(growth[2].revenue) >= 1999);
const f = await one(`select * from platform_funnel()`);
check('the funnel narrows: let in ≥ set up ≥ paying', f.let_in >= f.set_up && f.set_up >= f.paying && f.paying >= 1, JSON.stringify(f));
const ad = await all(`select * from platform_feature_adoption()`);
check('feature adoption: check-ins used by the gyms checking in', (ad.find((a) => a.feature === 'checkins')?.gyms_30d ?? 0) >= 2, JSON.stringify(ad.find((a) => a.feature === 'checkins')));

await as(OWNER(3));
check("a gym's owner sees none of it", (await all(`select * from platform_gym_health()`)).length === 0
  && (await all(`select * from platform_growth(3)`)).length === 0
  && (await all(`select * from platform_funnel()`)).length === 0
  && (await all(`select * from platform_feature_adoption()`)).length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0136 checks passed');
process.exit(failures ? 1 : 0);
