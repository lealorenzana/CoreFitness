import { useState } from 'react';
import { Eyebrow, NocButton, Panel, StatusPill } from './ui/noc';
import {
  applyProposal, discardProposal, undoProposal,
  type GoalPayload, type ProposalNames, type ProposalStatus, type RoutinePayload, type SchedulePayload,
} from '../lib/api/aiProposals';
import { formatRemindAt } from '../lib/api/gymPlans';
import { errorMessage } from '../utils/errorMessage';

/**
 * One change the coach proposed (0145): what it is, in full, and the member's
 * choice. Nothing has changed until Apply; Undo puts it back. Every refusal is
 * the database's own sentence, shown under the card.
 *
 * The card owns only its busy and error state — the status is the caller's, so
 * the same proposal reads the same in the chat and in the changes sheet.
 */

const KIND_LABEL: Record<string, string> = {
  'routine.create': 'New routine',
  'routine.replace': 'Change a routine',
  'schedule.set': 'Weekly plan',
  'goal.create': 'New goal',
};

// Monday first: the order a training week is read in.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const UNIT: Record<string, (v: number) => string> = {
  weight_kg: (v) => `${v} kg`,
  body_fat_pct: (v) => `${v}% body fat`,
  waist_cm: (v) => `${v} cm waist`,
  workouts_per_week: (v) => `${v} ${v === 1 ? 'workout' : 'workouts'} a week`,
  custom: (v) => `${v}`,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

function exerciseLine(e: RoutinePayload['exercises'][number], names: ProposalNames): string {
  const name = e.exercise_id ? names.exercises.get(e.exercise_id) ?? 'an exercise' : e.custom_name || 'an exercise';
  const work = e.target_seconds != null ? `${e.target_sets} × ${e.target_seconds} s`
    : e.target_reps != null ? `${e.target_sets} × ${e.target_reps}`
    : `${e.target_sets} ${e.target_sets === 1 ? 'set' : 'sets'}`;
  return `${name} — ${work}, rest ${e.rest_seconds} s`;
}

function detailLines(kind: string, payload: unknown, names: ProposalNames): { lead?: string; lines: string[] } {
  if (kind === 'routine.create' || kind === 'routine.replace') {
    const p = obj(payload) as unknown as RoutinePayload;
    const lines = Array.isArray(p.exercises) ? p.exercises.map((e) => exerciseLine(e, names)) : [];
    if (kind === 'routine.replace') {
      const current = p.routine_id ? names.routines.get(p.routine_id) ?? 'a routine' : 'a routine';
      lines.unshift(`Replaces: ${current}`);
    }
    return { lead: typeof p.name === 'string' ? p.name : undefined, lines };
  }
  if (kind === 'schedule.set') {
    const p = obj(payload) as unknown as SchedulePayload;
    const days = Array.isArray(p.days) ? p.days : [];
    return {
      lines: WEEK.map((d) => {
        const day = days.find((x) => x.day_of_week === d);
        if (!day) return `${DAY[d]} — Rest`;
        const what = day.routine_id ? names.routines.get(day.routine_id) ?? 'a routine' : 'Any workout';
        return `${DAY[d]} — ${what}${day.remind_at ? ` · reminder ${formatRemindAt(day.remind_at)}` : ''}`;
      }),
    };
  }
  if (kind === 'goal.create') {
    const p = obj(payload) as unknown as GoalPayload;
    const fmt = UNIT[p.metric] ?? UNIT.custom;
    const lines: string[] = [];
    if (p.target_value != null) {
      const by = p.target_date
        ? ` by ${new Date(`${p.target_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : '';
      lines.push(`Target: ${fmt(p.target_value)}${by}`);
    } else if (p.target_date) {
      lines.push(`By ${new Date(`${p.target_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
    }
    if (p.start_value != null) lines.push(`Starting from ${fmt(p.start_value)}`);
    return { lead: typeof p.title === 'string' ? p.title : undefined, lines };
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
  const { lead, lines } = detailLines(kind, payload, names);

  const run = async (act: () => Promise<unknown>, next: ProposalStatus) => {
    setBusy(true);
    setError(null);
    try {
      await act();
      onStatus(id, next);
    } catch (err) {
      setError(errorMessage(err, 'That did not go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full" data-proposal={id}>
      <Panel filled style={{ border: '1px solid var(--color-hairline)', padding: 14 }}>
        <Eyebrow mark>{KIND_LABEL[kind] ?? 'A change from the coach'}</Eyebrow>
        <p style={{ marginTop: 8, fontSize: 14.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--color-text-primary)' }}>
          {summary}
        </p>
        {(lead || lines.length > 0) && (
          <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {lead && <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{lead}</p>}
            {lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}

        {status === 'pending' && (
          <div className="flex" style={{ gap: 10, marginTop: 12 }}>
            <NocButton variant="fill" className="flex-1" disabled={busy} style={{ height: 42 }}
              onClick={() => void run(() => applyProposal(id), 'applied')}>
              Apply
            </NocButton>
            <NocButton variant="ghost" className="flex-1" disabled={busy} style={{ height: 42 }}
              onClick={() => void run(() => discardProposal(id), 'discarded')}>
              Discard
            </NocButton>
          </div>
        )}
        {status === 'applied' && (
          <div className="flex items-center justify-between" style={{ gap: 10, marginTop: 12 }}>
            <StatusPill label="Applied" />
            <NocButton variant="ghost" disabled={busy} style={{ height: 38, padding: '0 16px' }}
              onClick={() => void run(() => undoProposal(id), 'undone')}>
              Undo
            </NocButton>
          </div>
        )}
        {(status === 'undone' || status === 'discarded') && (
          <div style={{ marginTop: 12 }}>
            <StatusPill tone="muted" label={status === 'undone' ? 'Undone' : 'Discarded'} />
          </div>
        )}
      </Panel>
      {error && (
        <p role="alert" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>{error}</p>
      )}
    </div>
  );
}
