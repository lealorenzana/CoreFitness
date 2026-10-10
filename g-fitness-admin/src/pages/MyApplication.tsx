import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, Send } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext, getGymContext } from '../lib/gymContext';
import { myApplications, replyToApplication, withdrawApplication, type MyApplication as App } from '../lib/api/applications';
import ApplicationDocuments from '../components/ApplicationDocuments';
import { showToast } from '../utils/toast';

const MUTED = 'var(--color-text-muted)';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const PILL: Record<App['status'], string> = { pending: 'Being read', approved: 'Let in', rejected: 'Not this time', withdrawn: 'Called off' };

/**
 * `/admin/application` (0187): someone who applied on the website and signs in
 * here before their gym exists. The dashboard stays shut until the platform
 * lets the gym in; meanwhile this is where they follow the application, talk to
 * Core Fitness, send the six business documents, or call it off.
 */
export default function MyApplication() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { navigate('/admin/login', { replace: true }); return; }
    try { setApps(await myApplications()); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not load your application', 'error'); setApps([]); }
  }, [navigate]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const signOut = async () => { await supabase.auth.signOut(); clearGymContext(); navigate('/admin/login', { replace: true }); };
  const openGym = async () => {
    const ctx = await getGymContext(true);
    if (ctx?.role === 'admin' && ctx.status === 'active') navigate(ctx.onboarded ? '/admin/dashboard' : '/admin/setup');
    else showToast('Your gym is not ready yet — Core Fitness is setting it up.', 'info');
  };

  if (apps === null) return <Shell onSignOut={signOut}><p className="text-sm" style={{ color: MUTED }}>Opening your application…</p></Shell>;
  if (apps.length === 0) {
    return (
      <Shell onSignOut={signOut}>
        <h1 className="text-xl font-semibold text-white">No gym here yet</h1>
        <p className="text-sm mt-2" style={{ color: MUTED }}>
          This account has no application and runs no gym. Register your gym on the Core Fitness website, or sign in with the email you applied with.
        </p>
      </Shell>
    );
  }
  const a = apps.find((x) => x.id === pick) ?? apps[0]!;
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await replyToApplication(a.id, body.trim()); setBody(''); await load(); window.setTimeout(() => end.current?.scrollIntoView({ block: 'nearest' }), 50); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };
  const callOff = async () => {
    setBusy(true);
    try { await withdrawApplication(a.id); showToast('Application called off', 'success'); setCalling(false); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not call it off', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Shell onSignOut={signOut}>
      {apps.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {apps.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === a.id} onClick={() => setPick(x.id)}
              className="text-xs font-semibold rounded-full px-3 py-1.5"
              style={{ background: x.id === a.id ? 'var(--color-primary)' : 'var(--color-surface)', color: x.id === a.id ? '#fff' : 'var(--color-text-secondary)' }}>
              {x.gym_name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] font-semibold uppercase flex items-center gap-1.5" style={{ color: MUTED }}><ClipboardList size={13} /> Your application</p>
      <h1 className="text-2xl font-bold text-white mt-1">{a.gym_name}</h1>
      <p className="text-sm mt-1" style={{ color: MUTED }}>
        <span className="inline-block rounded-full px-2 py-0.5 mr-2 text-xs font-semibold" style={{ background: 'var(--color-surface-high)', color: '#fff' }} data-application-status>{PILL[a.status]}</span>
        Applied {day(a.created_at)}{a.plan ? ` · ${a.plan.name}` : ''}
      </p>

      <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
        {a.status === 'pending' && (a.missing.length > 0
          ? <>Core Fitness lets a gym in once its business documents are verified. Still needed: <b>{a.missing.join('; ')}</b>. Send them below — the dashboard opens once your gym is let in.</>
          : <>Every document is verified. Core Fitness will let {a.gym_name} in shortly — you can write to them below.</>)}
        {a.status === 'approved' && (
          <div className="flex flex-wrap items-center gap-3">
            <span><b>{a.gym_name} is in.</b> Open it to set your gym up.</span>
            <button type="button" onClick={() => void openGym()} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-secondary)', color: '#111' }}>Open my gym</button>
          </div>
        )}
        {a.status === 'rejected' && <>Core Fitness cannot take {a.gym_name} on right now{a.reason ? `: ${a.reason}` : '.'} You can still write to them below.</>}
        {a.status === 'withdrawn' && <>You called this application off. You can still write to Core Fitness below.</>}
      </div>

      {(a.status === 'pending' || a.status === 'approved') && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-white mb-2">Business documents</h2>
          <ApplicationDocuments applicationId={a.id} documents={a.documents} onChanged={load} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-white mb-2">Messages with Core Fitness</h2>
        <div className="space-y-2" data-thread>
          {a.messages.length === 0 && <p className="text-xs" style={{ color: MUTED }}>No messages yet. Ask anything — pricing, setup, moving your members over.</p>}
          {a.messages.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.from_platform ? '' : 'ml-auto'}`}
              style={{ background: m.from_platform ? 'var(--color-surface)' : 'color-mix(in srgb, var(--color-primary) 22%, transparent)', color: 'var(--color-text-primary)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: MUTED }}>{m.from_platform ? 'Core Fitness' : 'You'} · {stamp(m.created_at)}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="mt-3 flex gap-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={2} placeholder="Write to Core Fitness…"
            aria-label="Message to Core Fitness"
            className="flex-1 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: '#fff' }} />
          <button type="button" disabled={busy || !body.trim()} onClick={() => void send()}
            className="self-end inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-secondary)', color: '#111' }}><Send size={13} /> Send</button>
        </div>
      </section>

      {a.status === 'pending' && (
        <div className="mt-8">
          {calling ? (
            <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
              Call off {a.gym_name}'s application? Core Fitness stops reviewing it. You can apply again later.
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void callOff()} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--color-secondary)', color: '#111' }}>Call it off</button>
                <button type="button" onClick={() => setCalling(false)} className="rounded-lg px-3 py-1.5 text-xs" style={{ color: MUTED }}>Keep it</button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-xs underline" style={{ color: MUTED }} onClick={() => setCalling(true)}>Call off this application</button>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut: () => void }) {
  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex justify-end">
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 text-xs" style={{ color: MUTED }}><LogOut size={13} /> Sign out</button>
        </div>
        {children}
      </div>
    </div>
  );
}
