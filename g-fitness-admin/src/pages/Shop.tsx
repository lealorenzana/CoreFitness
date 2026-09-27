import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Minus, Package, Plus, ShoppingCart, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import { getGymContext } from '../lib/gymContext';
import {
  findMembers, listProducts, moveStock, recordSale, saveProduct, salesOn, shopReport, voidSale,
  type Product, type ReportRow, type Sale,
} from '../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const monthStart = () => `${manilaToday().slice(0, 8)}01`;
type Tab = 'sell' | 'products' | 'sales';
const blank = { id: null as string | null, name: '', category: 'Drinks', description: '', price: '', trackStock: true, lowStockAt: '5', shownInApp: true };

/**
 * Billing → Shop (0133). Sell: tap products into a sale, optionally name the
 * member, record it as cash — it joins today's drawer count. Products (owner):
 * what you sell, prices, deliveries and shelf counts, what members see in the
 * app. Sales: what sold, by product, for any dates.
 */
export default function Shop() {
  const [tab, setTab] = useState<Tab>('sell');
  const [owner, setOwner] = useState(false);
  const [products, setProducts] = useState<Product[] | null | undefined>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [memberQ, setMemberQ] = useState('');
  const [memberHits, setMemberHits] = useState<{ id: string; name: string }[]>([]);
  const [today, setToday] = useState<Sale[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [stockFor, setStockFor] = useState<{ p: Product; reason: 'delivery' | 'count' | 'damage'; qty: string; note: string } | null>(null);
  const [range, setRange] = useState({ from: monthStart(), to: manilaToday() });
  const [report, setReport] = useState<ReportRow[]>([]);

  const load = useCallback(async () => {
    const [p, s, ctx] = await Promise.all([listProducts(), salesOn(manilaToday()), getGymContext()]);
    setProducts(p); setToday(s); setOwner(ctx?.role === 'admin');
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => {
    let alive = true;
    void (async () => { const r = await shopReport(range.from, range.to); if (alive) setReport(r); })();
    return () => { alive = false; };
  }, [range, today]);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => { void findMembers(memberQ).then((h) => { if (alive) setMemberHits(h); }); }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [memberQ]);

  const lines = useMemo(() => (products ?? []).filter((p) => cart[p.id]).map((p) => ({ p, qty: cart[p.id] })), [products, cart]);
  const total = lines.reduce((s, l) => s + l.qty * l.p.price, 0);
  const bump = (p: Product, d: number) => setCart((c) => {
    const next = Math.max(0, Math.min((c[p.id] ?? 0) + d, p.trackStock ? p.stock : 999));
    const n = { ...c }; if (next === 0) delete n[p.id]; else n[p.id] = next; return n;
  });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); return false; }
    finally { setBusy(false); }
  };

  if (products === null) return <div className="text-sm" style={{ color: MUTED }}>Loading the shop…</div>;
  if (products === undefined) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <p className="text-xs text-white">The shop is not switched on yet — paste migration 0133 (System shows what is missing).</p>
        </div>
      </Card>
    );
  }

  const selling = products.filter((p) => p.active);
  const low = selling.filter((p) => p.trackStock && p.stock <= p.lowStockAt);
  const todayTotal = today.filter((s) => !s.voidedAt).reduce((s, x) => s + x.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shop</h1>
          <p className="text-xs mt-1" style={{ color: MUTED }}>
            Counter sales today: {formatCurrency(todayTotal)} · {today.filter((s) => !s.voidedAt).length} {today.filter((s) => !s.voidedAt).length === 1 ? 'sale' : 'sales'}
            {low.length > 0 && <span style={{ color: 'var(--color-secondary)' }}> · {low.length} running low</span>}
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={FIELD} role="tablist" aria-label="Shop sections">
          {(['sell', 'products', 'sales'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold capitalize"
              style={{ background: tab === t ? 'var(--color-primary)' : 'transparent', color: tab === t ? '#fff' : 'var(--color-text-secondary)' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'sell' && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <Card className="!p-4">
            {selling.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: MUTED }}>
                Nothing to sell yet. {owner ? 'Add your products under Products.' : 'The owner adds products under Products.'}
              </p>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {selling.map((p) => {
                  const out = p.trackStock && p.stock <= (cart[p.id] ?? 0);
                  return (
                    <button key={p.id} type="button" disabled={out} onClick={() => bump(p, 1)} aria-label={`Add ${p.name}`}
                      className="text-left rounded-lg p-3" style={{ ...FIELD, opacity: out ? 0.45 : 1 }}>
                      <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: 'var(--color-secondary)' }}>{formatCurrency(p.price)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        {p.category}{p.trackStock ? ` · ${p.stock} left` : ''}{cart[p.id] ? ` · ${cart[p.id]} in sale` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="!p-4">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><ShoppingCart size={14} /> This sale</p>
            {lines.length === 0 && <p className="text-[11px] mt-3" style={{ color: MUTED }}>Tap a product to add it.</p>}
            <div className="space-y-2 mt-3">
              {lines.map(({ p, qty }) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-white truncate">{p.name}</span>
                  <button aria-label={`One less ${p.name}`} onClick={() => bump(p, -1)} className="p-1 rounded" style={FIELD}><Minus size={10} /></button>
                  <span className="text-xs text-white w-5 text-center tabular-nums">{qty}</span>
                  <button aria-label={`One more ${p.name}`} onClick={() => bump(p, 1)} className="p-1 rounded" style={FIELD}><Plus size={10} /></button>
                  <span className="text-xs text-white w-16 text-right tabular-nums">{formatCurrency(qty * p.price)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              {member ? (
                <p className="text-[11px] flex items-center gap-1.5 text-white">For {member.name}
                  <button aria-label="Remove member" onClick={() => setMember(null)} style={{ color: MUTED }}><X size={12} /></button></p>
              ) : (
                <>
                  <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Member (optional)" aria-label="Member"
                    className="w-full h-8 px-2 rounded-lg text-xs text-white" style={FIELD} />
                  {memberHits.map((m) => (
                    <button key={m.id} className="block w-full text-left text-[11px] px-2 py-1 text-white"
                      onClick={() => { setMember(m); setMemberQ(''); setMemberHits([]); }}>{m.name}</button>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <span className="text-xs" style={{ color: MUTED }}>Total</span>
              <span className="text-lg font-bold text-white tabular-nums">{formatCurrency(total)}</span>
            </div>
            <Button variant="secondary" className="w-full mt-3" disabled={busy || lines.length === 0}
              onClick={() => void run(async () => {
                await recordSale(lines.map((l) => ({ productId: l.p.id, qty: l.qty })), member?.id ?? null);
                setCart({}); setMember(null);
              }, `Cash sale of ${formatCurrency(total)} recorded`)}>
              Record cash sale
            </Button>
          </Card>

          <Card className="!p-4" style={{ gridColumn: '1 / -1' }}>
            <p className="text-xs font-semibold text-white mb-2">Today's sales</p>
            {today.length === 0 ? <p className="text-[11px]" style={{ color: MUTED }}>None yet today.</p> : (
              <div className="space-y-1.5">
                {today.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-xs" style={{ opacity: s.voidedAt ? 0.5 : 1 }}>
                    <span className="w-14 tabular-nums" style={{ color: MUTED }}>{new Date(s.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="flex-1 text-white truncate">
                      {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}{s.memberName ? ` · ${s.memberName}` : ''}
                      {s.voidedAt && <span style={{ color: 'var(--color-secondary)' }}> · voided: {s.voidReason}</span>}
                    </span>
                    <span className="w-16 text-right tabular-nums text-white">{formatCurrency(s.total)}</span>
                    {!s.voidedAt && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                        const reason = window.prompt('Why is this sale voided?');
                        if (reason && reason.trim()) void run(() => voidSale(s.id, reason), 'Sale voided; the stock is back');
                      }}>Void</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'products' && (
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs" style={{ color: MUTED }}>
              {owner ? 'What you sell, what it costs, and what members see in the app.' : 'Only the owner changes products and stock.'}
            </p>
            {owner && <Button variant="secondary" onClick={() => setForm({ ...blank })}><Plus size={14} /> Add product</Button>}
          </div>
          {form && (
            <div className="rounded-lg p-3 mb-3 grid gap-2" style={{ ...FIELD, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Whey scoop" aria-label="Product name"
                className="col-span-2 h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" aria-label="Category"
                className="h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              <input value={form.price} inputMode="decimal" onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="Price (₱)" aria-label="Price" className="h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)"
                aria-label="Description" className="col-span-2 h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              <input value={form.lowStockAt} inputMode="numeric" onChange={(e) => setForm({ ...form, lowStockAt: e.target.value.replace(/\D/g, '') })}
                aria-label="Warn when stock is at" placeholder="Warn at" className="h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              <div className="flex flex-col gap-1 text-[11px] text-white">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.trackStock} onChange={(e) => setForm({ ...form, trackStock: e.target.checked })} /> Count stock</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.shownInApp} onChange={(e) => setForm({ ...form, shownInApp: e.target.checked })} /> Show in members' app</label>
              </div>
              <div className="col-span-4 flex gap-2">
                <Button size="sm" variant="secondary" disabled={busy || !form.name.trim() || form.price === ''}
                  onClick={() => void run(async () => {
                    await saveProduct({ id: form.id, name: form.name, category: form.category, description: form.description.trim() || null,
                      price: Number(form.price), photoUrl: null, trackStock: form.trackStock, lowStockAt: Number(form.lowStockAt || 0),
                      shownInApp: form.shownInApp, active: true });
                    setForm(null);
                  }, form.id ? 'Product saved' : 'Product added')}>
                  {form.id ? 'Save' : 'Add'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {products.length === 0 && <p className="text-xs py-6 text-center" style={{ color: MUTED }}>No products yet.</p>}
          <div className="space-y-1.5">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ ...FIELD, opacity: p.active ? 1 : 0.5 }}>
                <Package size={14} style={{ color: MUTED }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                  <p className="text-[10px]" style={{ color: MUTED }}>
                    {p.category} · {formatCurrency(p.price)}{p.shownInApp ? '' : ' · hidden from the app'}{p.active ? '' : ' · retired'}
                  </p>
                </div>
                <span className="text-xs tabular-nums" style={{ color: p.trackStock && p.stock <= p.lowStockAt ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
                  {p.trackStock ? `${p.stock} in stock` : 'not counted'}
                </span>
                {owner && (
                  <div className="flex gap-1">
                    {p.trackStock && p.active && (<>
                      <Button size="sm" variant="ghost" onClick={() => setStockFor({ p, reason: 'delivery', qty: '', note: '' })}>Delivery</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStockFor({ p, reason: 'count', qty: String(p.stock), note: '' })}>Count</Button>
                    </>)}
                    <Button size="sm" variant="ghost" onClick={() => setForm({ id: p.id, name: p.name, category: p.category, description: p.description ?? '',
                      price: String(p.price), trackStock: p.trackStock, lowStockAt: String(p.lowStockAt), shownInApp: p.shownInApp })}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => saveProduct({ ...p, active: !p.active }),
                      p.active ? `${p.name} retired — past sales keep it` : `${p.name} is back on sale`)}>{p.active ? 'Retire' : 'Restore'}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {stockFor && (
            <div className="rounded-lg p-3 mt-3 flex flex-wrap items-center gap-2" style={FIELD}>
              <span className="text-xs text-white">{stockFor.p.name}:</span>
              <select value={stockFor.reason} aria-label="Stock change" onChange={(e) => setStockFor({ ...stockFor, reason: e.target.value as typeof stockFor.reason })}
                className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD}>
                <option value="delivery">Delivery arrived (+)</option>
                <option value="count">Shelf count (set to)</option>
                <option value="damage">Damaged / expired (−)</option>
              </select>
              <input value={stockFor.qty} inputMode="numeric" aria-label="Quantity" onChange={(e) => setStockFor({ ...stockFor, qty: e.target.value.replace(/\D/g, '') })}
                className="h-8 w-20 px-2 rounded-lg text-xs text-white" style={FIELD} />
              <input value={stockFor.note} aria-label="Note" placeholder={stockFor.reason === 'delivery' ? 'Supplier (optional)' : 'Why'}
                onChange={(e) => setStockFor({ ...stockFor, note: e.target.value })} className="h-8 flex-1 px-2 rounded-lg text-xs text-white" style={FIELD} />
              <Button size="sm" variant="secondary" disabled={busy || stockFor.qty === ''}
                onClick={() => void run(async () => { await moveStock(stockFor.p.id, stockFor.reason, Number(stockFor.qty), stockFor.note); setStockFor(null); }, 'Stock recorded')}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStockFor(null)}>Cancel</Button>
            </div>
          )}
        </Card>
      )}

      {tab === 'sales' && (
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <input type="date" value={range.from} aria-label="From" onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD} />
            <span className="text-xs" style={{ color: MUTED }}>to</span>
            <input type="date" value={range.to} aria-label="To" onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-8 px-2 rounded-lg text-xs text-white" style={FIELD} />
            <span className="ml-auto text-sm font-bold text-white tabular-nums">{formatCurrency(report.reduce((s, r) => s + r.revenue, 0))}</span>
          </div>
          {report.length === 0 ? <p className="text-xs py-6 text-center" style={{ color: MUTED }}>No sales in these dates.</p> : (
            <table className="w-full text-xs">
              <thead><tr style={{ color: MUTED }}><th className="text-left py-1 font-semibold">Product</th><th className="text-right font-semibold">Sold</th><th className="text-right font-semibold">Revenue</th></tr></thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.productId} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td className="py-1.5 text-white">{r.name}</td>
                    <td className="text-right tabular-nums text-white">{r.qty}</td>
                    <td className="text-right tabular-nums text-white">{formatCurrency(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] mt-3" style={{ color: MUTED }}>Voided sales are left out. Cash sales are part of each day's drawer count under Payments.</p>
        </Card>
      )}
    </div>
  );
}
