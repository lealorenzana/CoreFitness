import { useState } from 'react';
import { Chip, NocButton } from './ui/noc';
import { Field, TextInput } from './ui/Field';
import type { CoachProfile } from '../lib/api/aiCoach';

/**
 * The coach's guided setup (0144): seven questions, one at a time, in the chat.
 *
 * Every choice is a tap. The two free-text answers are capped at 200 characters,
 * and an injury is a yes or no only: the coach is told there is one and points
 * the member to a person, so the details are never written down anywhere.
 */

type Opt = { label: string; value: string | number };
type Step =
  | { kind: 'choice'; ask: string; opts: Opt[]; key: 'goal' | 'experience' | 'days_per_week' | 'minutes' }
  | { kind: 'multi'; ask: string; opts: Opt[] }
  | { kind: 'text'; ask: string }
  | { kind: 'yesno'; ask: string };

const STEPS: Step[] = [
  { kind: 'choice', key: 'goal', ask: "Let's set you up. What do you want most from training?", opts: [
    { label: 'Get stronger', value: 'strength' }, { label: 'Build muscle', value: 'muscle' },
    { label: 'Lose fat', value: 'fat_loss' }, { label: 'Get fitter', value: 'fitness' },
    { label: 'Train for a sport', value: 'sport' }, { label: 'Feel healthier', value: 'health' } ] },
  { kind: 'choice', key: 'experience', ask: 'How long have you been training?', opts: [
    { label: "I'm new", value: 'new' }, { label: 'A few months to a year', value: 'some' },
    { label: 'Over a year', value: 'experienced' } ] },
  { kind: 'choice', key: 'days_per_week', ask: 'How many days a week can you train?',
    opts: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ label: String(n), value: n })) },
  { kind: 'choice', key: 'minutes', ask: 'How long is a usual session?', opts: [
    { label: '30 min', value: 30 }, { label: '45 min', value: 45 },
    { label: '60 min', value: 60 }, { label: '90 min', value: 90 } ] },
  { kind: 'multi', ask: 'What can you use? Pick all that apply, then tap Done.', opts: [
    { label: 'Full gym', value: 'full_gym' }, { label: 'Machines', value: 'machines' },
    { label: 'Barbell', value: 'barbell' }, { label: 'Dumbbells', value: 'dumbbells' },
    { label: 'Just my body', value: 'bodyweight' }, { label: 'Cardio machines', value: 'cardio' } ] },
  { kind: 'text', ask: 'Anything you love doing, or want to avoid? (Optional)' },
  { kind: 'yesno', ask: 'Does anything hurt at the moment, or do you have an injury?' },
];

export const REFERRAL = "Thanks for telling me. I won't plan around it — please have a coach at the gym or a physiotherapist look at it first. I can still help with everything else.";

interface Answer { label: string; value: unknown }

function CoachLine({ children }: { children: string }) {
  return (
    <div className="max-w-[88%]" style={{ paddingLeft: 12, fontSize: 13.5, lineHeight: 1.6,
      color: 'var(--color-text-secondary)', borderLeft: '2px solid var(--color-primary)' }}>
      {children}
    </div>
  );
}

function MemberLine({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]" style={{
        padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-primary)',
        background: 'color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))',
        border: '1px solid var(--color-primary-800)', borderRadius: '14px 14px 4px 14px',
      }}>{children}</div>
    </div>
  );
}

function build(a: Answer[]): CoachProfile {
  const t = a[5].value as { likes: string; avoid: string };
  return {
    goal: a[0].value as string,
    experience: a[1].value as string,
    days_per_week: a[2].value as number,
    minutes: a[3].value as number,
    equipment: a[4].value as string[],
    likes: t.likes.trim() || null,
    avoid: t.avoid.trim() || null,
    has_injury: a[6].value as boolean,
  };
}

