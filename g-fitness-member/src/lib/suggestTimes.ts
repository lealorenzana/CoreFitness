/**
 * Times that fit both schedules (owner, 2026-11-24): the coach's open slots, on the member's own training days
 * (their week plan), nearest the time they train. Pure, so a check can run it without a login.
 *
 * - A slot that clashes with something the member already has is never suggested.
 * - One suggestion per weekday, the earliest week, at most `max`.
 * - No training days set: the earliest open slots, one per weekday, and `fitsPlan` is false so the screen says so.
 */
export interface SlotIn { startsAt: string; durationMinutes: number; conflict: string | null }
export interface PlanDay { day: number; at: string | null }
export interface Suggestion extends SlotIn { fitsPlan: boolean }

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

export function suggestTimes(slots: SlotIn[], plan: PlanDay[], max = 3): Suggestion[] {
  const free = slots.filter((s) => !s.conflict).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const days = new Map(plan.map((p) => [p.day, p.at]));
  const pool = days.size ? free.filter((s) => days.has(new Date(s.startsAt).getDay())) : free;
  const best = new Map<number, { s: SlotIn; score: number; week: number }>();
  for (const s of pool) {
    const d = new Date(s.startsAt);
    const at = days.get(d.getDay());
    const score = at ? Math.abs(d.getHours() * 60 + d.getMinutes() - minutes(at)) : 0;
    const week = Math.floor((d.getTime() - new Date(pool[0].startsAt).getTime()) / (7 * 864e5));
    const had = best.get(d.getDay());
    // The earliest week first, then the time nearest the member's own.
    if (!had || week < had.week || (week === had.week && score < had.score)) best.set(d.getDay(), { s, score, week });
  }
  return [...best.values()]
    .map((b) => ({ ...b.s, fitsPlan: days.size > 0 }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, max);
}
