import { supabase } from '../supabaseClient';

/**
 * The shop (0133): the counter's drinks, supplements and merch. The owner adds
 * products, sets prices and records stock; the desk rings up sales and voids
 * one the same day, before the drawer is closed. Every rule — who may do what,
 * the price charged, "not enough on the shelf", stock following its moves, the
 * drawer counting cash sales — is SQL's; this module asks.
 */

export interface Product {
  id: string; name: string; category: string; description: string | null; price: number;
  photoUrl: string | null; trackStock: boolean; stock: number; lowStockAt: number;
  shownInApp: boolean; active: boolean;
}
export interface Sale {
  id: string; saleDay: string; total: number; memberName: string | null; soldByName: string | null;
  createdAt: string; voidedAt: string | null; voidReason: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
}
export interface ReportRow { productId: string; name: string; qty: number; revenue: number }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** undefined = 0133 not live yet. */
export async function listProducts(): Promise<Product[] | undefined> {
  const { data, error } = await supabase.from('shop_products')
    .select('id, name, category, description, price, photo_url, track_stock, stock, low_stock_at, shown_in_app, active')
    .order('category').order('name');
  if (error) return undefined;
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string, name: p.name as string, category: p.category as string, description: p.description as string | null,
    price: Number(p.price), photoUrl: p.photo_url as string | null, trackStock: !!p.track_stock, stock: Number(p.stock),
    lowStockAt: Number(p.low_stock_at), shownInApp: !!p.shown_in_app, active: !!p.active,
  }));
}

export async function saveProduct(p: Omit<Product, 'id' | 'stock'> & { id: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('save_product', {
    p_id: p.id, p_name: p.name.trim(), p_category: p.category.trim(), p_price: p.price, p_description: p.description,
    p_photo_url: p.photoUrl, p_track_stock: p.trackStock, p_low_stock_at: p.lowStockAt,
    p_shown_in_app: p.shownInApp, p_active: p.active,
  });
  if (error) throw new Error(/shop_products_name|duplicate/i.test(error.message) ? 'You already sell something with that name.' : clean(error.message));
  return data as string;
}

export async function moveStock(productId: string, reason: 'delivery' | 'count' | 'damage', qty: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('move_stock', { p_product: productId, p_reason: reason, p_qty: qty, p_note: note.trim() || null });
  if (error) throw new Error(clean(error.message));
  return Number(data);
}

export async function recordSale(items: { productId: string; qty: number }[], memberId: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('record_sale', {
    p_items: items.map((i) => ({ product_id: i.productId, qty: i.qty })), p_member: memberId,
  });
  if (error) throw new Error(clean(error.message));
  return data as string;
}

export async function voidSale(saleId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_sale', { p_sale: saleId, p_reason: reason.trim() });
  if (error) throw new Error(clean(error.message));
}

const SALE_COLUMNS = 'id, sale_day, total, created_at, voided_at, void_reason, member:profiles!shop_sales_member_id_fkey(first_name, last_name), seller:profiles!shop_sales_sold_by_fkey(first_name, last_name), shop_sale_items(qty, unit_price, shop_products(name))';

export async function salesOn(day: string): Promise<Sale[]> {
  return salesBetween(day, day);
}

/** Every sale between two Manila days, newest first; voided ones included and marked. */
export async function salesBetween(from: string, to: string): Promise<Sale[]> {
  const { data, error } = await supabase.from('shop_sales').select(SALE_COLUMNS)
    .gte('sale_day', from).lte('sale_day', to).order('created_at', { ascending: false });
  if (error) return [];
  return toSales(data);
}

/** What one member bought at the counter — the "who is buying" link, read back (front desk only, 0133). */
export async function memberPurchases(memberId: string): Promise<Sale[] | null> {
  const { data, error } = await supabase.from('shop_sales').select(SALE_COLUMNS)
    .eq('member_id', memberId).order('created_at', { ascending: false }).limit(50);
  if (error) return null;
  return toSales(data);
}

function toSales(data: unknown): Sale[] {
  const nm = (p: unknown) => {
    const x = p as { first_name?: string; last_name?: string } | null;
    return x ? `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim() || null : null;
  };
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: s.id as string, saleDay: s.sale_day as string, total: Number(s.total), memberName: nm(s.member), soldByName: nm(s.seller),
    createdAt: s.created_at as string, voidedAt: s.voided_at as string | null, voidReason: s.void_reason as string | null,
    items: ((s.shop_sale_items as { qty: number; unit_price: number; shop_products: { name: string } | null }[]) ?? [])
      .map((i) => ({ name: i.shop_products?.name ?? '—', qty: i.qty, unitPrice: Number(i.unit_price) })),
  }));
}

export async function shopReport(from: string, to: string): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('shop_report', { p_from: from, p_to: to });
  if (error) return [];
  return ((data ?? []) as { product_id: string; name: string; qty: number; revenue: number }[])
    .map((r) => ({ productId: r.product_id, name: r.name, qty: r.qty, revenue: Number(r.revenue) }));
}

export interface MemberHit { id: string; name: string; email: string | null; photoUrl: string | null }

/** Members matching a name or email, for "who is buying?" (optional). Archived accounts are left out. */
export async function findMembers(q: string): Promise<MemberHit[]> {
  if (q.trim().length < 2) return [];
  const safe = q.trim().replace(/[,()%]/g, ' ').replace(/\s+/g, ' ');
  const [first, ...rest] = safe.split(' ');
  // "Ana Reyes" is a first and a last name, so a full name typed in finds them too.
  const filter = rest.length
    ? `and(first_name.ilike.%${first}%,last_name.ilike.%${rest.join(' ')}%)`
    : `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`;
  const { data } = await supabase.from('gym_people').select('id, first_name, last_name, email, photo_url').eq('role', 'member')
    .neq('status', 'archived')
    .or(filter).limit(6);
  return ((data ?? []) as { id: string; first_name: string; last_name: string; email: string | null; photo_url: string | null }[])
    .map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`.trim(), email: m.email, photoUrl: m.photo_url }));
}