export default function CoachSetup({ onDone, onSkip, failed }: {
  onDone: (p: CoachProfile) => void;
  onSkip: () => void;
  /** The save did not go through: the answers stay and Try again resends them. */
  failed?: boolean;
}) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [likes, setLikes] = useState('');
  const [avoid, setAvoid] = useState('');

  const step = answers.length;
  const complete = step >= STEPS.length;
  const cur = complete ? null : STEPS[step];

  const answer = (a: Answer) => {
    const next = [...answers, a];
    setAnswers(next);
    if (next.length === STEPS.length) onDone(build(next));
  };

  const back = () => {
    const last = answers[answers.length - 1];
    if (!last) return;
    if (step === 4) setPicked(last.value as string[]);
    if (step === 5) { const t = last.value as { likes: string; avoid: string }; setLikes(t.likes); setAvoid(t.avoid); }
    setAnswers(answers.slice(0, -1));
  };

  const optLabel = (s: Step & { opts: Opt[] }, values: unknown[]) =>
    values.map((v) => s.opts.find((o) => o.value === v)?.label ?? String(v)).join(', ');

  return (
    <div className="flex flex-col" style={{ gap: 12 }} aria-label="Coach setup">
      {STEPS.slice(0, step).map((s, i) => {
        const a = answers[i];
        let said: string;
        if (s.kind === 'text') {
          const t = a.value as { likes: string; avoid: string };
          const parts = [t.likes.trim() && `I enjoy ${t.likes.trim()}`, t.avoid.trim() && `I'd rather avoid ${t.avoid.trim()}`].filter(Boolean);
          said = parts.length ? parts.join(' · ') : 'Nothing in particular';
        } else if (s.kind === 'yesno') said = a.value ? 'Yes' : 'No';
        else if (s.kind === 'multi') said = optLabel(s, a.value as string[]);
        else said = a.label;
        return (
          <div key={i} className="flex flex-col" style={{ gap: 12 }}>
            <CoachLine>{s.ask}</CoachLine>
            <MemberLine>{said}</MemberLine>
            {s.kind === 'yesno' && a.value === true && <CoachLine>{REFERRAL}</CoachLine>}
          </div>
        );
      })}

      {cur && <CoachLine>{cur.ask}</CoachLine>}

      {cur?.kind === 'choice' && (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {cur.opts.map((o) => <Chip key={String(o.value)} label={o.label} onClick={() => answer({ label: o.label, value: o.value })} />)}
        </div>
      )}

      {cur?.kind === 'multi' && (
        <>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {cur.opts.map((o) => {
              const v = o.value as string;
              const on = picked.includes(v);
              return <Chip key={v} label={o.label} on={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== v) : [...picked, v])} />;
            })}
          </div>
          <NocButton variant="fill" disabled={picked.length === 0} onClick={() => answer({ label: 'Done', value: picked })}>Done</NocButton>
        </>
      )}

      {cur?.kind === 'text' && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <Field label="I enjoy">
            <TextInput value={likes} maxLength={200} onChange={(e) => setLikes(e.target.value)} />
          </Field>
          <Field label="I'd rather avoid" hint="Injuries: the next question covers that.">
            <TextInput value={avoid} maxLength={200} onChange={(e) => setAvoid(e.target.value)} />
          </Field>
          <NocButton variant="fill" onClick={() => answer({ label: 'Next', value: { likes, avoid } })}>Next</NocButton>
        </div>
      )}

      {cur?.kind === 'yesno' && (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <Chip label="No" onClick={() => answer({ label: 'No', value: false })} />
          <Chip label="Yes" onClick={() => answer({ label: 'Yes', value: true })} />
        </div>
      )}

      {complete && failed && (
        <NocButton variant="fill" onClick={() => onDone(build(answers))}>Try again</NocButton>
      )}

      <div className="flex items-center" style={{ gap: 18, fontSize: 13 }}>
        {step > 0 && !complete && (
          <button onClick={back} style={{ height: 36, color: 'var(--color-text-secondary)' }}>Back</button>
        )}
        {(!complete || failed) && (
          <button onClick={onSkip} style={{ height: 36, color: 'var(--color-text-muted)' }}>Skip for now</button>
        )}
      </div>
    </div>
  );
}
