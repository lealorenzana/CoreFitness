import { useEffect, useState } from 'react';
import GlassSheet from './ui/GlassSheet';
import { Eyebrow } from './ui/noc';
import ProposalCard from './ProposalCard';
import { listProposals, type Proposal, type ProposalNames, type ProposalStatus } from '../lib/api/aiProposals';
import { errorMessage } from '../utils/errorMessage';
import { useT } from '../lib/i18n';

/**
 * Every change the coach has proposed — waiting ones, and the last 30 days of
 * decided ones — with the same Apply, Discard and Undo as the chat's cards.
 * A proposal made in a conversation the member has left is still here.
 *
 * `decided` is the chat's record of what was tapped this visit, so a card
 * tapped in the chat reads right here too. Each read hands the server's statuses
 * back through `onLoaded`, which replaces those local entries: once the list
 * lands, the database's word wins (a change undone on another phone reads Undone).
 */

const GROUPS: { title: string; has: (s: ProposalStatus) => boolean }[] = [
  { title: 'Waiting', has: (s) => s === 'pending' },
  { title: 'Applied', has: (s) => s === 'applied' },
  { title: 'Undone or discarded', has: (s) => s === 'undone' || s === 'discarded' },
];

export default function CoachChanges({
  open, onClose, names, decided, onStatus, onLoaded,
}: {
  open: boolean;
  onClose: () => void;
  names: ProposalNames;
  decided: Record<string, ProposalStatus>;
  onStatus: (id: string, next: ProposalStatus) => void;
  /** The list as read, so the caller can take the server's status over its own. */
  onLoaded: (rows: Proposal[]) => void;
}) {
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      setError(null);
      try {
        const list = await listProposals();
        if (alive) { setRows(list); onLoaded(list); }
      } catch (err) {
        if (alive) { setRows(null); setError(errorMessage(err, t('The coach\'s changes could not be loaded.'))); }
      }
    })();
    return () => { alive = false; };
  }, [open, onLoaded, t]);

  const statusOf = (p: Proposal): ProposalStatus => decided[p.id] ?? p.status;

  return (
    <GlassSheet open={open} onClose={onClose} title={t('Changes from the coach')}
      subtitle={t('Nothing changes until you tap Apply')}>
      {error ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{error}</p>
      ) : rows === null ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('Loading…')}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          {t('Nothing from the coach yet. Ask it to build you a routine or plan your week, and its suggestion shows up here.')}
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 18 }}>
          {GROUPS.map((g) => {
            const list = rows.filter((p) => g.has(statusOf(p)));
            if (list.length === 0) return null;
            return (
              <section key={g.title} aria-label={g.title}>
                <Eyebrow>{t(g.title)} · {list.length}</Eyebrow>
                <div className="flex flex-col" style={{ gap: 10, marginTop: 10 }}>
                  {list.map((p) => (
                    <ProposalCard key={p.id} id={p.id} kind={p.kind} summary={p.summary} payload={p.payload}
                      status={statusOf(p)} names={names} onStatus={onStatus} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </GlassSheet>
  );
}
