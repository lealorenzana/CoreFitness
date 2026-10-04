import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/formatters';
import { todayKey as manilaToday, addDays } from '../../utils/dates';
import { salesBetween, shopReport, type ReportRow, type Sale } from '../../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const PANEL = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

type Preset = 'today' | 'week' | 'month' | 'last' | 'custom';
function rangeFor(p: Preset): { from: string; to: string } {
  const today = manilaToday();
  if (p === 'today') return { from: today, to: today };
  if (p === 'week') return { from: addDays(today, -6), to: today };
  if (p === 'last') {
    const first = `${today.slice(0, 8)}01`;
    const end = addDays(first, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Billing → Shop → Sales: what sold for any dates — totals, the best sellers, and every sale with its receipt. Voids are shown, never counted. */
export default function ShopSales({ refresh, onReceipt }: { refresh: number; onReceipt: (s: Sale) => void }) {
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(rangeFor('month'));
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [r, s] = await Promise.all([shopReport(range.from, range.to), salesBetween(range.from, range.to)]);
      if (alive) { setReport(r); setSales(s); }
    })();
    return () => { alive = false; };
  }, [range, refresh]);

  const live = (sales ?? []).filter((s) => !s.voidedAt);
  const voided = (sales ?? []).filter((s) => s.voidedAt);
  const revenue = (report ?? []).reduce((s, r) => s + r.revenue, 0);
  const items = (report ?? []).reduce((s, r) => s + r.qty, 0);
  const top = [...(report ?? [])].sort((a, b) => b.revenue - a.revenue);
  const max = top[0]?.revenue || 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {([['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Pick dates']] as [Preset, string][]).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={preset === k} onClick={() => { setPreset(k); if (k !== 'custom') setRange(rangeFor(k)); }}
            className="h-8 px-3 rounded-full text-xs font-semibold"
            style={{ background: preset === k ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: preset === k ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              border: `1px solid ${preset === k ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{label}</button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-2">
            <input type="date" value={range.from} aria-label="From" onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD} />
            <span className="text-xs" style={{ color: MUTED }}>to</span>
            <input type="date" value={range.to} aria-label="To" onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD} />
          </span>
        )}
      </div>

      <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
        {[
          ['Shop revenue', formatCurrency(revenue)],
          ['Sales', String(live.length)],
          ['Items sold', String(items)],
          ['Voided', String(voided.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl p-3" style={PANEL}>
            <p className="text-[11px] font-semibold uppercase" style={{ color: MUTED }}>{label}</p>
            <p className="text-xl font-bold text-white tabular-nums mt-1">{sales === null ? '…' : value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl p-4" style={PANEL}>
          <p className="text-sm font-semibold text-white mb-3">Best sellers</p>
          {report === null ? <p className="text-xs" style={{ color: MUTED }}>Loading…</p> : top.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: MUTED }}>No sales in these dates.</p>
          ) : (
            <div className="space-y-2.5">
              {top.map((r) => (
                <div key={r.productId}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-white truncate">{r.name} <span style={{ color: MUTED }}>· {r.qty} sold</span></span>
                    <span className="text-white font-semibold tabular-nums">{formatCurrency(r.revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--color-surface-high)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.revenue / max) * 100)}%`, background: 'var(--color-primary)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4" style={PANEL}>
          <p className="text-sm font-semibold text-white mb-2">Every sale</p>
          {sales === null ? <p className="text-xs" style={{ color: MUTED }}>Loading…</p> : sales.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: MUTED }}>No sales in these dates.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {sales.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2 text-xs" style={{ borderTop: '1px solid var(--color-border)', opacity: s.voidedAt ? 0.55 : 1 }}>
                  <span className="w-24 tabular-nums" style={{ color: MUTED }}>
                    {new Date(s.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="flex-1 min-w-0 text-white truncate">
                    {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                    {s.memberName && <span style={{ color: MUTED }}> · {s.memberName}</span>}
                    {s.voidedAt && <span style={{ color: 'var(--color-secondary)' }}> · voided</span>}
                  </span>
                  <span className="tabular-nums text-white font-semibold">{formatCurrency(s.total)}</span>
                  <Button size="sm" variant="ghost" onClick={() => onReceipt(s)} aria-label="Receipt"><Receipt size={13} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: MUTED }}>Voided sales are listed but never counted. Cash sales are part of each day's drawer count under Payments, and of Revenue under Reports.</p>
    </div>
  );
}
