import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarCheck, Clock, Info } from 'lucide-react';

import SectionHeader from '../components/ui/SectionHeader';
import { panelStyle } from '../components/ui/Card';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import {
  listMyPlan, saveMyPlan, DAY_LABELS, DAY_FULL, DEFAULT_REMIND_AT,
  formatRemindAt, toTimeInput, todayDow,
} from '../lib/api/gymPlans';
import { getCurrentMemberId } from '../services/bookingService';

/**
 * "Which days am I training, and when should you nudge me?"
 *
 * The reminder is the whole point, so the screen is explicit about how it
 * arrives: a notification on the day, and the card on Home. It also states the
 * one rule that would otherwise look like a bug — no nudge if you already
 * checked in, because being told to go to the gym you are standing in is worse
 * than no reminder at all.
 *
 * One time for the whole week rather than per-day. A per-day time is a much
 * bigger control for a benefit nobody asked for, and the plan is a habit, not
 * a calendar.
 */
export default function GymPlan() {
  const navigate = useNavigate();
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

  useEffect(() => { load(); }, [load]);

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
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white">Training plan</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Pick your days and we will remind you
          </p>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <SectionHeader title="Days" hint="Tap the days you plan to train" />
            <div
              className="p-4"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
            >
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_LABELS.map((label, d) => {
                  const on = days.includes(d);
                  const isToday = d === today;
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      aria-label={DAY_FULL[d]}
                      className="h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors active:scale-95"
                      style={{
                        background: on ? 'var(--color-primary)' : 'var(--color-surface-high)',
                        // Today gets an amber outline whether or not it is
                        // selected, so "is today one of my days?" is answerable
                        // without counting across the row.
                        border: isToday ? '1px solid var(--color-secondary)' : '1px solid var(--color-border)',
                        color: on ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {label}
                      {isToday && (
                        <span className="text-[10px] font-semibold leading-none"
                          style={{ color: 'var(--color-secondary)' }}>
                          today
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {days.length === 0 && (
                <p className="text-xs mt-3 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                  No days selected. Saving now turns reminders off completely.
                </p>
              )}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <SectionHeader title="Time" hint="When to nudge you on those days" />
            <div
              className="p-4 flex items-center gap-3"
              style={{ ...panelStyle, borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-panel)' }}
            >
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                <Clock size={18} />
              </span>
              <input
                type="time"
                value={remindAt}
                onChange={(e) => { setRemindAt(e.target.value); setDirty(true); }}
                className="field-input flex-1 px-3 py-2.5 rounded-xl text-sm text-white"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                aria-label="Reminder time"
              />
            </div>
          </motion.section>

          {/* Says exactly what will happen. The alternative — a switch that
              saves a preference nothing reads — is the failure this app has
              already shipped six times. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="p-4 space-y-2.5"
            style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}
          >
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Info size={13} style={{ color: 'var(--color-secondary)' }} /> What you will get
            </p>
            <p className="text-xs leading-relaxed flex items-start gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <CalendarCheck size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
              A card on your home screen every planned day, showing the time and whether you have
              checked in.
            </p>
            <p className="text-xs leading-relaxed flex items-start gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <Bell size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
              A notification shortly after your chosen time — but only if you have not already
              checked in that day.
            </p>
          </motion.div>

          <button
            onClick={save}
            disabled={saving || !dirty}
            className="w-full h-12 rounded-full font-bold text-sm text-black disabled:opacity-40"
            style={{ background: 'var(--color-secondary)' }}
          >
            {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}
          </button>
        </>
      )}
    </div>
  );
}
