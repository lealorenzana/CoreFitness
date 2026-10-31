import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassSheet from '../ui/GlassSheet';
import { NocButton, StatusPill } from '../ui/noc';
import { toast } from '../ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import {
  coachingPrices, getCoachingSettings, monthsLabel, myCoachings, OPEN_STATUSES, peso, requestCoaching,
  type Coaching, type CoachingSettings,
} from '../../lib/api/coaching';

/**
 * "Train with <coach>" on a coach's profile (0181): ask for a package — a
 * length from the gym's list (groups were removed by 0220),
 * see what it costs under the gym's arrangement, and ask. Nothing renders when
 * the gym does not let members pick a coach, or before 0181 — and a member who
 * already has a package is pointed at Train → Coach instead of a second ask.
 */
export default function TrainWith({ trainerId, firstName, presence }: {
  trainerId: string; firstName: string; presence?: string | null;
}) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CoachingSettings | null>(null);
  const [open, setOpen] = useState<Coaching | null | undefined>(undefined);
  const [prices, setPrices] = useState<{ kind: 'pt' | 'group'; months: number; price: number }[]>([]);
  const [sheet, setSheet] = useState(false);
  const [months, setMonths] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, list, p] = await Promise.all([getCoachingSettings(), myCoachings(), coachingPrices()]);
      setSettings(s);
      setOpen((list ?? []).find((c) => c.iAm === 'member' && OPEN_STATUSES.includes(c.status)) ?? null);
      setPrices(p);
    })();
  }, []);

  if (!settings || open === undefined) return null;
  if (!settings.modes.includes('pick_pt')) return null;

  if (open) {
    return (
      <NocButton variant="ghost" onClick={() => navigate('/member/book-class?tab=coach')}>
        {open.trainerId === trainerId ? `${firstName} is your coach — see details` : 'You already have a package — see Train → Coach'}
      </NocButton>
    );
  }

  const priceOf = (m: number) => prices.find((p) => p.kind === 'pt' && p.months === m)?.price ?? null;
  const costLine = (m: number) => settings.feeMode === 'included' ? 'Included in your plan'
    : settings.feeMode === 'trainer_direct' ? `You pay ${firstName} directly — they say their price when they accept`
    : priceOf(m) != null ? `${peso(priceOf(m)!)}, paid to the gym` : 'Not priced yet — ask at the desk';

  const ask = async () => {
    if (months == null) return;
    setBusy(true);
    try {
      await requestCoaching(trainerId, 'pt', months);
      toast.success(`${firstName} has your request`);
      setSheet(false);
      navigate('/member/book-class?tab=coach');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NocButton variant="structure" onClick={() => setSheet(true)}>
        Train with {firstName}
      </NocButton>
      <GlassSheet open={sheet} onClose={() => setSheet(false)} title={`Train with ${firstName}`}
        subtitle={presence === 'on_leave' ? `${firstName} is on leave right now — they answer when back.` : 'Choose how long. You can end it early.'}
        footer={<NocButton className="w-full" disabled={busy || months == null || (settings.feeMode === 'gym_priced' && months != null && priceOf(months) == null)}
          onClick={() => void ask()}>{busy ? 'Sending…' : 'Ask'}</NocButton>}>
        <div className="flex flex-col" style={{ gap: 8 }} role="radiogroup" aria-label="How long">
          {settings.lengths.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={months === m} data-length={m} onClick={() => setMonths(m)}
              className="flex items-center justify-between rounded-2xl text-left"
              style={{ padding: '12px 14px', border: `1px solid ${months === m ? 'var(--color-primary)' : 'var(--color-separator)'}`, background: 'transparent' }}>
              <span>
                <span className="block" style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{monthsLabel(m)}</span>
                <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{costLine(m)}</span>
              </span>
              {months === m && <StatusPill label="Chosen" />}
            </button>
          ))}
        </div>
      </GlassSheet>
    </>
  );
}
