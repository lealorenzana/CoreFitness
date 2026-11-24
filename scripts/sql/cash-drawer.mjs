/**
 * 0271: the cash drawer. A day starts with what was left at the last close; cash
 * handed to the owner or paid out lowers it; a past day nobody closed is closed
 * automatically at the expected amount and says nobody counted; the desk may put
 * a real count over an automatic close, never over a counted one; an admin undoes
 * a cash out with a reason; closes from before 0271 carry nothing.
 *
 *   node <repo>/scripts/sql/cash-drawer.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2710000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const day = (n) => `(manila_today() + ${n})`;
const sum = async (n) => {
  const r = await one(`select * from cash_day_summary(${day(n)})`);
  for (const k of ['opening', 'cash_in', 'refunds_out', 'handed_over', 'paid_out', 'expected', 'counted']) r[k] = r[k] == null ? null : Number(r[k]);
  return r;
};
const close = (n) => one(`select * from cash_closeouts where gym_id = '${GYM}' and day = ${day(n)}`);

await owner();
await db.exec(`
  ${[['own', AD, 'admin'], ['desk', ST, 'staff'], ['mem', M, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@drawer-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@drawer-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  -- A clean drawer for this gym, then history seeded past the date-window triggers (setup only).
  delete from cash_closeouts where gym_id = '${GYM}';
  set session_replication_role = replica;
  insert into payments (gym_id, member_id, amount, method, status, invoice_number, paid_on) values
    ('${GYM}', '${M}', 1000, 'Cash',  'completed', 'DRW-1', ${day(-2)}),
    ('${GYM}', '${M}',  500, 'cash',  'completed', 'DRW-2', ${day(-1)}),
    ('${GYM}', '${M}',  700, 'GCash', 'completed', 'DRW-3', ${day(-1)});
  set session_replication_role = origin;`);

// Whatever else the fixtures put on these days: the drawer's own arithmetic must hold.
await as(AD);
const raw2 = await sum(-2), raw1 = await sum(-1);
check('GCash is not in the drawer (only the ₱500 cash on day −1)', raw1.cash_in >= 500 && raw1.cash_in < 1200, JSON.stringify(raw1));

// ---- the automatic close ----
await as(M);
check('a member cannot run the sweep (it closes nothing)', Number((await one(`select auto_close_cash_days() n`)).n) === 0);
check('a member cannot read the drawer', !!(await tryExec(`select * from cash_day_summary(manila_today())`)));
await as(ST);
const closed = Number((await one(`select auto_close_cash_days() n`)).n);
check('the desk opening Money closes the past days that moved cash', closed >= 2, `closed ${closed}`);
check('a second sweep closes nothing', Number((await one(`select auto_close_cash_days() n`)).n) === 0);
let c2 = await close(-2), c1 = await close(-1);
check('an automatic close is marked auto, by nobody, at the expected amount',
  c2.auto && c2.closed_by === null && Number(c2.counted) === Number(c2.expected) && Number(c2.expected) === raw2.expected, JSON.stringify(c2));
check('the next day opens with what the day before closed with (carry over)',
  Number(c1.opening) === Number(c2.carried) && Number(c1.expected) === Number(c2.carried) + raw1.cash_in - raw1.refunds_out, JSON.stringify(c1));
let s1 = await sum(-1);
check('the summary says the day closed automatically', s1.closed && s1.auto === true);

// ---- the desk puts a real count over an automatic close ----
const realCount = Number(c1.expected) - 20;
check('a different count still needs a note', !!(await tryExec(`select close_cash_day(${day(-1)}, ${realCount}, null)`)));
check('the desk may replace an automatic close with a real count', !(await tryExec(`select close_cash_day(${day(-1)}, ${realCount}, 'two coins missing')`)));
c1 = await close(-1);
check('…kept the automatic one in previous', !c1.auto && c1.previous?.auto === true && Number(c1.carried) === realCount, JSON.stringify(c1));
check('…and a counted close cannot be redone by the desk', /Only an admin/.test((await tryExec(`select close_cash_day(${day(-1)}, ${realCount}, 'again')`)) ?? ''));

// ---- today: carry, cash out ----
let t = await sum(0);
check("today opens with yesterday's real count", t.opening === realCount, JSON.stringify(t));
check('a hand over needs who took it', /who took/.test((await tryExec(`select record_cash_out('handed_over', 300, null, null)`)) ?? ''));
check('a member cannot be the one who took it', /who took/.test((await tryExec(`select record_cash_out('handed_over', 300, '${M}', null)`)) ?? ''));
check('a paid out needs what for', /spent on/.test((await tryExec(`select record_cash_out('paid_out', 50, null, ' ')`)) ?? ''));
check('a zero amount is refused', !!(await tryExec(`select record_cash_out('paid_out', 0, null, 'water')`)));
const before = t.expected;
await db.exec(`select record_cash_out('handed_over', 300, '${AD}', 'Evening collection')`);
await db.exec(`select record_cash_out('paid_out', 50, null, 'Drinking water')`);
t = await sum(0);
check('the drawer drops by what was handed over and paid out', t.expected === before - 350 && t.handed_over === 300 && t.paid_out === 50, JSON.stringify(t));
const logged = Number((await (await owner(), one(`select count(*) n from activity_log where gym_id = '${GYM}' and action in ('cash.handed_over', 'cash.paid_out')`))).n);
check('both are in the activity log', logged === 2, `logged ${logged}`);
await as(M);
check('a member cannot take cash out', !!(await tryExec(`select record_cash_out('paid_out', 50, null, 'x')`)));
check('a member sees no cash outs', (await db.query(`select id from cash_outs`)).rows.length === 0);
check('nobody writes cash_outs directly', !!(await tryExec(`insert into cash_outs (gym_id, day, kind, amount) values ('${GYM}', manila_today(), 'paid_out', 1)`)));

// ---- close today early, then cash moves after the close ----
await as(ST);
await db.exec(`select close_cash_day(manila_today(), ${t.expected}, null)`);
await db.exec(`select record_cash_out('handed_over', 100, '${AD}', 'Late pickup')`);
let tomorrow = await sum(1);
check('cash taken out after an early close is carried into tomorrow', tomorrow.opening === t.expected - 100, JSON.stringify(tomorrow));

// ---- undoing a cash out ----
const late = (await (await owner(), one(`select id from cash_outs where note = 'Late pickup'`))).id;
await as(ST);
check('the desk cannot undo a cash out', !!(await tryExec(`select void_cash_out('${late}', 'typo')`)));
await as(AD);
check('undoing needs a reason', !!(await tryExec(`select void_cash_out('${late}', '')`)));
await db.exec(`select void_cash_out('${late}', 'Recorded twice')`);
tomorrow = await sum(1);
check('an undone cash out stops counting', tomorrow.opening === t.expected, JSON.stringify(tomorrow));
check('it cannot be undone twice', !!(await tryExec(`select void_cash_out('${late}', 'again')`)));

// ---- closes from before 0271 carry nothing ----
await owner();
await db.exec(`insert into cash_closeouts (gym_id, day, expected, counted) values ('${GYM}', ${day(-30)}, 900, 900)`);
const legacy = Number((await one(`select cash_opening('${GYM}', ${day(-29)}) v`)).v);
check('a close from before 0271 (drawer emptied nightly) carries ₱0', legacy === 0, `opening ${legacy}`);
await as(AD);
check('the helpers are not callable from the app', !!(await tryExec(`select cash_opening('${GYM}', manila_today())`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0271 checks passed');
process.exit(failures ? 1 : 0);
