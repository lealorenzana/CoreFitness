/**
 * 0181: getting a coach — the ways in (pick, group, desk assigns, coach
 * invites), the term, stand-ins, and the three ways a coach is paid
 * (included in the plan, priced by the gym, paid to the coach directly).
 *
 *   node <repo>/scripts/sql/coaching.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1810000-0000-4000-8000-0000000000${n}`;
const A = id('0a'), B = id('0b'), C = id('0c'), NOPT = id('0d');
const T = id('1a'), T2 = id('1b'), AD = id('2a'), ST = id('2b');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const tryOne = async (sql) => { try { return { row: await one(sql), err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const status = async (cid) => { await owner(); return (await one(`select status from coachings where id = '${cid}'`)).status; };
const PT_PLAN = id('f1'), NO_PLAN = id('f2');

await owner();
await db.exec(`
  ${[['a', A, 'member'], ['b', B, 'member'], ['c', C, 'member'], ['nopt', NOPT, 'member'],
     ['rae', T, 'trainer'], ['ben', T2, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@coach-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@coach-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength'), ('${T2}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${A}', '${GYM}', 'QR-CA'), ('${B}', '${GYM}', 'QR-CB'), ('${C}', '${GYM}', 'QR-CC'), ('${NOPT}', '${GYM}', 'QR-CD') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active) values
    ('${PT_PLAN}', '${GYM}', 'With coach', 900, 30, 'premium', true, true, true),
    ('${NO_PLAN}', '${GYM}', 'Floor only', 300, 30, 'free', true, false, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ('${A}', '${GYM}', '${PT_PLAN}', 'active', manila_today() - 1, manila_today() + 30),
    ('${B}', '${GYM}', '${PT_PLAN}', 'active', manila_today() - 1, manila_today() + 30),
    ('${C}', '${GYM}', '${PT_PLAN}', 'active', manila_today() - 1, manila_today() + 30),
    ('${NOPT}', '${GYM}', '${NO_PLAN}', 'active', manila_today() - 1, manila_today() + 30);`);

const settings = async (modes, lengths, fee) => { await as(AD); await db.exec(`select set_coaching_settings(array[${modes.map((m) => `'${m}'`).join(',')}]::text[], array[${lengths.join(',')}], '${fee}')`); };
const request = async (who, trainer, kind = 'pt', months = 1, code = null) => {
  await as(who);
  return tryOne(`select request_coaching('${trainer}', '${kind}', ${months}, ${code ? `'${code}'` : 'null'}) id`);
};

// ---- defaults: today's behaviour plus the free ways in ----
await as(A);
let s = await one(`select * from coaching_settings()`);
check('a gym that chose nothing: pick a coach, desk assigns, coach invites; included in the plan; 1/3/6 months',
  s.modes.includes('pick_pt') && s.modes.includes('desk_assigns') && !s.modes.includes('pick_group') && s.fee_mode === 'included' && s.lengths.join() === '1,3,6',
  JSON.stringify(s));

// ---- included ----
let r = await request(NOPT, T);
check("included: a plan without 1-on-1 cannot ask, and is told why", r.err !== null && /plan does not include a coach/.test(r.err), r.err ?? '');
r = await request(A, T, 'pt', 2);
check('only the gym\'s lengths are offered', r.err !== null && /1, 3, 6/.test(r.err), r.err ?? '');
r = await request(A, T, 'pt', 3);
const cA = r.row?.id;
check('a member with a coaching plan asks a coach', !!cA, r.err ?? '');
check('…and the coach is told', !!(await (async () => { await owner(); return one(`select 1 x from notifications where user_id = '${T}' and title = 'Coaching request'`); })()));
r = await request(A, T2);
check('one coach at a time: a second ask is refused, in words', r.err !== null && /already have a coach/.test(r.err), r.err ?? '');
await as(T2);
check("another coach cannot answer it", (await tryExec(`select respond_coaching('${cA}', true)`)) !== null);
await as(T);
await db.exec(`select respond_coaching('${cA}', true)`);
await owner();
let row = await one(`select status, starts_on = manila_today() s, ends_on = (manila_today() + interval '3 months')::date e, room_id from coachings where id = '${cA}'`);
check('the coach accepts: it starts today and ends in the chosen 3 months', row.status === 'active' && row.s && row.e, JSON.stringify(row));
check('…with their 1-on-1 room', !!(await one(`select 1 x from rooms where id = '${row.room_id}' and kind = 'pt' and member_id = '${A}' and trainer_id = '${T}'`)));
await as(T);
check('…and the member counts as the coach\'s trainee', (await one(`select is_my_trainee('${A}') t`)).t === true);
await as(A);
check('the member reads it, with the coach\'s name', (await one(`select count(*)::int n from my_coachings() where id = '${cA}' and trainer_name is not null and i_am = 'member'`)).n === 1);
check('nobody writes a coaching row directly', (await tryExec(`insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by) values ('${GYM}', '${A}', '${T2}', 'group', 1, 'active', 'included', 'member')`)) !== null);

// ---- stand-in ----
await as(A);
check('a stand-in cannot start in the past', (await tryExec(`select set_coaching_standin('${cA}', '${T2}', manila_today() - 1, manila_today() + 5)`)) !== null);
await db.exec(`select set_coaching_standin('${cA}', '${T2}', manila_today(), manila_today() + 5)`);
await as(T2);
check("the stand-in coach can see the trainee while standing in", (await one(`select is_my_trainee('${A}') t`)).t === true);
check('…and reads the coaching', (await one(`select count(*)::int n from my_coachings() where id = '${cA}' and i_am = 'standin'`)).n === 1);
await as(T);
check('the main coach keeps them', (await one(`select is_my_trainee('${A}') t`)).t === true);

// ---- ending ----
await as(A);
await db.exec(`select end_coaching('${cA}', 'Moving away')`);
check('the member ends it early', (await status(cA)) === 'ended');
await as(T2);
check('…and the stand-in ends with it', (await one(`select is_my_trainee('${A}') t`)).t === false);

// ---- trainer_direct (G Fitness) ----
await settings(['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], [1, 3], 'trainer_direct');
r = await request(B, T, 'pt', 1);
const cB = r.row?.id;
check('paid to the coach: any plan may ask', !!cB, r.err ?? '');
await as(T);
check('the coach must say what they charge', (await tryExec(`select respond_coaching('${cB}', true)`)) !== null);
await db.exec(`select respond_coaching('${cB}', true, 1500)`);
check('…and then it waits for the member to pay', (await status(cB)) === 'awaiting_payment');
await as(B);
await db.exec(`select submit_coaching_payment('${cB}', 'GC-7781')`);
check('the member sends the reference', (await status(cB)) === 'payment_sent');
await as(ST);
check('the desk cannot say a coach was paid', (await tryExec(`select confirm_coaching_payment('${cB}')`)) !== null);
await as(T2);
check('nor can another coach', (await tryExec(`select confirm_coaching_payment('${cB}')`)) !== null);
await as(T);
await db.exec(`select confirm_coaching_payment('${cB}')`);
check('the coach taps Received: it starts', (await status(cB)) === 'active');
await owner();
check('…and no money goes through the gym\'s books', (await one(`select count(*)::int n from payments where member_id = '${B}'`)).n === 0);
await as(ST);
check('the desk sees the coach and until when', (await one(`select count(*)::int n from coachings where id = '${cB}' and ends_on is not null`)).n === 1);
r = await request(C, T, 'pt', 1);
await as(T);
await db.exec(`select respond_coaching('${r.row.id}', true, 1000)`);
await as(C);
check('a reference is claimed once', /already been used/.test((await tryExec(`select submit_coaching_payment('${r.row.id}', 'gc-7781')`)) ?? ''));
await db.exec(`select end_coaching('${r.row.id}')`);
check('an unpaid one can be cancelled', (await status(r.row.id)) === 'cancelled');

// ---- gym_priced ----
await settings(['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], [1, 3], 'gym_priced');
r = await request(C, T2, 'pt', 3);
check('priced by the gym: a length with no price is refused, in words', r.err !== null && /not priced/.test(r.err), r.err ?? '');
await as(AD);
await db.exec(`select set_coaching_price('pt', 3, 2400)`);
r = await request(C, T2, 'pt', 3);
const cC = r.row?.id;
await as(T2);
await db.exec(`select respond_coaching('${cC}', true)`);
await owner();
check('…the gym\'s price is on it, waiting for payment', (await one(`select status, price::numeric p from coachings where id = '${cC}'`)).p == 2400);
await as(T2);
check('a coach cannot confirm a payment to the gym', (await tryExec(`select confirm_coaching_payment('${cC}')`)) !== null);
await as(ST);
await db.exec(`select confirm_coaching_payment('${cC}', true, 'cash')`);
await owner();
check('the desk confirms cash at the counter: it starts', (await status(cC)) === 'active');
check('…and it is an ordinary payment of ₱2,400', (await one(`select count(*)::int n from payments where member_id = '${C}' and amount = 2400 and status = 'completed' and paid_on = manila_today()`)).n === 1);

// ---- desk assigns / coach invites ----
await settings(['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], [1, 3], 'included');
await as(ST);
const cN = (await one(`select assign_coaching('${A}', '${T2}', 1) id`)).id;
check('the desk assigns a coach and it starts at once (included)', (await status(cN)) === 'active');
await as(A);
await db.exec(`select end_coaching('${cN}')`);
await settings(['classes', 'pick_pt', 'coach_invites'], [1, 3], 'included');
await as(ST);
check('…unless the owner turned that off', (await tryExec(`select assign_coaching('${A}', '${T2}', 1)`)) !== null);
await as(T);
const cI = (await one(`select invite_coaching('${A}', 1) id`)).id;
check('a coach invites a member', (await status(cI)) === 'invited');
await as(B);
check('only that member answers it', (await tryExec(`select respond_coaching('${cI}', true)`)) !== null);
await as(A);
await db.exec(`select respond_coaching('${cI}', true)`);
check('…who accepts: it starts', (await status(cI)) === 'active');

// ---- groups ----
await as(NOPT);
check('a group cannot be started while the gym has groups off', (await tryOne(`select request_coaching('${T}', 'group', 1, null) id`)).err !== null);
await settings(['classes', 'pick_pt', 'pick_group', 'coach_invites'], [1, 3], 'trainer_direct');
await as(NOPT);
const g1 = (await one(`select request_coaching('${T}', 'group', 1, null) id`)).id;
await as(T);
await db.exec(`select respond_coaching('${g1}', true, 0)`);
await owner();
const grp = await one(`select c.status, r.join_code, r.id room from coachings c join rooms r on r.id = c.room_id where c.id = '${g1}'`);
check('a member starts a coaching group; at ₱0 it starts at once, with a group room and a code', grp?.status === 'active' && /^[A-Z]{6}$/.test(grp.join_code ?? ''), JSON.stringify(grp));
await as(C);
check('a wrong code finds no group', (await tryOne(`select request_coaching('${T}', 'group', 1, 'ZZZZZZ') id`)).err !== null);
const g2 = (await one(`select request_coaching('${T2}', 'group', 1, '${grp.join_code.toLowerCase()}') id`)).id;
await owner();
check("a friend joins with the code — and the group's coach is the one asked, whoever they named", (await one(`select trainer_id from coachings where id = '${g2}'`)).trainer_id === T);
await as(T);
await db.exec(`select respond_coaching('${g2}', true, 0)`);
await owner();
check('…and is in the same room', (await one(`select count(*)::int n from room_members where room_id = '${grp.room}'`)).n === 2);

// ---- time passing ----
await owner();
await db.exec(`update coachings set starts_on = manila_today() - 40, ends_on = manila_today() - 1 where id = '${cI}'`);
await as(A);
await db.exec(`select coaching_sweep()`);
check('a term whose date has passed ends on the next sweep', (await status(cI)) === 'ended');

// ---- who decides the rules ----
await as(ST);
check('only the owner changes how coaching works', (await tryExec(`select set_coaching_settings(array['pick_pt'], array[1], 'included')`)) !== null);
await as(AD);
check('a made-up way in is refused', (await tryExec(`select set_coaching_settings(array['bribe'], array[1], 'included')`)) !== null);
check('a 30-month term is refused', (await tryExec(`select set_coaching_settings(array['pick_pt'], array[30], 'included')`)) !== null);

await owner();
check('marker', (await one(`select migration_0181_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0181 checks passed');
process.exit(failures ? 1 : 0);
