import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Receipt, Search, ShoppingCart, Trash2, UserRound, X } from 'lucide-react';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/formatters';
import { findMembers, type MemberHit, type Product, type Sale } from '../../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const PANEL = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

/** A product's tile picture: its photo, or its initials on a tint — never a stock image. */
export function ProductThumb({ p, size = 44 }: { p: Pick<Product, 'name' | 'photoUrl'>; size?: number }) {
  if (p.photoUrl) return <img src={p.photoUrl} alt="" className="rounded-lg object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  const initials = (p.name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0]).join('') || p.name).slice(0, 2).toUpperCase();
  return (
    <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold"
      style={{ width: size, height: size, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: size * 0.32 }}>
      {initials}
    </span>
  );
}

/** Quick amounts for cash handed over: exact, then the next bills up. */
function quickCash(total: number): number[] {
  const out = new Set<number>([total]);
  for (const bill of [20, 50, 100, 200, 500, 1000]) {
    const up = Math.ceil(total / bill) * bill;
    if (up > total) out.add(up);
    if (out.size >= 5) break;
  }
  return [...out].sort((a, b) => a - b);
}

interface Props {
  products: Product[];
  today: Sale[];
  owner: boolean;
  busy: boolean;
  /** Records the sale; resolves true when it was recorded (a failure has already said so). */
  onRecord: (items: { productId: string; qty: number }[], member: MemberHit | null, tendered: number | null) => Promise<boolean>;
  onReceipt: (sale: Sale) => void;
  onVoid: (sale: Sale, reason: string) => Promise<boolean>;
  onAddProducts: () => void;
}

/**
 * Billing → Shop → Sell (0133), a till: find a product by name or category,
 * tap it in, set quantities, say who is buying if it is a member, take the
 * cash and see the change. Prices and stock are the database's — the till only
 * stops you adding more than the shelf has.
 */
