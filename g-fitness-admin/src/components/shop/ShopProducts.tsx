import { useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, PackagePlus, Pencil, Plus, Archive, ArchiveRestore, Truck, ClipboardCheck, Package } from 'lucide-react';
import Modal from '../ui/Modal';
import PhotoPicker from '../ui/PhotoPicker';
import { RdCard, RdButton, SearchField, FilterChips, EmptyBlock, DotMenu, Pill } from '../ui/rd';
import { RD_INPUT, RD_INPUT_STYLE } from '../ui/rdTokens';
import { formatCurrency } from '../../utils/formatters';
import type { Product } from '../../lib/api/shop';
import { ProductArt } from './ShopSell';
import { blankProduct, type ProductForm, type StockChange } from './shopForm';

const MUTED = 'var(--color-text-muted)';
const SECOND = 'var(--color-text-secondary)';
const LINE = '1px solid rgba(255,255,255,0.06)';
const STARTER_CATEGORIES = ['Drinks', 'Supplements', 'Snacks', 'Merch', 'Rentals', 'Other'];

interface Props {
  products: Product[];
  owner: boolean;
  busy: boolean;
  form: ProductForm | null;
  setForm: (f: ProductForm | null) => void;
  stockFor: StockChange | null;
  setStockFor: (s: StockChange | null) => void;
  onSave: (f: ProductForm) => void;
  onStock: (s: StockChange) => void;
  onToggle: (p: Product) => void;
}

type Show = 'selling' | 'low' | 'retired';

/**
 * Billing → Shop → Products: what the gym sells, with a photo the till and the
 * members' menu both show, its price, its category, and its stock — which only
 * moves through Delivery, Count and Damaged (0133's stock_moves), never by
 * typing a new number over the old one.
 *
 * 2026-10-12: a grid of photo cards in a box that scrolls itself; adding or
 * editing opens a form whose first field is the photo (drop or pick).
 */
