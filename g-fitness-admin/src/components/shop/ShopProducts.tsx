import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, EyeOff, Plus, Search, X } from 'lucide-react';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/formatters';
import { uploadContentPhoto } from '../../lib/api/exerciseMedia';
import type { Product } from '../../lib/api/shop';
import { ProductThumb } from './ShopSell';
import { blankProduct, type ProductForm, type StockChange } from './shopForm';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const PANEL = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };
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

/**
 * Billing → Shop → Products: what the gym sells, with a photo the till and the
 * members' menu both show, its price, its category, and its stock — which only
 * moves through Delivery, Count and Damaged (0133's stock_moves), never by
 * typing a new number over the old one.
 */
export default function ShopProducts({ products, owner, busy, form, setForm, stockFor, setStockFor, onSave, onStock, onToggle }: Props) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'selling' | 'low' | 'retired'>('selling');
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => Array.from(new Set([...STARTER_CATEGORIES, ...products.map((p) => p.category)])), [products]);
  const low = products.filter((p) => p.active && p.trackStock && p.stock <= p.lowStockAt);
  const list = products.filter((p) => (show === 'retired' ? !p.active : show === 'low' ? low.includes(p) : p.active)
    && (!q.trim() || `${p.name} ${p.category}`.toLowerCase().includes(q.trim().toLowerCase())));

  const pickPhoto = async (f: File | undefined) => {
    if (!f || !form) return;
    setUploading(true); setPhotoError(null);
    try { setForm({ ...form, photoUrl: await uploadContentPhoto(f) }); }
    catch (e) { setPhotoError(e instanceof Error ? e.message : 'The photo could not be added.'); }
    finally { setUploading(false); if (file.current) file.current.value = ''; }
  };

  return (
    <div className="space-y-3">
      {low.length > 0 && (
        <div className="rounded-2xl p-3 flex items-start gap-3" style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{low.length} running low</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {low.map((p) => `${p.name} (${p.stock === 0 ? 'sold out' : `${p.stock} left`})`).join(' · ')}
            </p>
          </div>
          {owner && <Button size="sm" variant="secondary" onClick={() => setShow('low')}>See them</Button>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MUTED }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product"
            className="w-full h-9 pl-9 pr-3 rounded-lg text-xs text-white" style={FIELD} />
        </div>
        {(['selling', 'low', 'retired'] as const).map((k) => {
          const n = k === 'selling' ? products.filter((p) => p.active).length : k === 'low' ? low.length : products.filter((p) => !p.active).length;
          return (
            <button key={k} type="button" onClick={() => setShow(k)} aria-pressed={show === k} className="h-9 px-3 rounded-lg text-xs font-semibold"
              style={{ background: show === k ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: show === k ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                border: `1px solid ${show === k ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
              {k === 'selling' ? 'On sale' : k === 'low' ? 'Low stock' : 'Retired'} <span style={{ opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
        {owner && <Button variant="secondary" onClick={() => setForm({ ...blankProduct })}><Plus size={14} /> Add product</Button>}
      </div>
      {!owner && <p className="text-xs" style={{ color: MUTED }}>Only the owner changes products, prices and stock.</p>}

      {form && (
        // Every box is labelled: an owner typed their stock into an unlabelled box and saw 0 in stock.
        <div className="rounded-2xl p-4 space-y-4" style={{ ...PANEL, borderColor: 'var(--color-primary)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{form.id ? `Edit ${form.name || 'product'}` : 'Add a product'}</p>
            <button type="button" aria-label="Close" onClick={() => setForm(null)} style={{ color: MUTED }}><X size={16} /></button>
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)]">
            <div>
              <button type="button" onClick={() => file.current?.click()} disabled={uploading}
                className="w-[120px] h-[120px] rounded-2xl flex flex-col items-center justify-center gap-1 overflow-hidden"
                style={{ ...FIELD, borderStyle: form.photoUrl ? 'solid' : 'dashed' }} aria-label={form.photoUrl ? 'Change the photo' : 'Add a photo'}>
                {form.photoUrl ? <img src={form.photoUrl} alt="" className="w-full h-full object-cover" /> : (
                  <><Camera size={20} style={{ color: MUTED }} /><span className="text-[11px]" style={{ color: MUTED }}>{uploading ? 'Adding…' : 'Add a photo'}</span></>
                )}
              </button>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              {form.photoUrl && <button type="button" className="text-[11px] mt-1" style={{ color: MUTED }} onClick={() => setForm({ ...form, photoUrl: null })}>Remove photo</button>}
              {photoError && <p className="text-[11px] mt-1" style={{ color: 'var(--color-secondary)' }}>{photoError}</p>}
            </div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Labelled label="Name" span={2}>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Whey scoop" aria-label="Product name"
                  className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              </Labelled>
              <Labelled label="Price (₱)">
                <input value={form.price} inputMode="decimal" onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="e.g. 100" aria-label="Price" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              </Labelled>
              <Labelled label="Category">
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Drinks" aria-label="Category"
                  list="shop-categories" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
                <datalist id="shop-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Labelled>
              <div className="col-span-2 lg:col-span-4 flex gap-1.5 flex-wrap -mt-1" role="group" aria-label="Quick picks">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, category: c })} className="h-7 px-2.5 rounded-full text-[11px] font-semibold"
                    style={{ background: form.category === c ? 'var(--color-primary-light)' : 'transparent', color: form.category === c ? 'var(--color-primary)' : MUTED,
                      border: `1px solid ${form.category === c ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{c}</button>
                ))}
              </div>
              <Labelled label="Description (optional)" span={4}>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What members see under the name — flavour, size"
                  aria-label="Description" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
              </Labelled>
              {form.trackStock && (form.id ? (
                <Labelled label="In stock now" span={2}>
                  <p className="h-9 flex items-center text-xs text-white">{form.stock} — change it with Delivery or Count</p>
                </Labelled>
              ) : (
                <Labelled label="How many you have now" span={2}>
                  <input value={form.opening} inputMode="numeric" onChange={(e) => setForm({ ...form, opening: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 24" aria-label="How many you have now" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
                </Labelled>
              ))}
              {form.trackStock && (
                <Labelled label="Warn me when down to" span={2}>
                  <input value={form.lowStockAt} inputMode="numeric" onChange={(e) => setForm({ ...form, lowStockAt: e.target.value.replace(/\D/g, '') })}
                    aria-label="Warn me when down to" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
                </Labelled>
              )}
              <div className="col-span-2 lg:col-span-4 flex flex-wrap gap-4 text-xs text-white">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.trackStock} onChange={(e) => setForm({ ...form, trackStock: e.target.checked })} /> Count stock <span style={{ color: MUTED }}>(untick for services like towel rental)</span></label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.shownInApp} onChange={(e) => setForm({ ...form, shownInApp: e.target.checked })} /> Show in members' app</label>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || uploading || !form.name.trim() || form.price === ''} onClick={() => onSave(form)}>{form.id ? 'Save' : 'Add'}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {stockFor && (
        <div className="rounded-2xl p-4 space-y-3" style={{ ...PANEL, borderColor: 'var(--color-primary)' }}>
          <p className="text-sm font-semibold text-white">{stockFor.p.name} · {stockFor.p.stock} on the shelf</p>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Stock change">
            {([['delivery', 'Delivery arrived (+)'], ['count', 'Shelf count (set to)'], ['damage', 'Damaged / expired (−)']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setStockFor({ ...stockFor, reason: k, qty: k === 'count' ? String(stockFor.p.stock) : '' })}
                aria-pressed={stockFor.reason === k} className="h-8 px-3 rounded-lg text-xs font-semibold"
                style={{ background: stockFor.reason === k ? 'var(--color-primary-light)' : 'var(--color-surface-high)', color: stockFor.reason === k ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  border: `1px solid ${stockFor.reason === k ? 'var(--color-primary)' : 'var(--color-border)'}` }}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={stockFor.qty} inputMode="numeric" aria-label="Quantity" onChange={(e) => setStockFor({ ...stockFor, qty: e.target.value.replace(/\D/g, '') })}
              placeholder={stockFor.reason === 'count' ? 'Counted' : 'How many'} className="h-9 w-28 px-3 rounded-lg text-sm text-white tabular-nums" style={FIELD} />
            <input value={stockFor.note} aria-label="Note" placeholder={stockFor.reason === 'delivery' ? 'Supplier (optional)' : 'Why'}
              onChange={(e) => setStockFor({ ...stockFor, note: e.target.value })} className="h-9 flex-1 min-w-[160px] px-3 rounded-lg text-xs text-white" style={FIELD} />
            {stockFor.qty !== '' && (
              <span className="text-xs" style={{ color: MUTED }}>
                → {stockFor.reason === 'delivery' ? stockFor.p.stock + Number(stockFor.qty) : stockFor.reason === 'count' ? Number(stockFor.qty) : Math.max(0, stockFor.p.stock - Number(stockFor.qty))} on the shelf
              </span>
            )}
            <Button size="sm" variant="secondary" disabled={busy || stockFor.qty === ''} onClick={() => onStock(stockFor)}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setStockFor(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-xs py-8 text-center rounded-2xl" style={{ ...PANEL, color: MUTED }}>
          {products.length === 0 ? 'No products yet.' : show === 'low' ? 'Nothing is running low.' : show === 'retired' ? 'Nothing retired.' : 'No product matches.'}
        </p>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {list.map((p) => {
            const isLow = p.trackStock && p.stock <= p.lowStockAt;
            return (
              <div key={p.id} className="rounded-2xl p-3 flex flex-col gap-3" style={{ ...PANEL, opacity: p.active ? 1 : 0.6 }}>
                <div className="flex items-start gap-3">
                  <ProductThumb p={p} size={52} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{p.category}{p.description ? ` · ${p.description}` : ''}</p>
                    <p className="text-base font-bold mt-0.5 tabular-nums" style={{ color: 'var(--color-secondary)' }}>{formatCurrency(p.price)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums" style={{ color: isLow ? 'var(--color-secondary)' : 'var(--color-text)' }}>
                      {p.trackStock ? p.stock : '—'}
                    </p>
                    <p className="text-[11px]" style={{ color: MUTED }}>{p.trackStock ? 'in stock' : 'not counted'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]" style={{ color: MUTED }}>
                  {!p.shownInApp && <span className="flex items-center gap-1"><EyeOff size={11} /> hidden from the app</span>}
                  {!p.active && <span>retired — past sales keep it</span>}
                  {isLow && p.active && <span style={{ color: 'var(--color-secondary)' }}>running low (warns at {p.lowStockAt})</span>}
                </div>
                {owner && (
                  <div className="flex gap-1 flex-wrap">
                    {p.trackStock && p.active && (<>
                      <Button size="sm" variant="ghost" onClick={() => setStockFor({ p, reason: 'delivery', qty: '', note: '' })}>Delivery</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStockFor({ p, reason: 'count', qty: String(p.stock), note: '' })}>Count</Button>
                    </>)}
                    <Button size="sm" variant="ghost" onClick={() => setForm({ id: p.id, name: p.name, category: p.category, description: p.description ?? '', price: String(p.price),
                      photoUrl: p.photoUrl, trackStock: p.trackStock, lowStockAt: String(p.lowStockAt), shownInApp: p.shownInApp, opening: '', stock: p.stock })}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onToggle(p)}>{p.active ? 'Retire' : 'Restore'}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Labelled({ label, span = 1, children }: { label: string; span?: 1 | 2 | 4; children: React.ReactNode }) {
  // Literal classes only: Tailwind emits CSS for names it can read in the source.
  const cls = span === 4 ? 'col-span-2 lg:col-span-4' : span === 2 ? 'col-span-2' : 'col-span-1';
  return (
    <label className={`block ${cls}`}>
      <span className="block text-[11px] font-semibold uppercase mb-1" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}
