import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import Modal from './Modal';
import { showToast } from '../../utils/toast';
import { challengeStandings, type Standing } from '../../lib/api/engagementRules';

/**
 * Who is in a challenge and how far along each is (0094) — the same number
 * the member's own challenge card shows, from `challenge_progress()`.
 */
export function ChallengeStandingsModal({
  challenge, onClose,
}: { challenge: { id: string; title: string; target: number } | null; onClose: () => void }) {
  const [rows, setRows] = useState<Standing[] | null | undefined>(undefined);

  useEffect(() => {
    if (!challenge) return;
    let alive = true;
    void (async () => {
      try {
        const r = await challengeStandings(challenge.id);
        if (alive) setRows(r);
      } catch (err) {
        if (alive) { setRows([]); showToast(err instanceof Error ? err.message : 'Could not load standings', 'error'); }
      }
    })();
    return () => { alive = false; setRows(undefined); };
  }, [challenge]);

  return (
    <Modal isOpen={!!challenge} onClose={onClose} title={challenge ? `Standings — ${challenge.title}` : 'Standings'}
      subtitle="Everyone who joined, closest to finishing first" cancelLabel="Close">
      {rows === undefined ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : rows === null ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Standings need migration 0094_challenge_standings_and_progress_guard.sql — paste it in the Supabase SQL editor.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nobody has joined this challenge yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {rows.map((r, i) => {
            const f = Math.min(1, r.progress / Math.max(1, r.target));
            return (
              <div key={r.member_id} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white truncate">
                    <span className="tabular-nums mr-2" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</span>
                    {r.first_name} {r.last_name}
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {r.completed_on ? <><Trophy size={12} style={{ color: 'var(--color-secondary)' }} /> finished</> : `${Math.min(r.progress, r.target)} / ${r.target}`}
                  </span>
                </div>
                <div className="h-1 mt-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(f * 100)}%`, background: r.completed_on ? 'var(--color-secondary)' : 'var(--color-primary)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
