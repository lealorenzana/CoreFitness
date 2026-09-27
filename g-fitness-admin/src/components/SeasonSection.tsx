import { useCallback, useEffect, useState } from 'react';
import { Medal, Plus, Trash2 } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { addTier, deleteTier, handOver, listTiers, openClaims, type ClaimRow, type TierRow } from '../lib/api/season';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };

/**
 * Rewards → the monthly season (0123): its tiers, and the rewards waiting at
 * the desk.
 *
 * A season is the calendar month. A member's score is the points they earned
 * in it; reaching a tier lets them claim that tier's reward once a month, at no
 * cost in points. The desk hands it over here. The owner edits tiers; the desk
 * sees the queue (the database enforces both).
 */
export default function SeasonSection({ isAdmin }: { isAdmin: boolean }) {
  const [tiers, setTiers] = useState<TierRow[] | null | undefined>(undefined);
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [rewards, setRewards] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('');
  const [reward, setReward] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, c, r] = await Promise.all([
      listTiers(), openClaims(),
      supabase.from('rewards').select('id, name').eq('is_active', true).order('name'),
    ]);
    setTiers(t);
    setClaims(c);
    setRewards((r.data ?? []) as { id: string; name: string }[]);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (tiers === undefined) return null;
  if (tiers === null) {
    return (
      <Card className="!p-4">
        <p className="text-xs" style={{ color: MUTED }}>Monthly seasons need migration 0123, which is not pasted yet.</p>
      </Card>
    );
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  const add = () => {
    const n = Number(points);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) { showToast('A name and a positive number of points, please.', 'error'); return; }
    void run(async () => { await addTier(name, Math.round(n), reward || null); setName(''); setPoints(''); setReward(''); },
      `${name.trim()} added. Members see it on their Season screen.`);
  };

  return (
    <Card className="!p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Medal size={14} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h2 className="text-sm font-bold text-white">Monthly season</h2>
          <p className="text-[10px]" style={{ color: MUTED }}>
            Each month, points earned that month count toward these tiers. Everyone starts again on the 1st. A claim costs no points.
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: MUTED }}>Waiting at the desk ({claims?.length ?? 0})</p>
        {claims === null ? (
          <p className="text-xs" style={{ color: MUTED }}>The claims could not be loaded.</p>
        ) : claims.length === 0 ? (
          <p className="text-xs" style={{ color: MUTED }}>Nothing to hand over.</p>
        ) : (
          <div className="space-y-1.5">
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={FIELD}>
                <p className="text-xs text-white">
                  <strong>{c.memberName}</strong> · {c.tierName}{c.rewardName ? ` — ${c.rewardName}` : ''}
                  <span className="text-[10px] ml-1" style={{ color: MUTED }}>
                    {new Date(c.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </p>
                <Button size="sm" variant="secondary" disabled={busy}
                  onClick={() => void run(() => handOver(c.id), `Handed over to ${c.memberName}.`)}>
                  Handed over
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: MUTED }}>Tiers</p>
        {tiers.length === 0 ? (
          <p className="text-xs" style={{ color: MUTED }}>No tiers yet — add one below, e.g. Bronze at 300 points.</p>
        ) : (
          <div className="space-y-1.5">
            {tiers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={FIELD}>
                <p className="text-xs text-white">
                  <strong>{t.name}</strong> · {t.pointsNeeded.toLocaleString()} points
                  <span style={{ color: MUTED }}>{t.rewardName ? ` · ${t.rewardName}` : ' · no reward, recognition only'}</span>
                </p>
                {isAdmin && (
                  <button onClick={() => void run(() => deleteTier(t.id), `${t.name} removed.`)} disabled={busy}
                    aria-label={`Remove tier ${t.name}`} className="p-1.5 rounded-lg" style={{ color: MUTED }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Tier name, e.g. Silver"
              aria-label="Tier name" className="h-9 px-3 rounded-lg text-xs text-white flex-1 min-w-0" style={FIELD} />
            <input value={points} onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
              placeholder="Points" aria-label="Points needed" className="h-9 px-3 rounded-lg text-xs text-white w-24" style={FIELD} />
            <select value={reward} onChange={(e) => setReward(e.target.value)} aria-label="Tier reward"
              className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
              <option value="">No reward</option>
              {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={busy} onClick={add}><Plus size={12} /> Add tier</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
