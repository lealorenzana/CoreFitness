import { useEffect, useState } from 'react';
import { Goal, Pencil, Check, Lock, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { showToast } from '../../utils/toast';
import {
  goalTemplateReached, goalTemplateUsage, listGoalTemplates, updateGoalTemplate, type GoalTemplate,
} from '../../lib/api/engagementRules';

/** Goals count over a rolling window (period_days), so "the last N days" is what the app checks. */
const windowWord = (days: number) => `in the last ${days} days`;

/**
 * Challenges → Goals members pick (0055, redrawn 2026-10-20): the list members
 * choose a personal goal from. What is measured and over how long are fixed —
 * `goal_value_of()` reads them live, so changing them would move goals people
 * already set; the name, the line, the starting number, whether it is offered
 * and the order are the gym's.
 */
export default function GoalListTab({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<GoalTemplate[] | null | undefined>(undefined);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [reached, setReached] = useState<Map<string, number>>(new Map());
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', description: '', target: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [t, u, r] = await Promise.all([listGoalTemplates(), goalTemplateUsage(), goalTemplateReached()]);
        setItems(t); setUsage(u); setReached(r);
        if (t[0]) { setPick(t[0].key); setDraft({ label: t[0].label, description: t[0].description, target: String(t[0].target_default) }); }
      } catch {
        setItems(null);
      }
    })();
  }, []);

  const open = (t: GoalTemplate) => { setPick(t.key); setDraft({ label: t.label, description: t.description, target: String(t.target_default) }); };
  const save = async (t: GoalTemplate, patch: Parameters<typeof updateGoalTemplate>[1], ok: string) => {
    setBusy(true);
    try {
      await updateGoalTemplate(t.key, patch);
      setItems((xs) => xs?.map((x) => (x.key === t.key ? { ...x, ...patch } : x)) ?? xs);
      showToast(ok, 'success');
      onChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };
  /** Swap with the neighbour: both rows get each other's sort_order. */
  const move = async (i: number, by: -1 | 1) => {
    if (!items) return;
    const a = items[i]; const b = items[i + by];
    if (!a || !b) return;
    const [sa, sb] = a.sort_order === b.sort_order ? [i + by, i] : [b.sort_order, a.sort_order];
    setBusy(true);
    try {
      await Promise.all([updateGoalTemplate(a.key, { sort_order: sa }), updateGoalTemplate(b.key, { sort_order: sb })]);
      const next = [...items]; next[i] = { ...b, sort_order: sb }; next[i + by] = { ...a, sort_order: sa };
      setItems(next);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reorder', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (items === undefined) return <p className="a-sub">Loading…</p>;
  if (items === null) return <div className="a-card"><p className="a-sub">The goal list could not be loaded — a connection problem, not an empty list.</p></div>;
  const t = items.find((x) => x.key === pick) ?? null;
  const target = Number(draft.target) || 0;
  const dirty = !!t && (draft.label !== t.label || draft.description !== t.description || draft.target !== String(t.target_default));

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }} data-goal-list>
      <div className="a-card">
        <div className="a-ct"><h3><Goal size={16} />The goals on your list</h3><small>members pick one in the app · ↑↓ sets the order they see</small></div>
        <div className="a-scroll grow">
          <table className="a-table">
            <thead><tr><th>Offered</th><th>Goal</th><th>Measured as</th><th>Starts at</th><th>Using it</th><th>Reached</th><th /></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.key} data-goal-template={x.key} style={{ background: pick === x.key ? '#ffffff06' : undefined }}>
                  <td><button type="button" className={`a-toggle ${x.is_active ? '' : 'off'}`} disabled={busy} aria-pressed={x.is_active} aria-label={`Offer ${x.label}`}
                    onClick={() => void save(x, { is_active: !x.is_active }, x.is_active ? `${x.label} is hidden from members` : `${x.label} is offered again`)} /></td>
                  <td><b>{x.label}</b><div className="a-sub" style={{ color: x.is_active ? undefined : 'var(--a-muted)' }}>{x.is_active ? `“${x.description}”` : 'hidden from members'}</div></td>
                  <td className="a-sub">{x.measured_as}</td>
                  <td><b>{x.target_default}</b></td>
                  <td className={usage.get(x.key) ? '' : 'a-sub'}>{usage.get(x.key) ?? 0}</td>
                  <td className={reached.get(x.key) ? '' : 'a-sub'}>{reached.get(x.key) ?? 0}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="a-btn ghost sm" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`Move ${x.label} up`}><ArrowUp size={13} /></button>{' '}
                    <button type="button" className="a-btn ghost sm" disabled={busy || i === items.length - 1} onClick={() => void move(i, 1)} aria-label={`Move ${x.label} down`}><ArrowDown size={13} /></button>{' '}
                    <button type="button" className="a-btn ghost sm" onClick={() => open(x)}><Pencil size={13} />Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="a-hint" style={{ marginTop: 10 }}><Info size={14} /><span>The kinds of goal are the ones the app can count honestly from check-ins, workouts and measurements. Hide one you do not want offered; rename any of them.</span></div>
      </div>

      {t && (
        <div className="a-card glow" style={{ overflowY: 'auto' }} data-goal-editor>
          <div className="a-ct"><h3><Pencil size={16} />{t.label}</h3></div>
          <div className="a-sentence" style={{ marginBottom: 10 }}>
            A member picks this to reach <input aria-label="Starting number" inputMode="numeric" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value.replace(/\D/g, '') })} />
            {' '}— <u>{t.measured_as}</u>, {windowWord(t.period_days)}. They can raise or lower the number for themselves.
          </div>
          <div className="a-fld"><label htmlFor="goal-label">Name members see</label>
            <input id="goal-label" className="a-in" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
          <div className="a-fld" style={{ marginTop: 8 }}><label htmlFor="goal-line">One line under it</label>
            <input id="goal-line" className="a-in" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="a-lbl" style={{ margin: '12px 0 6px' }}>What a member sees when they pick it</div>
          <div className="a-prev"><b>{draft.label.trim() || 'Untitled'}</b>
            <div className="a-sub" style={{ margin: '3px 0 8px' }}>0 of {target} · {windowWord(t.period_days)}</div>
            <div className="a-big"><i style={{ width: '2%' }} /></div>
            <div className="a-sub" style={{ marginTop: 6 }}>Marked reached by the app when the count gets there — worth points.</div></div>
          <div className="a-hint" style={{ marginTop: 10 }}><Lock size={14} /><span>How a goal is measured cannot change once members use it, so a goal they set never moves under them. The starting number applies to goals set from now on.</span></div>
          <button type="button" className="a-btn violet" style={{ marginTop: 12 }} disabled={busy || !dirty || !draft.label.trim() || target <= 0}
            onClick={() => void save(t, { label: draft.label.trim(), description: draft.description.trim(), target_default: target }, `${draft.label.trim()} saved — members see it in the goal picker`)} data-save-goal>
            <Check size={15} />Save</button>
        </div>
      )}
    </div>
  );
}
