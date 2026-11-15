import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Repeat, Clock3, UserX } from 'lucide-react';
import { showToast } from '../utils/toast';
import { refreshGymModules } from '../hooks/useGymModules';
import {
  getBookingRules, setCancelRules, setNoshowRules, setRepeatRules,
  type BookingRules, type LateMode, type NoshowMode, type RepeatKind, type RepeatWho,
} from '../lib/api/bookingRules';

const muted = { color: 'var(--color-text-secondary)' };
const strong = { color: 'var(--color-text-primary)' };
const box = (on: boolean) => ({ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' });
const num = (v: string, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

/** One choice among several, the time-slots card's look. */
function Choice<T extends string>({ label, value, options, onPick, busy, name }: {
  label: string; value: T; busy: boolean; name: string; onPick: (v: T) => void;
  options: { key: T; title: string; blurb: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold" style={strong}>{label}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} disabled={busy} data-choice={`${name}:${o.key}`}
              onClick={() => { if (!on) onPick(o.key); }}
              className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left" style={box(on)}>
              <span className="mt-0.5 shrink-0">{on ? <Check size={16} style={{ color: 'var(--color-primary)' }} /> : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium" style={strong}>{o.title}</span>
                <span className="block text-xs mt-0.5" style={muted}>{o.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A number the owner types; saved when the box loses focus. */
function NumberRule({ label, unit, value, lo, hi, onSave, name }: { label: string; unit: string; value: number; lo: number; hi: number; name: string; onSave: (v: number) => void }) {
  return (
    <label className="block text-sm" style={strong}>
      <span className="font-semibold">{label}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <input className="a-in" style={{ width: 90 }} inputMode="numeric" defaultValue={value} key={`${name}:${value}`} data-rule={name} aria-label={label}
          onBlur={(e) => { const v = num(e.target.value, lo, hi); if (v !== value) onSave(v); else e.target.value = String(value); }} />
        <span className="text-xs" style={muted}>{unit}</span>
      </span>
    </label>
  );
}

function Toggle({ on, label, children, onFlip, busy, name }: { on: boolean; label: string; children: React.ReactNode; busy: boolean; name: string; onFlip: () => void }) {
  return (
    <label className="flex items-start gap-3 text-sm" style={strong}>
      <button type="button" className={`a-toggle ${on ? '' : 'off'}`} aria-pressed={on} aria-label={label} disabled={busy} data-toggle={name} onClick={onFlip} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </label>
  );
}

function OffNote({ part }: { part: string }) {
  return (
    <p className="text-sm rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--color-border)', ...muted }} data-part-off>
      <b>{part}</b> is off — nothing here applies yet. Set it up here, then switch it on in{' '}
      <Link to="/gym-app?tab=runs" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }} onClick={() => refreshGymModules()}>Your app → What you run</Link>.
    </p>
  );
}

/**
 * Settings → Bookings: repeat bookings, late cancels and no-shows (0260, gym styles phase 4). Every rule is the
 * owner's — "we adjust to their gym, not them to our system"; the database holds the defaults. Renders nothing
 * before 0260 is live.
 */
export default function BookingRulesSettings() {
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRules(await getBookingRules()); }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  if (!rules) return null;

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, next: BookingRules) => {
    setRules(next);
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { showToast(r.message, 'error'); await load(); return; }
    showToast('Saved — it applies from now on.', 'success');
  };
  const saveRepeat = (p: Partial<BookingRules>) => {
    const n = { ...rules, ...p };
    if (n.repeatWho.length === 0) { showToast('Choose at least one: members, coaches or the front desk.', 'error'); return; }
    void run(() => setRepeatRules(n.repeatWho, n.repeatKind, n.repeatMaxWeeks, n.repeatAheadDays), n);
  };
  const saveCancel = (p: Partial<BookingRules>) => {
    const n = { ...rules, ...p };
    void run(() => setCancelRules(n.classCancelMinutes, n.ptCancelMinutes, n.slotCancelMinutes, n.lateMode), n);
  };
  const saveNoshow = (p: Partial<BookingRules>) => { const n = { ...rules, ...p }; void run(() => setNoshowRules(n), n); };
  const flipWho = (w: RepeatWho) => saveRepeat({ repeatWho: rules.repeatWho.includes(w) ? rules.repeatWho.filter((x) => x !== w) : [...rules.repeatWho, w] });
  const allSame = rules.classCancelMinutes === rules.ptCancelMinutes && rules.ptCancelMinutes === rules.slotCancelMinutes;

  return (
    <div className="space-y-8" data-booking-rules>
      <section className="space-y-4" data-rules-repeats>
        <h3 className="flex items-center gap-2 text-base font-semibold" style={strong}><Repeat size={16} />Repeat bookings</h3>
        {!rules.repeatsOn && <OffNote part="Repeat bookings" />}
        <div>
          <p className="text-sm font-semibold" style={strong}>Who can set a repeat</p>
          <p className="text-xs mt-0.5" style={muted}>Any mix. Every week is still its own booking, checked like any other — seats, plan limits, clashes, and who approves.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([['member', 'Members'], ['coach', 'Coaches'], ['desk', 'The front desk']] as const).map(([w, l]) => {
              const on = rules.repeatWho.includes(w);
              return (
                <button key={w} type="button" className={`a-chip ${on ? 'v' : ''}`} aria-pressed={on} disabled={busy} data-repeat-who={w} onClick={() => flipWho(w)}>
                  {on && <Check size={12} />}{l}
                </button>
              );
            })}
          </div>
        </div>
        <Choice<RepeatKind> label="How it repeats" name="repeat-kind" value={rules.repeatKind} busy={busy} onPick={(v) => saveRepeat({ repeatKind: v })}
          options={[
            { key: 'weeks', title: 'For a number of weeks', blurb: `Whoever sets it picks 2 to ${rules.repeatMaxWeeks} weeks, counting the first.` },
            { key: 'until_stopped', title: 'Until it is stopped', blurb: `Keeps booking the next weeks, ${rules.repeatAheadDays} days ahead, until the member, the coach or the desk stops it.` },
          ]} />
        <div className="grid gap-3 sm:grid-cols-2">
          {rules.repeatKind === 'weeks'
            ? <NumberRule label="Up to" unit="weeks (2 – 12)" name="repeat_max_weeks" value={rules.repeatMaxWeeks} lo={2} hi={12} onSave={(v) => saveRepeat({ repeatMaxWeeks: v })} />
            : <NumberRule label="Book ahead" unit="days (1 – 28)" name="repeat_ahead_days" value={rules.repeatAheadDays} lo={1} hi={28} onSave={(v) => saveRepeat({ repeatAheadDays: v })} />}
        </div>
        <p className="text-xs" style={muted}>A week that cannot be booked (full, a clash, over the plan's limit) is listed with the reason — never skipped quietly. Stopping a repeat keeps the weeks already booked.</p>
      </section>

      <section className="space-y-4" data-rules-late>
        <h3 className="flex items-center gap-2 text-base font-semibold" style={strong}><Clock3 size={16} />Late cancels</h3>
        <p className="text-xs" style={muted}>How close to the start a member may still cancel in the app. 0 means until it starts — nothing is late.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberRule label="Classes: cancel up to" unit="minutes before" name="class_cancel_minutes" value={rules.classCancelMinutes} lo={0} hi={1440} onSave={(v) => saveCancel({ classCancelMinutes: v })} />
          <NumberRule label="1-on-1: cancel up to" unit="minutes before" name="pt_cancel_minutes" value={rules.ptCancelMinutes} lo={0} hi={1440} onSave={(v) => saveCancel({ ptCancelMinutes: v })} />
          <NumberRule label="Time slots: cancel up to" unit="minutes before" name="slot_cancel_minutes" value={rules.slotCancelMinutes} lo={0} hi={1440} onSave={(v) => saveCancel({ slotCancelMinutes: v })} />
        </div>
        {!allSame && (
          <button type="button" className="a-btn ghost sm" disabled={busy} data-same-for-all
            onClick={() => saveCancel({ ptCancelMinutes: rules.classCancelMinutes, slotCancelMinutes: rules.classCancelMinutes })}>
            Use the same for all ({rules.classCancelMinutes} minutes, from classes)
          </button>
        )}
        <Choice<LateMode> label="Inside that window" name="late-mode" value={rules.lateMode} busy={busy} onPick={(v) => saveCancel({ lateMode: v })}
          options={[
            { key: 'mark', title: 'Allowed, marked late', blurb: 'The place opens for someone else. It is recorded as late and counts toward your no-show rules below.' },
            { key: 'mark_free', title: 'Allowed, marked late — never counts', blurb: 'Recorded as late so you, the desk and the coach can see it. No other effect.' },
            { key: 'block', title: 'Not in the app — ask the front desk', blurb: 'The app says when the last moment was; the desk can still cancel it.' },
          ]} />
        <p className="text-xs" style={muted}>The front desk and coaches are never late — only a member's own cancel is.</p>
      </section>

      <section className="space-y-4" data-rules-noshows>
        <h3 className="flex items-center gap-2 text-base font-semibold" style={strong}><UserX size={16} />No-shows</h3>
        {!rules.noshowsOn && <OffNote part="No-shows and late cancels" />}
        <Choice<NoshowMode> label="Who decides a no-show" name="noshow-mode" value={rules.noshowMode} busy={busy} onPick={(v) => saveNoshow({ noshowMode: v })}
          options={[
            { key: 'auto_coach', title: 'Check-in for classes and slots, the coach for 1-on-1', blurb: 'A 1-on-1 the coach has not answered stays unmarked — never a no-show by silence — and the coach is reminded.' },
            { key: 'auto', title: 'Check-in for everything', blurb: 'Booked, confirmed, and no check-in in the window below: a no-show.' },
            { key: 'hand', title: 'Marked by hand only', blurb: 'The coach or the front desk taps who came. Choose this if your desk does not scan everyone at the door.' },
            { key: 'off', title: 'Do not track no-shows', blurb: 'Nothing is marked; nothing below applies.' },
          ]} />
        {rules.noshowMode !== 'off' && (<>
          {rules.noshowMode !== 'hand' && (
            <NumberRule label="A check-in counts from" unit="minutes before it starts, until it ends" name="noshow_window_minutes" value={rules.noshowWindowMinutes} lo={0} hi={240}
              onSave={(v) => saveNoshow({ noshowWindowMinutes: v })} />
          )}
          <div className="space-y-3">
            <p className="text-sm font-semibold" style={strong}>After a no-show</p>
            <Toggle name="noshow-tell" on={rules.noshowTell} busy={busy} label="Record it and tell them" onFlip={() => saveNoshow({ noshowTell: !rules.noshowTell })}>
              <b>Record it and tell them</b> <span className="text-xs" style={muted}>— the member and their coach get a message; it shows on the member's record either way</span>
            </Toggle>
            <Toggle name="noshow-counts" on={rules.noshowCountsUsed} busy={busy} label="It counts as used" onFlip={() => saveNoshow({ noshowCountsUsed: !rules.noshowCountsUsed })}>
              <b>It counts as used</b> <span className="text-xs" style={muted}>— against the plan's classes a week or 1-on-1 sessions a month. Coaching packages are monthly, so nothing is used up there.</span>
            </Toggle>
            <Toggle name="noshow-pause" on={rules.noshowPause} busy={busy} label="Pause booking in the app after repeats" onFlip={() => saveNoshow({ noshowPause: !rules.noshowPause })}>
              <b>Pause booking in the app after repeats</b> <span className="text-xs" style={muted}>— the member is told why and until when; the desk can still book for them and can lift it early</span>
            </Toggle>
            {rules.noshowPause && (
              <div className="grid gap-3 sm:grid-cols-3" data-pause-rules>
                <NumberRule label="After" unit={rules.lateMode === 'mark' ? 'no-shows or late cancels' : 'no-shows'} name="noshow_pause_count" value={rules.noshowPauseCount} lo={1} hi={10} onSave={(v) => saveNoshow({ noshowPauseCount: v })} />
                <NumberRule label="Within" unit="days" name="noshow_pause_within_days" value={rules.noshowPauseWithinDays} lo={7} hi={180} onSave={(v) => saveNoshow({ noshowPauseWithinDays: v })} />
                <NumberRule label="Pause for" unit="days" name="noshow_pause_days" value={rules.noshowPauseDays} lo={1} hi={60} onSave={(v) => saveNoshow({ noshowPauseDays: v })} />
              </div>
            )}
          </div>
          <p className="text-xs" style={muted}>Only sessions after you switch no-shows on are judged — never the past. Marking “they were here” undoes a no-show and what it caused. No-shows never take points away.</p>
        </>)}
      </section>
    </div>
  );
}
