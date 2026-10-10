import { useState } from 'react';
import { Eyebrow, NocButton, Panel, StatusPill } from './ui/noc';
import {
  applyProposal, discardProposal, undoProposal,
  type GoalPayload, type ProposalNames, type ProposalStatus, type RoutinePayload, type SchedulePayload,
} from '../lib/api/aiProposals';
import { formatRemindAt } from '../lib/api/gymPlans';
import { errorMessage } from '../utils/errorMessage';
import { dateLocale, useLanguage, useT } from '../lib/i18n';

/**
 * One change the coach proposed (0145): what it is, in full, and the member's
 * choice. Nothing has changed until Apply; Undo puts it back. Every refusal is
 * the database's own sentence, shown under the card.
 *
 * The card owns only its busy and error state — the status is the caller's, so
 * the same proposal reads the same in the chat and in the changes sheet.
 *
 * Everything the database will write is on the card — weights, and each day's
 * reminder time (17:00 when the coach named none, as apply stores it) — so what
 * is applied is what was shown. Copy goes through `t()` (lib/i18n.ts). A meal
 * guide (0146) shows every section and meal idea, then the fixed general-guidance
 * line — the app's, never stored, so no guide is shown without it.
 */

type T = (text: string) => string;

const KIND_LABEL: Record<string, string> = {
  'routine.create': 'New routine',
  'routine.replace': 'Change a routine',
  'schedule.set': 'Weekly plan',
  'goal.create': 'New target',
  'meals.set': 'Meal guide',
  // 0177: the coach can book, cancel, plan weeks ahead and log what you did.
  'booking.create': 'Book a class',
  'booking.cancel': 'Cancel a booking',
  'program.create': 'New program',
  'log.create': 'Log a workout',
};

const REASON: Record<string, string> = {
  schedule_conflict: 'Schedule conflict', changed_plans: 'Changed plans', mistake: 'Booked by mistake', personal_emergency: 'Personal emergency',
};

// Monday first: the order a training week is read in.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const UNIT: Record<string, (v: number, t: T) => string> = {
  weight_kg: (v) => `${v} kg`,
  body_fat_pct: (v, t) => `${v}% ${t('body fat')}`,
  waist_cm: (v, t) => `${v} cm ${t('waist')}`,
  workouts_per_week: (v, t) => `${v} ${v === 1 ? t('workout a week') : t('workouts a week')}`,
  custom: (v) => `${v}`,
};

// What apply_ai_proposal stores when the coach named no reminder time (gym_plans' default).
const DEFAULT_REMIND_AT = '17:00';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

function exerciseLine(e: RoutinePayload['exercises'][number], names: ProposalNames, t: T): string {
  const name = e.exercise_id ? names.exercises.get(e.exercise_id) ?? t('an exercise') : e.custom_name || t('an exercise');
  const work = e.target_seconds != null ? `${e.target_sets} × ${e.target_seconds} s`
    : e.target_reps != null ? `${e.target_sets} × ${e.target_reps}`
    : `${e.target_sets} ${e.target_sets === 1 ? t('set') : t('sets')}`;
  const load = e.target_weight_kg != null ? ` ${t('at')} ${e.target_weight_kg} kg` : '';
  return `${name} — ${work}${load}, ${t('rest')} ${e.rest_seconds} s`;
}

