import { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, Check, Clock, X, AlertTriangle } from 'lucide-react';
import { panelStyle } from './Card';
import {
  listMyCredentials, uploadCredential, deleteCredential, credentialUrl,
  type Credential,
} from '../../lib/api/trainerCredentials';
import { errorMessage } from '../../utils/errorMessage';

/**
 * A trainer's certificates, on their own profile screen (migration 0054).
 *
 * ## What this is honest about
 *
 * The certifications *text* field above this says the gym does not verify it,
 * and that stays true — it is still whatever the trainer typed. This section is
 * the separate thing: the document, and whether anyone has looked at it.
 *
 * A trainer cannot set the status. The database refuses it (0054), and this
 * screen shows the status as a read-only badge rather than a control, so the
 * refusal is never something the trainer discovers by being rejected.
 *
 * ## Members never see any of this
 *
 * Not the file, not the status. RLS restricts reads to the owner and the admin.
 */

const TONE: Record<Credential['status'], { bg: string; fg: string; label: string }> = {
  pending:  { bg: 'var(--color-surface-high)',   fg: 'var(--color-text-muted)',  label: 'Waiting for the gym' },
  verified: { bg: 'var(--color-primary-light)',  fg: 'var(--color-primary)',     label: 'Verified by the gym' },
  rejected: { bg: 'var(--color-secondary-light)',fg: 'var(--color-secondary)',   label: 'Not accepted' },
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png';

export default function CredentialsSection({ trainerId }: { trainerId: string }) {
  const [items, setItems] = useState<Credential[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setItems(await listMyCredentials(trainerId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    let alive = true;
    // Awaited first, so nothing is set synchronously from the effect body.
    (async () => {
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerId]);

  const pick = () => {
    if (!title.trim()) {
      setError('Give the document a name first — "NASM-CPT", "First Aid".');
      return;
    }
    setError(null);
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = '';
    if (!file) return;

    // Checked here as well as by the bucket, because a 5 MB rejection from
    // storage arrives after the upload has already been attempted over what is
    // often mobile data.
    if (file.size > MAX_BYTES) {
      setError('That file is over 5 MB. A phone photo or a scan should be well under.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadCredential(trainerId, title, file);
      setTitle('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = async (c: Credential) => {
    const url = await credentialUrl(c.filePath);
    if (!url) {
      setError('That file could not be opened just now. Try again in a moment.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const remove = async (c: Credential) => {
    setBusy(true);
    try {
      await deleteCredential(c.id, c.filePath);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl" style={panelStyle}>
      <p className="text-xs font-bold text-white">Certificates</p>
      <p className="text-[10px] mt-1 mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Upload the document itself — a PDF or a photo. Only you and the gym owner
        can open it; members never see the file. The gym marks it verified once
        they have looked at it.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-xl flex items-start gap-2 text-[10px] leading-relaxed mb-3"
             style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. NASM-CPT"
          className="field-input flex-1 min-w-0 h-11 px-3 rounded-xl text-xs text-white"
          style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
        />
        <button onClick={pick} disabled={busy}
          className="px-3.5 h-11 rounded-xl text-[11px] font-bold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
          style={{ background: 'var(--color-secondary)', color: '#1A1200' }}>
          <Upload size={13} /> {busy ? 'Sending…' : 'Add'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {loading ? (
        <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
          Nothing uploaded yet.
        </p>
      ) : (
        <div className="space-y-2 mt-3">
          {items.map((c) => {
            const tone = TONE[c.status];
            return (
              <div key={c.id} className="p-3 rounded-xl"
                   style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => open(c)}
                    className="flex items-center gap-2 min-w-0 text-left">
                    <FileText size={14} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    <span className="text-xs text-white truncate">{c.title}</span>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[9px] px-2 py-1 rounded-full font-semibold flex items-center gap-1"
                          style={{ background: tone.bg, color: tone.fg }}>
                      {c.status === 'verified' ? <Check size={9} />
                        : c.status === 'rejected' ? <X size={9} /> : <Clock size={9} />}
                      {tone.label}
                    </span>
                    <button onClick={() => remove(c)} disabled={busy}
                      aria-label="Remove" className="p-1.5 rounded-lg"
                      style={{ color: 'var(--color-text-muted)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {c.reviewNote && (
                  <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {c.reviewNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
