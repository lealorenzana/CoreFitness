import { useCallback, useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './gymdocs.css';

/**
 * Maintenance mode (0263): one switch that covers the admin app and the member app (members and coaches) with your
 * message, for an update or an outage. You are never shut out yourself. Clearing it lifts the notice within half a
 * minute on every open app. Before 0263 is pasted this says so and does nothing.
 */
type State = { on: boolean; message?: string; since?: string } | null;

export default function MaintenanceSwitch() {
  const [state, setState] = useState<State | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('platform_maintenance_admin');
    if (error) { setState(null); return; }
    const s = (data ?? { on: false }) as NonNullable<State>;
    setState(s);
    setText(s.on ? s.message ?? '' : '');
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const set = async (message: string) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('set_platform_maintenance', { p_message: message });
    setBusy(false); setConfirm(false);
    if (error) { setErr(error.message); return; }
    await load();
  };

  if (state === undefined) return <section className="card mx"><p className="mx-sub">Reading the switch…</p></section>;
  const on = !!state?.on;
  return (
    <section className={`card mx${on ? ' on' : ''}`} data-maintenance-switch>
      <header className="mx-head">
        <span className="mx-icon">{on ? <PauseCircle size={18} /> : <Wrench size={18} />}</span>
        <span className="mx-title"><b>Maintenance mode</b>
          <em>{state === null ? 'Needs migration 0263, paste it first.'
            : on ? `On since ${new Date(state.since!).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: every gym's apps show your message.`
            : 'Off. Turn it on to cover the admin and member apps with a message during an update or an outage.'}</em></span>
        {on && <button type="button" className="btn sm" disabled={busy} onClick={() => void set('')}><PlayCircle size={14} /> Turn it off</button>}
      </header>
      {state !== null && (
        <div className="mx-body">
          <textarea rows={2} maxLength={400} value={text} placeholder="We are updating Core Fitness. Back by 10pm tonight." aria-label="Maintenance message"
            onChange={(e) => setText(e.target.value)} />
          {confirm ? (
            <div className="mx-row"><span className="mx-warn">Every owner, desk, coach and member is shut out until you turn it off. Turn it on?</span>
              <button type="button" className="btn sm" disabled={busy} onClick={() => void set(text)}>Turn it on</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button></div>
          ) : (
            <div className="mx-row"><span className="mx-count">{text.trim().length}/400</span>
              {on ? <button type="button" className="btn ghost sm" disabled={busy || text.trim() === state.message || text.trim().length < 3} onClick={() => void set(text)}>Save the message</button>
                : <button type="button" className="btn sm" disabled={busy || text.trim().length < 3} onClick={() => setConfirm(true)}><PauseCircle size={14} /> Turn on…</button>}</div>
          )}
          {err && <p className="mx-warn">{err}</p>}
        </div>
      )}
    </section>
  );
}
