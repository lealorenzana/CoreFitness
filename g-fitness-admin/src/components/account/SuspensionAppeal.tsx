import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Appealing a Core Fitness suspension (0265, owner 2026-11-23): once per suspension, a statement of 20 to 2000
 * characters and, if they like, one photo or PDF kept privately for the platform. A platform admin decides; an upheld
 * appeal is shown here with the reviewer's note, a lifted one simply opens the app again.
 * Byte-identical in the member and admin apps (components/account/), so diff before changing one.
 */
export type Appeal = { status: 'pending' | 'upheld' | 'lifted'; sent_at: string; decision_note: string | null; decided_at: string | null } | null;

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
const MAX_FILE = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const box: React.CSSProperties = { marginTop: 18, textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: '1px solid var(--color-border)' };
const line: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)', marginTop: 6 };

export default function SuspensionAppeal({ appeal }: { appeal: Appeal | undefined }) {
  const [state, setState] = useState<Appeal>(appeal ?? null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state?.status === 'pending') {
    return (
      <div style={box} data-appeal-pending>
        <b style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Your appeal is with Core Fitness</b>
        <p style={line}>Sent on {day(state.sent_at)}. A Core Fitness admin reviews it and answers here. Each suspension can be appealed once.</p>
      </div>
    );
  }
  if (state?.status === 'upheld') {
    return (
      <div style={box} data-appeal-upheld>
        <b style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Your appeal was turned down</b>
        {state.decision_note && <p style={{ ...line, color: 'var(--color-text-primary)' }}>{state.decision_note}</p>}
        <p style={line}>Decided{state.decided_at ? ` on ${day(state.decided_at)}` : ''}. Each suspension can be appealed once.</p>
      </div>
    );
  }

  const pick = (f: File | null) => {
    setError(null);
    if (f && !TYPES.includes(f.type)) { setError('Attach a photo (JPEG, PNG or WebP) or a PDF.'); return; }
    if (f && f.size > MAX_FILE) { setError('Keep the file under 5 MB.'); return; }
    setFile(f);
  };

  const send = async () => {
    const statement = text.trim();
    if (statement.length < 20) { setError('Say what happened in at least 20 characters.'); return; }
    setBusy(true); setError(null);
    try {
      let path: string | null = null;
      if (file) {
        const { data: me } = await supabase.auth.getUser();
        if (!me.user) throw new Error('Sign in again to send your appeal.');
        path = `${me.user.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)}`;
        const up = await supabase.storage.from('appeals').upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error('The file could not be uploaded. Try again, or send the appeal without it.');
      }
      const { error: e } = await supabase.rpc('appeal_my_suspension', { p_statement: statement, p_attachment: path });
      if (e) {
        // Before 0265 is live the function does not exist: say so, rather than a database message.
        throw new Error(/appeal_my_suspension|function/i.test(e.message) && /not|find|exist/i.test(e.message)
          ? 'Appeals open here soon. Until then, reply to the email Core Fitness sent you.' : e.message);
      }
      setState({ status: 'pending', sent_at: new Date().toISOString(), decision_note: null, decided_at: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your appeal could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={box} data-appeal-form>
      {/* Words on the action fill: dark on dark mode's bright amber, white on light mode's deep fill. */}
      <style>{'[data-appeal-send]{color:var(--on-secondary,#111)}:root[data-mode="light"] [data-appeal-send]{color:#fff}'}</style>
      <b style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Appeal this suspension</b>
      <p style={line}>Tell Core Fitness what happened. You can appeal once; a Core Fitness admin reads it and answers here. Your gym does not see it.</p>
      <label htmlFor="appeal-text" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 12, color: 'var(--color-text-secondary)' }}>What happened</label>
      <textarea id="appeal-text" value={text} maxLength={2000} rows={5} onChange={(e) => { setText(e.target.value); setError(null); }}
        placeholder="Explain in your own words. Include anything that shows it was a mistake."
        style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, resize: 'vertical',
          background: 'var(--color-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} />
      <p style={{ fontSize: 11.5, marginTop: 4, color: 'var(--color-text-muted)', textAlign: 'right' }}>{text.trim().length} of 2000{text.trim().length < 20 ? ', at least 20' : ''}</p>
      <label htmlFor="appeal-file" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 8, color: 'var(--color-text-secondary)' }}>
        A photo or PDF <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· optional, under 5 MB</span>
      </label>
      <input id="appeal-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)}
        style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary)', width: '100%' }} />
      {error && <p role="alert" style={{ ...line, color: 'var(--color-secondary)' }} data-appeal-error>{error}</p>}
      <button type="button" onClick={() => void send()} disabled={busy} data-appeal-send
        style={{ marginTop: 14, width: '100%', height: 44, borderRadius: 12, fontWeight: 700, fontSize: 14,
          background: 'var(--fill-action, var(--color-secondary))', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Send my appeal'}
      </button>
    </div>
  );
}
