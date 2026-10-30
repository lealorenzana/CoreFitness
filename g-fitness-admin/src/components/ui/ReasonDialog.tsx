import { useState } from 'react';
import Modal from './Modal';
import { RdButton } from './rd';
import { RD_INPUT, RD_INPUT_STYLE } from './rdTokens';
import { reasonProblem } from '../../lib/api/reasons';

/**
 * Asks for a reason before something that undoes or changes money — a cancel,
 * delete, decline, refund, void, freeze, price or plan change, or points removed
 * (the owner, 2026-10-28). One dialog for all of them, so every one reads the
 * same: what will happen, a few quick reasons to tap, and a box for your own.
 *
 * `onConfirm` does the action and then records the reason (lib/api/reasons.ts);
 * the dialog stays open, showing the error, when it throws.
 */
export default function ReasonDialog({
  isOpen, onClose, title, message, confirmText, danger, quick = [], onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Statement-style, never a question (CLAUDE.md). */
  title: string;
  message: React.ReactNode;
  confirmText: string;
  danger?: boolean;
  /** One-tap reasons for this action; the box takes anything else. */
  quick?: string[];
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const problem = reasonProblem(reason);

  const close = () => { if (busy) return; setReason(''); setError(null); setTouched(false); onClose(); };
  const go = async () => {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    try {
      await onConfirm(reason.trim());
      setReason(''); setTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} size="md"
      footer={<>
        <RdButton variant="ghost" onClick={close} disabled={busy}>Keep it</RdButton>
        <RdButton variant={danger ? 'danger' : 'primary'} onClick={() => void go()} disabled={busy} data-reason-confirm>
          {busy ? 'Saving…' : confirmText}
        </RdButton>
      </>}>
      <div className="flex flex-col gap-3" data-reason-dialog>
        <div className="text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{message}</div>
        {quick.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button key={q} type="button" onClick={() => setReason(q)}
                className="h-8 px-3 rounded-full text-[13px]"
                style={{ border: `1px solid ${reason === q ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.1)'}`,
                  background: reason === q ? 'rgba(124,58,237,0.18)' : 'transparent', color: reason === q ? '#E9E3FF' : 'var(--color-text-secondary)' }}>
                {q}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-white">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={3} aria-label="Reason"
            placeholder="A few words — it is kept in Activity with your name." className={RD_INPUT} style={{ ...RD_INPUT_STYLE, height: 'auto', paddingTop: 10 }} />
          {touched && problem && <span className="text-[12.5px]" style={{ color: '#FBBF24' }}>{problem}</span>}
        </label>
        {error && <p className="text-[13px]" style={{ color: '#FBBF24' }} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
