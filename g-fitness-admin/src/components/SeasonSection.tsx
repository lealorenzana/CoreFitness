import { useCallback, useEffect, useState } from 'react';
import { HandHeart, Medal, Plus, Sparkles, Trash2, Trophy } from 'lucide-react';
import Button from './ui/Button';
import { Section } from './ui/kit';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import {
  addTier, deleteTier, handOver, listTiers, openClaims, seasonOverview, updateTier,
  type ClaimRow, type SeasonOverview, type TierRow,
} from '../lib/api/season';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const RAISED = { background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' };

/** A starting ladder an owner can take as it is or change: three steps, each roughly double the last. */
const PRESET = [
  { name: 'Bronze', points: 150 },
  { name: 'Silver', points: 400 },
  { name: 'Gold', points: 800 },
];

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/**
 * Rewards → the monthly season (0123; 0159's overview).
 *
 * A season is the calendar month. A member's score is the points they earned
 * in it; reaching a tier lets them claim that tier's reward once a month, at no
 * cost in points, and the desk hands it over here. Everyone starts again on
 * the 1st. The owner edits tiers; the desk sees the queue and the month (the
 * database enforces both).
 */
export default function SeasonSection({ isAdmin }: { isAdmin: boolean }) {
  const [tiers, setTiers] = useState<TierRow[] | null | undefined>(undefined);
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [overview, setOverview] = useState<SeasonOverview | null>(null);
  const [rewards, setRewards] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState<{ name: string; points: string; reward: string }>({ name: '', points: '', reward: '' });
  const [preset, setPreset] = useState<{ name: string; points: string; reward: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, c, o, r] = await Promise.all([
      listTiers(), openClaims(), seasonOverview(),
      supabase.from('rewards').select('id, name').eq('is_active', true).order('name'),
    ]);
    setTiers(t); setClaims(c); setOverview(o);
    setRewards((r.data ?? []) as { id: string; name: string }[]);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (tiers === undefined) return null;
  if (tiers === null) {
    return <Section title="Monthly season" icon={Medal}><p className="text-xs" style={{ color: MUTED }}>Monthly seasons need migration 0123, which is not live here.</p></Section>;
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); return true; }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); return false; }
    finally { setBusy(false); }
  };
  const add = () => {
    const n = Number(draft.points);
    if (!draft.name.trim() || !Number.isFinite(n) || n <= 0) { showToast('A name and a positive number of points, please.', 'error'); return; }
    void run(async () => { await addTier(draft.name, Math.round(n), draft.reward || null); setDraft({ name: '', points: '', reward: '' }); },
      `${draft.name.trim()} added. Members see it on their Season screen.`);
  };
  const addPreset = () => {
    if (!preset) return;
    void run(async () => {
      for (const p of preset) await addTier(p.name, Number(p.points), p.reward || null);
      setPreset(null);
    }, 'Bronze, Silver and Gold are set. Members see them on their Season screen.');
  };

  // The worked example uses the gym's own first tier, so it is about this gym, not a made-up one.
  const first = tiers[0];
  const tierById = new Map(overview?.tiers.map((t) => [t.id, t]) ?? []);

  return (
    <div className="space-y-4">
      <Section title="Monthly season" icon={Medal}
        hint={overview ? `${day(overview.seasonStart)} – ${day(overview.seasonEnd)} · everyone starts again on the 1st` : 'a points race that starts again every month'}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-xl p-3 space-y-2" style={RAISED}>
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Sparkles size={13} style={{ color: 'var(--color-primary)' }} /> How it works</p>
            <ol className="text-[12px] space-y-1 list-decimal pl-4" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Every point a member earns this month counts — check-ins, workouts, classes, every way to earn that is switched on.</li>
              <li>Reaching a tier lets them tap <b>Claim</b> on their Season screen. A claim costs no points; their balance stays for Rewards.</li>
              <li>The claim waits here; whoever gives the reward marks it <b>Handed over</b>.</li>
              <li>On the 1st the month's score goes back to zero, and every tier can be reached again.</li>
            </ol>
            <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: 'var(--color-primary-light)', color: 'var(--color-text-secondary)' }}>
              <b className="text-white">Example.</b> A member checks in 12 times and logs 8 workouts by the 20th. If check-ins pay 10 and workouts 15, that is 120 + 120 = 240 points this month
              {first ? <> — past {first.name} ({first.pointsNeeded.toLocaleString()}){first.rewardName ? `, so they claim ${first.rewardName}` : ''}.</> : '. With a Bronze tier at 150, they claim it.'}
            </p>
          </div>

          <div className="rounded-xl p-3" style={RAISED}>
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Trophy size={13} style={{ color: 'var(--color-primary)' }} /> This month so far</p>
            {!overview ? (
              <p className="text-[12px] mt-2" style={{ color: MUTED }}>Progress shows once migration 0159 is live.</p>
            ) : (
              <>
                <p className="text-[12px] mt-1" style={{ color: MUTED }}>{overview.scoring} of {overview.members} active members have earned points this month.</p>
                {overview.top.length === 0 ? <p className="text-[12px] mt-3" style={{ color: MUTED }}>Nobody has earned a point yet this month.</p> : (
                  <ol className="mt-2 space-y-1">
                    {overview.top.slice(0, 5).map((t, i) => (
                      <li key={t.memberId} className="flex items-center gap-2 text-[12px]">
                        <span className="w-4 text-right tabular-nums" style={{ color: MUTED }}>{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate text-white">{t.name}</span>
                        <span className="tabular-nums font-semibold" style={{ color: 'var(--color-primary)' }}>{t.score.toLocaleString()}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Tiers" icon={Medal} count={tiers.length} hint="what members race to this month">
        {tiers.length === 0 && isAdmin && !preset && (
          <div className="rounded-xl p-4 text-center space-y-2" style={RAISED}>
            <p className="text-sm text-white font-semibold">No tiers yet</p>
            <p className="text-[12px]" style={{ color: MUTED }}>Start with a ready ladder and change anything, or add your own below.</p>
            <Button variant="secondary" onClick={() => setPreset(PRESET.map((p) => ({ name: p.name, points: String(p.points), reward: '' })))}>
              <Sparkles size={13} /> Use Bronze · Silver · Gold
            </Button>
          </div>
        )}

        {preset && (
          <div className="rounded-xl p-3 space-y-2" style={{ ...RAISED, borderColor: 'var(--color-primary)' }}>
            <p className="text-xs font-semibold text-white">Bronze, Silver and Gold — change the points or pick a reward for each</p>
            {preset.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input value={p.name} maxLength={40} aria-label={`Tier ${i + 1} name`} onChange={(e) => setPreset(preset.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="h-9 px-3 rounded-lg text-xs text-white w-32" style={FIELD} />
                <input value={p.points} inputMode="numeric" aria-label={`${p.name} points`} onChange={(e) => setPreset(preset.map((x, j) => (j === i ? { ...x, points: e.target.value.replace(/\D/g, '') } : x)))}
                  className="h-9 px-3 rounded-lg text-xs text-white w-24 tabular-nums" style={FIELD} />
                <span className="text-[11px]" style={{ color: MUTED }}>points →</span>
                <select value={p.reward} aria-label={`${p.name} reward`} onChange={(e) => setPreset(preset.map((x, j) => (j === i ? { ...x, reward: e.target.value } : x)))}
                  className="h-9 px-2 rounded-lg text-xs text-white flex-1 min-w-[160px]" style={FIELD}>
                  <option value="">Recognition only</option>
                  {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            ))}
            {rewards.length === 0 && <p className="text-[11px]" style={{ color: MUTED }}>No rewards in the catalogue yet — add one under Catalogue to give at a tier.</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || preset.some((p) => !p.name.trim() || !Number(p.points))} onClick={addPreset}>Add these three</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreset(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {tiers.length > 0 && (
          <div className="space-y-2">
            {tiers.map((t) => {
              const o = tierById.get(t.id);
              const share = o && overview && overview.members > 0 ? o.reached / overview.members : null;
              return (
                <div key={t.id} className="rounded-xl p-3" style={RAISED}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Medal size={15} style={{ color: 'var(--color-primary)' }} />
                    <span className="text-sm font-semibold text-white">{t.name}</span>
                    {isAdmin ? (
                      <>
                        <input defaultValue={String(t.pointsNeeded)} inputMode="numeric" aria-label={`${t.name} points`}
                          onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== t.pointsNeeded) void run(() => updateTier(t.id, { pointsNeeded: Math.round(n) }), `${t.name}: ${n} points`); }}
                          className="h-8 px-2 rounded-lg text-xs text-white w-20 tabular-nums" style={FIELD} />
                        <span className="text-[11px]" style={{ color: MUTED }}>points →</span>
                        <select value={t.rewardId ?? ''} aria-label={`${t.name} reward`}
                          onChange={(e) => void run(() => updateTier(t.id, { rewardId: e.target.value || null }), `${t.name}: reward changed`)}
                          className="h-8 px-2 rounded-lg text-xs text-white min-w-[150px]" style={FIELD}>
                          <option value="">Recognition only</option>
                          {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: MUTED }}>{t.pointsNeeded.toLocaleString()} points · {t.rewardName ?? 'recognition only'}</span>
                    )}
                    <span className="flex-1" />
                    {isAdmin && (
                      <button onClick={() => void run(() => deleteTier(t.id), `${t.name} removed.`)} disabled={busy}
                        aria-label={`Remove tier ${t.name}`} className="p-1.5 rounded-lg" style={{ color: MUTED }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {o && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--color-surface-high)' }}>
                        {share !== null && share > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: 'var(--color-primary)' }} />}
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                        {o.reached} reached it this month · {o.claimed} claimed · {o.handedOver} handed over
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && !preset && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} placeholder="New tier, e.g. Platinum"
              aria-label="Tier name" className="h-9 px-3 rounded-lg text-xs text-white flex-1 min-w-[140px]" style={FIELD} />
            <input value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric"
              placeholder="Points" aria-label="Points needed" className="h-9 px-3 rounded-lg text-xs text-white w-24" style={FIELD} />
            <select value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: e.target.value })} aria-label="Tier reward"
              className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
              <option value="">Recognition only</option>
              {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={busy} onClick={add}><Plus size={12} /> Add tier</Button>
          </div>
        )}
      </Section>

      <Section title="Waiting at the desk" icon={HandHeart} count={claims?.length ?? 0} hint="season rewards members claimed">
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
                  <span className="text-[11px] ml-1" style={{ color: MUTED }}>
                    {new Date(c.claimedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
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
      </Section>
    </div>
  );
}
