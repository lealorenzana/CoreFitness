import { useCallback, useEffect, useState } from 'react';
import { Clock } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, LineRow, NocButton, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { bookSlot, cancelSlot, listSlots, slotRules, type Slot, type SlotRules } from '../lib/api/slots';
import { addDays, todayKey } from '../utils/dates';
import { errorMessage } from '../utils/errorMessage';
import { useT } from '../lib/i18n';

const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const dayChip = (ymd: string, today: string) => {
  if (ymd === today) return 'Today';
  if (ymd === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' });
};

/**
 * Book a time (0259, gym styles phase 3): the gym's time slots, a day at a time, as far ahead as the gym allows —
 * each with how full it is, and the member's own place to keep or cancel. The rules (days ahead, slots a day, the
 * cancel cut-off, what the door does) are the owner's, read from the gym and said on the page, never typed.
 */
export default function BookTime() {
  const t = useT();
  const today = todayKey();
  const [rules, setRules] = useState<SlotRules | null | undefined>(undefined);
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now()); // the moment the page opened

  const load = useCallback(async (d: string) => {
    setSlots(undefined);
    setSlots(await listSlots(d, 0));
  }, []);
  useEffect(() => { void slotRules().then(setRules); }, []);
  useEffect(() => { void (async () => { await load(day); })(); }, [day, load]);

  const days = rules ? Array.from({ length: rules.aheadDays + 1 }, (_, i) => addDays(today, i)) : [today];
  const over = (s: Slot) => new Date(`${s.date}T${s.ends}`).getTime() <= now;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(day); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  const rulesLine = rules
    ? [rules.door === 'required' ? t('Only members who booked get in during a slot.') : t('Your booking keeps your place; others come in while there is room.'),
       rules.perDay === 1 ? t('One slot a day.') : `${rules.perDay} ${t('slots a day.')}`,
       rules.cancelMinutes > 0 ? `${t('Cancel up to')} ${rules.cancelMinutes} ${t('minutes before.')}` : t('Cancel any time before it starts.')].join(' ')
    : '';

  return (
    <Page>
      <PageTitle back fallback="/member/home" title={t('Book a time')} subtitle={t('Pick when you come in')} />
      {rules === undefined ? <SkeletonList count={3} />
        : rules === null || !rules.on ? <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)' }} data-slots-off>{t('Your gym does not use time slots — just come in during opening hours.')}</p>
        : (<>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text-secondary)' }} data-slot-rules>{rulesLine}</p>
          <div className="flex flex-wrap" style={{ gap: 6 }} role="tablist" aria-label={t('Day')}>
            {days.map((d) => <Chip key={d} label={t(dayChip(d, today))} on={d === day} onClick={() => setDay(d)} />)}
          </div>
          {slots === undefined ? <SkeletonList count={4} />
            : slots === null ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{t('The slots could not be loaded. Pull to try again.')}</p>
            : slots.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-no-slots>{t('No slots that day — the gym is closed or runs none.')}</p>
            : (
              <section aria-label={t('Slots')} data-slots>
                {slots.map((s, i) => {
                  const taken = s.booked + s.walkIns;
                  const full = taken >= s.capacity;
                  const key = `${s.date}:${s.starts}`;
                  return (
                    <div key={key} data-slot={key} data-full={full} data-mine={!!s.myBooking}><LineRow last={i === slots.length - 1} icon={Clock} tone={s.myBooking ? 'mine' : 'info'}
                      title={`${clock(s.starts)} – ${clock(s.ends)}`}
                      meta={s.myBooking ? t('Your place is kept') : `${Math.min(taken, s.capacity)} ${t('of')} ${s.capacity}`}
                      action={over(s) ? <StatusPill label={t('over')} tone="muted" />
                        : s.myBooking ? (
                          <NocButton variant="ghost" disabled={busy === key} onClick={() => void act(key, () => cancelSlot(s.myBooking!), t('Cancelled'))}>{t('Cancel')}</NocButton>
                        ) : full ? <StatusPill label={t('Full')} tone="muted" />
                        : <NocButton disabled={busy === key} onClick={() => void act(key, () => bookSlot(s.date, s.starts), t('Booked — your place is kept'))}>{t('Book')}</NocButton>} /></div>
                  );
                })}
              </section>
            )}
        </>)}
    </Page>
  );
}
