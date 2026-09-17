import { useCallback, useEffect, useState } from 'react';

import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listMyPlan, saveMyPlan, DAY_LABELS, DAY_FULL, DEFAULT_REMIND_AT,
  formatRemindAt, toTimeInput, todayDow,
} from '../lib/api/gymPlans';
import { getCurrentMemberId } from '../services/bookingService';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, LineRow, NocButton, SectionHead } from '../components/ui/noc';

/**
 * "Which days am I training, and when should you nudge me?" (Nocturne redesign)
 *
 * The reminder is the whole point, so the screen is explicit about how it
 * arrives: a notification on the day, and the entry on Today. It also states the
 * one rule that would otherwise look like a bug — no nudge if you already
 * checked in, because being told to go to the gym you are standing in is worse
 * than no reminder at all.
 *
 * One time for the whole week rather than per-day. A per-day time is a much
 * bigger control for a benefit nobody asked for, and the plan is a habit, not
 * a calendar.
 *
 * Colour roles: a chosen day is violet (what you have), today is an amber edge
 * (the day you can still act on), Save is amber (the thing to do next).
 */
export default function GymPlan() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [remindAt, setRemindAt] = useState(DEFAULT_REMIND_AT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getCurrentMemberId();
      setMemberId(id);
      if (!id) return;
      const rows = await listMyPlan(id);
      setDays(rows.filter((r) => r.active).map((r) => r.day_of_week));
      // Every row carries the same time; the first is as good as any.
      if (rows.length > 0) setRemindAt(toTimeInput(rows[0].remind_at));
      setDirty(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your plan'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggleDay = (d: number) => {
    setDirty(true);
    setDays((current) =>
      current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort()
    );
  };

  const save = async () => {
    if (!memberId) return;
    setSaving(true);
    try {
      await saveMyPlan(memberId, days, remindAt);
      setDirty(false);
      toast.success(
        days.length === 0
          ? 'Plan cleared — no more reminders'
          : `Saved. ${days.length} ${days.length === 1 ? 'day' : 'days'} a week at ${formatRemindAt(remindAt)}`
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your plan'));
      void load();
    } finally {
      setSaving(false);
    }
  };

  const today = todayDow();

  return (
    <Page>
      <PageTitle back fallback="/member/book-class" title="Training plan"
        subtitle={loading ? 'Pick your days and when to be reminded'
          : days.length === 0 ? 'No days chosen yet'
          : `${days.length} ${days.length === 1 ? 'day' : 'days'} a week · reminder at ${formatRemindAt(remindAt)}`} />

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          <section>
            <SectionHead title="Days" meta="Tap the days you plan to train" />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
              {DAY_LABELS.map((label, d) => {
                const on = days.includes(d);
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    aria-label={`${DAY_FULL[d]}${isToday ? ', today' : ''}`}
                    className="flex flex-col items-center justify-center"
                    style={{
                      height: 56, gap: 3, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                      background: on ? 'var(--color-primary)' : 'transparent',
                      boxShadow: on ? '0 0 12px -4px var(--color-primary)' : 'none',
                      // Today gets an amber edge whether or not it is chosen, so
                      // "is today one of my days?" needs no counting across the row.
                      border: `1px solid ${isToday ? 'var(--color-secondary)' : on ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                      color: on ? '#fff' : 'var(--color-text-secondary)',
                    }}
                  >
                    {label}
                    {isToday && (
                      <span style={{ fontSize: 12, lineHeight: 1, color: on ? '#fff' : 'var(--color-secondary)' }}>today</span>
                    )}
                  </button>
                );
              })}
            </div>
            {days.length === 0 && (
              <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                No days chosen. Saving now turns reminders off completely.
              </p>
            )}
          </section>

          <section>
            <SectionHead title="Reminder time" meta="Same time on every chosen day" />
            <input
              type="time"
              value={remindAt}
              onChange={(e) => { setRemindAt(e.target.value); setDirty(true); }}
              className="field-input w-full"
              style={{
                marginTop: 12, height: 46, padding: '0 14px', fontSize: 15,
                borderRadius: 'var(--radius-btn)', color: 'var(--color-text-primary)',
                background: 'var(--color-surface)', border: '1px solid var(--color-hairline)',
              }}
              aria-label="Reminder time"
            />
          </section>

          {/* Says exactly what will happen. The alternative — a switch that
              saves a preference nothing reads — is the failure this app has
              already shipped six times. */}
          <section>
            <Eyebrow mark>What you will get</Eyebrow>
            <div style={{ marginTop: 4 }}>
              <LineRow gutterWidth={0} title="An entry on Today"
                meta="Every chosen day, with the time and whether you have checked in." />
              <LineRow gutterWidth={0} title="A notification after your time" last
                meta="Only if you have not already checked in that day." />
            </div>
          </section>

          <NocButton variant="action" onClick={save} disabled={saving || !dirty} className="w-full">
            {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}
          </NocButton>
        </>
      )}
    </Page>
  );
}
