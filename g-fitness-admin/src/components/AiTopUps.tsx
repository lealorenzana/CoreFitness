import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Card from './ui/Card';
import { showToast } from '../utils/toast';
import { shrinkImage } from '../utils/shrinkImage';
import { payOptions, type PayOption } from '../lib/api/subscription';
import { aiAllowance, buyTopUp, type AiAllowance } from '../lib/api/aiTopups';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: '#fff' };
const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS = { pending: 'Waiting for Core Fitness', paid: 'Added', rejected: 'Not added' } as const;

/**
 * More AI coach messages (0189): this month's allowance and what is used, the
 * top-up messages left, and buying more — the size and price are the
 * platform's, paid like any payment to Core Fitness (reference + screenshot,
 * Core Fitness verifies). Top-ups are used only after the month's allowance
 * and never expire; the per-member daily limit above still holds.
 */
export default function AiTopUps() {
  const [a, setA] = useState<AiAllowance | null | undefined>(undefined);
  const [opts, setOpts] = useState<PayOption[]>([]);
  const [packs, setPacks] = useState(1);
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [x, o] = await Promise.all([aiAllowance(), payOptions()]);
    setA(x); setOpts(o ?? []);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (a === undefined) return null;
  if (a === null) return null; // before 0189, or not the owner: nothing to buy here
  const used = Number(a.used);
  const pct = a.monthly > 0 ? Math.min(100, Math.round((used / a.monthly) * 100)) : 0;
  const send = async () => {
    setBusy(true);
    try {
      await buyTopUp(packs, reference.trim(), proof);
      showToast('Sent — Core Fitness adds the messages once it sees the payment', 'success');
      setReference(''); setProof(null); await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="!p-5 mt-4" data-ai-topups>
      <p className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={15} /> Messages this month</p>
      <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }} aria-hidden>
        <div className="h-full" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--color-text-primary)' }} data-ai-used>
        {used.toLocaleString('en-PH')} of {a.monthly.toLocaleString('en-PH')} used{a.plan_monthly != null ? ` (your plan includes ${a.plan_monthly.toLocaleString('en-PH')})` : ''}
        {' · '}<b>{a.credits.toLocaleString('en-PH')}</b> top-up message{a.credits === 1 ? '' : 's'} left
      </p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>
        You are told at 80% and when they run out. Top-ups are used only after the month's messages and never expire. It starts again on the 1st.
      </p>

      <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
        <p className="text-xs font-semibold text-white">Buy more — {a.topup_messages.toLocaleString('en-PH')} messages for {peso(a.topup_price)}</p>
        {opts.length > 0 ? (
          <p className="text-[11px] mt-1" style={{ color: MUTED }}>
            Pay {peso(Number(a.topup_price) * packs)} to {opts.map((o) => `${o.label}${o.account_number ? ` ${o.account_number}` : ''}`).join(' or ')}, then send the reference.
          </p>
        ) : <p className="text-[11px] mt-1" style={{ color: MUTED }}>Core Fitness has not published how to pay yet — ask in Support.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={packs} onChange={(e) => setPacks(Number(e.target.value))} aria-label="Packs" className="rounded-lg px-2 py-1.5 text-xs" style={FIELD}>
            {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{(n * a.topup_messages).toLocaleString('en-PH')} messages · {peso(n * Number(a.topup_price))}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="Reference number" aria-label="Reference number"
            className="rounded-lg px-3 py-1.5 text-xs flex-1 min-w-[140px]" style={FIELD} />
          <input type="file" accept="image/*" aria-label="Receipt screenshot" className="text-xs max-w-full" style={{ color: 'var(--color-text-secondary)' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void shrinkImage(f).then(setProof).catch((err) => showToast(err.message, 'error')); }} />
          <button type="button" disabled={busy || reference.trim().length < 4 || opts.length === 0} onClick={() => void send()}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {a.topups.length > 0 && (
        <ul className="mt-3 space-y-1">
          {a.topups.slice(0, 5).map((t) => (
            <li key={t.id} className="text-xs flex flex-wrap gap-2" style={{ color: MUTED }} data-topup={t.status}>
              <span className="text-white">{t.messages.toLocaleString('en-PH')} messages · {peso(t.amount)}</span>
              <span>ref {t.reference} · {day(t.created_at)}</span>
              <span style={{ color: t.status === 'rejected' ? 'var(--color-secondary)' : undefined }}>{STATUS[t.status]}{t.reason ? `: ${t.reason}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
