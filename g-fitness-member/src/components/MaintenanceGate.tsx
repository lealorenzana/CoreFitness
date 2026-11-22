import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Maintenance mode (0263). While Core Fitness has it on, this covers the whole app with the platform's message
 * instead of its screens; it checks again every half minute and on "Check again", and lifts itself when it is off.
 * Before 0263, or if the read fails, it is off: a missing switch never shuts anybody out.
 * Byte-identical in g-fitness-admin and g-fitness-member: diff before changing one.
 */
type State = { on: boolean; message?: string; since?: string };

export default function MaintenanceGate() {
  const [state, setState] = useState<State>({ on: false });
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const { data, error } = await supabase.rpc('platform_maintenance_state');
    setChecking(false);
    setState(!error && data && typeof data === 'object' && (data as State).on ? (data as State) : { on: false });
  }, []);

  useEffect(() => {
    void (async () => { await check(); })();
    const every = window.setInterval(() => { void check(); }, state.on ? 30_000 : 120_000);
    const back = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', back);
    return () => { window.clearInterval(every); document.removeEventListener('visibilitychange', back); };
  }, [check, state.on]);

  if (!state.on) return null;
  const since = state.since ? new Date(state.since).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="mg-title" data-maintenance
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, display: 'grid', placeItems: 'center', padding: 24,
        fontFamily: 'Inter, system-ui, sans-serif' }} className="mg-cover">
      {/* Its own solid colours, light or dark with the device, never borrowed: the apps name their colours differently,
          and a borrowed one left white words on a pale ground in the member app's light mode. */}
      <style>{`.mg-cover{background:#f6f5fa;color:#16141f}@media (prefers-color-scheme: dark){.mg-cover{background:#0e0d12;color:#ececf1}}
        :root[data-mode="light"] .mg-cover{background:#f6f5fa;color:#16141f}
        :root[data-mode="dark"] .mg-cover{background:#0e0d12;color:#ececf1}`}</style>
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.8, display: 'block', margin: '0 auto' }}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <h1 id="mg-title" style={{ margin: '14px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Core Fitness is being updated</h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.85 }}>{state.message}</p>
        {since && <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.6 }}>Since {since}. Nothing you saved is lost.</p>}
        <button type="button" onClick={() => void check()} disabled={checking}
          style={{ marginTop: 20, minHeight: 44, padding: '0 20px', borderRadius: 12, border: '1px solid currentColor', background: 'transparent',
            color: 'inherit', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: checking ? 0.6 : 1 }}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  );
}
