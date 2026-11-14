import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight, Clock } from '@phosphor-icons/react';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';
import { listSlots, slotRules, type Slot } from '../../lib/api/slots';
import { todayKey } from '../../utils/dates';
import { useT } from '../../lib/i18n';

const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };

/**
 * Today → Book a time (0259): only at a gym that runs time slots. Names the member's next booked time, or invites
 * them to book one; opens Book a time. Nothing at all when the gym does not use slots.
 */
export default function BookTimeRow() {
  const navigate = useNavigate();
  const t = useT();
  const on = moduleOn(useGymApp(), 'slots');
  const [next, setNext] = useState<Slot | null | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void (async () => {
      const r = await slotRules();
      const list = r?.on ? await listSlots(todayKey(), r.aheadDays) : null;
      const now = Date.now();
      if (alive) setNext((list ?? []).find((s) => s.myBooking && new Date(`${s.date}T${s.ends}`).getTime() > now) ?? null);
    })();
    return () => { alive = false; };
  }, [on]);
  if (!on || next === undefined) return null;
  const when = next ? `${next.date === todayKey() ? t('Today') : new Date(`${next.date}T00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' })} · ${clock(next.starts)} – ${clock(next.ends)}` : '';
  return (
    <button type="button" onClick={() => navigate('/member/slots')} data-book-time
      className="w-full text-left noc-press-soft flex items-center"
      style={{ gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid rgb(var(--hair-rgb, 233 233 237) / 0.1)' }}>
      <span className="grid place-items-center flex-none" data-row-icon={next ? 'mine' : 'act'}
        style={{ width: 36, height: 36, borderRadius: 11, background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)', color: 'var(--color-primary-300)' }}>
        <Clock size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{next ? t('Your time') : t('Book a time')}</span>
        <span className="block" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{next ? when : t('Pick when you come in — your place is kept')}</span>
      </span>
      <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} />
    </button>
  );
}
