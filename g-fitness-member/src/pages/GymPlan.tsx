import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowCounterClockwise, BellSlash, CalendarCheck, Fire, Info, Lightbulb } from '@phosphor-icons/react';

import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import WeekMarks from '../components/ui/WeekMarks';
import Disclosure from '../components/ui/Disclosure';
import { Select } from '../components/ui/Field';
import { errorMessage } from '../utils/errorMessage';
import {
  saveMyPlan, DAY_LABELS, DAY_FULL, formatRemindAt, todayDow,
} from '../lib/api/gymPlans';
import { getCurrentMemberId } from '../services/bookingService';
import {
  loadTrainingPlan, suggestReminder, DAY_PRESETS, TIME_PRESETS, type TrainingPlanView,
} from '../services/trainingPlanService';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, Eyebrow, LineRow, NocButton, Panel, SectionHead } from '../components/ui/noc';

/**
 * Training plan — which days, what you train on each, and when to be nudged
 * (reworked 2026-09-19, with 0089).
 *
 *   This week      Today's week marks, "2 of 5 planned days", weeks in a row
 *   Days           presets, then the seven days
 *   On each day    a routine per chosen day (0089), or "any workout"
 *   Reminder       presets, the time, and your usual check-in time as a hint
 *   How it works   folded away: what the plan actually does
 *
 * Nothing saves until Save — the plan is replaced whole (see `saveMyPlan`) —
 * so an unsaved change shows a bar that stays in reach however long the page.
 *
 * One time for the whole week rather than per-day: the plan is a habit, not a
 * calendar. Colour roles: a chosen day is violet, today an amber edge, Save amber.
 */
