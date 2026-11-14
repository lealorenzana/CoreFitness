import { useEffect, useState } from 'react';
import { ArrowRight, Check, DoorOpen, CalendarDays, CalendarClock, HeartHandshake, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import { refreshGymModules } from '../hooks/useGymModules';
import { RdButton } from './ui/rd';

export type GymStyle = 'open_gym' | 'classes' | 'pt_appointments' | 'coaching_packages';

const STYLES: { key: GymStyle; title: string; blurb: string; icon: LucideIcon }[] = [
  { key: 'open_gym', title: 'Open gym', icon: DoorOpen,
    blurb: 'Members come in and train on their own. Nothing to book in the app.' },
  { key: 'classes', title: 'Class timetable', icon: CalendarDays,
    blurb: 'Group classes on a weekly timetable. Members book a seat.' },
  { key: 'pt_appointments', title: 'Personal training by appointment', icon: CalendarClock,
    blurb: 'Members book a 1-on-1 session with a coach at a free time.' },
  { key: 'coaching_packages', title: 'Coaching packages — members pick their coach', icon: HeartHandshake,
    blurb: 'A member picks one coach for a package of months. Sessions are arranged with the coach, not booked in the app.' },
];

type Change = { setting: string; label: string; now_value: string; next_value: string };

/**
 * How does your gym work? (0256, gym styles phase 1, 2026-11-14). The owner ticks one or more styles; the screen
 * shows exactly which settings that changes (now → next), and nothing changes until they press Apply these —
 * the owner's rule: "customizable", so a setting they tuned is never overwritten behind their back. The same
 * component is the onboarding step and Settings → Bookings. Renders nothing before 0256 is live.
 */
export default function GymStyles({ onApplied }: { onApplied?: () => void }) {
  const [saved, setSaved] = useState<GymStyle[] | null | undefined>(undefined);
  const [picked, setPicked] = useState<GymStyle[]>([]);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings').select('gym_styles').maybeSingle();
      if (error) { setSaved(null); return; }   // before 0256: the column is not there
      const s = ((data as { gym_styles: GymStyle[] | null } | null)?.gym_styles ?? []) as GymStyle[];
      setSaved(s);
      setPicked(s);
    })();
  }, []);

  // What the picked styles would change — read, never written, every time the ticks change.
  useEffect(() => {
    if (saved === undefined || saved === null) return;
    if (picked.length === 0) return;   // the screen says "tick at least one" without asking
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('gym_style_changes', { p_styles: picked });
      if (alive) setChanges(error ? null : ((data ?? []) as Change[]));
    })();
    return () => { alive = false; };
  }, [picked, saved]);

  if (saved === undefined || saved === null) return null;

  const toggle = (k: GymStyle) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const same = picked.length === saved.length && picked.every((k) => saved.includes(k));
  const apply = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('apply_gym_styles', { p_styles: picked });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(changes && changes.length ? 'Applied — your settings follow your gym’s style.' : 'Saved.', 'success');
    setSaved(picked);
    setChanges([]);
    refreshGymModules();
    onApplied?.();
  };

  return (
    <div className="space-y-3" data-gym-styles>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Tick every way your gym works. Your booking and coaching settings follow — and you can still change each one afterwards.
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="How your gym works">
        {STYLES.map((s) => {
          const on = picked.includes(s.key);
          return (
            <button key={s.key} type="button" role="checkbox" aria-checked={on} data-style={s.key} disabled={busy}
              onClick={() => toggle(s.key)}
              className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
              style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' }}>
              <s.icon size={18} className="mt-0.5 shrink-0" style={{ color: on ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{s.title}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{s.blurb}</span>
              </span>
              <span className="mt-0.5 shrink-0">
                {on ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                  : <span className="block h-4 w-4 rounded border" style={{ borderColor: 'var(--color-border)' }} />}
              </span>
            </button>
          );
        })}
      </div>

      {picked.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tick at least one.</p>
      ) : changes === null ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>What this changes could not be read just now.</p>
      ) : changes.length === 0 ? (
        <div className="flex items-center gap-3">
          <p className="text-xs flex-1" style={{ color: 'var(--color-text-muted)' }} data-style-nochange>
            {same ? 'Your settings already match.' : 'Your settings already match — this only records your style.'}
          </p>
          {!same && <RdButton size="sm" variant="soft" disabled={busy} onClick={() => void apply()}>Save</RdButton>}
        </div>
      ) : (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }} data-style-changes>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>This changes {changes.length} setting{changes.length === 1 ? '' : 's'}</p>
          <ul className="mt-2 space-y-1.5">
            {changes.map((c) => (
              <li key={c.setting} className="text-xs flex flex-wrap items-center gap-1.5" data-style-change={c.setting} style={{ color: 'var(--color-text-secondary)' }}>
                <b style={{ color: 'var(--color-text-primary)' }}>{c.label}:</b>
                <span>{c.now_value}</span><ArrowRight size={12} /><b style={{ color: 'var(--color-text-primary)' }}>{c.next_value}</b>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <RdButton size="sm" variant="primary" disabled={busy} onClick={() => void apply()} data-style-apply>
              {busy ? 'Applying…' : 'Apply these'}
            </RdButton>
            <RdButton size="sm" variant="secondary" disabled={busy} onClick={() => setPicked(saved)}>Keep my settings</RdButton>
          </div>
        </div>
      )}
    </div>
  );
}
