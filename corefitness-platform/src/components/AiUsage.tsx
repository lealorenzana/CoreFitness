import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Download } from 'lucide-react';
import InfoDot from './InfoDot';
import { downloadCsv } from '../lib/csv';
import { usd } from '../lib/insight';
import { aiOverview, explain, type AiGym } from '../lib/platform';

const n = (v: number) => v.toLocaleString('en-PH');
const tokens = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v));

/**
 * AI, per gym (0149): the AI coach (a real Claude model, 0143 — paid per use)
 * and the in-app assistant (rule-based, 0046 — free to run). Messages and how
 * many members use each; for the coach, tokens and a cost estimated at list
 * price. Counts only: no member is named and no message is read.
 */
export default function AiUsage({ days }: { days: number }) {
  const [rows, setRows] = useState<AiGym[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try { const r = await aiOverview(days); if (alive) { setRows(r); setError(null); } }
      catch (e) { if (alive) { setRows([]); setError(explain(e, '0149')); } }
    })();
    return () => { alive = false; };
  }, [days]);

  const sum = (k: keyof AiGym) => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const using = (rows ?? []).filter((r) => r.coach_messages + r.assistant_messages > 0);
  const top = Math.max(1, ...(rows ?? []).map((r) => r.coach_messages + r.assistant_messages));

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 className="section-title" style={{ display: 'flex' }}><Bot size={14} /> AI, last {days} days
        <InfoDot tip="The AI coach is a real Claude model and costs money per message (an estimate at list price; the real bill is on console.anthropic.com). The in-app assistant is rule-based and free to run. Counted, never read." />
        <button className="btn ghost" style={{ marginLeft: 'auto', height: 30, fontSize: 12 }} disabled={!rows?.length}
          onClick={() => downloadCsv(`core-fitness-ai-${days}d`, rows ?? [], [
            ['Gym', (r) => r.name], ['Coach messages', (r) => r.coach_messages], ['Members using the coach', (r) => r.coach_members],
            ['Tokens in', (r) => r.tokens_in], ['Tokens out', (r) => r.tokens_out], ['Estimated cost (USD)', (r) => r.est_cost_usd],
            ['Assistant questions', (r) => r.assistant_messages], ['Members asking the assistant', (r) => r.assistant_members],
          ])}><Download size={13} /> CSV</button>
      </h2>
      {error ? <p className="err">{error}</p> : rows === null ? <p className="empty">Counting…</p> : (
        <>
          <div className="mini-figs" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', marginTop: 0, paddingTop: 0 }}>
            <span><b>{n(sum('coach_messages'))}</b>AI coach messages</span>
            <span><b>{n(sum('coach_members'))}</b>members using the coach</span>
            <span><b>{usd(sum('est_cost_usd'))}</b>coach cost, estimated</span>
            <span><b>{n(sum('assistant_messages'))}</b>assistant questions</span>
            <span><b>{using.length} of {rows.length}</b>gyms using AI</span>
          </div>
          {using.length === 0 ? (
            <p className="meta">No gym's members used the AI coach or the assistant in these {days} days.
              {' '}The coach appears in the member app once its Edge Function is deployed and a gym's plan includes it.</p>
          ) : (
            <table className="dd-table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Gym</th><th className="num">Coach messages</th><th className="num">Members</th><th className="num">Tokens in / out</th>
                  <th className="num">Est. cost</th><th className="num">Assistant</th><th style={{ width: '22%' }}>Share</th></tr>
              </thead>
              <tbody>
                {using.map((r) => (
                  <tr key={r.gym_id}>
                    <td><Link to={`/gyms/${r.gym_id}`}>{r.name}</Link></td>
                    <td className="num"><b style={{ color: 'var(--text)' }}>{n(r.coach_messages)}</b></td>
                    <td className="num">{n(r.coach_members)}</td>
                    <td className="num">{tokens(r.tokens_in)} / {tokens(r.tokens_out)}</td>
                    <td className="num">{usd(r.est_cost_usd)}</td>
                    <td className="num">{n(r.assistant_messages)}{r.assistant_members ? ` · ${r.assistant_members} people` : ''}</td>
                    <td><div className="meter"><span style={{ width: `${((r.coach_messages + r.assistant_messages) / top) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
