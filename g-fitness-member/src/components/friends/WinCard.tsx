import { useState } from 'react';
import { CrownSimple, Fire, FlagCheckered, HandsClapping, Medal as MedalIcon, Target, type Icon } from '@phosphor-icons/react';
import Avatar from '../ui/Avatar';
import { Medal } from '../ui/lively';
import { tierStyle } from '../../data/achievements';
import { cheer, type Win, type WinKind } from '../../lib/api/friends';
import { buzz, play, reducedMotion } from '../../lib/moments';
import { agoLabel } from '../../utils/dates';
import { toast } from '../ui/Toast';

/** Each kind of win, as a small medal: a record and a target in the gym's colour, a streak in gold. */
const LOOK: Record<WinKind, { icon: Icon; tier: string }> = {
  record: { icon: CrownSimple, tier: 'var(--color-primary-300)' },
  streak: { icon: Fire, tier: tierStyle('gold').ring },
  badge: { icon: MedalIcon, tier: tierStyle('silver').ring },
  target: { icon: Target, tier: 'var(--color-primary-300)' },
  challenge: { icon: FlagCheckered, tier: 'var(--color-primary-300)' },
};

/**
 * One friend's win, with Cheer (wave 3, mock-up approved). Cheering tells
 * them, once (cheer_win, 0217); tapping again takes it back. No count of
 * cheers on the win — the owner's choice.
 */
export default function WinCard({ win, onChange, style }: { win: Win; onChange?: (w: Win) => void; style?: React.CSSProperties }) {
  const [cheered, setCheered] = useState(win.cheered);
  const [busy, setBusy] = useState(false);
  const [claps, setClaps] = useState<{ id: number; x: number; y: number }[]>([]);
  const look = LOOK[win.kind];
  const tier = win.kind === 'badge' && win.tier ? tierStyle(win.tier).ring : look.tier;

  const toggle = async () => {
    if (busy) return;
    const next = !cheered;
    setBusy(true);
    setCheered(next);
    if (next) {
      play('pop'); buzz(20);
      if (!reducedMotion()) {
        const now = Date.now();
        setClaps(Array.from({ length: 7 }, (_, i) => ({ id: now + i, x: (Math.random() - 0.5) * 120, y: -40 - Math.random() * 60 })));
        window.setTimeout(() => setClaps([]), 950);
      }
    }
    try {
      await cheer(win, next);
      onChange?.({ ...win, cheered: next });
    } catch (e) {
      setCheered(!next);
      toast.error(e instanceof Error ? e.message : 'That cheer did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="relative" data-win={win.kind} style={{ border: '1px solid var(--color-hairline)', borderRadius: 18, padding: '12px 14px',
      background: 'var(--color-surface)', ...style }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <Avatar name={`${win.firstName} ${win.lastName}`} photoUrl={win.photoUrl} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{win.firstName} {win.lastName}</span>
          <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {agoLabel(win.at)} · {win.relation === 'squad' ? 'your squad' : 'your friend'}
          </span>
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--color-surface-raised)' }}>
        <Medal tier={tier} icon={look.icon} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{win.title}</span>
          {win.detail && <span className="block" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>{win.detail}</span>}
        </span>
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{cheered ? 'You cheered' : ''}</span>
        <button type="button" onClick={() => void toggle()} disabled={busy} data-cheer={cheered ? 'on' : 'off'}
          className={`fr-cheer${cheered ? ' fr-cheer--on' : ''} noc-press`} aria-pressed={cheered}
          aria-label={cheered ? `Take back your cheer for ${win.firstName}` : `Cheer ${win.firstName}`}>
          <HandsClapping size={16} weight={cheered ? 'fill' : 'regular'} /> {cheered ? 'Cheered' : 'Cheer'}
        </button>
      </div>
      {claps.map((c) => (
        <span key={c.id} className="fr-clap" aria-hidden style={{ right: 40, bottom: 26, ['--x' as string]: `${c.x}px`, ['--y' as string]: `${c.y}px` }}>
          <HandsClapping size={18} weight="fill" />
        </span>
      ))}
    </article>
  );
}