export default function ShopSell({ products, today, owner, busy, onRecord, onReceipt, onVoid, onAddProducts }: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [member, setMember] = useState<MemberHit | null>(null);
  const [memberQ, setMemberQ] = useState('');
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [cash, setCash] = useState('');
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => { void findMembers(memberQ).then((h) => { if (alive) setHits(h); }); }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [memberQ]);

  const selling = products.filter((p) => p.active);
  const categories = useMemo(() => ['All', ...Array.from(new Set(selling.map((p) => p.category))).sort()], [selling]);
  const shown = selling.filter((p) => (cat === 'All' || p.category === cat) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const lines = selling.filter((p) => cart[p.id]).map((p) => ({ p, qty: cart[p.id] }));
  const total = lines.reduce((s, l) => s + l.qty * l.p.price, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const tendered = cash === '' ? null : Number(cash);
  const short = tendered !== null && tendered < total;

  const bump = (p: Product, d: number) => setCart((c) => {
    const next = Math.max(0, Math.min((c[p.id] ?? 0) + d, p.trackStock ? p.stock : 999));
    const n = { ...c }; if (next === 0) delete n[p.id]; else n[p.id] = next; return n;
  });
  const clear = () => { setCart({}); setMember(null); setCash(''); };

  const record = async () => {
    const ok = await onRecord(lines.map((l) => ({ productId: l.p.id, qty: l.qty })), member, tendered);
    if (ok) clear();
  };

  const live = today.filter((s) => !s.voidedAt);

  return (
    <div className="grid gap-4 items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1" style={{ minWidth: 200 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MUTED }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product"
              className="w-full h-10 pl-9 pr-3 rounded-xl text-sm text-white" style={FIELD} />
          </div>
        </div>
        {categories.length > 2 && (
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Category">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                className="h-8 px-3 rounded-full text-xs font-semibold"
                style={{ background: cat === c ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: cat === c ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  border: `1px solid ${cat === c ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {selling.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={PANEL}>
            <p className="text-sm text-white font-semibold">Nothing to sell yet</p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>{owner ? 'Add what you sell — drinks, supplements, towels — and it appears here.' : 'The owner adds products under Products.'}</p>
            {owner && <Button className="mt-3" variant="secondary" onClick={onAddProducts}><Plus size={14} /> Add products</Button>}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: MUTED }}>No product matches “{q}”.</p>
        ) : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))' }}>
            {shown.map((p) => {
              const inCart = cart[p.id] ?? 0;
              const out = p.trackStock && p.stock <= inCart;
              const low = p.trackStock && p.stock <= p.lowStockAt;
              return (
                <button key={p.id} type="button" disabled={out} onClick={() => bump(p, 1)} aria-label={`Add ${p.name}`}
                  className="relative text-left rounded-2xl p-3 flex flex-col gap-2 transition-transform active:scale-[0.98]"
                  style={{ ...PANEL, borderColor: inCart ? 'var(--color-primary)' : 'var(--color-border)', opacity: out ? 0.45 : 1 }}>
                  <div className="flex items-start justify-between gap-2 w-full">
                    <ProductThumb p={p} />
                    {inCart > 0 && (
                      <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: 'var(--color-primary)', color: '#fff' }}>{inCart}</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-white leading-tight line-clamp-2">{p.name}</span>
                  <span className="flex items-baseline justify-between gap-2 w-full">
                    <span className="text-base font-bold tabular-nums" style={{ color: 'var(--color-secondary)' }}>{formatCurrency(p.price)}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: low ? 'var(--color-secondary)' : MUTED }}>
                      {!p.trackStock ? p.category : p.stock === 0 ? 'Sold out' : `${p.stock} left`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl p-4" style={PANEL}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">Today at the counter</p>
            <p className="text-xs tabular-nums" style={{ color: MUTED }}>{live.length} {live.length === 1 ? 'sale' : 'sales'} · {formatCurrency(live.reduce((s, x) => s + x.total, 0))}</p>
          </div>
          {today.length === 0 ? <p className="text-xs" style={{ color: MUTED }}>No sales yet today.</p> : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {today.map((s) => (
                <div key={s.id} className="py-2" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-3 text-xs" style={{ opacity: s.voidedAt ? 0.55 : 1 }}>
                    <span className="w-16 tabular-nums" style={{ color: MUTED }}>{new Date(s.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="flex-1 min-w-0 text-white truncate">
                      {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      {s.memberName && <span style={{ color: MUTED }}> · {s.memberName}</span>}
                      {s.voidedAt && <span style={{ color: 'var(--color-secondary)' }}> · voided: {s.voidReason}</span>}
                    </span>
                    <span className="w-20 text-right tabular-nums text-white font-semibold">{formatCurrency(s.total)}</span>
                    <Button size="sm" variant="ghost" onClick={() => onReceipt(s)} aria-label={`Receipt for the ${formatCurrency(s.total)} sale`}><Receipt size={13} /></Button>
                    {!s.voidedAt && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setVoiding({ id: s.id, reason: '' })}>Void</Button>}
                  </div>
                  {voiding?.id === s.id && (
                    <form className="flex items-center gap-2 mt-2" onSubmit={async (e) => {
                      e.preventDefault();
                      if (await onVoid(s, voiding.reason)) setVoiding(null);
                    }}>
                      <input autoFocus value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })}
                        placeholder="Why is it voided? e.g. rang up twice" aria-label="Why is this sale voided"
                        className="flex-1 h-8 px-3 rounded-lg text-xs text-white" style={FIELD} />
                      <Button size="sm" variant="secondary" type="submit" disabled={busy || !voiding.reason.trim()}>Void sale</Button>
                      <Button size="sm" variant="ghost" type="button" onClick={() => setVoiding(null)}>Keep it</Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] mt-2" style={{ color: MUTED }}>A void puts the stock back and takes the sale out of the drawer. Only today's sales, before the drawer is closed.</p>
        </div>
      </div>

      {/* The ticket: sticky beside the products, so Record is always in reach. */}
      <aside className="rounded-2xl p-4 flex flex-col gap-3 lg:sticky lg:top-4" style={PANEL} aria-label="This sale">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5"><ShoppingCart size={15} /> This sale {count > 0 && <span style={{ color: MUTED }}>· {count} {count === 1 ? 'item' : 'items'}</span>}</p>
          {lines.length > 0 && <button type="button" onClick={clear} className="text-xs flex items-center gap-1" style={{ color: MUTED }}><Trash2 size={12} /> Clear</button>}
        </div>

        {lines.length === 0 ? (
          <p className="text-xs py-6 text-center rounded-xl" style={{ ...FIELD, color: MUTED }}>Tap a product to start a sale.</p>
        ) : (
          <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
            {lines.map(({ p, qty }) => (
              <div key={p.id} className="flex items-center gap-2">
                <ProductThumb p={p} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-white truncate">{p.name}</span>
                  <span className="block text-[11px] tabular-nums" style={{ color: MUTED }}>{formatCurrency(p.price)} each</span>
                </span>
                <span className="flex items-center rounded-lg" style={FIELD}>
                  <button type="button" aria-label={`One less ${p.name}`} onClick={() => bump(p, -1)} className="w-7 h-7 flex items-center justify-center text-white"><Minus size={12} /></button>
                  <span className="text-xs text-white w-6 text-center tabular-nums">{qty}</span>
                  <button type="button" aria-label={`One more ${p.name}`} onClick={() => bump(p, 1)} disabled={p.trackStock && qty >= p.stock}
                    className="w-7 h-7 flex items-center justify-center text-white disabled:opacity-30"><Plus size={12} /></button>
                </span>
                <span className="text-xs text-white w-16 text-right tabular-nums font-semibold">{formatCurrency(qty * p.price)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Who is buying: optional, and what it does is said where it is asked. */}
        <div className="rounded-xl p-3" style={FIELD}>
          <p className="text-xs font-semibold text-white flex items-center gap-1.5"><UserRound size={13} /> Who is buying? <span className="font-normal" style={{ color: MUTED }}>(optional)</span></p>
          {member ? (
            <div className="flex items-center gap-2 mt-2">
              {member.photoUrl ? <img src={member.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{member.name.slice(0, 1)}</span>}
              <span className="flex-1 min-w-0 text-xs text-white truncate">{member.name}</span>
              <button type="button" aria-label="Not a member sale" onClick={() => setMember(null)} style={{ color: MUTED }}><X size={14} /></button>
            </div>
          ) : (
            <div className="relative mt-2">
              <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Type a member's name or email" aria-label="Who is buying"
                className="w-full h-9 px-3 rounded-lg text-xs text-white" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
              {hits.length > 0 && memberQ.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-10 z-10 rounded-lg overflow-hidden shadow-xl" style={PANEL} role="listbox">
                  {hits.map((m) => (
                    <button key={m.id} type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2 text-left px-3 py-2 hover:bg-white/5"
                      onClick={() => { setMember(m); setMemberQ(''); setHits([]); }}>
                      <span className="text-xs text-white">{m.name}</span>
                      {m.email && <span className="text-[11px] truncate" style={{ color: MUTED }}>{m.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] mt-2" style={{ color: MUTED }}>Links the sale to their account: it shows on their profile under Shop purchases. Leave it empty for a walk-in.</p>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm" style={{ color: MUTED }}>Total</span>
          <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(total)}</span>
        </div>

        {total > 0 && (
          <div className="space-y-2">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase mb-1" style={{ color: MUTED }}>Cash received</span>
              <input value={cash} inputMode="decimal" onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Optional — to work out the change"
                aria-label="Cash received" className="w-full h-9 px-3 rounded-lg text-sm text-white tabular-nums" style={FIELD} />
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {quickCash(total).map((n) => (
                <button key={n} type="button" onClick={() => setCash(String(n))} className="h-7 px-2.5 rounded-lg text-xs font-semibold tabular-nums"
                  style={{ ...FIELD, color: tendered === n ? 'var(--color-primary)' : 'var(--color-text-secondary)', borderColor: tendered === n ? 'var(--color-primary)' : 'var(--color-border)' }}>
                  {n === total ? 'Exact' : formatCurrency(n)}
                </button>
              ))}
            </div>
            {tendered !== null && (
              <div className="flex items-baseline justify-between rounded-lg px-3 py-2" style={{ background: short ? 'var(--color-secondary-light)' : 'var(--color-primary-light)' }}>
                <span className="text-xs font-semibold" style={{ color: short ? 'var(--color-secondary)' : 'var(--color-primary)' }}>{short ? 'Still owed' : 'Change'}</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: short ? 'var(--color-secondary)' : 'var(--color-primary)' }}>{formatCurrency(Math.abs(tendered - total))}</span>
              </div>
            )}
          </div>
        )}

        <Button variant="secondary" className="w-full h-11" disabled={busy || lines.length === 0 || short} onClick={() => void record()}>
          {busy ? 'Recording…' : lines.length ? `Record cash sale · ${formatCurrency(total)}` : 'Record cash sale'}
        </Button>
        <p className="text-[11px] text-center" style={{ color: MUTED }}>Cash only. It joins today's drawer count under Payments.</p>
      </aside>
    </div>
  );
}
