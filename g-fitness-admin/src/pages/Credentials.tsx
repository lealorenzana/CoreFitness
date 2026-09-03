import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Check, X, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import Card from '../components/ui/Card';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';

/**
 * Trainer certificates, for the person who hires them (migration 0054).
 *
 * ## Why the page exists at all
 *
 * `trainer_profiles.certifications` is free text a trainer types, and the
 * member-facing profile admits the gym does not verify it. That is honest and
 * weak. This is where the gym looks at the actual document and records that it
 * did — who checked, when, and what they decided.
 *
 * ## Signed URLs, never public ones
 *
 * The bucket is private. Each file is opened through a URL that expires in five
 * minutes, so a link copied out of the address bar stops working. A certificate
 * carries a real name and licence number; the avatars pattern (public-read)
 * would have been the wrong one to copy.
 *
 * ## Admin only, and not by accident
 *
 * Staff cannot read these rows at all — RLS refuses, not just the router. They
 * take payments and check people in; reviewing an employee's qualifications is
 * not a front-desk task.
 */

interface Row {
  id: string;
  trainer_id: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: 'pending' | 'verified' | 'rejected';
  uploaded_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  trainer_profiles: { profiles: { first_name: string; last_name: string } | null } | null;
}

const TONE = {
  pending:  { bg: 'var(--color-surface-high)',    fg: 'var(--color-text-muted)', label: 'Pending' },
  verified: { bg: 'var(--color-primary-light)',   fg: 'var(--color-primary)',    label: 'Verified' },
  rejected: { bg: 'var(--color-secondary-light)', fg: 'var(--color-secondary)',  label: 'Rejected' },
} as const;


/**
 * One credential row.
 *
 * Module scope, not inside `Credentials`. A component declared in a render body
 * is a new component *type* on every render, so React unmounts and remounts the
 * whole subtree each time — this project has already been caught doing it once,
 * in PlanBuilder, and the lint rule exists because of it. Everything it needs
 * arrives as props instead of closing over state.
 */
function CredentialRow({
  row, actions, busy, onOpen, onDecide,
}: {
  row: Row;
  actions: boolean;
  busy: string | null;
  onOpen: (r: Row) => void;
  onDecide: (r: Row, status: 'verified' | 'rejected') => void;
}) {
  const tone = TONE[row.status];
  const p = row.trainer_profiles?.profiles;
  const name = p ? `${p.first_name} ${p.last_name}` : 'Trainer';
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg gap-3"
         style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
      <button onClick={() => onOpen(row)} className="flex items-center gap-2.5 min-w-0 text-left">
        <FileText size={14} className="flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{name} — {row.title}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {new Date(row.uploaded_at).toLocaleDateString()}
            {row.size_bytes != null && ` · ${Math.round(row.size_bytes / 1024)} KB`}
            {' · click to open'}
          </p>
          {row.review_note && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-secondary)' }}>
              {row.review_note}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {actions ? (
          <>
            <button onClick={() => onDecide(row, 'verified')} disabled={busy === row.id}
              className="px-3 h-8 rounded-lg text-[11px] font-bold disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: '#fff' }}>
              <Check size={12} className="inline mr-1" />Verify
            </button>
            <button onClick={() => onDecide(row, 'rejected')} disabled={busy === row.id}
              className="px-3 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              <X size={12} className="inline mr-1" />Reject
            </button>
          </>
        ) : (
          <span className="text-[9px] px-2 py-1 rounded-full font-semibold"
                style={{ background: tone.bg, color: tone.fg }}>
            {tone.label}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Credentials() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // `setLoading(true)` deliberately absent: the state already starts true,
  // and setting it synchronously from an effect is what
  // react-hooks/set-state-in-effect exists to catch.
  /** Pure fetch, no state. Keeps every setState behind an await in the caller,
   *  which is what react-hooks/set-state-in-effect is asking for. */
  const fetchRows = async (): Promise<Row[] | null> => {
    const { data, error } = await supabase
      .from('trainer_credentials')
      .select('id, trainer_id, title, file_path, mime_type, size_bytes, status, uploaded_at, reviewed_at, review_note, trainer_profiles(profiles(first_name, last_name))')
      .order('uploaded_at', { ascending: false });
    return error ? null : ((data ?? []) as unknown as Row[]);
  };

  const load = async () => {
    const res = await fetchRows();
    if (res) { setRows(res); setFailed(false); } else setFailed(true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchRows();
      if (!alive) return;
      if (res) setRows(res); else setFailed(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const open = async (row: Row) => {
    const { data, error } = await supabase.storage
      .from('credentials')
      .createSignedUrl(row.file_path, 300);
    if (error || !data?.signedUrl) {
      showToast('Could not open that file', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const decide = async (row: Row, status: 'verified' | 'rejected') => {
    // A rejection the trainer cannot understand is a dead end — they will
    // re-upload the same document.
    const note = status === 'rejected'
      ? window.prompt('Why? The trainer sees this.') ?? ''
      : '';
    if (status === 'rejected' && !note.trim()) {
      showToast('A reason is required to reject', 'error');
      return;
    }
    setBusy(row.id);
    // `reviewed_by` and `reviewed_at` are stamped by the trigger from
    // auth.uid(), not sent from here — the client does not get to say who
    // reviewed something.
    const { error } = await supabase
      .from('trainer_credentials')
      .update({ status, review_note: note.trim() || null })
      .eq('id', row.id);
    setBusy(null);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(status === 'verified' ? 'Marked verified' : 'Rejected', 'success');
    await load();
  };

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading credentials…</div>;
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn&apos;t load credentials</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              A connection problem, not an empty list — nothing has been reviewed or
              missed. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white">Trainer Credentials</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {pending.length} waiting · files open in a link that expires after five minutes
        </p>
      </motion.div>

      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-sm font-bold text-white">Waiting for review</h3>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Nothing to review.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <CredentialRow key={r.id} row={r} actions busy={busy}
                onOpen={open} onDecide={decide} />
            ))}
          </div>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} style={{ color: 'var(--color-text-muted)' }} />
            <h3 className="text-sm font-bold text-white">Already reviewed</h3>
          </div>
          <div className="space-y-2">
            {done.map((r) => (
              <CredentialRow key={r.id} row={r} actions={false} busy={busy}
                onOpen={open} onDecide={decide} />
            ))}
          </div>
        </Card>
      )}

      {rows.length === 0 && (
        <Card className="!p-6 text-center">
          <FileText size={22} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No trainer has uploaded a certificate yet. They add these from their own
            profile screen in the phone app.
          </p>
        </Card>
      )}
    </div>
  );
}
