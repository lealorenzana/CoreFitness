import { useCallback, useEffect, useState } from 'react';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import {
  getWaiverRequired, listWaiverSignatures, listWaiverVersions, parqQuestions,
  publishWaiver, saveWaiverDraft, setWaiverRequired,
  type WaiverSignature, type WaiverVersion,
} from '../lib/api/waiver';

const MUTED = 'var(--color-text-muted)';
const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Settings → Waiver (0119).
 *
 * The owner writes the text, publishes it, and chooses whether booking waits
 * for a signature. Three things this screen deliberately does not offer:
 *
 *  - **Editing a published waiver.** The database refuses it for everybody.
 *    Editing always means a draft of the next version, and the screen says so
 *    before anyone types, not after they press Save.
 *  - **Editing the PAR-Q.** It is fixed in SQL. A gym shortening it is a
 *    liability, not a setting, so it is shown here read-only.
 *  - **A gate on check-in.** Only booking waits. Blocking the door would mean a
 *    queue at the desk the morning the setting went on.
 */
export default function WaiverTab() {
  const [versions, setVersions] = useState<WaiverVersion[] | null | undefined>(undefined);
  const [signatures, setSignatures] = useState<WaiverSignature[] | null>(null);
  const [required, setRequired] = useState<boolean | null>(null);
  const [questions, setQuestions] = useState<{ key: string; question: string }[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [v, s, r, q] = await Promise.all([
      listWaiverVersions(), listWaiverSignatures(), getWaiverRequired(), parqQuestions(),
    ]);
    setVersions(v);
    setSignatures(s);
    setRequired(r);
    setQuestions(q);
    // Start the editor from the draft if there is one, else from the version in
    // force, so "edit" always begins from the words members are actually signing.
    const draft = v?.find((x) => !x.publishedAt);
    const current = v?.find((x) => x.publishedAt);
    const from = draft ?? current;
    setTitle(from?.title ?? 'Waiver and release');
    setBody(from?.body ?? '');
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (versions === undefined) {
    return <p className="text-xs" style={{ color: MUTED }}>Loading…</p>;
  }
  if (versions === null) {
    return (
      <p className="text-xs" style={{ color: MUTED }}>
        The waiver needs migration 0119_waivers_and_parq.sql, which is not pasted yet.
      </p>
    );
  }

  const draft = versions.find((x) => !x.publishedAt) ?? null;
  const current = versions.find((x) => x.publishedAt) ?? null;
  const flagged = (signatures ?? []).filter((s) => s.flagged);
  const onCurrent = (signatures ?? []).filter((s) => current && s.version === current.version).length;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-white">Waiver</h2>
        <p className="text-[11px] mt-1" style={{ color: MUTED }}>
          {current
            ? `Version ${current.version} is in force, published ${stamp(current.publishedAt!)}. ${onCurrent} member${onCurrent === 1 ? '' : 's'} signed it.`
            : 'Nothing published yet. Members have nothing to sign until you publish.'}
        </p>
      </div>

      {/* The editor. What it edits is always a draft. */}
      <div className="space-y-2">
        <p className="text-[11px]" style={{ color: MUTED }}>
          {current
            ? 'Published words cannot be changed — members signed exactly what was on screen. Saving here makes a draft of the next version; publishing it asks every member to sign again.'
            : 'Write it, save it as a draft, then publish when it is right.'}
        </p>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
          value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          aria-label="Waiver title" />
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', minHeight: 220 }}
          value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)}
          placeholder="I understand that physical exercise carries a risk of injury…"
          aria-label="Waiver text" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void run(async () => {
              await saveWaiverDraft(title.trim(), body.trim());
              showToast(`Draft of version ${draft?.version ?? (current ? current.version + 1 : 1)} saved.`, 'success');
            })}>
            Save draft
          </Button>
          <Button size="sm" disabled={busy || !draft}
            onClick={() => void run(async () => {
              const v = await publishWaiver();
              showToast(`Version ${v} published. Members sign this one from now on.`, 'success');
            })}>
            {draft ? `Publish version ${draft.version}` : 'Publish'}
          </Button>
        </div>
        {!draft && current && (
          <p className="text-[10px]" style={{ color: MUTED }}>
            Nothing to publish — save a draft first.
          </p>
        )}
      </div>

      {/* The gate. */}
      <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
        <label className="flex items-start gap-2.5 text-xs text-white">
          <input type="checkbox" className="mt-0.5" checked={!!required} disabled={busy || required === null}
            onChange={(e) => {
              // Read now, not after the await: this input is controlled, so by
              // the time the save returns React has put it back to the old
              // value, and the toast said the opposite of what was saved.
              const on = e.target.checked;
              void run(async () => {
                await setWaiverRequired(on);
                showToast(on ? 'Booking now waits for a signature.' : 'Booking no longer waits.', 'success');
              });
            }} />
          <span>
            Members must sign before they can book
            <span className="block text-[10px] mt-0.5" style={{ color: MUTED }}>
              Only booking from the app. Check-in, the free workouts and anything the desk books
              for them are never blocked.{!current && ' Nothing is blocked until a waiver is published.'}
            </span>
          </span>
        </label>
      </div>

      {/* Who answered yes. A referral, never a decision. */}
      <div>
        <h3 className="text-xs font-bold text-white">
          Health questions to follow up {flagged.length > 0 && `(${flagged.length})`}
        </h3>
        <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
          A yes means talk to them before they train hard. It does not block anyone and changes
          nothing about their training — that is for a person to decide, not the system.
        </p>
        {flagged.length === 0 ? (
          <p className="text-xs mt-2" style={{ color: MUTED }}>Nobody has answered yes.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {flagged.map((s) => (
              <div key={s.memberId + s.version} className="rounded-lg px-3 py-2"
                style={{ background: 'var(--color-surface-raised)' }}>
                <p className="text-xs text-white">
                  <strong>{s.memberName}</strong> · version {s.version} · {stamp(s.acceptedAt)}
                </p>
                <ul className="mt-1 list-disc pl-4 text-[10px]" style={{ color: MUTED }}>
                  {questions.filter((q) => s.parQ[q.key]).map((q) => <li key={q.key}>{q.question}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold text-white">The PAR-Q members answer</h3>
        <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
          The standard seven questions. Fixed on purpose — shortening them would be a liability.
        </p>
        <ol className="mt-2 list-decimal pl-4 space-y-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          {questions.map((q) => <li key={q.key}>{q.question}</li>)}
        </ol>
      </div>
    </div>
  );
}