export default function GymPlan() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [view, setView] = useState<TrainingPlanView | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [remindAt, setRemindAt] = useState('17:00');
  const [routineByDay, setRoutineByDay] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = (v: TrainingPlanView) => {
    setDays(v.days);
    setRemindAt(v.remindAt);
    setRoutineByDay(v.routineByDay);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getCurrentMemberId();
      setMemberId(id);
      if (!id) return;
      const v = await loadTrainingPlan(id);
      setView(v);
      reset(v);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your plan'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggleDay = (d: number) => {
    setDays((current) => current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort((a, b) => a - b));
  };
  const applyPreset = (preset: number[]) => setDays([...preset]);
  const pickTime = (t: string) => setRemindAt(t);
  const pickRoutine = (d: number, id: string) => {
    setRoutineByDay((m) => ({ ...m, [d]: id || null }));
  };

  const save = async () => {
    if (!memberId) return;
    setSaving(true);
    try {
      await saveMyPlan(memberId, days, remindAt, routineByDay);
      toast.success(days.length === 0
        ? 'Plan cleared — no more reminders'
        : `Saved. ${days.length} ${days.length === 1 ? 'day' : 'days'} a week at ${formatRemindAt(remindAt)}`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your plan'));
      void load();
    } finally {
      setSaving(false);
    }
  };

  // Unsaved = different from what the server holds, so toggling a day on and
  // off again leaves nothing to save.
  const dirty = view != null && (
    days.join() !== view.days.join()
    || remindAt !== view.remindAt
    || days.some((d) => (routineByDay[d] ?? null) !== (view.routineByDay[d] ?? null))
  );
  const today = todayDow();
  const routines = view?.routines ?? null;
  const samePreset = (p: number[]) => p.length === days.length && p.every((d) => days.includes(d));

  // This week against the plan *as saved* — the draft has not happened yet.
  const saved = view?.days ?? [];
  const keptThisWeek = view?.weekCheckIns
    ? saved.filter((d) => d <= today && view.weekCheckIns![d]).length : null;
  const visitsThisWeek = view?.weekCheckIns?.filter(Boolean).length ?? 0;
  const suggestion = view?.usualCheckIn ? suggestReminder(view.usualCheckIn) : null;

  return (
    <Page>
      <PageTitle back fallback="/member/home" title="Training plan"
        subtitle={loading ? 'Pick your days and when to be reminded'
          : saved.length === 0 ? 'No days chosen yet'
          : `${saved.length} ${saved.length === 1 ? 'day' : 'days'} a week · reminder at ${formatRemindAt(view!.remindAt)}`} />

      {loading || !view ? (
        <SkeletonList count={4} />
      ) : (
        <>
          {/* ── This week ── */}
          {saved.length > 0 ? (
            <Panel glow="structure">
              <div className="flex items-center justify-between" style={{ gap: 10 }}>
                <Eyebrow>This week</Eyebrow>
                {view.streakWeeks != null && view.streakWeeks > 0 && (
                  <span className="inline-flex items-center" style={{ gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)' }}>
                    <Fire size={14} weight="fill" /> {view.streakWeeks} {view.streakWeeks === 1 ? 'week' : 'weeks'} in a row
                  </span>
                )}
              </div>
              {view.weekCheckIns ? (
                <>
                  <div style={{ marginTop: 14 }}>
                    <WeekMarks days={view.weekCheckIns} dayNumbers={view.weekDayNumbers} todayIndex={today} planned={saved} />
                  </div>
                  <p style={{ fontSize: 13, marginTop: 12, color: 'var(--color-text-secondary)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {Math.min(visitsThisWeek, saved.length)} of {saved.length}
                    </span>{' '}
                    {visitsThisWeek >= saved.length ? 'done — this week is kept' : 'visits this week'}
                    {keptThisWeek != null && visitsThisWeek < saved.length && ` · ${keptThisWeek} on a planned day`}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, marginTop: 10, color: 'var(--color-text-muted)' }}>
                  Your check-ins could not be read just now, so this week is not shown.
                </p>
              )}
            </Panel>
          ) : (
            <Panel glow="action">
              <Eyebrow tone="action">Start a habit</Eyebrow>
              <p style={{ fontSize: 17, fontWeight: 700, marginTop: 8, color: 'var(--color-text-primary)' }}>
                Pick the days you train
              </p>
              <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                Today will show each training day, and you get one nudge if you have not checked in by your time.
                A preset below is the quickest start.
              </p>
            </Panel>
          )}

          {/* ── Days ── */}
          <section>
            <SectionHead title="Days" meta={`${days.length} a week`} />
            <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, marginTop: 12, marginInline: -2, padding: 2 }}>
              {DAY_PRESETS.map((p) => (
                <Chip key={p.label} label={p.label} on={samePreset(p.days)} onClick={() => applyPreset(p.days)} />
              ))}
            </div>
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
                    className="flex flex-col items-center justify-center noc-press"
                    style={{
                      height: 56, gap: 3, borderRadius: 12, fontSize: 12.5, fontWeight: 600,
                      background: on ? 'var(--color-primary)' : 'transparent',
                      boxShadow: on ? '0 0 12px -4px var(--color-primary)' : 'none',
                      border: `1px solid ${isToday ? 'var(--color-secondary)' : on ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                      color: on ? '#fff' : 'var(--color-text-secondary)',
                      transition: 'background-color 160ms ease, box-shadow 160ms ease',
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
            {days.length === 0 && dirty && (
              <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
                No days chosen. Saving now turns reminders off completely.
              </p>
            )}
          </section>

          {/* ── What you train on each day (0089) ── */}
          {days.length > 0 && view.routinesSupported && (
            <section>
              <SectionHead title="On each day" meta="Optional" />
              {routines && routines.length > 0 ? (
                <>
                  <div className="noc-rows" style={{ marginTop: 6 }}>
                    {days.map((d, i) => (
                      <div key={d} className="flex items-center" style={{
                        gap: 12, padding: '10px 0',
                        borderBottom: i === days.length - 1 ? 'none' : '1px solid var(--color-separator)',
                      }}>
                        <span style={{ width: 92, flex: 'none', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {DAY_FULL[d]}
                        </span>
                        <Select
                          aria-label={`Workout on ${DAY_FULL[d]}`}
                          value={routineByDay[d] ?? ''}
                          onChange={(e) => pickRoutine(d, e.target.value)}
                          className="min-w-0 flex-1"
                          style={{ height: 42, fontSize: 14 }}
                        >
                          <option value="">Any workout</option>
                          {routines.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                    On that day, Today offers to start it and the reminder names it.
                  </p>
                </>
              ) : routines ? (
                <button onClick={() => navigate('/member/track')} className="w-full text-left noc-press-soft"
                  style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  Save a routine — leg day, arms day — and you can plan it for a day here.{' '}
                  <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>Build one</span>
                </button>
              ) : (
                <p style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-muted)' }}>
                  Your routines could not be read just now.
                </p>
              )}
            </section>
          )}

          {/* ── Reminder ── */}
          <section>
            <SectionHead title="Reminder" meta="Same time every chosen day" />
            <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, marginTop: 12, marginInline: -2, padding: 2 }}>
              {TIME_PRESETS.map((t) => (
                <Chip key={t.value} label={t.label} on={remindAt === t.value} onClick={() => pickTime(t.value)} />
              ))}
            </div>
            <label className="flex items-center" style={{
              gap: 12, marginTop: 12, height: 50, padding: '0 14px',
              borderRadius: 'var(--radius-btn)', background: 'var(--color-surface)',
              border: '1px solid var(--color-hairline)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 'none' }}>Remind me at</span>
              <input
                type="time"
                value={remindAt}
                onChange={(e) => pickTime(e.target.value)}
                aria-label="Reminder time"
                className="min-w-0 flex-1 text-right bg-transparent"
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', outline: 'none' }}
              />
            </label>
            {view.usualCheckIn && suggestion && (
              <div className="flex items-start" style={{ gap: 10, marginTop: 10 }}>
                <Lightbulb size={16} weight="fill" style={{ color: 'var(--color-secondary)', flex: 'none', marginTop: 2 }} aria-hidden />
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  You usually check in around {formatRemindAt(view.usualCheckIn)}.
                  {remindAt !== suggestion && (
                    <>
                      {' '}
                      <button onClick={() => pickTime(suggestion)} style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                        Use {formatRemindAt(suggestion)}
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
          </section>

          {/* ── How it works ── */}
          <Disclosure title="How your plan works" icon={<Info size={17} />}>
            <LineRow gutterWidth={0} title="An entry on Today"
              meta="Every chosen day, with the time, the workout if you set one, and whether you have checked in." />
            <LineRow gutterWidth={0} title="One notification after your time"
              meta="Only if you have not checked in that day, and only within three hours of it." />
            <LineRow gutterWidth={0} title="Weeks in a row" last
              meta="A week counts when you visit at least as many days as your plan has — any days. It is measured against the plan you have now." />
          </Disclosure>

          {/* ── Unsaved changes — sticks to the bottom of the screen while there
              are any. It stops short on the right: the assistant's bubble
              floats in that corner and would sit on top of Save. */}
          {dirty && (
            <div role="region" aria-label="Unsaved changes" style={{
              position: 'sticky', bottom: 12, zIndex: 5, marginRight: 66,
              display: 'flex', alignItems: 'center', gap: 8, padding: 8,
              borderRadius: 20, background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-hairline)',
              boxShadow: '0 12px 32px -12px rgba(0,0,0,0.75)',
            }}>
              <button onClick={() => reset(view)} disabled={saving}
                className="flex-none inline-flex items-center noc-press-soft"
                style={{ gap: 6, height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                <ArrowCounterClockwise size={15} aria-hidden /> Undo
              </button>
              <NocButton variant="action" onClick={save} disabled={saving} className="flex-1"
                icon={days.length === 0 ? <BellSlash size={16} /> : <CalendarCheck size={16} />}>
                {saving ? 'Saving…' : days.length === 0 ? 'Save · reminders off' : 'Save plan'}
              </NocButton>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
