import { useState, useEffect, useRef } from 'react';
import { Check, Clock, FileText, PencilSimple, Plus, Trash, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';
import { TextInput } from './Field';
import { StatusPill } from './noc';
import {
  listMyCredentials, uploadCredential, deleteCredential, credentialUrl, updateCredentialDetails, runCredentialExpirySweep,
  type Credential,
} from '../../lib/api/trainerCredentials';
import { errorMessage } from '../../utils/errorMessage';
import { todayKey } from '../../utils/dates';

/** Whole days from a to b, both YYYY-MM-DD on the local calendar. */
const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000);
};

/**
 * A trainer's certificates, on their own profile screen (0054; 0160 adds who
 * issued it, its number and its dates).
 *
 * The certifications *text* field above stays the trainer's own words; this is
 * the document, and whether the gym has looked at it. A trainer cannot set the
 * status — the database refuses it — so it shows as a badge, not a control.
 * Members see a verified one's name, issuer and "valid until" on the coach's
 * profile, never the file or the number, and only while it is in date.
 */

const TONE: Record<Credential['status'], { tone: 'muted' | 'structure' | 'action'; label: string }> = {
  pending:  { tone: 'muted',     label: 'Waiting for the gym' },
  verified: { tone: 'structure', label: 'Verified by the gym' },
  rejected: { tone: 'action',    label: 'Not accepted' },
};
const COMMON = ['First Aid / CPR', 'Personal Trainer (CPT)', 'Group Fitness', 'Strength & Conditioning', 'Nutrition coaching', 'Yoga teacher'];
const ISSUERS = ['Philippine Red Cross', 'TESDA', 'NASM', 'ACE', 'ISSA', 'ACSM', 'NSCA'];
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const EMPTY = { title: '', issuer: '', credentialNumber: '', issuedOn: '', expiresOn: '', noExpiry: false };
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="noc-press"
      style={{ height: 32, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
        background: on ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'var(--color-surface)',
        color: on ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
        border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
      {children}
    </button>
  );
}

/** "Valid until …", "Expires in 12 days", "Expired" — from the date, never stored. */
function validity(c: Credential): { text: string; warn: boolean } | null {
  if (!c.expiresOn) return null;
  const left = daysBetween(todayKey(), c.expiresOn);
  if (left < 0) return { text: `Expired ${fmt(c.expiresOn)} — upload the renewed one`, warn: true };
  if (left <= 30) return { text: `Expires in ${left} day${left === 1 ? '' : 's'} (${fmt(c.expiresOn)})`, warn: true };
  return { text: `Valid until ${fmt(c.expiresOn)}`, warn: false };
}

