import { useEffect, useState } from 'react';
import { UsersRound, Info, Lightbulb, Flame } from 'lucide-react';
import { Av } from '../../pages/attendance/parts';
import { supabase } from '../../lib/supabaseClient';
import { todayKey, addDays } from '../../utils/dates';

interface Row { id: string; name: string; code: string; target: number; maker: string | null; people: { id: string; name: string; photo: string | null }[]; days: number | null; streak: number }

/** Monday of this week, on the local (Manila) calendar — what manila_week_start() returns. */
const monday = (today: string) => { const [y, m, d] = today.split('-').map(Number); const dow = new Date(y, m - 1, d).getDay(); return addDays(today, -((dow + 6) % 7)); };

/**
 * Challenges → Squads (0124, redrawn 2026-10-20): the members' own small
 * groups — made, joined and left in the app; the owner and desk see them and
 * do not edit them (no write policy for anyone). This week's days are
 * `squad_days()`, the same number the squad sees; "weeks in a row" counts the
 * reached weeks `settle_squads()` recorded.
 */
export default function SquadsTab() {
  const [today] = useState(() => todayKey());
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const week = monday(today);
      const [s, m, w] = await Promise.all([
        supabase.from('squads').select('id, name, code, weekly_target, created_by').is('archived_at', null).order('name'),
        supabase.from('squad_members').select('squad_id, member_id').is('left_at', null),
        supabase.from('squad_weeks').select('squad_id, week_start'),
      ]);
      if (s.error) { setRows(null); return; }
      const ids = [...new Set([...(m.data ?? []).map((x) => x.member_id as string), ...(s.data ?? []).map((x) => x.created_by as string)])];
      const p = ids.length ? await supabase.from('gym_people').select('id, first_name, last_name, photo_url').in('id', ids) : { data: [] };
      const who = new Map(((p.data ?? []) as { id: string; first_name: string; last_name: string; photo_url: string | null }[]).map((x) => [x.id, { id: x.id, name: `${x.first_name} ${x.last_name}`.trim(), photo: x.photo_url }]));
      const reached = new Map<string, Set<string>>();
      for (const r of (w.data ?? []) as { squad_id: string; week_start: string }[]) { if (!reached.has(r.squad_id)) reached.set(r.squad_id, new Set()); reached.get(r.squad_id)!.add(r.week_start); }
      const out = await Promise.all(((s.data ?? []) as { id: string; name: string; code: string; weekly_target: number; created_by: string }[]).map(async (q) => {
        const d = await supabase.rpc('squad_days', { p_squad: q.id, p_week: week });
        // Weeks in a row: this week if already reached, then each week before it while reached.
        const got = reached.get(q.id) ?? new Set();
        let streak = 0; let wk = got.has(week) ? week : addDays(week, -7);
        while (got.has(wk)) { streak++; wk = addDays(wk, -7); }
        return { id: q.id, name: q.name, code: q.code, target: q.weekly_target, maker: who.get(q.created_by)?.name.split(' ')[0] ?? null,
          people: (m.data ?? []).filter((x) => x.squad_id === q.id).map((x) => who.get(x.member_id as string)).filter((x): x is { id: string; name: string; photo: string | null } => !!x),
          days: d.error ? null : Number(d.data), streak };
      }));
      setRows(out);
    })();
  }, [today]);

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', flex: 1 }} data-squads>
      <div className="a-card">
        <div className="a-ct"><h3><UsersRound size={16} />Squads this week</h3><small>members make these in the app · you see them, they run them</small></div>
        <div className="a-scroll grow">
          {rows === undefined ? <p className="a-sub">Loading…</p> : rows === null ? <p className="a-sub">Squads need migration 0124.</p> : rows.length === 0 ? (
            <p className="a-sub" style={{ padding: '10px 0' }}>No squads yet. Members start one under Squads in the app and invite friends with its code.</p>
          ) : (
            <table className="a-table">
              <thead><tr><th>Squad</th><th>Members</th><th>This week</th><th>Weeks hit in a row</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const hit = r.days != null && r.days >= r.target;
                  return (
                    <tr key={r.id} data-squad-row={r.name}>
                      <td><b>{r.name}</b><div className="a-sub">code {r.code}{r.maker ? ` · made by ${r.maker}` : ''}</div></td>
                      <td><div className="a-avs" data-tip={r.people.map((x) => x.name).join(', ')}>{r.people.slice(0, 4).map((x) => <Av key={x.id} name={x.name} photo={x.photo} small />)}{r.people.length > 4 && <span className="a-av s">+{r.people.length - 4}</span>}</div></td>
                      <td>{r.days == null ? <span className="a-sub">—</span> : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div className="a-bar" style={{ maxWidth: 90 }}><i style={{ width: `${Math.min(100, (r.days / r.target) * 100)}%` }} /></div>
                          <span className="a-sub" style={{ color: hit ? 'var(--a-p300)' : undefined }}>{r.days} of {r.target} days{hit ? ' · hit' : ''}</span></div>)}</td>
                      <td>{r.streak > 0 ? <><b>{r.streak}</b> <Flame size={13} style={{ display: 'inline', color: 'var(--a-amber)' }} /></> : <span className="a-sub">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="a-card" data-squads-how>
        <div className="a-ct"><h3><Info size={16} />How squads work</h3></div>
        <div className="a-step" style={{ fontWeight: 500, alignItems: 'flex-start' }}><span>1</span><div className="a-sub" style={{ fontSize: 12.5, color: 'var(--a-text2)' }}>A member opens Squads in the app, names one and gets a six-letter code.</div></div>
        <div className="a-step" style={{ fontWeight: 500, alignItems: 'flex-start' }}><span>2</span><div className="a-sub" style={{ fontSize: 12.5, color: 'var(--a-text2)' }}>Friends join with the code — five at most. The squad sets a weekly target: days trained between them.</div></div>
        <div className="a-step" style={{ fontWeight: 500, alignItems: 'flex-start' }}><span>3</span><div className="a-sub" style={{ fontSize: 12.5, color: 'var(--a-text2)' }}>Every member's training days count for the squad, Monday to Sunday. A week they hit pays each of them the squad-week points from Rewards.</div></div>
        <div className="a-hint" style={{ marginTop: 6 }}><Lightbulb size={14} /><span>Squads cost you nothing to run. Mention them at the desk — members who train with friends have a reason to show up.</span></div>
      </div>
    </div>
  );
}
