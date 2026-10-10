import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';

/** Who approves a booking, per kind (0180). */
export type BookingMode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';

const CHOICES: { key: BookingMode; title: string; blurb: (kind: 'class' | 'pt') => string }[] = [
  { key: 'instant', title: 'Instant', blurb: () => 'Confirmed the moment a member books. Seats, plan limits and clashes still apply.' },
  { key: 'coach', title: 'Coach approves', blurb: () => 'The coach accepts or declines. What every gym had before this setting.' },
  { key: 'desk', title: 'Desk approves', blurb: (k) => (k === 'class'
      ? 'Only you decide, on Bookings. Coaches see the request but cannot decide it.'
      : 'You or the front desk decide, on Bookings. Coaches cannot.') },
  { key: 'coach_desk', title: 'Coach, then desk', blurb: (k) => (k === 'class'
      ? 'The coach accepts first, then you confirm. A coach’s decline is final.'
      : 'The coach accepts first, then you or the desk confirm. A coach’s decline is final.') },
  { key: 'off', title: 'Off', blurb: (k) => (k === 'class'
      ? 'Members do not book classes in the app. The tab is hidden.'
      : 'Members do not book 1-on-1 in the app. Your desk can still book one for them.') },
];

/**
 * The owner's choice of who approves bookings, for classes and 1-on-1 apart,
 * saved the moment it is picked through `set_booking_approval()` (0180).
 * Shared by Settings → Bookings and the setup wizard so the two cannot drift.
 * Renders nothing before 0180 is live — a setting nothing reads is a lie.
 */
export default function BookingApproval() {
  const [modes, setModes] = useState<{ class: BookingMode; pt: BookingMode } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings')
        .select('class_booking_approval, pt_booking_approval').maybeSingle();
      if (error || !data) return;
      const row = data as { class_booking_approval: BookingMode; pt_booking_approval: BookingMode };
      setModes({ class: row.class_booking_approval ?? 'coach', pt: row.pt_booking_approval ?? 'coach' });
    })();
  }, []);

  if (!modes) return null;

  const pick = async (kind: 'class' | 'pt', mode: BookingMode) => {
    const next = { ...modes, [kind]: mode };
    const before = modes;
    setModes(next);
    setSaving(true);
    const { error } = await supabase.rpc('set_booking_approval', { p_class: next.class, p_pt: next.pt });
    setSaving(false);
    if (error) { setModes(before); showToast(error.message, 'error'); return; }
    showToast('Saved — it applies to the next booking.', 'success');
  };

  const labelStyle = { color: 'var(--color-text-secondary)' };
  return (
    <div className="space-y-6" data-booking-approval>
      {(['class', 'pt'] as const).map((kind) => (
        <div key={kind}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {kind === 'class' ? 'Group classes' : '1-on-1 sessions'}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={kind === 'class' ? 'Group classes' : '1-on-1 sessions'}>
            {CHOICES.map((c) => {
              const on = modes[kind] === c.key;
              return (
                <button key={c.key} type="button" role="radio" aria-checked={on} disabled={saving}
                  data-mode={`${kind}:${c.key}`}
                  onClick={() => { if (!on) void pick(kind, c.key); }}
                  className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
                  style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' }}>
                  <span className="mt-0.5 shrink-0">
                    {on
                      ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                      : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{c.title}</span>
                    <span className="block text-xs mt-0.5" style={labelStyle}>{c.blurb(kind)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs" style={labelStyle}>
        Whatever you choose, you can always approve, decline or reverse a booking on Bookings.
      </p>
    </div>
  );
}
