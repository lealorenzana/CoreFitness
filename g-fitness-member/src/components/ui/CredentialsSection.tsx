import { useState, useEffect, useRef } from 'react';
import { Check, Clock, FileText, Trash, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';
import { TextInput } from './Field';
import { StatusPill } from './noc';
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

const TONE: Record<Credential['status'], { tone: 'muted' | 'structure' | 'action'; label: string }> = {
  pending:  { tone: 'muted',     label: 'Waiting for the gym' },
  verified: { tone: 'structure', label: 'Verified by the gym' },
  rejected: { tone: 'action',    label: 'Not accepted' },
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

  // Drawn in the Nocturne style (2026-09-18): a titled block on the page with
  // rows beneath, not a grey card inside the form.
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Certificates</p>
      <p style={{ fontSize: 12, marginTop: 3, marginBottom: 10, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        Upload the document itself — a PDF or a photo. Only you and the gym owner
        can open it; members never see the file. The gym marks it verified once
        they have looked at it.
      </p>

      {error && (
        <p className="flex items-start" style={{ gap: 7, marginBottom: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
          <WarningCircle size={15} className="flex-none" style={{ marginTop: 1 }} />
          <span>{error}</span>
        </p>
      )}

      <div className="flex" style={{ gap: 8 }}>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. NASM-CPT"
          aria-label="Certificate name"
          className="flex-1 min-w-0"
        />
        <button onClick={pick} disabled={busy}
          className="flex-none inline-flex items-center noc-press disabled:opacity-50"
          style={{
            gap: 6, height: 46, padding: '0 14px', borderRadius: 'var(--radius-btn)', fontSize: 13.5, fontWeight: 600,
            color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
            background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)',
          }}>
          <UploadSimple size={15} /> {busy ? 'Sending…' : 'Add'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {loading ? (
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>
          Nothing uploaded yet.
        </p>
      ) : (
        <div style={{ marginTop: 6 }}>
          {items.map((c, i) => {
            const tone = TONE[c.status];
            return (
              <div key={c.id}>
                <div style={{ padding: '11px 0' }}>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <button onClick={() => open(c)} className="flex items-center min-w-0 text-left" style={{ gap: 8 }}>
                      <FileText size={16} className="flex-none" style={{ color: 'var(--color-primary-300)' }} />
                      <span className="truncate" style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{c.title}</span>
                    </button>
                    <div className="flex items-center flex-none" style={{ gap: 6 }}>
                      <span className="inline-flex items-center" style={{ gap: 4 }}>
                        {c.status === 'verified' ? <Check size={12} style={{ color: 'var(--color-primary-300)' }} />
                          : c.status === 'rejected' ? <X size={12} style={{ color: 'var(--color-secondary)' }} />
                          : <Clock size={12} style={{ color: 'var(--color-text-muted)' }} />}
                        <StatusPill label={tone.label} tone={tone.tone} />
                      </span>
                      <button onClick={() => remove(c)} disabled={busy}
                        aria-label="Remove" className="grid place-items-center"
                        style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  {c.reviewNote && (
                    <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      {c.reviewNote}
                    </p>
                  )}
                </div>
                {i < items.length - 1 && <div className="hair" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
