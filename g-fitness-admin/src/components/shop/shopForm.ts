import type { Product } from '../../lib/api/shop';

export interface ProductForm {
  id: string | null; name: string; category: string; description: string; price: string; photoUrl: string | null;
  trackStock: boolean; lowStockAt: string; shownInApp: boolean; opening: string; stock: number;
}
export const blankProduct: ProductForm = { id: null, name: '', category: 'Drinks', description: '', price: '', photoUrl: null, trackStock: true, lowStockAt: '5', shownInApp: true, opening: '', stock: 0 };
export type StockChange = { p: Product; reason: 'delivery' | 'count' | 'damage'; qty: string; note: string };
