import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';

/**
 * Walk-ins (0185): whether the gym sells day passes, the price per day, the
 * optional 5- and 10-visit packs, and after how many visits in a month the
 * desk is told to suggest a membership. Saved together through
 * set_day_pass_settings(). Shared by Settings → Walk-ins and the setup wizard.
 * Renders nothing before 0185.
 */
export default function DayPassSettings() {
  const [f, setF] = useState<{ on: boolean; day: string; pack5: string; pack10: string; nudge: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** 0194: a guest with a day pass bought in the app may book a class that day. null = before 0194. */
  const [classes, setClasses] = useState<boolean | null>(null);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings').select('day_pass_classes').maybeSingle();
      if (!error && data) setClasses(!!(data as { day_pass_classes: boolean }).day_pass_classes);
    })();
  }, []);
  const toggleClasses = async (on: boolean) => {
    setClasses(on);
    const { error } = await supabase.rpc('set_day_pass_classes', { p_on: on });
    if (error) { setClasses(!on); showToast(error.message, 'error'); return; }
    showToast(on ? 'Day-pass guests can book a class that day' : 'Day-pass guests cannot book classes', 'success');
  };

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('gym_settings')
        .select('day_pass_on, day_pass_price, pack5_price, pack10_price, guest_nudge_visits').maybeSingle();
      if (error || !data) return;
      const r = data as { day_pass_on: boolean; day_pass_price: number | null; pack5_price: number | null; pack10_price: number | null; guest_nudge_visits: number | null };
      setF({ on: r.day_pass_on, day: r.day_pass_price?.toString() ?? '', pack5: r.pack5_price?.toString() ?? '',
        pack10: r.pack10_price?.toString() ?? '', nudge: r.guest_nudge_visits?.toString() ?? '' });
    })();
  }, []);
  if (!f) return null;

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_day_pass_settings', {
      p_on: f.on, p_day: num(f.day), p_pack5: num(f.pack5), p_pack10: num(f.pack10), p_nudge: num(f.nudge),
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Saved', 'success');
  };
  const input = 'w-28 rounded-lg border px-3 py-2 text-sm';
  const style = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };
  const muted = { color: 'var(--color-text-secondary)' };
  const money = (k: 'day' | 'pack5' | 'pack10', label: string, hint: string) => (
    <label className="block text-xs" style={muted}>{label}
      <span className="flex items-center gap-1.5 mt-1">
        <span>₱</span>
        <input aria-label={label} className={input} style={style} inputMode="decimal" value={f[k]} disabled={!f.on}
          onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^0-9.]/g, '') })} />
      </span>
      <span className="block mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{hint}</span>
    </label>
  );

  return (
    <div className="space-y-4" data-day-pass-settings>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={f.on} onChange={(e) => setF({ ...f, on: e.target.checked })} className="mt-1" aria-label="Sell day passes" />
        <span>
          <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Sell day passes to walk-ins</span>
          <span className="block text-xs mt-0.5" style={muted}>
            The desk types the guest&rsquo;s name (and phone), takes the cash, and the visit shows in attendance and the cash drawer.
            Guests never appear in your member list and never count toward your plan&rsquo;s member limit.
          </span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {money('day', 'Day pass', 'One visit, today')}
        {money('pack5', '5-visit pack', 'Empty: not sold')}
        {money('pack10', '10-visit pack', 'Empty: not sold')}
      </div>
      {classes !== null && (
        <label className="flex items-start gap-3 cursor-pointer" data-day-pass-classes>
          <input type="checkbox" checked={classes} disabled={!f.on} onChange={(e) => void toggleClasses(e.target.checked)} className="mt-1"
            aria-label="Day-pass guests may book a class that day" />
          <span>
            <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Day-pass guests may book a class that day</span>
            <span className="block text-xs mt-0.5" style={muted}>
              Someone who buys a day pass in the app (where you take payments in the app) can book a class held the same day. No plan, no weekly limit; your waiver still applies.
            </span>
          </span>
        </label>
      )}
      <label className="block text-xs" style={muted}>Suggest a membership after
        <span className="flex items-center gap-1.5 mt-1">
          <input aria-label="Visits before suggesting a membership" className="w-20 rounded-lg border px-3 py-2 text-sm" style={style} inputMode="numeric"
            value={f.nudge} disabled={!f.on} onChange={(e) => setF({ ...f, nudge: e.target.value.replace(/\D/g, '') })} placeholder="—" />
          <span>visits in a month (empty: never)</span>
        </span>
      </label>
      <button type="button" disabled={saving} onClick={() => void save()} data-save-day-pass
        className="h-9 px-4 rounded-full text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-primary)', color: '#fff' }}>
        {saving ? 'Saving…' : 'Save walk-in prices'}
      </button>
    </div>
  );
}
