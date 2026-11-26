import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type Turn = { role: 'user' | 'assistant'; content: string; sources?: { title: string; link: string | null }[]; failed?: boolean };
type Status = { allowed: boolean; reason: string | null; used_today: number; daily_limit: number };

/** A source opens here only when it is a page of this app (member pages like /terms are named, not linked). */
const ADMIN_PAGE = (link: string | null) => !!link && link.startsWith('/') && !/^\/(terms|privacy|member)\b/.test(link);
const SAMPLES = ['How do I set up time slots?', 'How do members pay me online?', 'What do our Terms say about freezing?'];

/**
 * Help that answers (0283): the owner or desk asks "how do I…", and the answer comes from the setup
 * guides and the gym's own documents (0282's search), with buttons to the page it names. It uses the
 * gym's AI messages, with its own daily limit per account (Settings → the AI limits).
 */
export default function AskHelp() {
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadStatus = async () => {
    const { data } = await supabase.rpc('staff_help_status');
    setStatus((data as Status | null) ?? null);
  };
  useEffect(() => { void (async () => { await loadStatus(); })(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = turns.filter((t) => !t.failed).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: 'user', content: question }]);
    setQ(''); setBusy(true);
    const { data, error } = await supabase.functions.invoke('staff-help', { body: { question, history } });
    let reply: Turn;
    if (error) {
      let message = 'Help is busy. Try again in a minute.';
      try { message = ((await (error as { context?: Response }).context?.json()) as { message?: string })?.message ?? message; } catch { /* keep */ }
      reply = { role: 'assistant', content: message, failed: true };
    } else {
      const d = data as { text: string; sources?: Turn['sources'] };
      reply = { role: 'assistant', content: d.text, sources: d.sources ?? [] };
    }
    setTurns((t) => [...t, reply]);
    setBusy(false);
    void loadStatus();
  };

  const off = status && !status.allowed && status.reason !== 'daily_limit';
  return (
    <div className="a-card" data-help-ask style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="a-ct">
        <h3><Sparkles size={16} />Ask Help</h3>
        <small>answers from the setup guides and your gym's documents, with a button to the page</small>
        {status && <small style={{ marginLeft: 'auto' }} data-help-usage>{status.used_today} of {status.daily_limit} today</small>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
        {turns.length === 0 && (
          <div className="a-sub" data-help-empty>
            {off ? (status?.reason === 'switched_off' ? 'Turn on the Assistant in Your app to use Help.'
              : status?.reason === 'monthly_limit' ? 'This month’s AI messages are used. Buy more on Your app, or it starts again on the 1st.'
              : 'Help is for the gym’s owner and front desk.')
              : <>Try one:
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {SAMPLES.map((s) => <button key={s} type="button" className="a-btn sm ghost" onClick={() => void ask(s)}>{s}</button>)}
                </span></>}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} data-help-turn={t.role} style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'stretch', maxWidth: t.role === 'user' ? '75%' : '100%' }}>
            <p className="a-sub" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--a-ink)', fontSize: 13.5, lineHeight: 1.55,
              ...(t.role === 'user' ? { background: 'var(--a-plight)', border: '1px solid var(--a-line)', borderRadius: 12, padding: '8px 12px' } : {}) }}>{t.content}</p>
            {t.sources && t.sources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }} data-help-sources>
                <small className="a-sub" style={{ margin: 0 }}>Read from</small>
                {t.sources.map((s) => ADMIN_PAGE(s.link)
                  ? <button key={s.title} type="button" className="a-btn sm" onClick={() => navigate(s.link!)}>{s.title}</button>
                  : <span key={s.title} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--a-line)', color: 'var(--a-text2)' }}>{s.title}</span>)}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="a-sub" role="status" style={{ margin: 0 }}>Looking it up…</p>}
        <div ref={end} />
      </div>
      <form className="a-input" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} placeholder="How do I…" aria-label="Ask Help" disabled={busy || !!off} />
        <button type="submit" className="a-btn violet sm" disabled={busy || !q.trim() || !!off}><Send size={14} />Ask</button>
      </form>
    </div>
  );
}
