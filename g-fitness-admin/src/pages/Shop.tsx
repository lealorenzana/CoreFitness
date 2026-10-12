import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Package, ShoppingCart } from 'lucide-react';
import { RdHeader, RdCard, PageTabs } from '../components/ui/rd';
import ReceiptSheet from '../components/ReceiptSheet';
import ShopSell from '../components/shop/ShopSell';
import ShopProducts from '../components/shop/ShopProducts';
import ShopSales from '../components/shop/ShopSales';
import type { ProductForm, StockChange } from '../components/shop/shopForm';
import { saleNo, saleReceipt } from '../components/shop/saleReceipt';
import { showToast } from '../utils/toast';
import { formatCurrency } from '../utils/formatters';
import { todayKey } from '../utils/dates';
import { getGymContext } from '../lib/gymContext';
import { getGymSettings, type GymSettingsRow } from '../lib/api/settings';
import { listProducts, moveStock, recordSale, saveProduct, salesOn, voidSale, type Product, type Sale } from '../lib/api/shop';

const MUTED = 'var(--color-text-muted)';
type Tab = 'sell' | 'products' | 'sales';

/**
 * Billing → Shop (0133), a counter till. Sell: find and tap products, say who
 * is buying if they are a member (the sale then shows on their profile), take
 * the cash and see the change, print or save the receipt. Products (owner):
 * photos, prices, categories, stock moved only by deliveries and counts.
 * Sales: totals, best sellers and every sale, for any dates.
 *
 * 2026-10-12: the kit's look, and it holds the screen — each section is boxes
 * that scroll themselves; the till's Record never scrolls out of reach.
 */
export default function Shop() {
  const [tab, setTab] = useState<Tab>('sell');
  const [owner, setOwner] = useState(false);
  const [products, setProducts] = useState<Product[] | null | undefined>(null);
  const [today, setToday] = useState<Sale[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [stockFor, setStockFor] = useState<StockChange | null>(null);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
  const [receipt, setReceipt] = useState<{ sale: Sale; tendered: number | null } | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    const [p, s, ctx] = await Promise.all([listProducts(), salesOn(todayKey()), getGymContext()]);
    setProducts(p); setToday(s); setOwner(ctx?.role === 'admin');
    setRefresh((n) => n + 1);
    return s;
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => { getGymSettings().then(setGym).catch(() => setGym(null)); }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); return false; }
    finally { setBusy(false); }
  };

  if (products === null) return <div className="text-sm" style={{ color: MUTED }}>Loading the shop…</div>;
  if (products === undefined) {
    return (
      <RdCard className="p-5 flex items-start gap-3">
        <AlertTriangle size={18} style={{ color: '#FBBF24' }} />
        <p className="text-[14px] text-white">The shop is not switched on yet — migration 0133 is not live on this database.</p>
      </RdCard>
    );
  }

  const live = today.filter((s) => !s.voidedAt);
  const low = products.filter((p) => p.active && p.trackStock && p.stock <= p.lowStockAt);

  return (
    <div className="rd-fit" data-shop>
      <RdHeader
        title="Shop"
        subtitle={<>
          Counter sales today: <b className="text-white">{formatCurrency(live.reduce((s, x) => s + x.total, 0))}</b> — {live.length} {live.length === 1 ? 'sale' : 'sales'}
          {low.length > 0 && <> — <button type="button" className="underline" style={{ color: '#FBBF24' }} onClick={() => setTab('products')}>{low.length} running low</button></>}
        </>}
        actions={
          <PageTabs<Tab> label="Shop sections" value={tab} onChange={setTab} tabs={[
            { key: 'sell', label: 'Sell', icon: ShoppingCart },
            { key: 'products', label: 'Products', icon: Package, count: low.length },
            { key: 'sales', label: 'Sales', icon: BarChart3 },
          ]} />
        }
      />

      {tab === 'sell' && (
        <ShopSell products={products} today={today} owner={owner} busy={busy}
          onAddProducts={() => { setTab('products'); setForm(null); }}
          onReceipt={(sale) => setReceipt({ sale, tendered: null })}
          onVoid={(s, reason) => run(() => voidSale(s.id, reason), 'Sale voided; the stock is back')}
          onRecord={async (items, member, tendered) => {
            let id: string | null = null;
            const ok = await run(async () => { id = await recordSale(items, member?.id ?? null); }, 'Cash sale recorded');
            if (ok && id) {
              // The receipt is the sale as the database recorded it — its prices, not the till's.
              const fresh = (await salesOn(todayKey())).find((s) => s.id === id);
              if (fresh) setReceipt({ sale: fresh, tendered });
            }
            return ok;
          }} />
      )}

      {tab === 'products' && (
        <ShopProducts products={products} owner={owner} busy={busy} form={form} setForm={setForm} stockFor={stockFor} setStockFor={setStockFor}
          onSave={(f) => void run(async () => {
            const id = await saveProduct({ id: f.id, name: f.name, category: f.category.trim() || 'Other', description: f.description.trim() || null,
              price: Number(f.price), photoUrl: f.photoUrl, trackStock: f.trackStock, lowStockAt: Number(f.lowStockAt || 0),
              shownInApp: f.shownInApp, active: true });
            // A new product's opening stock is its first delivery, so it has a record like every other change.
            if (!f.id && f.trackStock && Number(f.opening) > 0) await moveStock(id, 'delivery', Number(f.opening), 'Opening stock');
            setForm(null);
          }, f.id ? 'Product saved' : 'Product added')}
          onStock={(s) => void run(async () => { await moveStock(s.p.id, s.reason, Number(s.qty), s.note); setStockFor(null); }, 'Stock recorded')}
          onToggle={(p) => void run(() => saveProduct({ ...p, active: !p.active }), p.active ? `${p.name} retired — past sales keep it` : `${p.name} is back on sale`)} />
      )}

      {tab === 'sales' && <ShopSales refresh={refresh} onReceipt={(sale) => setReceipt({ sale, tendered: null })} />}

      {receipt && (
        <ReceiptSheet doc={saleReceipt(receipt.sale, gym, receipt.tendered)} filename={`Receipt-${saleNo(receipt.sale.id)}`} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
