import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from '@phosphor-icons/react';
import { SectionHead } from '../ui/noc';
import { friendWins, myFriends, type Win } from '../../lib/api/friends';
import { useFriendsOn } from '../../hooks/useFriendsOn';

/**
 * Today's strip of friends' latest wins (wave 3): three, newest first, with See
 * all to the Friends page. Nothing while the gym has Friends off; one line
 * offering to add friends when the member has none and no squad wins.
 */
export default function FriendsWinsStrip() {
  const navigate = useNavigate();
  const on = useFriendsOn();
  const [wins, setWins] = useState<Win[] | null>(null);
  const [hasFriends, setHasFriends] = useState(true);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    void (async () => {
      const [w, f] = await Promise.all([friendWins(3).catch(() => []), myFriends().catch(() => [])]);
      if (alive) { setWins(w); setHasFriends(f.length > 0); }
    })();
    return () => { alive = false; };
  }, [on]);

  if (!on || wins == null) return null;
  if (wins.length === 0) {
    if (hasFriends) return null;
    return (
      <button type="button" onClick={() => navigate('/member/friends/add')} className="flex items-center text-left noc-press-soft" data-friends-invite
        style={{ gap: 10, fontSize: 13.5, color: 'var(--color-secondary)' }}>
        <UserPlus size={18} /> Add friends to see their wins here and cheer them on
      </button>
    );
  }
  return (
    <section data-friends-strip>
      <SectionHead title="Friends' wins" meta="See all" />
      <button type="button" onClick={() => navigate('/member/friends')} className="lv-shelf w-full text-left" style={{ gap: 10 }} aria-label="Friends' wins. See all">
        {wins.map((w) => (
          <span key={`${w.kind}:${w.ref}`} className="flex-none" style={{ width: 200, padding: '10px 12px', borderRadius: 16,
            border: '1px solid var(--color-hairline)', background: 'var(--color-surface)' }}>
            <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{w.firstName}</span>
            <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{w.title}</span>
          </span>
        ))}
      </button>
    </section>
  );
}
