import { useState } from 'react';
import { Chip, Eyebrow, NocButton, Panel, StatusPill } from './ui/noc';
import { TextInput } from './ui/Field';
import { useT } from '../lib/i18n';

export interface CoachQuestions {
  intro: string;
  questions: { label: string; kind: 'choice' | 'number' | 'text'; options: string[] }[];
}

/**
 * The coach's questions in one card (0282, the owner's fix for the daily limit): every answer goes
 * back in ONE message, so a setup that used to take a message per question takes one. A question
 * left empty is sent as "skipped", never invented.
 */
export default function QuestionsCard({ card, onSend, disabled }: {
  card: CoachQuestions; onSend: (text: string) => void; disabled?: boolean;
}) {
  const t = useT();
  const [answers, setAnswers] = useState<string[]>(() => card.questions.map(() => ''));
  const [sent, setSent] = useState(false);
  const set = (i: number, v: string) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)));
  const any = answers.some((a) => a.trim());

  const send = () => {
    const text = card.questions.map((q, i) => `${q.label} ${answers[i].trim() || '(skipped)'}`).join('\n');
    setSent(true);
    onSend(text);
  };

  return (
    <div className="w-full" data-questions-card>
      <Panel filled style={{ border: '1px solid var(--color-hairline)', padding: 14 }}>
        <Eyebrow mark>{t('A few questions')}</Eyebrow>
        {card.intro && <p style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>{card.intro}</p>}
        <div className="flex flex-col" style={{ gap: 14, marginTop: 12 }}>
          {card.questions.map((q, i) => (
            <div key={q.label} data-question>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{q.label}</p>
              {q.kind === 'choice' ? (
                <div className="flex flex-wrap" style={{ gap: 8, marginTop: 8 }} role="radiogroup" aria-label={q.label}>
                  {q.options.map((o) => (
                    <Chip key={o} label={o} on={answers[i] === o} onClick={() => !sent && set(i, answers[i] === o ? '' : o)} />
                  ))}
                </div>
              ) : (
                <TextInput style={{ marginTop: 8 }} aria-label={q.label} disabled={sent}
                  inputMode={q.kind === 'number' ? 'numeric' : undefined} maxLength={q.kind === 'number' ? 6 : 120}
                  value={answers[i]} onChange={(e) => set(i, q.kind === 'number' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)} />
              )}
            </div>
          ))}
        </div>
        {sent ? (
          <div style={{ marginTop: 12 }}><StatusPill label={t('Sent')} /></div>
        ) : (
          <NocButton variant="fill" className="w-full" style={{ height: 44, marginTop: 14 }} disabled={!any || disabled} onClick={send}>
            {t('Send answers')}
          </NocButton>
        )}
      </Panel>
    </div>
  );
}