function detailLines(kind: string, payload: unknown, names: ProposalNames, t: T, locale: string): { lead?: string; lines: string[] } {
  const date = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  if (kind === 'routine.create' || kind === 'routine.replace') {
    const p = obj(payload) as unknown as RoutinePayload;
    const lines = Array.isArray(p.exercises) ? p.exercises.map((e) => exerciseLine(e, names, t)) : [];
    if (kind === 'routine.replace') {
      const current = p.routine_id ? names.routines.get(p.routine_id) ?? t('a routine') : t('a routine');
      lines.unshift(`${t('Replaces:')} ${current}`);
    }
    return { lead: typeof p.name === 'string' ? p.name : undefined, lines };
  }
  if (kind === 'schedule.set') {
    const p = obj(payload) as unknown as SchedulePayload;
    const days = Array.isArray(p.days) ? p.days : [];
    return {
      lines: WEEK.map((d) => {
        const day = days.find((x) => x.day_of_week === d);
        if (!day) return `${t(DAY[d])} — ${t('Rest')}`;
        const what = day.routine_id ? names.routines.get(day.routine_id) ?? t('a routine') : t('Any workout');
        return `${t(DAY[d])} — ${what} · ${t('reminder')} ${formatRemindAt(day.remind_at || DEFAULT_REMIND_AT)}`;
      }),
    };
  }
  if (kind === 'goal.create') {
    const p = obj(payload) as unknown as GoalPayload;
    const fmt = UNIT[p.metric] ?? UNIT.custom;
    const lines: string[] = [];
    if (p.target_value != null) {
      const by = p.target_date ? ` ${t('by')} ${date(p.target_date)}` : '';
      lines.push(`${t('Target:')} ${fmt(p.target_value, t)}${by}`);
    } else if (p.target_date) {
      lines.push(`${t('By')} ${date(p.target_date)}`);
    }
    if (p.start_value != null) lines.push(`${t('Starting from')} ${fmt(p.start_value, t)}`);
    return { lead: typeof p.title === 'string' ? p.title : undefined, lines };
  }
  if (kind === 'booking.create') {
    return { lines: [t('The gym’s booking rules still apply — some bookings wait for approval.')] };
  }
  if (kind === 'booking.cancel') {
    const p = obj(payload);
    return { lines: [`${t('Reason:')} ${t(REASON[String(p.reason_key)] ?? 'Changed plans')}`, t('A cancelled booking cannot be restored here.')] };
  }
  if (kind === 'program.create') {
    const p = obj(payload) as { name?: string; weeks?: number; deload_every?: number | null; sessions?: { day_of_week: number; name: string; exercises: { exercise_id: string; target_sets: number; target_reps: number | null; target_weight_kg: number | null; target_seconds: number | null; progress_kind: string; progress_step: number }[] }[] };
    const lines: string[] = [];
    lines.push(`${p.weeks ?? '?'} ${t('weeks')}${p.deload_every ? ` · ${t('a lighter week every')} ${p.deload_every}` : ''}`);
    for (const ses of [...(p.sessions ?? [])].sort((a, b) => WEEK.indexOf(a.day_of_week) - WEEK.indexOf(b.day_of_week))) {
      const ex = ses.exercises.map((e) => {
        const name = names.exercises.get(e.exercise_id) ?? t('an exercise');
        const grow = e.progress_kind === 'weight' ? ` (+${e.progress_step} kg ${t('a week')})`
          : e.progress_kind === 'reps' ? ` (+${e.progress_step} ${t('reps a week')})`
          : e.progress_kind === 'sets' ? ` (+${e.progress_step} ${t('sets a week')})`
          : e.progress_kind === 'seconds' ? ` (+${e.progress_step} s ${t('a week')})` : '';
        return `${name}${grow}`;
      }).join(', ');
      lines.push(`${t(DAY[ses.day_of_week])} — ${ses.name}: ${ex}`);
    }
    return { lead: p.name, lines };
  }
  if (kind === 'log.create') {
    const p = obj(payload) as { activity?: string; performed_on?: string; sets?: { exercise_id: string; reps: number | null; weight_kg: number | null; seconds: number | null }[] };
    const lines = (p.sets ?? []).map((x, i) => `${i + 1}. ${names.exercises.get(x.exercise_id) ?? t('an exercise')} — ${x.seconds != null ? `${x.seconds} s` : `${x.reps ?? '—'} ${t('reps')}`}${x.weight_kg != null ? ` ${t('at')} ${x.weight_kg} kg` : ''}`);
    if (p.performed_on) lines.unshift(date(p.performed_on));
    return { lead: p.activity, lines };
  }
  return { lines: [] };
}

export default function ProposalCard({
  id, kind, summary, payload, status, names, onStatus,
}: {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
  status: ProposalStatus;
  names: ProposalNames;
  onStatus: (id: string, next: ProposalStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const lang = useLanguage();
  const { lead, lines } = detailLines(kind, payload, names, t, dateLocale(lang));
  // Meal guides were removed (2026-10-05). An old proposal of that kind can
  // still be discarded, never applied.
  const retired = kind === 'meals.set';

  const run = async (act: () => Promise<unknown>, next: ProposalStatus) => {
    setBusy(true);
    setError(null);
    try {
      await act();
      onStatus(id, next);
    } catch (err) {
      setError(errorMessage(err, t('That did not go through. Try again.')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full" data-proposal={id}>
      <Panel filled style={{ border: '1px solid var(--color-hairline)', padding: 14 }}>
        <Eyebrow mark>{t(KIND_LABEL[kind] ?? 'A change from the coach')}</Eyebrow>
        <p style={{ marginTop: 8, fontSize: 14.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--color-text-primary)' }}>
          {summary}
        </p>
        {(lead || lines.length > 0) && (
          <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {lead && <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{lead}</p>}
            {lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
        {retired && status === 'pending' && (
          <p style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {t('Meal guides are no longer part of the app, so this cannot be applied.')}
          </p>
        )}

        {status === 'pending' && (
          <div className="flex" style={{ gap: 10, marginTop: 12 }}>
            {!retired && (
              <NocButton variant="fill" className="flex-1" disabled={busy} style={{ height: 42 }}
                onClick={() => void run(() => applyProposal(id), 'applied')}>
                {t('Apply')}
              </NocButton>
            )}
            <NocButton variant="ghost" className="flex-1" disabled={busy} style={{ height: 42 }}
              onClick={() => void run(() => discardProposal(id), 'discarded')}>
              {t('Discard')}
            </NocButton>
          </div>
        )}
        {status === 'applied' && (
          <div className="flex items-center justify-between" style={{ gap: 10, marginTop: 12 }}>
            <StatusPill label={t('Applied')} />
            <NocButton variant="ghost" disabled={busy} style={{ height: 38, padding: '0 16px' }}
              onClick={() => void run(() => undoProposal(id), 'undone')}>
              {t('Undo')}
            </NocButton>
          </div>
        )}
        {(status === 'undone' || status === 'discarded') && (
          <div style={{ marginTop: 12 }}>
            <StatusPill tone="muted" label={status === 'undone' ? t('Undone') : t('Discarded')} />
          </div>
        )}
      </Panel>
      {error && (
        <p role="alert" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>{error}</p>
      )}
    </div>
  );
}
