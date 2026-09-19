import { useEffect, useState } from 'react';
import { Coins, Target, Trophy } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';
import { Section } from './kit';
import { showToast } from '../../utils/toast';
import {
  challengeStandings, goalTemplateUsage, listGoalTemplates, listPointRules, updateGoalTemplate, updatePointRule,
  type GoalTemplate, type PointRule, type Standing,
} from '../../lib/api/engagementRules';

const input = 'h-9 rounded-lg px-2.5 text-xs text-white outline-none';
const inputStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)' };

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
      style={{ background: on ? 'var(--color-primary)' : 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
      <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

/**
 * How members earn CORE points (0051's `point_rules`). The member's Rewards
 * screen lists these under "How you earn", so what is typed here is what they
 * read. Points already earned are never recalculated — a change applies to
 * points earned from now on.
 */
export function PointRulesSection() {
  const [rules, setRules] = useState<PointRule[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { label: string; points: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await listPointRules();
        if (alive) setRules(r);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async (rule: PointRule, patch: Partial<Pick<PointRule, 'label' | 'points' | 'is_active'>>) => {
    setBusy(rule.key);
    try {
      await updatePointRule(rule.key, patch);
      setRules((rs) => rs?.map((r) => (r.key === rule.key ? { ...r, ...patch } : r)) ?? null);
      setDraft((d) => { const n = { ...d }; delete n[rule.key]; return n; });
      showToast('Saved — members see it next time they open Rewards', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="How members earn points" icon={Coins} count={rules?.filter((r) => r.is_active).length}
      hint="Shown to members under “How you earn”. Changes apply from now on; points already earned stay.">
      {failed ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>The point rules could not be loaded.</p>
      ) : !rules ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : (
        <div className="space-y-1.5">
          {rules.map((r) => {
            const d = draft[r.key] ?? { label: r.label, points: String(r.points) };
            const dirty = d.label !== r.label || d.points !== String(r.points);
            return (
              <div key={r.key} className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                style={{ background: 'var(--color-surface-raised)', opacity: r.is_active ? 1 : 0.6 }}>
                <Toggle on={r.is_active} label={`${r.label} ${r.is_active ? 'on' : 'off'}`}
                  onChange={(v) => void save(r, { is_active: v })} />
                <input className={`${input} flex-1 min-w-0`} style={inputStyle} value={d.label} aria-label="What members read"
                  onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, label: e.target.value } }))} />
                <input className={`${input} w-20 text-right tabular-nums`} style={inputStyle} value={d.points} inputMode="numeric" aria-label="Points"
                  onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, points: e.target.value.replace(/\D/g, '') } }))} />
                <span className="text-[11px] w-6" style={{ color: 'var(--color-text-muted)' }}>pts</span>
                <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || busy === r.key}
                  onClick={() => void save(r, { label: d.label.trim(), points: Number(d.points) })}>
                  {busy === r.key ? 'Saving…' : 'Save'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/**
 * The goals a member can pick in the phone app (0055). The metric and window
 * are fixed here: `goal_value_of()` reads them live, so editing them would move
 * goals people have already set. The default target applies to new goals only.
 */
export function GoalTemplatesSection() {
  const [items, setItems] = useState<GoalTemplate[] | null>(null);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [draft, setDraft] = useState<Record<string, { label: string; description: string; target: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [t, u] = await Promise.all([listGoalTemplates(), goalTemplateUsage()]);
        if (alive) { setItems(t); setUsage(u); }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async (t: GoalTemplate, patch: Partial<Pick<GoalTemplate, 'label' | 'description' | 'target_default' | 'is_active'>>) => {
    setBusy(t.key);
    try {
      await updateGoalTemplate(t.key, patch);
      setItems((xs) => xs?.map((x) => (x.key === t.key ? { ...x, ...patch } : x)) ?? null);
      setDraft((d) => { const n = { ...d }; delete n[t.key]; return n; });
      showToast('Saved — members see it in the goal picker', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Goal templates" icon={Target} count={items?.filter((t) => t.is_active).length}
      hint="The goals members pick from in the app. How each is measured is fixed, so goals already set never move.">
      {failed ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Goal templates could not be loaded.</p>
      ) : !items ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {items.map((t) => {
            const d = draft[t.key] ?? { label: t.label, description: t.description, target: String(t.target_default) };
            const dirty = d.label !== t.label || d.description !== t.description || d.target !== String(t.target_default);
            const using = usage.get(t.key) ?? 0;
            return (
              <div key={t.key} className="rounded-lg p-3 space-y-2"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', opacity: t.is_active ? 1 : 0.6 }}>
                <div className="flex items-center gap-2">
                  <input className={`${input} flex-1 min-w-0 font-semibold`} style={inputStyle} value={d.label} aria-label="Name"
                    onChange={(e) => setDraft((x) => ({ ...x, [t.key]: { ...d, label: e.target.value } }))} />
                  <Toggle on={t.is_active} label={`${t.label} ${t.is_active ? 'offered' : 'hidden'}`}
                    onChange={(v) => void save(t, { is_active: v })} />
                </div>
                <textarea className="w-full rounded-lg px-2.5 py-2 text-xs text-white outline-none resize-none" rows={2}
                  style={inputStyle} value={d.description} aria-label="Description"
                  onChange={(e) => setDraft((x) => ({ ...x, [t.key]: { ...d, description: e.target.value } }))} />
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Measured as: {t.measured_as}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Default target</span>
                  <input className={`${input} w-16 text-right tabular-nums`} style={inputStyle} value={d.target} inputMode="numeric" aria-label="Default target"
                    onChange={(e) => setDraft((x) => ({ ...x, [t.key]: { ...d, target: e.target.value.replace(/\D/g, '') } }))} />
                  <span className="text-[11px] flex-1" style={{ color: 'var(--color-text-muted)' }}>
                    {using} working on it now
                  </span>
                  <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || busy === t.key}
                    onClick={() => void save(t, { label: d.label.trim(), description: d.description.trim(), target_default: Number(d.target) })}>
                    {busy === t.key ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

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
