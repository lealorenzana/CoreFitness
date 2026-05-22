import { useEffect, useState, useRef } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { progressService, type Badge, type MemberBadge } from '../../../services/progressService';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import ErrorState from '../../../components/ui/ErrorState';
import { toast } from '../../../components/ui/Toast';

export default function BadgesTab() {
  const memberId = useMemberId();
  const [allBadges, setAllBadges]   = useState<Badge[]>([]);
  const [earned, setEarned]         = useState<MemberBadge[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [selected, setSelected]     = useState<Badge | null>(null);
  const [justEarned, setJustEarned] = useState<Badge | null>(null);
  const prevEarnedRef = useRef<Set<string>>(new Set());

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const [b, m] = await Promise.all([
        progressService.getAllBadges(),
        progressService.getMemberBadges(memberId),
      ]);
      setAllBadges(b); setEarned(m);
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [memberId]);

  // Detect newly earned badges
  useEffect(() => {
    if (loading || earned.length === 0) return;
    const currentIds = new Set(earned.map(e => e.badgeId));
    const prev = prevEarnedRef.current;
    if (prev.size > 0) {
      for (const id of currentIds) {
        if (!prev.has(id)) {
          const badge = allBadges.find(b => b.id === id);
          if (badge) {
            toast.success('🎉 Badge earned: ' + badge.name);
            setJustEarned(badge);
          }
        }
      }
    }
    prevEarnedRef.current = currentIds;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [earned, loading]);

  // Auto-dismiss celebration modal after 5 seconds
  useEffect(() => {
    if (justEarned) {
      const timer = setTimeout(() => setJustEarned(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [justEarned]);

  // Check and auto-award badges on mount
  useEffect(() => {
    if (loading || allBadges.length === 0) return;
    const checkAndAwardBadges = async () => {
      // Check if member has workout logs
      const workoutKey = `progress_workouts_${memberId}`;
      const workoutLogs = JSON.parse(localStorage.getItem(workoutKey) || '[]');
      const hasWorkouts = workoutLogs.length > 0;

      // Find "First Workout" badge
      const firstWorkoutBadge = allBadges.find(b =>
        b.name.toLowerCase().includes('first workout') || b.name.toLowerCase().includes('first session')
      );

      if (hasWorkouts && firstWorkoutBadge) {
        const result = await progressService.awardBadge(memberId, firstWorkoutBadge.id);
        if (result) {
          load(); // Reload to trigger the detection useEffect
        }
      }
    };
    checkAndAwardBadges();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [loading, allBadges.length]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  if (error) return <ErrorState onRetry={load} />;

  const earnedIds = new Set(earned.map(e => e.badgeId));

  return (
    <div className="space-y-4">
      {/* Stat */}
      <div className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-secondary-light)' }}>
            <Trophy size={18} style={{ color: 'var(--color-secondary)' }} />
          </div>
          <div>
            <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Badges Earned</p>
            <p className="text-xl font-bold text-white">
              {earned.length} <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>/ {allBadges.length}</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase" style={{ color: 'var(--color-text-muted)' }}>Completion</p>
          <p className="text-xl font-bold" style={{ color: 'var(--color-secondary)' }}>
            {Math.round((earned.length / Math.max(1, allBadges.length)) * 100)}%
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {allBadges.map(b => {
          const isEarned = earnedIds.has(b.id);
          return (
            <button key={b.id} onClick={() => setSelected(b)}
              className="rounded-2xl p-3 flex flex-col items-center text-center transition-transform active:scale-95 relative overflow-hidden"
              style={{
                background: isEarned ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                border: `1px solid ${isEarned ? 'var(--color-primary-hover)' : 'var(--color-border)'}`,
              }}>
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1.5"
                style={{
                  background: isEarned ? 'rgba(245,158,11,0.18)' : 'var(--color-bg)',
                }}>
                <span
                  className="text-2xl"
                  style={{
                    filter: isEarned ? 'none' : 'grayscale(1)',
                    color: isEarned ? 'var(--color-secondary)' : 'var(--color-text-muted)',
                  }}>
                  {b.icon}
                </span>
              </div>
              <p
                className="text-[10px] font-semibold leading-tight"
                style={{ color: isEarned ? '#fff' : 'var(--color-text-muted)' }}>
                {b.name}
              </p>
              {!isEarned && (
                <div className="absolute inset-0 flex items-start justify-end p-2 pointer-events-none"
                  style={{ background: 'rgba(15,15,26,0.45)' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <Lock size={11} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div onClick={e => e.stopPropagation()}
            className="relative rounded-2xl p-6 max-w-[260px] w-full text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-5xl mb-2" style={{ filter: earnedIds.has(selected.id) ? 'none' : 'grayscale(1)' }}>{selected.icon}</div>
            <h3 className="text-white font-bold text-lg">{selected.name}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{selected.description}</p>
            <p className="text-[10px] mt-3 uppercase" style={{ color: 'var(--color-text-muted)' }}>
              {earnedIds.has(selected.id) ? 'EARNED' : 'NOT YET EARNED'}
            </p>
            <button onClick={() => setSelected(null)}
              className="mt-4 w-full py-2.5 rounded-xl font-semibold text-sm text-black"
              style={{ background: 'var(--color-secondary)' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Badge Earned Celebration Modal */}
      {justEarned && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)' }} />
          {/* Confetti-like dots */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-bounce"
                style={{
                  background: i % 2 === 0 ? 'var(--color-primary)' : 'var(--color-secondary)',
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${1 + Math.random() * 2}s`,
                  opacity: 0.7,
                }}
              />
            ))}
          </div>
          <div
            className="relative rounded-2xl p-8 max-w-[280px] w-full text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-6xl mb-3">{justEarned.icon}</div>
            <h3 className="text-white font-bold text-xl">Badge Earned!</h3>
            <p className="text-white font-bold text-lg mt-1">{justEarned.name}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {justEarned.description}
            </p>
            <button
              onClick={() => setJustEarned(null)}
              className="mt-5 w-full h-10 rounded-full font-semibold text-sm text-black"
              style={{ background: 'var(--color-secondary)' }}
            >
              Awesome!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
