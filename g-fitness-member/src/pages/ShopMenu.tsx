import { useEffect, useState } from 'react';
import { Storefront } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, Panel, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { supabase } from '../lib/supabaseClient';

interface Item { id: string; name: string; category: string; description: string | null; price: number; photoUrl: string | null; availability: 'in_stock' | 'low' | 'sold_out' }
const AVAIL = {
  in_stock: null,
  low: { label: 'Only a few left', tone: 'action' as const },
  sold_out: { label: 'Sold out', tone: 'muted' as const },
};
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0 })}`;

/**
 * The gym's counter, as a menu (0133): what is sold, what it costs, and whether
 * it is in — never a stock count. Nothing is ordered here: the gym is cash-only,
 * so members pay at the front desk. The owner decides what shows.
 */
export default function ShopMenu() {
  const [items, setItems] = useState<Item[] | null | undefined>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('shop_catalog');
      if (!alive) return;
      setItems(error ? undefined : ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, name: r.name as string, category: r.category as string, description: r.description as string | null,
        price: Number(r.price), photoUrl: r.photo_url as string | null, availability: r.availability as Item['availability'],
      })));
    })();
    return () => { alive = false; };
  }, []);

  if (items === null) return <Page><PageTitle back title="Shop" /><SkeletonList /></Page>;
  if (items === undefined) {
    return <Page><PageTitle back title="Shop" /><p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>The shop is not switched on at your gym yet.</p></Page>;
  }
  const cats = [...new Set(items.map((i) => i.category))];

  return (
    <Page>
      <PageTitle back title="Shop" subtitle="Pay at the front desk — cash" />
      {items.length === 0 && (
        <Panel>
          <p className="flex items-center" style={{ gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <Storefront size={20} aria-hidden /> Nothing listed yet
          </p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>Ask at the front desk what they have today.</p>
        </Panel>
      )}
      {cats.map((c) => {
        const list = items.filter((i) => i.category === c);
        return (
          <section key={c}>
            <SectionHead title={c} />
            {list.map((i, k) => {
              const a = AVAIL[i.availability];
              return (
                <LineRow key={i.id} title={i.name} last={k === list.length - 1} dim={i.availability === 'sold_out'}
                  // The product's own photo (2026-10-10: it was saved by the owner
                  // and never shown here); a quiet tile when there is none.
                  gutterWidth={64}
                  gutter={i.photoUrl
                    ? <img src={i.photoUrl} alt="" loading="lazy" data-product-photo
                        style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', display: 'block' }} />
                    : <span aria-hidden className="grid place-items-center"
                        style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(233,233,237,0.05)', color: 'var(--color-text-muted)' }}>
                        <Storefront size={20} />
                      </span>}
                  meta={`${peso(i.price)}${i.description ? ` · ${i.description}` : ''}`}
                  action={a ? <StatusPill label={a.label} tone={a.tone} /> : undefined} />
              );
            })}
          </section>
        );
      })}
    </Page>
  );
}
