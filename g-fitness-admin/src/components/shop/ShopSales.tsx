import { useEffect, useState } from 'react';
import { Banknote, Package, Receipt, ShoppingBag, Trophy, Undo2 } from 'lucide-react';
import { RdCard, StatTile, FilterChips, EmptyBlock, TableFooter } from '../ui/rd';
import { usePaged } from '../../hooks/usePaged';
import { formatCurrency } from '../../utils/formatters';
import { todayKey as manilaToday, addDays } from '../../utils/dates';
import DatePicker from '../ui/DatePicker';
import { useGymFirstDay } from '../../hooks/useGymFirstDay';
import { salesBetween, shopReport, type ReportRow, type Sale } from '../../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

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
  const firstDay = useGymFirstDay();
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const paged = usePaged(sales ?? [], 20);

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
    <div className="rd-fit-fill flex flex-col gap-4 min-h-0" data-sales>
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChips<Preset> compact value={preset} onChange={(k) => { setPreset(k); if (k !== 'custom') setRange(rangeFor(k)); }} items={[
          { key: 'today', label: 'Today' }, { key: 'week', label: 'Last 7 days' }, { key: 'month', label: 'This month' },
          { key: 'last', label: 'Last month' }, { key: 'custom', label: 'Pick dates' },
        ]} />
        {preset === 'custom' && (
          <span className="flex items-center gap-2">
            <span className="w-40" aria-label="From"><DatePicker mode="history" bounds={{ earliest: firstDay }} max={range.to || undefined} value={range.from} onChange={(v) => v && setRange({ ...range, from: v })} /></span>
            <span className="text-[13px]" style={{ color: MUTED }}>to</span>
            <span className="w-40" aria-label="To"><DatePicker mode="history" bounds={{ earliest: firstDay }} min={range.from || undefined} value={range.to} onChange={(v) => v && setRange({ ...range, to: v })} /></span>
          </span>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <StatTile compact icon={Banknote} label="Shop revenue" value={sales === null ? '…' : formatCurrency(revenue)} sub="voids never counted" />
        <StatTile compact icon={ShoppingBag} label="Sales" value={sales === null ? '…' : live.length} sub="in these dates" />
        <StatTile compact icon={Package} label="Items sold" value={sales === null ? '…' : items} />
        <StatTile compact icon={Undo2} tone={voided.length ? 'amber' : 'violet'} label="Voided" value={sales === null ? '…' : voided.length} sub="listed, not counted" />
      </div>

      <div className="rd-fit-two">
        <RdCard className="flex flex-col min-h-0 overflow-hidden" data-best-sellers>
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: LINE }}>
            <Trophy size={18} style={{ color: '#FBBF24' }} />
            <p className="text-[15px] font-semibold text-white">Best sellers</p>
          </div>
          <div className="rd-fit-scroll p-4">
            {report === null ? <p className="text-[13px]" style={{ color: MUTED }}>Loading…</p> : top.length === 0 ? (
              <EmptyBlock compact icon={Trophy} title="No sales in these dates" />
            ) : (
              <div className="space-y-3.5">
                {top.map((r, i) => (
                  <div key={r.productId} className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg grid place-items-center text-[12.5px] font-bold flex-none tabular-nums"
                      style={i === 0 ? { background: 'rgba(245,158,11,0.18)', color: '#FBBF24' } : { background: 'rgba(255,255,255,0.05)', color: MUTED }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between text-[13.5px] gap-2">
                        <span className="text-white truncate">{r.name} <span style={{ color: MUTED }}>— {r.qty} sold</span></span>
                        <span className="text-white font-semibold tabular-nums">{formatCurrency(r.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.revenue / max) * 100)}%`, background: 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </RdCard>

        <RdCard className="flex flex-col min-h-0 overflow-hidden" data-every-sale>
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: LINE }}>
            <Receipt size={18} style={{ color: '#C4B5FD' }} />
            <p className="text-[15px] font-semibold text-white">Every sale</p>
          </div>
          <div className="rd-fit-scroll px-4">
            {sales === null ? <p className="text-[13px] py-4" style={{ color: MUTED }}>Loading…</p> : sales.length === 0 ? (
              <EmptyBlock compact icon={Receipt} title="No sales in these dates" />
            ) : paged.visible.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.045)', opacity: s.voidedAt ? 0.55 : 1 }}>
                <span className="w-28 tabular-nums" style={{ color: MUTED }}>
                  {new Date(s.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="flex-1 min-w-0 text-white truncate">
                  {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                  {s.memberName && <span style={{ color: MUTED }}> — {s.memberName}</span>}
                  {s.voidedAt && <span style={{ color: '#FBBF24' }}> — voided</span>}
                </span>
                <span className="tabular-nums text-white font-semibold">{formatCurrency(s.total)}</span>
                <button type="button" onClick={() => onReceipt(s)} aria-label="Receipt" data-tip="Receipt"
                  className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/[0.06]" style={{ color: MUTED }}><Receipt size={14} /></button>
              </div>
            ))}
          </div>
          {sales && sales.length > 0 && (
            <div style={{ borderTop: LINE }}>
              <TableFooter page={paged.page} perPage={paged.perPage} total={paged.total} noun="sales" onPage={paged.setPage} />
            </div>
          )}
        </RdCard>
      </div>
      <p className="text-[12px]" style={{ color: MUTED }}>Voided sales are listed but never counted. Cash sales are part of each day&rsquo;s drawer count under Payments, and of Revenue under Reports.</p>
    </div>
  );
}
