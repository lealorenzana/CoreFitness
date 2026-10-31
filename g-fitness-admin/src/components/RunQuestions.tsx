import { useEffect, useState } from 'react';
import type { GymModule } from '../lib/api/gymApp';
import { getCelebrations, setCelebrations } from '../lib/api/celebrations';
import { showToast } from '../utils/toast';

/**
 * What you run, asked as questions (guides G2, 2026-10-31): the owner answers
 * Yes or No in plain words and each answer sets the real switch at once —
 * `set_gym_module` for a part of the app, the celebrations settings for the
 * big moments. A question appears only for a part this gym's Core Fitness plan
 * includes. Every answer can be changed later on Your app → What you run.
 */
const QUESTIONS: { key: string; ask: string; what: string }[] = [
  { key: 'classes', ask: 'Do you run group classes?', what: 'A timetable members book seats in. No: the app is about personal training only.' },
  { key: 'points', ask: 'Points and rewards?', what: 'Members earn points for coming in and training, and spend them on rewards at your desk.' },
  { key: 'squads', ask: 'Teams?', what: 'Members form small teams that train toward a weekly target together.' },
  { key: 'seasons', ask: 'A monthly season?', what: 'A monthly board of points with tiers and prizes.' },
  { key: 'events', ask: 'Gym events?', what: 'One-off events members sign up for — a fun run, a seminar, an open day.' },
  { key: 'online_pay', ask: 'Online payments?', what: 'Members pay in the app through your own PayMongo account. No: cash and transfers at the desk.' },
  { key: 'lobby_tv', ask: 'A lobby TV?', what: 'Today’s sessions and announcements on a screen in your gym.' },
];

export default function RunQuestions({ modules, onSet }: {
  modules: GymModule[];
  onSet: (key: string, enabled: boolean) => Promise<void>;
}) {
  const [moments, setMoments] = useState<{ celebrations: boolean; sounds: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void getCelebrations().then(setMoments); }, []);

  const shown = QUESTIONS.map((q) => ({ q, m: modules.find((x) => x.feature_key === q.key) }))
    .filter((x): x is { q: typeof QUESTIONS[number]; m: GymModule } => !!x.m && x.m.state !== 'not_sold');

  const answer = async (key: string, yes: boolean) => {
    setBusy(key);
    try {
      if (key === 'moments') {
        await setCelebrations({ celebrations: yes, sounds: yes });
        setMoments({ celebrations: yes, sounds: yes });
      } else {
        await onSet(key, yes);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That answer was not saved', 'error');
    } finally {
      setBusy(null);
    }
  };

  const row = (key: string, ask: string, what: string, on: boolean, locked: string | null) => (
    <div key={key} className="rounded-xl border p-3 flex items-center gap-3" data-run-question={key}
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{ask}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{locked ?? what}</p>
      </div>
      <div className="flex gap-1.5 flex-none" role="radiogroup" aria-label={ask}>
        {([['Yes', true], ['No', false]] as const).map(([label, yes]) => (
          <button key={label} type="button" role="radio" aria-checked={on === yes} disabled={busy === key || !!locked}
            onClick={() => { if (on !== yes) void answer(key, yes); }} data-answer={label.toLowerCase()}
            className="h-8 px-3.5 rounded-lg text-[13px] font-semibold border"
            style={on === yes
              ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-2" data-run-questions>
      {shown.map(({ q, m }) => row(q.key, q.ask, q.what, m.enabled,
        m.state === 'parent_off' ? 'Switch its section on first in Show every switch below.' : null))}
      {moments && row('moments', 'Celebrations and sounds?', 'A full-screen moment with a chime when a member checks in, finishes a workout or earns a badge. No: a small card instead, and quiet.',
        moments.celebrations, null)}
    </div>
  );
}
