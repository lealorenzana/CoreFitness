import GlassSheet from './ui/GlassSheet';
import { NocButton } from './ui/noc';

/**
 * Asked once, before the coach first answers (0143). Messages go to Anthropic
 * to be answered, and the coach reads your training only if you say yes here.
 * The same switch lives in Settings, and No still leaves you a working coach.
 */
export default function CoachConsent({ open, onChoose }: { open: boolean; onChoose: (yes: boolean) => void }) {
  return (
    <GlassSheet open={open} onClose={() => onChoose(false)} title="Before the coach answers">
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
        <p>The coach is an AI. What you type is sent to Anthropic, the company that runs it, to be answered.</p>
        <p style={{ marginTop: 10 }}>It gives better advice if it can see your training: your goals, your routines,
          how often you have worked out lately, and your first name.</p>
        <p style={{ marginTop: 10 }}>It never sees your health or waiver answers, your payments, your contact
          details, your chats with coaches or your photos.</p>
        <p style={{ marginTop: 10 }}>You can change this any time in Settings.</p>
      </div>
      <div className="flex flex-col" style={{ gap: 10, marginTop: 18 }}>
        <NocButton variant="fill" onClick={() => onChoose(true)}>Yes, use my training</NocButton>
        <NocButton variant="ghost" onClick={() => onChoose(false)}>No, just answer questions</NocButton>
      </div>
    </GlassSheet>
  );
}
