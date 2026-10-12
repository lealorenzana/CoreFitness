import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Receipt, Search, ShoppingCart, Trash2, UserRound, X } from 'lucide-react';
import { RdCard, RdButton, EmptyBlock } from '../ui/rd';
import { formatCurrency } from '../../utils/formatters';
import { findMembers, type MemberHit, type Product, type Sale } from '../../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' };
const PANEL = { background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.1)' };
const LINE = '1px solid rgba(255,255,255,0.06)';
const initialsOf = (name: string) => (name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0]).join('') || name).slice(0, 2).toUpperCase();

/** A product's tile picture: its photo, or its initials on a tint — never a stock image. */
export function ProductThumb({ p, size = 44 }: { p: Pick<Product, 'name' | 'photoUrl'>; size?: number }) {
  if (p.photoUrl) return <img src={p.photoUrl} alt="" className="rounded-lg object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  return (
    <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold"
      style={{ width: size, height: size, background: 'rgba(124,58,237,0.22)', color: '#C4B5FD', fontSize: size * 0.32 }}>
      {initialsOf(p.name)}
    </span>
  );
}

/** A product's cover picture, filling its (relative) box: the photo, or its initials on a tint. */
export function ProductArt({ p }: { p: Pick<Product, 'name' | 'photoUrl'> }) {
  if (p.photoUrl) return <img src={p.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />;
  return (
    <span className="absolute inset-0 grid place-items-center text-[26px] font-bold"
      style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgba(124,58,237,0.42), transparent 60%), radial-gradient(100% 100% at 100% 100%, rgba(245,158,11,0.22), transparent 60%), #17122A', color: 'rgba(237,233,254,0.85)' }}>
      {initialsOf(p.name)}
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
 *
 * 2026-10-12: three boxes that hold the screen — the shelf (photo tiles), today's
 * sales under it, and the ticket beside them with Total and Record pinned to its foot.
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
    <div className="rd-shop-sell">
      <div className="rd-shop-left">
        {/* ── The shelf: find, filter, tap in ── */}
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-shop-shelf" data-shelf>
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
            <label className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MUTED }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product"
                className="w-full h-11 pl-10 pr-3 rounded-xl text-[14.5px] text-white outline-none" style={FIELD} />
            </label>
            {categories.length > 2 && (
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Category">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                    className="h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors"
                    style={cat === c ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                      : { background: 'rgba(255,255,255,0.02)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rd-fit-scroll p-4">
            {selling.length === 0 ? (
              <EmptyBlock compact icon={ShoppingCart} title="Nothing to sell yet"
                body={owner ? 'Add what you sell — drinks, supplements, towels — with a photo, and it appears here.' : 'The owner adds products under Products.'}
                action={owner ? <RdButton variant="primary" icon={Plus} onClick={onAddProducts}>Add products</RdButton> : undefined} />
            ) : shown.length === 0 ? (
              <p className="text-[13.5px] py-8 text-center" style={{ color: MUTED }}>No product matches &ldquo;{q}&rdquo;.</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 158px), 1fr))' }}>
                {shown.map((p) => {
                  const inCart = cart[p.id] ?? 0;
                  const out = p.trackStock && p.stock <= inCart;
                  const low = p.trackStock && p.stock <= p.lowStockAt;
                  return (
                    <button key={p.id} type="button" disabled={out} onClick={() => bump(p, 1)} aria-label={`Add ${p.name}`}
                      className="relative text-left rounded-2xl overflow-hidden flex flex-col transition-transform active:scale-[0.98] hover:-translate-y-0.5"
                      style={{ background: 'var(--color-surface)', border: `1px solid ${inCart ? 'rgba(139,92,246,0.8)' : 'rgba(255,255,255,0.07)'}`,
                        boxShadow: inCart ? '0 0 0 3px rgba(124,58,237,0.18)' : undefined, opacity: out ? 0.45 : 1 }}>
                      <span className="relative block w-full" style={{ aspectRatio: '4 / 3' }}>
                        <ProductArt p={p} />
                        {inCart > 0 && (
                          <span className="absolute top-2 right-2 min-w-[28px] h-7 px-2 rounded-full grid place-items-center text-[13px] font-bold" style={{ background: '#7C3AED', color: '#fff' }}>{inCart}</span>
                        )}
                      </span>
                      <span className="p-2.5 flex flex-col gap-1">
                        <span className="text-[13.5px] font-semibold text-white leading-tight line-clamp-2">{p.name}</span>
                        <span className="flex items-baseline justify-between gap-2 w-full">
                          <span className="text-[15px] font-bold tabular-nums" style={{ color: '#FBBF24' }}>{formatCurrency(p.price)}</span>
                          <span className="text-[11.5px] tabular-nums" style={{ color: low ? '#FBBF24' : MUTED }}>
                            {!p.trackStock ? p.category : p.stock === 0 ? 'Sold out' : `${p.stock} left`}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </RdCard>

        {/* ── Today at the counter ── */}
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-shop-today" data-today-sales>
          <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: LINE }}>
            <p className="text-[15px] font-semibold text-white">Today at the counter</p>
            <p className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{live.length} {live.length === 1 ? 'sale' : 'sales'} — {formatCurrency(live.reduce((s, x) => s + x.total, 0))}</p>
          </div>
          <div className="rd-fit-scroll px-4">
            {today.length === 0 ? <p className="text-[13px] py-4" style={{ color: MUTED }}>No sales yet today.</p> : today.map((s) => (
              <div key={s.id} className="py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
                <div className="flex items-center gap-3 text-[13px]" style={{ opacity: s.voidedAt ? 0.55 : 1 }}>
                  <span className="w-16 tabular-nums" style={{ color: MUTED }}>{new Date(s.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="flex-1 min-w-0 text-white truncate">
                    {s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                    {s.memberName && <span style={{ color: MUTED }}> — {s.memberName}</span>}
                    {s.voidedAt && <span style={{ color: '#FBBF24' }}> — voided: {s.voidReason}</span>}
                  </span>
                  <span className="w-20 text-right tabular-nums text-white font-semibold">{formatCurrency(s.total)}</span>
                  <button type="button" onClick={() => onReceipt(s)} aria-label={`Receipt for the ${formatCurrency(s.total)} sale`} data-tip="Receipt"
                    className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/[0.06]" style={{ color: MUTED }}><Receipt size={14} /></button>
                  {!s.voidedAt && (
                    <RdButton size="sm" variant="ghost" disabled={busy} onClick={() => setVoiding({ id: s.id, reason: '' })}
                      data-tip="Undo a mistaken sale: today only, before the drawer is closed. The stock goes back; the sale stays listed as voided.">Void</RdButton>
                  )}
                </div>
                {voiding?.id === s.id && (
                  <form className="flex items-center gap-2 mt-2" onSubmit={async (e) => {
                    e.preventDefault();
                    if (await onVoid(s, voiding.reason)) setVoiding(null);
                  }}>
                    <input autoFocus value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })}
                      placeholder="Why is it voided? e.g. rang up twice" aria-label="Why is this sale voided"
                      className="flex-1 h-9 px-3 rounded-lg text-[13px] text-white outline-none" style={FIELD} />
                    <RdButton size="sm" variant="amber" type="submit" disabled={busy || !voiding.reason.trim()}>Void sale</RdButton>
                    <RdButton size="sm" variant="ghost" type="button" onClick={() => setVoiding(null)}>Keep it</RdButton>
                  </form>
                )}
              </div>
            ))}
            <p className="text-[11.5px] py-2.5" style={{ color: MUTED }}>A void puts the stock back and takes the sale out of the drawer. Only today&rsquo;s sales, before the drawer is closed.</p>
          </div>
        </RdCard>
      </div>

      {/* ── The ticket: its own box beside the shelf, so Record is always in reach ── */}
      <RdCard className="flex flex-col min-h-0 overflow-hidden" aria-label="This sale" data-ticket>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: LINE }}>
          <p className="text-[15px] font-semibold text-white flex items-center gap-2"><ShoppingCart size={17} /> This sale {count > 0 && <span className="font-normal" style={{ color: MUTED }}>— {count} {count === 1 ? 'item' : 'items'}</span>}</p>
          {lines.length > 0 && <button type="button" onClick={clear} className="text-[12.5px] flex items-center gap-1" style={{ color: MUTED }}><Trash2 size={13} /> Clear</button>}
        </div>

        <div className="rd-fit-scroll px-4 py-3 flex flex-col gap-3">
          {lines.length === 0 ? (
            <div className="py-8 text-center rounded-xl" style={{ ...FIELD, borderStyle: 'dashed' }}>
              <ShoppingCart size={26} className="mx-auto" style={{ color: 'rgba(196,181,253,0.55)' }} />
              <p className="text-[13px] mt-2" style={{ color: MUTED }}>Tap a product to start a sale.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {lines.map(({ p, qty }) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <ProductThumb p={p} size={38} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] text-white truncate">{p.name}</span>
                    <span className="block text-[11.5px] tabular-nums" style={{ color: MUTED }}>{formatCurrency(p.price)} each</span>
                  </span>
                  <span className="flex items-center rounded-lg" style={FIELD}>
                    <button type="button" aria-label={`One less ${p.name}`} onClick={() => bump(p, -1)} className="w-8 h-8 flex items-center justify-center text-white"><Minus size={13} /></button>
                    <span className="text-[13px] text-white w-6 text-center tabular-nums">{qty}</span>
                    <button type="button" aria-label={`One more ${p.name}`} onClick={() => bump(p, 1)} disabled={p.trackStock && qty >= p.stock}
                      className="w-8 h-8 flex items-center justify-center text-white disabled:opacity-30"><Plus size={13} /></button>
                  </span>
                  <span className="text-[13px] text-white w-16 text-right tabular-nums font-semibold">{formatCurrency(qty * p.price)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Who is buying: optional, and what it does is said where it is asked. */}
          <div className="rounded-xl p-3" style={FIELD}>
            <p className="text-[13px] font-semibold text-white flex items-center gap-1.5"><UserRound size={14} /> Who is buying? <span className="font-normal" style={{ color: MUTED }}>(optional)</span></p>
            {member ? (
              <div className="flex items-center gap-2 mt-2">
                {member.photoUrl ? <img src={member.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ background: 'rgba(124,58,237,0.25)', color: '#C4B5FD' }}>{member.name.slice(0, 1)}</span>}
                <span className="flex-1 min-w-0 text-[13px] text-white truncate">{member.name}</span>
                <button type="button" aria-label="Not a member sale" onClick={() => setMember(null)} style={{ color: MUTED }}><X size={15} /></button>
              </div>
            ) : (
              <div className="relative mt-2">
                <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Type a member's name or email" aria-label="Who is buying"
                  className="w-full h-10 px-3 rounded-lg text-[13px] text-white outline-none" style={{ background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.1)' }} />
                {hits.length > 0 && memberQ.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-11 z-10 rounded-lg overflow-hidden shadow-xl" style={PANEL} role="listbox">
                    {hits.map((m) => (
                      <button key={m.id} type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2 text-left px-3 py-2 hover:bg-white/5"
                        onClick={() => { setMember(m); setMemberQ(''); setHits([]); }}>
                        <span className="text-[13px] text-white">{m.name}</span>
                        {m.email && <span className="text-[11.5px] truncate" style={{ color: MUTED }}>{m.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-[11.5px] mt-2" style={{ color: MUTED }}>Links the sale to their account: it shows on their profile under Shop purchases. Leave it empty for a walk-in.</p>
          </div>
        </div>

        {/* The total and Record stay at the foot of the box, never scrolled away. */}
        <div className="px-4 py-3.5 flex flex-col gap-2.5" style={{ borderTop: LINE, background: 'rgba(255,255,255,0.015)' }}>
          <div className="flex items-baseline justify-between">
            <span className="text-[14px]" style={{ color: MUTED }}>Total</span>
            <span className="text-[28px] leading-none font-bold text-white tabular-nums">{formatCurrency(total)}</span>
          </div>
          {total > 0 && (
            <>
              <label className="block">
                <span className="block text-[12.5px] font-medium mb-1" style={{ color: MUTED }}>Cash received</span>
                <input value={cash} inputMode="decimal" onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Optional — to work out the change"
                  aria-label="Cash received" className="w-full h-10 px-3 rounded-lg text-[14px] text-white tabular-nums outline-none" style={FIELD} />
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {quickCash(total).map((n) => (
                  <button key={n} type="button" onClick={() => setCash(String(n))} className="h-8 px-2.5 rounded-lg text-[12.5px] font-semibold tabular-nums"
                    style={{ ...FIELD, color: tendered === n ? '#C4B5FD' : 'var(--color-text-secondary)', borderColor: tendered === n ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.1)' }}>
                    {n === total ? 'Exact' : formatCurrency(n)}
                  </button>
                ))}
              </div>
              {tendered !== null && (
                <div className="flex items-baseline justify-between rounded-lg px-3 py-2" style={{ background: short ? 'rgba(245,158,11,0.13)' : 'rgba(124,58,237,0.16)' }}>
                  <span className="text-[13px] font-semibold" style={{ color: short ? '#FBBF24' : '#C4B5FD' }}>{short ? 'Still owed' : 'Change'}</span>
                  <span className="text-[19px] font-bold tabular-nums" style={{ color: short ? '#FBBF24' : '#C4B5FD' }}>{formatCurrency(Math.abs(tendered - total))}</span>
                </div>
              )}
            </>
          )}
          <RdButton variant="primary" className="w-full" disabled={busy || lines.length === 0 || short} onClick={() => void record()}>
            {busy ? 'Recording…' : lines.length ? `Record cash sale · ${formatCurrency(total)}` : 'Record cash sale'}
          </RdButton>
          <p className="text-[11.5px] text-center" style={{ color: MUTED }}>Cash only. It joins today&rsquo;s drawer count under Payments.</p>
        </div>
      </RdCard>
    </div>
  );
}