export default function CredentialsSection({ trainerId }: { trainerId: string }) {
  const [items, setItems] = useState<Credential[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
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
    (async () => {
      await runCredentialExpirySweep();
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerId]);

  const details = () => ({ issuer: form.issuer, credentialNumber: form.credentialNumber, issuedOn: form.issuedOn || null,
    expiresOn: form.noExpiry ? null : form.expiresOn || null });
  const formError = () => {
    if (!form.title.trim()) return 'Name the certificate — "First Aid / CPR", "NASM-CPT".';
    if (!form.noExpiry && !form.expiresOn) return 'Add the expiry date, or tick "It does not expire".';
    if (form.issuedOn && form.expiresOn && form.expiresOn < form.issuedOn) return 'It cannot expire before it was issued.';
    return null;
  };

  const pick = () => {
    const e = formError();
    if (e) { setError(e); return; }
    setError(null);
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('That file is over 5 MB. A phone photo or a scan should be well under.'); return; }
    setBusy(true);
    setError(null);
    try {
      await uploadCredential(trainerId, form.title, file, details());
      setForm(EMPTY); setAdding(false);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (c: Credential) => {
    const e = formError();
    if (e) { setError(e); return; }
    setBusy(true);
    try {
      await updateCredentialDetails(c.id, form.title, details());
      setEditing(null); setForm(EMPTY);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = async (c: Credential) => {
    const url = await credentialUrl(c.filePath);
    if (!url) { setError('That file could not be opened just now. Try again in a moment.'); return; }
    window.open(url, '_blank', 'noopener');
  };

  const remove = async (c: Credential) => {
    setBusy(true);
    try { await deleteCredential(c.id, c.filePath); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const fields = (
    <div className="flex flex-col" style={{ gap: 10, marginTop: 10 }}>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {COMMON.map((c) => <Chip key={c} on={form.title === c} onClick={() => setForm({ ...form, title: c })}>{c}</Chip>)}
      </div>
      <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Certificate name" aria-label="Certificate name" />
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {ISSUERS.map((c) => <Chip key={c} on={form.issuer === c} onClick={() => setForm({ ...form, issuer: c })}>{c}</Chip>)}
      </div>
      <TextInput value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Who issued it" aria-label="Issued by" />
      <TextInput value={form.credentialNumber} onChange={(e) => setForm({ ...form, credentialNumber: e.target.value })} placeholder="Certificate or licence number (optional)" aria-label="Certificate number" />
      <div className="grid grid-cols-2" style={{ gap: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Issued
          <TextInput type="date" value={form.issuedOn} max={todayKey()} onChange={(e) => setForm({ ...form, issuedOn: e.target.value })} aria-label="Issued on" style={{ colorScheme: 'dark', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Expires
          <TextInput type="date" value={form.expiresOn} disabled={form.noExpiry} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} aria-label="Expires on" style={{ colorScheme: 'dark', marginTop: 4 }} />
        </label>
      </div>
      <label className="flex items-center" style={{ gap: 8, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={form.noExpiry} onChange={(e) => setForm({ ...form, noExpiry: e.target.checked, expiresOn: '' })} /> It does not expire
      </label>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Certificates</p>
      <p style={{ fontSize: 12, marginTop: 3, marginBottom: 10, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        Upload the document — a PDF or a photo. Only you and the gym owner can open it. Once the gym verifies it, members see its
        name, who issued it and until when on your profile (never the file or the number), until it expires.
      </p>

      {error && (
        <p className="flex items-start" style={{ gap: 7, marginBottom: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
          <WarningCircle size={15} className="flex-none" style={{ marginTop: 1 }} />
          <span>{error}</span>
        </p>
      )}

      {!adding && !editing && (
        <button onClick={() => { setForm(EMPTY); setAdding(true); setError(null); }} className="inline-flex items-center noc-press"
          style={{ gap: 6, height: 42, padding: '0 14px', borderRadius: 'var(--radius-btn)', fontSize: 13.5, fontWeight: 600,
            color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)', background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)' }}>
          <Plus size={15} /> Add a certificate
        </button>
      )}

      {adding && (
        <div style={{ padding: 12, borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>New certificate</p>
          {fields}
          <div className="flex" style={{ gap: 8, marginTop: 12 }}>
            <button onClick={pick} disabled={busy} className="flex-1 inline-flex items-center justify-center noc-press disabled:opacity-50"
              style={{ gap: 6, height: 44, borderRadius: 'var(--radius-btn)', fontSize: 13.5, fontWeight: 700, background: 'var(--color-secondary)', color: '#1a1205' }}>
              <UploadSimple size={15} /> {busy ? 'Sending…' : 'Choose the file and send'}
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} style={{ height: 44, padding: '0 14px', fontSize: 13.5, color: 'var(--color-text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {loading ? (
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-text-muted)' }}>Nothing uploaded yet.</p>
      ) : (
        <div style={{ marginTop: 6 }}>
          {items.map((c, i) => {
            const tone = TONE[c.status];
            const v = validity(c);
            return (
              <div key={c.id}>
                <div style={{ padding: '11px 0' }}>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <button onClick={() => open(c)} className="flex items-center min-w-0 text-left" style={{ gap: 8 }}>
                      <FileText size={16} className="flex-none" style={{ color: 'var(--color-primary-300)' }} />
                      <span className="truncate" style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{c.title}</span>
                    </button>
                    <div className="flex items-center flex-none" style={{ gap: 4 }}>
                      <span className="inline-flex items-center" style={{ gap: 4 }}>
                        {c.status === 'verified' ? <Check size={12} style={{ color: 'var(--color-primary-300)' }} />
                          : c.status === 'rejected' ? <X size={12} style={{ color: 'var(--color-secondary)' }} />
                          : <Clock size={12} style={{ color: 'var(--color-text-muted)' }} />}
                        <StatusPill label={tone.label} tone={tone.tone} />
                      </span>
                      {c.status !== 'verified' && (
                        <button onClick={() => { setEditing(c.id); setAdding(false); setError(null);
                          setForm({ title: c.title, issuer: c.issuer ?? '', credentialNumber: c.credentialNumber ?? '', issuedOn: c.issuedOn ?? '',
                            expiresOn: c.expiresOn ?? '', noExpiry: !c.expiresOn && !!c.issuer }); }}
                          aria-label={`Correct ${c.title}`} className="grid place-items-center" style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}>
                          <PencilSimple size={14} />
                        </button>
                      )}
                      <button onClick={() => remove(c)} disabled={busy} aria-label="Remove" className="grid place-items-center"
                        style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  {(c.issuer || v) && (
                    <p style={{ fontSize: 12.5, marginTop: 4, color: v?.warn ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                      {[c.issuer, v?.text].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {c.reviewNote && (
                    <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      {c.reviewNote}{c.status === 'rejected' ? ' — correct it and it goes back to the gym.' : ''}
                    </p>
                  )}
                  {editing === c.id && (
                    <div style={{ marginTop: 8, padding: 12, borderRadius: 14, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                      {fields}
                      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                        <button onClick={() => void saveEdit(c)} disabled={busy} className="flex-1 noc-press disabled:opacity-50"
                          style={{ height: 44, borderRadius: 'var(--radius-btn)', fontSize: 13.5, fontWeight: 700, background: 'var(--color-secondary)', color: '#1a1205' }}>
                          {busy ? 'Saving…' : c.status === 'rejected' ? 'Save and send back' : 'Save'}
                        </button>
                        <button onClick={() => { setEditing(null); setError(null); }} style={{ height: 44, padding: '0 14px', fontSize: 13.5, color: 'var(--color-text-muted)' }}>Cancel</button>
                      </div>
                    </div>
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
