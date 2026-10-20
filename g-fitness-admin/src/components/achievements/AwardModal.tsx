import { createElement, useCallback, useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { RdButton, RdSelect } from '../ui/rd';
import { TONE } from '../ui/rdTokens';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { badgeIcon } from './badgeIcons';
import {
  awardAchievement, revokeAchievement, listHolders, listAwardCandidates,
  type AchievementRow, type AchievementHolder, type AchievementTier,
} from '../../lib/api/achievements';

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';
const RING: Record<AchievementTier, string> = { bronze: '#d97745', silver: '#b8c2d6', gold: '#f5b82e', platinum: '#a78bfa' };

/**
 * Give a badge by hand, and see (and take back) who holds one. Moved out of
 * Achievements.tsx unchanged in behaviour (2026-10-20). Admin-only, enforced
 * inside award_achievement()/revoke_achievement().
 */
export default function AwardModal({ achievement, onClose, onDone }: { achievement: AchievementRow; onClose: () => void; onDone: () => void }) {
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [holders, setHolders] = useState<AchievementHolder[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([listAwardCandidates(achievement.audience), listHolders(achievement.key)]);
      setPeople(p);
      setHolders(h);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not load');
    }
  }, [achievement]);
  useEffect(() => { void (async () => { await refresh(); })(); }, [refresh]);

  const held = new Set(holders.map((h) => h.user_id));
  const available = people.filter((p) => !held.has(p.id));

  const give = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await awardAchievement(pick, achievement.key);
      showSuccessToast('Awarded');
      setPick('');
      await refresh();
      onDone();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not award');
    } finally {
      setBusy(false);
    }
  };
  const take = async (userId: string) => {
    setBusy(true);
    try {
      await revokeAchievement(userId, achievement.key);
      showSuccessToast('Removed');
      await refresh();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setBusy(false);
    }
  };

  const who = achievement.audience === 'member' ? 'member' : 'coach';
  const ring = RING[achievement.tier];
  return (
    <Modal isOpen onClose={onClose} hideFooter title={`${achievement.rule_kind === 'manual' ? 'Give' : 'Who has'} "${achievement.title}"`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-full flex-none" style={{ width: 48, height: 48, border: `2px solid ${ring}`, background: '#15131f', boxShadow: `0 0 18px -6px ${ring}` }}>
            {createElement(badgeIcon(achievement.icon), { size: 20, style: { color: ring } })}
          </span>
          <p className="text-[13px]" style={{ color: SECOND }}>{achievement.requirement}</p>
        </div>
        {achievement.rule_kind !== 'manual' && (
          // Revoking an automatic badge someone still qualifies for lasts until their next sync.
          <p className="text-[12.5px] p-3 rounded-xl" style={{ background: TONE.amber.bg, color: TONE.amber.fg }}>
            This one is given automatically. You can still give it by hand — useful for records from before the app — but taking it from
            someone who genuinely qualifies will not stick: the server gives it back on their next sync.
          </p>
        )}
        <div>
          <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Give it to a {who}</span>
          <div className="flex gap-2">
            <RdSelect label={`Choose a ${who}`} value={pick} onChange={setPick} className="flex-1">
              <option value="">{available.length === 0 ? 'Everyone already has it' : `Choose a ${who}…`}</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </RdSelect>
            <RdButton variant="amber" icon={Gift} onClick={give} disabled={!pick || busy}>Award</RdButton>
          </div>
        </div>
        <div className="pt-3" style={{ borderTop: LINE }}>
          <p className="text-[13px] font-semibold text-white mb-2">Holding it ({holders.length})</p>
          {holders.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: MUTED }}>Nobody yet</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1">
              {holders.map((h) => (
                <div key={h.user_id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-white truncate">{h.name}</p>
                    <p className="text-[12px]" style={{ color: MUTED }}>{h.unlocked_on}</p>
                  </div>
                  <button type="button" onClick={() => take(h.user_id)} disabled={busy} aria-label={`Remove from ${h.name}`} data-tip="Remove"
                    className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 hover:bg-white/[0.06]" style={{ color: MUTED, border: LINE }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end pt-1"><RdButton onClick={onClose}>Done</RdButton></div>
      </div>
    </Modal>
  );
}
