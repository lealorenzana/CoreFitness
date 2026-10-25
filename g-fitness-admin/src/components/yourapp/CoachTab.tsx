import { useCallback, useEffect, useState } from 'react';
import { Bolt, Bot, Coins, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { showToast } from '../../utils/toast';
import { shrinkImage } from '../../utils/shrinkImage';
import { formatUsd, getAiUsage, setAiLimits, type AiUsageResult } from '../../lib/api/aiCoach';
import { aiAllowance, buyTopUp, type AiAllowance } from '../../lib/api/aiTopups';
import { payOptions, type PayOption } from '../../lib/api/subscription';
import { payOnline, paymongoReady, waitForPayment } from '../../lib/api/paymongo';
import { getGymContext } from '../../lib/gymContext';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS = { pending: 'Waiting for Core Fitness', paid: 'Added', rejected: 'Not added' } as const;
const PACKS = [1, 2, 3, 4, 5, 10];
/** The three sizes the mock-up offers as cards; the select below takes any of PACKS. */
const CARDS = [1, 3, 10];

/**
 * Your app → AI coach (0147, 0163, 0189), in the approved mock-up's layout
 * (2026-10-25): the switch, this month's totals, the two limits, buying more,
 * and a member's chat on the phone beside it.
 *
 * **Totals only**, as AiCoachCard (which Setup still uses): how many members,
 * never who — the mock-up's "busiest member" tile is not drawn, because a
 * per-person figure is exactly what this card promises not to show. The cost
 * is an estimate and says where the real bill is. Only the owner changes the
 * limits or buys messages; the desk reads them.
 */
export default function CoachTab({ enabled, sold, onToggle }: { enabled: boolean; sold: boolean; onToggle: () => void }) {
  const [res, setRes] = useState<AiUsageResult | null>(null);
  const [owner, setOwner] = useState(false);
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [saving, setSaving] = useState(false);
  /** The owner's allowance from Core Fitness (0189): null for the desk, or before 0189. */
  const [allow, setAllow] = useState<AiAllowance | null>(null);

  const load = useCallback(async () => {
    const [r, ctx, a] = await Promise.all([getAiUsage(), getGymContext(), aiAllowance()]);
    setRes(r);
    setAllow(a);
    setOwner(ctx?.role === 'admin');
    if (r.ok) { setDaily(String(r.usage.daily_limit)); setMonthly(String(r.usage.monthly_limit)); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async () => {
    const d = Number(daily), m = Number(monthly);
    const maxD = (res?.ok ? res.usage.plan_daily_cap : null) ?? 500;
    const maxM = (res?.ok ? res.usage.plan_monthly_cap : null) ?? 100000;
    if (!Number.isInteger(d) || d < 1 || d > maxD) { showToast(`A daily limit is 1 to ${maxD} messages${maxD < 500 ? ' on your plan' : ''}.`, 'error'); return; }
    if (!Number.isInteger(m) || m < 1 || m > maxM) { showToast(`A monthly limit is 1 to ${maxM.toLocaleString('en-PH')} messages${maxM < 100000 ? ' on your plan' : ''}.`, 'error'); return; }
    setSaving(true);
    try { await setAiLimits(d, m); await load(); showToast('Saved. The new limits apply to the next message.', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };

  const u = res?.ok ? res.usage : null;
  const capD = u?.plan_daily_cap ?? null;
  const capM = u?.plan_monthly_cap ?? null;
  const pct = u && u.monthly_limit > 0 ? Math.min(100, Math.round((u.messages_month / u.monthly_limit) * 100)) : 0;
  const resets = (() => {
    if (!u?.month_start) return null;
    const [y, mo] = u.month_start.split('-').map(Number);
    return new Date(y, mo, 1).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  })();

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }}>
      <div className="a-card a-scroll" data-card="ai-coach">
        <div className="a-ct">
          <h3><Bot size={16} />AI coach</h3>
          {owner && sold && (
            <button type="button" className={`a-toggle ${enabled ? '' : 'off'}`} onClick={onToggle}
              aria-pressed={enabled} aria-label={enabled ? 'Switch off the AI coach' : 'Switch on the AI coach'} />
          )}
        </div>
        {res === null ? <p className="a-sub">Loading…</p>
          : !res.ok ? <p className="a-sub">{res.missing ? 'This needs migration 0147.' : `The coach's usage could not be loaded: ${res.error}`}</p>
          : u && (
          <>
            <p className="a-sub" style={{ marginBottom: 10 }}>
              How much your members can talk to the coach, and how much they have this month. You see totals for the whole gym — never who asked what.
              {!enabled && ' The coach is switched off, so your members do not see it right now.'}
            </p>
            {allow && <Credits a={allow} onRaise={() => { if (allow.plan_monthly) setMonthly(String(allow.plan_monthly)); }} />}
            <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <div className="a-card" style={{ padding: 12 }} data-tip={`of the gym's ${u.monthly_limit.toLocaleString('en-PH')} for the month`}>
                <div className="a-lbl">Messages this month</div><div className="a-num" style={{ fontSize: 22 }}>{u.messages_month.toLocaleString('en-PH')}</div>
                <div className="a-meter" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
                <div className="a-sub" style={{ marginTop: 4 }}>of {u.monthly_limit.toLocaleString('en-PH')}{resets ? ` · resets ${resets}` : ''}</div>
              </div>
              <div className="a-card" style={{ padding: 12 }} data-tip="how many members asked it anything this month — a count, never who">
                <div className="a-lbl">Members using it</div><div className="a-num" style={{ fontSize: 22 }}>{u.members_using_month.toLocaleString('en-PH')}</div><div className="a-sub">this month</div>
              </div>
              <div className="a-card" style={{ padding: 12 }} data-tip="messages since midnight, Manila time">
                <div className="a-lbl">Today</div><div className="a-num" style={{ fontSize: 22 }}>{u.messages_today.toLocaleString('en-PH')}</div><div className="a-sub">messages</div>
              </div>
              <div className="a-card" style={{ padding: 12 }} data-tip="this month, in US dollars — an estimate, not a bill">
                <div className="a-lbl">Estimated cost</div><div className="a-num" style={{ fontSize: 22 }}>{formatUsd(u.est_cost_usd_month)}</div><div className="a-sub">this month</div>
              </div>
            </div>
            <p className="a-sub" style={{ marginTop: 6 }}>Estimated at Claude Sonnet 5.5's list price. Your real bill is on console.anthropic.com.</p>
            <DayBars days={u.days} />

            <div className="a-setting" style={{ marginTop: 6 }}>
              <div className="t"><b>Messages per member per day</b><small>keeps one person from using the gym's month{owner ? ` · 1 to ${capD ?? 500}${capD ? ', the most your plan allows' : ''}` : ''}</small></div>
              {owner ? (
                <div className="flex items-center gap-1.5">
                  {[10, 20, 40].filter((n) => n <= (capD ?? 500)).map((n) => (
                    <button key={n} type="button" className={`a-chip ${daily === String(n) ? 'on' : ''}`} onClick={() => setDaily(String(n))}>{n}</button>
                  ))}
                  <input id="ai-daily" type="number" min={1} max={capD ?? 500} step={1} className="a-in" style={{ width: 76, textAlign: 'center' }}
                    aria-label="Messages per member per day" value={daily} onChange={(e) => setDaily(e.target.value)} />
                </div>
              ) : <b id="ai-daily">{Number(daily).toLocaleString('en-PH')}</b>}
            </div>
            <div className="a-setting">
              <div className="t"><b>Messages for the whole gym per month</b><small>{owner ? `1 to ${(capM ?? 100000).toLocaleString('en-PH')}${capM ? ', the most your plan allows' : ''}` : 'the gym’s month'}</small></div>
              {owner ? (
                <input id="ai-monthly" type="number" min={1} max={capM ?? 100000} step={1} className="a-in" style={{ width: 110, textAlign: 'center' }}
                  aria-label="Messages for the whole gym per month" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              ) : <b id="ai-monthly">{Number(monthly).toLocaleString('en-PH')}</b>}
            </div>
            <div className="a-setting">
              <div className="t"><b>Who can use it</b><small>set per plan on Plans → What each unlocks</small></div>
              <Link to="/membership-plans" className="a-btn ghost sm">Open Plans</Link>
            </div>
            {(capD != null || capM != null) && (
              <div className="a-hint" style={{ marginTop: 4 }}>
                <Bolt size={15} />
                <span>Your Core Fitness plan allows up to {capD != null ? `${capD} a member a day` : 'any number a day'} and{' '}
                  {capM != null ? `${capM.toLocaleString('en-PH')} a month for the gym` : 'any number a month'}. You can set lower limits, never higher.{' '}
                  <Link to="/subscription" style={{ color: 'var(--a-p300)' }}>See plans →</Link></span>
              </div>
            )}
            {owner ? (
              <button type="button" className="a-btn violet" style={{ alignSelf: 'flex-end', marginTop: 10 }}
                onClick={() => void save()} disabled={saving || !daily || !monthly}>{saving ? 'Saving…' : 'Save'}</button>
            ) : <p className="a-sub" style={{ marginTop: 8 }}>Only the gym's owner can change these.</p>}
          </>
        )}
        <TopUps />
      </div>

      <div className="a-stage">
        <div className="cap"><Smartphone size={13} />Live preview · a member's chat</div>
        <div className="a-phone"><div className="scr">
          <b style={{ fontSize: 15 }}>Coach</b>
          <div className="a-phcard" style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#2a2050' }}>What should I do today? Legs are sore.</div>
          <div className="a-phcard" style={{ maxWidth: '90%' }}>Then upper body: push-ups, rows and planks, kept light. Walking helps sore legs recover.</div>
          <div className="a-sub" style={{ textAlign: 'center', marginTop: 'auto' }}>
            {u ? `Each member gets ${u.daily_limit.toLocaleString('en-PH')} messages a day` : 'A sample conversation'}
          </div>
          <div className="a-sub" style={{ textAlign: 'center', fontSize: 10 }}>Sample conversation</div>
        </div></div>
      </div>
    </div>
  );
}

/**
 * What Core Fitness gives this gym, said first (2026-10-25): the plan's monthly
 * messages (set by the platform), the gym's own limit under it, what is used and
 * left this month, and prepaid top-ups. The owner asked to see "my credits"; it
 * was all here, at the bottom, under "Need more?".
 */
function Credits({ a, onRaise }: { a: AiAllowance; onRaise: () => void }) {
  const used = Number(a.used);
  const left = Math.max(0, a.monthly - used);
  const below = a.plan_monthly != null && a.monthly < a.plan_monthly;
  const pct = a.monthly > 0 ? Math.min(100, Math.round((used / a.monthly) * 100)) : 0;
  return (
    <div className="a-card glow" style={{ marginBottom: 10 }} data-ai-credits>
      <div className="a-ct"><h3><Coins size={16} />Your AI coach credits</h3><small>set by Core Fitness, used by your members</small></div>
      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <div><div className="a-lbl">Your plan gives</div><div className="a-num" style={{ fontSize: 22 }}>{a.plan_monthly != null ? a.plan_monthly.toLocaleString('en-PH') : 'No cap'}</div><div className="a-sub">messages a month</div></div>
        <div><div className="a-lbl">Your limit</div><div className="a-num" style={{ fontSize: 22 }}>{a.monthly.toLocaleString('en-PH')}</div><div className="a-sub">{below ? 'below what your plan allows' : 'the month’s allowance'}</div></div>
        <div><div className="a-lbl">Left this month</div><div className="a-num" style={{ fontSize: 22, color: left === 0 ? 'var(--a-a300)' : undefined }}>{left.toLocaleString('en-PH')}</div><div className="a-sub">{used.toLocaleString('en-PH')} used · starts again on the 1st</div></div>
        <div><div className="a-lbl">Top-up credits</div><div className="a-num" style={{ fontSize: 22 }}>{a.credits.toLocaleString('en-PH')}</div><div className="a-sub">used after the month&rsquo;s, never expire</div></div>
      </div>
      <div className="a-meter" style={{ marginTop: 10 }}><i style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--a-amber)' : undefined }} /></div>
      {below && (
        <div className="a-hint" style={{ marginTop: 10 }}><Coins size={15} />
          <span>Your plan allows {a.plan_monthly!.toLocaleString('en-PH')} a month, but your limit is {a.monthly.toLocaleString('en-PH')}.{' '}
            <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={onRaise}>Use all {a.plan_monthly!.toLocaleString('en-PH')}</button> — then Save below.</span>
        </div>
      )}
    </div>
  );
}

/** One bar per day of this Manila month so far; the height is that day's share of the busiest. */
function DayBars({ days }: { days: { day: string; messages: number }[] }) {
  if (days.length === 0) return null;
  const top = Math.max(1, ...days.map((d) => d.messages));
  const label = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); };
  const [yy, mm] = days[0].day.split('-').map(Number);
  const slots = Math.max(days.length, new Date(yy, mm, 0).getDate() || days.length);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="a-lbl" style={{ marginBottom: 6 }}>Messages each day this month</div>
      <div className="grid items-end gap-[3px] h-12" data-days={days.length} style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <div key={d.day} className="min-w-0 h-full flex items-end" tabIndex={0}
            data-tip={`${label(d.day)}: ${d.messages.toLocaleString('en-PH')} message${d.messages === 1 ? '' : 's'}`}>
            <div className="w-full rounded-sm" style={{ height: d.messages ? `${Math.max(6, (d.messages / top) * 100)}%` : 2, background: d.messages ? 'var(--a-p400)' : 'var(--a-high)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * More messages this month (0189): the allowance and what is used, the top-up
 * messages left, and buying more at the platform's price — online when PayMongo
 * is on, else by transfer with a reference Core Fitness checks. The owner's only.
 */
function TopUps() {
  const [a, setA] = useState<AiAllowance | null | undefined>(undefined);
  const [opts, setOpts] = useState<PayOption[]>([]);
  const [packs, setPacks] = useState(1);
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [confirming, setConfirming] = useState<'waiting' | 'slow' | null>(null);
  useEffect(() => { void paymongoReady().then(setOnline); }, []);
  const load = useCallback(async () => {
    const [x, o] = await Promise.all([aiAllowance(), payOptions()]);
    setA(x); setOpts(o ?? []);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => waitForPayment((state, row) => {
    if (row && row.purpose !== 'ai_topup') return;
    if (state === 'paid') { setConfirming(null); showToast(`Payment received — ${row?.description ?? 'messages added'}`, 'success'); void load(); }
    else setConfirming(state);
  }), [load]);

  if (!a) return null; // before 0189, or not the owner: nothing to buy here
  const used = Number(a.used);
  const price = Number(a.topup_price);
  const payNow = async () => {
    setBusy(true);
    try { await payOnline('ai_topup', { packs }, '/gym-app?tab=coach'); }
    catch (e) { setBusy(false); showToast(e instanceof Error ? e.message : 'Could not open the payment', 'error'); }
  };
  const send = async () => {
    setBusy(true);
    try { await buyTopUp(packs, reference.trim(), proof); showToast('Sent — Core Fitness adds the messages once it sees the payment', 'success'); setReference(''); setProof(null); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div data-ai-topups style={{ marginTop: 16 }}>
      <div className="a-ct"><h3><Bolt size={16} />Need more this month?</h3></div>
      <p className="a-sub" data-ai-used style={{ color: '#fff' }}>
        {used.toLocaleString('en-PH')} of {a.monthly.toLocaleString('en-PH')} used{a.plan_monthly != null ? ` (your plan includes ${a.plan_monthly.toLocaleString('en-PH')})` : ''}
        {' · '}<b>{a.credits.toLocaleString('en-PH')}</b> top-up message{a.credits === 1 ? '' : 's'} left
      </p>
      <p className="a-sub" style={{ marginTop: 2 }}>You are told at 80% and when they run out. Top-ups are used only after the month's messages and never expire. It starts again on the 1st.</p>
      {confirming && <p className="a-sub" data-topup-confirming style={{ marginTop: 6 }}>{confirming === 'waiting' ? 'Confirming your payment with PayMongo…' : 'PayMongo has not confirmed it yet — the messages appear here once it does.'}</p>}
      <p className="a-lbl" style={{ margin: '10px 0 6px' }}>Buy more — {a.topup_messages.toLocaleString('en-PH')} messages for {peso(price)}</p>
      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {CARDS.map((n) => (
          <button key={n} type="button" className={`a-opt ${packs === n ? 'on' : ''}`} onClick={() => setPacks(n)} aria-pressed={packs === n}>
            <b>+{(n * a.topup_messages).toLocaleString('en-PH')} messages</b><div className="price">{peso(n * price)}</div>
          </button>
        ))}
      </div>
      {online && (
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }} data-topup-online>
          <button type="button" className="a-btn amber" disabled={busy} onClick={() => void payNow()}>
            {busy ? 'Opening PayMongo…' : `Pay ${peso(packs * price)} online — added at once`}
          </button>
          <span className="a-sub">or pay by transfer and send the reference:</span>
        </div>
      )}
      <p className="a-sub" style={{ marginTop: 8 }}>
        {opts.length > 0
          ? `Pay ${peso(price * packs)} to ${opts.map((o) => `${o.label}${o.account_number ? ` ${o.account_number}` : ''}`).join(' or ')}, then send the reference.`
          : 'Core Fitness has not published how to pay yet — ask in Help.'}
      </p>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 6 }}>
        <select className="a-in" style={{ width: 'auto' }} value={packs} onChange={(e) => setPacks(Number(e.target.value))} aria-label="Packs">
          {PACKS.map((n) => <option key={n} value={n}>{(n * a.topup_messages).toLocaleString('en-PH')} messages · {peso(n * price)}</option>)}
        </select>
        <input className="a-in" style={{ flex: 1, minWidth: 140, width: 'auto' }} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60}
          placeholder="Reference number" aria-label="Reference number" />
        <input type="file" accept="image/*" aria-label="Receipt screenshot" className="a-sub" style={{ maxWidth: 190 }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void shrinkImage(f).then(setProof).catch((err) => showToast(err.message, 'error')); }} />
        <button type="button" className="a-btn" disabled={busy || reference.trim().length < 4 || opts.length === 0} onClick={() => void send()}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
      <p className="a-sub" style={{ marginTop: 6 }}>Top-ups are paid to Core Fitness.</p>
      {a.topups.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {a.topups.slice(0, 5).map((t) => (
            <div key={t.id} className="a-row" data-topup={t.status}>
              <div className="t"><b>{t.messages.toLocaleString('en-PH')} messages · {peso(t.amount)}</b><small>ref {t.reference} · {day(t.created_at)}</small></div>
              <span className={`a-pill ${t.status === 'paid' ? 'v' : t.status === 'rejected' ? 'a' : ''}`}>{STATUS[t.status]}{t.reason ? `: ${t.reason}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
