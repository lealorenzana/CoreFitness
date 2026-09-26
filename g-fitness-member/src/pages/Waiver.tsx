import { useCallback, useEffect, useState } from 'react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  acceptWaiver, myWaiverStatus, parqQuestions,
  type ParqQuestion, type WaiverStatus,
} from '../lib/api/waiver';

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The gym's waiver, and the seven PAR-Q questions (0119).
 *
 * Every question must be answered yes or no — a missing answer is somebody who
 * did not read it, not a "no" — and the database refuses the signature
 * otherwise, so this screen only mirrors a rule it could not skip.
 *
 * A signed waiver stays readable: the member is entitled to see exactly what
 * they agreed to, and it is the published version they signed, which the
 * database will not let anybody edit afterwards.
 */
export default function Waiver() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<WaiverStatus | null>(null);
  const [questions, setQuestions] = useState<ParqQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [referred, setReferred] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, qs] = await Promise.all([myWaiverStatus(), parqQuestions()]);
      setStatus(st);
      setQuestions(qs);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the waiver'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (loading) return <Page><SkeletonList /></Page>;

  if (!status) {
    return (
      <Page>
        <PageTitle back fallback="/member/membership" title="Waiver" />
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Your gym has not published a waiver in the app. If they ask you to sign one, it will be here.
        </p>
      </Page>
    );
  }

  const allAnswered = questions.length > 0 && questions.every((q) => q.key in answers);

  const sign = async () => {
    setBusy(true);
    try {
      const flagged = await acceptWaiver(status.waiverId, answers);
      setReferred(flagged);
      await load();
      toast.success('Signed. Thank you.');
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be signed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageTitle
        back
        fallback="/member/membership"
        title={status.title}
        subtitle={`Version ${status.version}`}
      />

      <section>
        <p style={{
          fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          color: 'var(--color-text-secondary)',
        }}>
          {status.body}
        </p>
      </section>

      {status.acceptedAt ? (
        <section>
          <SectionHead title="Signed" />
          <LineRow
            title={`You signed version ${status.version}`}
            meta={stamp(status.acceptedAt)}
            action={<StatusPill label="Done" tone="structure" />}
            last
          />
          {(status.flagged || referred) && (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              You answered yes to a health question. Please talk to the front desk before training
              hard, and check with your doctor. This does not stop you training — it is so somebody
              who can help knows.
            </p>
          )}
        </section>
      ) : (
        <>
          <section>
            <SectionHead title="Health questions" meta="Answer every one" />
            {questions.map((q, i) => (
              <div key={q.key} style={{
                padding: '12px 0',
                borderBottom: i === questions.length - 1 ? 'none' : '1px solid var(--color-border)',
              }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.45 }}>
                  {q.question}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {([['No', false], ['Yes', true]] as const).map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={answers[q.key] === value}
                      onClick={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                      className="noc-press"
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13,
                        border: '1px solid',
                        borderColor: answers[q.key] === value ? 'var(--color-primary)' : 'var(--color-border)',
                        color: answers[q.key] === value ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                        background: 'transparent',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13,
              color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: 3 }} />
              I have read this waiver, and my answers above are true.
            </label>
            <NocButton
              variant="action"
              className="w-full"
              style={{ marginTop: 12 }}
              disabled={busy || !agreed || !allAnswered}
              onClick={() => void sign()}
            >
              {busy ? 'Signing…' : 'Sign'}
            </NocButton>
            {!allAnswered && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Answer all {questions.length} health questions to sign.
              </p>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