export default function ShopProducts({ products, owner, busy, form, setForm, stockFor, setStockFor, onSave, onStock, onToggle }: Props) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('selling');
  const [uploading, setUploading] = useState(false);

  const categories = useMemo(() => Array.from(new Set([...STARTER_CATEGORIES, ...products.map((p) => p.category)])), [products]);
  const low = products.filter((p) => p.active && p.trackStock && p.stock <= p.lowStockAt);
  const list = products.filter((p) => (show === 'retired' ? !p.active : show === 'low' ? low.includes(p) : p.active)
    && (!q.trim() || `${p.name} ${p.category}`.toLowerCase().includes(q.trim().toLowerCase())));
  const edit = (p: Product) => setForm({ id: p.id, name: p.name, category: p.category, description: p.description ?? '', price: String(p.price),
    photoUrl: p.photoUrl, trackStock: p.trackStock, lowStockAt: String(p.lowStockAt), shownInApp: p.shownInApp, opening: '', stock: p.stock });
  const withPhoto = products.filter((p) => p.active && p.photoUrl).length;
  const selling = products.filter((p) => p.active).length;

  return (
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-products>
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
        <div className="flex-1 min-w-[220px] max-w-[340px]"><SearchField value={q} onChange={setQ} placeholder="Find a product" label="Find a product" /></div>
        <FilterChips<Show> compact value={show} onChange={setShow} items={[
          { key: 'selling', label: 'On sale', count: selling },
          { key: 'low', label: 'Low stock', count: low.length, tone: low.length ? 'amber' : undefined },
          { key: 'retired', label: 'Retired', count: products.filter((p) => !p.active).length },
        ]} />
        <span className="flex-1" />
        {owner && <RdButton variant="primary" icon={Plus} onClick={() => setForm({ ...blankProduct })}>Add product</RdButton>}
      </div>

      {low.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: LINE, background: 'rgba(245,158,11,0.08)' }}>
          <AlertTriangle size={16} className="flex-none" style={{ color: '#FBBF24' }} />
          <p className="flex-1 min-w-0 text-[13px] truncate">
            <b className="text-white">{low.length} running low</b>
            <span style={{ color: SECOND }}> — {low.map((p) => `${p.name} (${p.stock === 0 ? 'sold out' : `${p.stock} left`})`).join(', ')}</span>
          </p>
          {owner && show !== 'low' && <RdButton size="sm" variant="amber" onClick={() => setShow('low')}>See them</RdButton>}
        </div>
      )}
      {!owner && <p className="text-[12.5px] px-4 pt-2.5" style={{ color: MUTED }}>Only the owner changes products, prices and stock.</p>}
      {owner && selling > 0 && withPhoto < selling && (
        <p className="text-[12.5px] px-4 pt-2.5" style={{ color: MUTED }}>
          {selling - withPhoto} of {selling} on sale {selling - withPhoto === 1 ? 'has' : 'have'} no photo yet — a photo helps the desk find it fast and members see what they are getting. Edit a product to add one.
        </p>
      )}

      <div className="rd-fit-scroll p-4">
        {list.length === 0 ? (
          products.length === 0
            ? <EmptyBlock icon={PackagePlus} title="No products yet" body="Add what you sell at the counter — drinks, supplements, towel rental — each with a photo and a price."
                action={owner ? <RdButton variant="primary" icon={Plus} onClick={() => setForm({ ...blankProduct })}>Add the first product</RdButton> : undefined} />
            : <EmptyBlock compact icon={Package} title={show === 'low' ? 'Nothing is running low' : show === 'retired' ? 'Nothing retired' : 'No product matches'} />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {list.map((p) => {
              const isLow = p.trackStock && p.stock <= p.lowStockAt;
              return (
                <RdCard key={p.id} className="overflow-hidden flex flex-col" style={{ opacity: p.active ? 1 : 0.6 }} data-product-card={p.name}>
                  <div className="relative" style={{ aspectRatio: '4 / 3' }}>
                    <ProductArt p={p} />
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
                      {!p.shownInApp && <span className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 text-white" style={{ background: 'rgba(0,0,0,0.6)' }}><EyeOff size={12} /> hidden from the app</span>}
                      {isLow && p.active && <span className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center" style={{ background: 'rgba(245,158,11,0.92)', color: '#1A1205' }}>Running low</span>}
                    </div>
                    {owner && (
                      <div className="absolute top-2 right-2">
                        <DotMenu label={`More for ${p.name}`} items={[
                          { label: 'Edit', icon: Pencil, onClick: () => edit(p) },
                          { label: 'Delivery arrived', icon: Truck, onClick: () => setStockFor({ p, reason: 'delivery', qty: '', note: '' }), hidden: !p.trackStock || !p.active },
                          { label: 'Count the shelf', icon: ClipboardCheck, onClick: () => setStockFor({ p, reason: 'count', qty: String(p.stock), note: '' }), hidden: !p.trackStock || !p.active },
                          { label: p.active ? 'Retire' : 'Restore', icon: p.active ? Archive : ArchiveRestore, onClick: () => onToggle(p), tone: p.active ? 'warn' : undefined, disabled: busy },
                        ]} />
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15.5px] font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[12.5px] truncate" style={{ color: MUTED }}>{p.category}{p.description ? ` — ${p.description}` : ''}</p>
                      </div>
                      <span className="text-[17px] font-bold tabular-nums" style={{ color: '#FBBF24' }}>{formatCurrency(p.price)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={isLow && p.active ? 'amber' : 'gray'}>
                        <span data-tip={p.trackStock ? 'How many the database says you have, after every sale and stock change' : 'Stock is not counted for this one'}>
                          {p.trackStock ? `${p.stock} in stock` : 'not counted'}
                        </span>
                      </Pill>
                      {isLow && p.active && <span className="text-[12px]" style={{ color: '#FBBF24' }}>warns at {p.lowStockAt}</span>}
                      {!p.active && <span className="text-[12px]" style={{ color: MUTED }}>retired — past sales keep it</span>}
                    </div>
                    {owner && (
                      <div className="mt-auto pt-2.5 flex gap-1.5 flex-wrap" style={{ borderTop: LINE }}>
                        {p.trackStock && p.active && (<>
                          <RdButton size="sm" variant="ghost" icon={Truck} data-tip="Stock arrived: adds to what you have" onClick={() => setStockFor({ p, reason: 'delivery', qty: '', note: '' })}>Delivery</RdButton>
                          <RdButton size="sm" variant="ghost" icon={ClipboardCheck} data-tip="You counted the shelf: sets the number to what is really there, and records the difference" onClick={() => setStockFor({ p, reason: 'count', qty: String(p.stock), note: '' })}>Count</RdButton>
                        </>)}
                        <RdButton size="sm" variant="ghost" icon={Pencil} onClick={() => edit(p)} className="ml-auto">Edit</RdButton>
                      </div>
                    )}
                  </div>
                </RdCard>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add or edit — every box is labelled: an owner typed their stock into an unlabelled box and saw 0 in stock ── */}
      <Modal isOpen={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.id ? `Edit ${form.name || 'product'}` : 'Add a product'}
        subtitle="The till and the members' menu both show the photo, name and price."
        footer={form ? (
          <>
            <RdButton variant="ghost" onClick={() => setForm(null)}>Cancel</RdButton>
            <RdButton variant="primary" disabled={busy || uploading || !form.name.trim() || form.price === ''} onClick={() => onSave(form)}>{form.id ? 'Save' : 'Add'}</RdButton>
          </>
        ) : undefined}>
        {form && (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.3fr)' }}>
            <PhotoPicker value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} onBusy={setUploading} aspect="1 / 1" label="Product photo" />
            <div className="space-y-3">
              <Labelled label="Name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Whey scoop" aria-label="Product name" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </Labelled>
              <div className="grid grid-cols-2 gap-3">
                <Labelled label="Price (₱)" tip="What the desk charges and members see. The database keeps the price — the till cannot type a different one.">
                  <input value={form.price} inputMode="decimal" onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
                    placeholder="e.g. 100" aria-label="Price" className={RD_INPUT} style={RD_INPUT_STYLE} />
                </Labelled>
                <Labelled label="Category" tip="Groups the menu in the members' app and the till, e.g. Drinks, Supplements, Rentals.">
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Drinks" aria-label="Category"
                    list="shop-categories" className={RD_INPUT} style={RD_INPUT_STYLE} />
                  <datalist id="shop-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </Labelled>
              </div>
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Quick picks">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, category: c })} className="h-7 px-2.5 rounded-full text-[12px] font-semibold"
                    style={form.category === c ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                      : { color: MUTED, border: '1px solid rgba(255,255,255,0.1)' }}>{c}</button>
                ))}
              </div>
              <Labelled label="Description (optional)">
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What members see under the name — flavour, size"
                  aria-label="Description" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </Labelled>
              {form.trackStock && (
                <div className="grid grid-cols-2 gap-3">
                  {form.id ? (
                    <Labelled label="In stock now" tip="Changes only through sales, Delivery and Count — never typed over, so every change has a reason.">
                      <p className="h-11 flex items-center text-[13.5px] text-white">{form.stock} — change it with Delivery or Count</p>
                    </Labelled>
                  ) : (
                    <Labelled label="How many you have now" tip="Your opening count. After this, stock moves only with sales, deliveries and shelf counts.">
                      <input value={form.opening} inputMode="numeric" onChange={(e) => setForm({ ...form, opening: e.target.value.replace(/\D/g, '') })}
                        placeholder="e.g. 24" aria-label="How many you have now" className={RD_INPUT} style={RD_INPUT_STYLE} />
                    </Labelled>
                  )}
                  <Labelled label="Warn me when down to" tip="At or below this number the product is marked Running low here, and members see “Only a few left”.">
                    <input value={form.lowStockAt} inputMode="numeric" onChange={(e) => setForm({ ...form, lowStockAt: e.target.value.replace(/\D/g, '') })}
                      aria-label="Warn me when down to" className={RD_INPUT} style={RD_INPUT_STYLE} />
                  </Labelled>
                </div>
              )}
              <div className="flex flex-col gap-2 text-[13.5px] text-white pt-1">
                <label className="flex items-center gap-2" data-tip="Off for things you never run out of — towel rental, locker for the day."><input type="checkbox" className="accent-violet-500" checked={form.trackStock} onChange={(e) => setForm({ ...form, trackStock: e.target.checked })} /> Count stock <span style={{ color: MUTED }}>(untick for services like towel rental)</span></label>
                <label className="flex items-center gap-2" data-tip="Members see the name, photo, price and whether it is available — never how many you have."><input type="checkbox" className="accent-violet-500" checked={form.shownInApp} onChange={(e) => setForm({ ...form, shownInApp: e.target.checked })} /> Show in members&rsquo; app</label>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── A stock change, with its reason ── */}
      <Modal isOpen={!!stockFor} onClose={() => setStockFor(null)} size="md"
        title={stockFor ? `${stockFor.p.name} — ${stockFor.p.stock} on the shelf` : ''}
        subtitle="Stock never changes without a reason: a delivery, a shelf count, or damage."
        footer={stockFor ? (
          <>
            <RdButton variant="ghost" onClick={() => setStockFor(null)}>Cancel</RdButton>
            <RdButton variant="primary" disabled={busy || stockFor.qty === ''} onClick={() => onStock(stockFor)}>Save</RdButton>
          </>
        ) : undefined}>
        {stockFor && (
          <div className="space-y-3.5">
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Stock change">
              {([['delivery', 'Delivery arrived (+)'], ['count', 'Shelf count (set to)'], ['damage', 'Damaged / expired (−)']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setStockFor({ ...stockFor, reason: k, qty: k === 'count' ? String(stockFor.p.stock) : '' })}
                  aria-pressed={stockFor.reason === k} className="h-9 px-3.5 rounded-xl text-[13px] font-semibold"
                  style={stockFor.reason === k ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                    : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>{label}</button>
              ))}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: '140px minmax(0, 1fr)' }}>
              <input value={stockFor.qty} inputMode="numeric" aria-label="Quantity" onChange={(e) => setStockFor({ ...stockFor, qty: e.target.value.replace(/\D/g, '') })}
                placeholder={stockFor.reason === 'count' ? 'Counted' : 'How many'} className={`${RD_INPUT} tabular-nums`} style={RD_INPUT_STYLE} />
              <input value={stockFor.note} aria-label="Note" placeholder={stockFor.reason === 'delivery' ? 'Supplier (optional)' : 'Why'}
                onChange={(e) => setStockFor({ ...stockFor, note: e.target.value })} className={RD_INPUT} style={RD_INPUT_STYLE} />
            </div>
            {stockFor.qty !== '' && (
              <p className="text-[13.5px]" style={{ color: SECOND }}>
                After this: <b className="text-white tabular-nums">{stockFor.reason === 'delivery' ? stockFor.p.stock + Number(stockFor.qty) : stockFor.reason === 'count' ? Number(stockFor.qty) : Math.max(0, stockFor.p.stock - Number(stockFor.qty))}</b> on the shelf
              </p>
            )}
          </div>
        )}
      </Modal>
    </RdCard>
  );
}

function Labelled({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>
        {label}
        {tip && <span data-tip={tip} aria-hidden className="inline-grid place-items-center w-4 h-4 rounded-full text-[10px] cursor-help"
          style={{ border: `1px solid ${MUTED}`, color: MUTED }}>?</span>}
      </span>
      {children}
    </label>
  );
}
