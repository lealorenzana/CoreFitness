import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, CaretRight, Storefront } from '@phosphor-icons/react';
import { getBalance } from '../../lib/api/points';
import { getCurrentMemberId } from '../../services/bookingService';
import { useLiveData } from '../../hooks/useLiveData';
import { supabase } from '../../lib/supabaseClient';

export function TodayPoints() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const load = useCallback(async () => {
    try { const id = await getCurrentMemberId(); setBalance(id ? await getBalance(id) : null); }
    catch { setBalance(null); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useLiveData(load);
  return <button type="button" className="member-header-points" aria-label={`${balance == null ? 'Points unavailable' : `${balance.toLocaleString()} points`}. Open Rewards`} onClick={() => navigate('/member/rewards')}>
    <Coins size={16} weight="duotone" aria-hidden="true" />
    <strong>{balance == null ? '—' : balance.toLocaleString()}</strong>
  </button>;
}

interface ShopItem { id: string; name: string; price: number; photo_url: string | null; availability: string }
export function TodayShopPreview() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ShopItem[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('shop_catalog');
      if (alive) setItems(error ? null : (data ?? []) as ShopItem[]);
    })();
    return () => { alive = false; };
  }, []);
  return <section className="today-shop-preview" aria-label="Gym shop">
    <header><h3><Storefront size={18} weight="duotone" />From the shop</h3><button type="button" onClick={() => navigate('/member/shop')}>View shop<CaretRight size={14} /></button></header>
    {items === undefined ? <p>Loading the shop…</p> : items === null ? <p>The shop could not be loaded. Open the shop to try again.</p> : !items.length ? <p>Nothing listed yet. Ask at the front desk what is available.</p> : <div className="today-shop-items">{items.slice(0, 3).map(item => <button type="button" key={item.id} onClick={() => navigate('/member/shop')}>
      <span className="today-shop-image">{item.photo_url ? <img src={item.photo_url} alt="" loading="lazy" /> : <Storefront size={27} weight="duotone" />}</span>
      <strong>{item.name}</strong><small>₱{Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: Number(item.price) % 1 ? 2 : 0 })}</small>{item.availability === 'sold_out' && <small>Sold out</small>}
    </button>)}</div>}
    <p>Pay at the front desk.</p>
  </section>;
}
