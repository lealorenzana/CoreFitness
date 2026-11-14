import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import CoachingRules from './CoachingRules';
import {
  coachingPrices, getCoachingSettings, MODE_WORDS, saveCoachingSettings, setCoachingPrice,
  type CoachingMode, type CoachingSettings as Settings, type FeeMode,
} from '../lib/api/coaching';

// Groups (pick_group) were removed by 0220 — personal training only.
const MODES: CoachingMode[] = ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'];
const LENGTHS = [1, 2, 3, 6, 12];
const FEES: { key: FeeMode; title: string; blurb: string }[] = [
  { key: 'included', title: 'Included in the plan', blurb: 'A member whose plan includes 1-on-1 may have a coach. Nothing extra to pay.' },
  { key: 'gym_priced', title: 'Priced by the gym', blurb: 'You set a price per length. Members pay the gym; the desk confirms it and it is a payment like any other.' },
  { key: 'trainer_direct', title: 'Paid to the coach', blurb: 'Members pay the coach directly and the coach taps Received. You see who has a coach and until when — never the money.' },
];

/**
 * How coaching works at this gym (0181): the ways members get a coach, the
 * lengths offered, and who is paid. Saved as it is changed, through
 * set_coaching_settings(). Shared by Settings → Coaching and the setup wizard.
 * Then the gym's own rules (CoachingRules, 0235).
 * Renders nothing before 0181.
 */
export default function CoachingSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [cfg, p] = await Promise.all([getCoachingSettings(), coachingPrices()]);
      setS(cfg);
      setPrices(Object.fromEntries(p.map((r) => [`${r.kind}:${r.months}`, String(r.price)])));
    })();
  }, []);
  if (!s) return null;

  const save = async (next: Settings) => {
    const before = s;
    setS(next);
    setSaving(true);
    try { await saveCoachingSettings(next); showToast('Saved', 'success'); }
    catch (e) { setS(before); showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };
  const savePrice = async (kind: 'pt' | 'group', months: number) => {
    const raw = (prices[`${kind}:${months}`] ?? '').trim();
    try { await setCoachingPrice(kind, months, raw === '' ? null : Number(raw)); showToast('Price saved', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
  };

  const muted = { color: 'var(--color-text-secondary)' };
  const box = (on: boolean) => ({ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' });
  const tick = (on: boolean) => on
    ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
    : <span className="block h-4 w-4 rounded border" style={{ borderColor: 'var(--color-border)' }} />;

  return (
    <div className="space-y-6" data-coaching-settings>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>How members get a coach</p>
        <p className="text-xs mt-0.5" style={muted}>Turn on as many as your gym does.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => {
            const on = s.modes.includes(m);
            return (
              <button key={m} type="button" role="checkbox" aria-checked={on} disabled={saving} data-coaching-mode={m}
                onClick={() => void save({ ...s, modes: on ? s.modes.filter((x) => x !== m) : [...s.modes, m] })}
                className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left" style={box(on)}>
                <span className="mt-0.5 shrink-0">{tick(on)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{MODE_WORDS[m].title}</span>
                  <span className="block text-xs mt-0.5" style={muted}>{MODE_WORDS[m].blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Who approves a member's pick (0258): only meaningful when members pick their own coach. */}
      {s.modes.includes('pick_pt') && <CoachingApproval />}

      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Lengths members choose from</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LENGTHS.map((l) => {
            const on = s.lengths.includes(l);
            return (
              <button key={l} type="button" aria-pressed={on} disabled={saving || (on && s.lengths.length === 1)} data-coaching-length={l}
                onClick={() => void save({ ...s, lengths: on ? s.lengths.filter((x) => x !== l) : [...s.lengths, l].sort((a, b) => a - b) })}
                className="h-9 px-3 rounded-lg border text-xs font-semibold" style={{ ...box(on), color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                {l} month{l === 1 ? '' : 's'}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Who is paid for coaching</p>
        <div className="mt-2 grid gap-2">
          {FEES.map((f) => {
            const on = s.feeMode === f.key;
            return (
              <button key={f.key} type="button" role="radio" aria-checked={on} disabled={saving} data-fee-mode={f.key}
                onClick={() => { if (!on) void save({ ...s, feeMode: f.key }); }}
                className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left" style={box(on)}>
                <span className="mt-0.5 shrink-0">{on ? <Check size={16} style={{ color: 'var(--color-primary)' }} /> : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{f.title}</span>
                  <span className="block text-xs mt-0.5" style={muted}>{f.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {s.feeMode === 'gym_priced' && (
        <div data-coaching-prices>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your prices (₱)</p>
          <p className="text-xs mt-0.5" style={muted}>Empty means not offered.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="text-xs">
              <thead><tr><th className="text-left pr-3 py-1" style={muted}>Length</th><th className="text-left pr-3" style={muted}>Package</th></tr></thead>
              <tbody>
                {s.lengths.map((m) => (
                  <tr key={m}>
                    <td className="pr-3 py-1" style={{ color: 'var(--color-text-primary)' }}>{m} mo</td>
                    {(['pt'] as const).map((k) => (
                      <td key={k} className="pr-3">
                        <input aria-label={`Package price, ${m} months`} inputMode="decimal"
                          value={prices[`${k}:${m}`] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [`${k}:${m}`]: e.target.value.replace(/[^0-9.]/g, '') }))}
                          onBlur={() => void savePrice(k, m)}
                          className="w-24 rounded-lg border px-2 py-1.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* The gym's own rules (0235): pause on a freeze, the gym's share, coach dues. */}
      <CoachingRules feeMode={s.feeMode} />
    </div>
  );
}

type Approval = 'coach' | 'desk' | 'coach_desk';
const APPROVALS: { key: Approval; title: string; blurb: string }[] = [
  { key: 'coach', title: 'The coach decides', blurb: 'The coach accepts or declines. You see every request on Personal training.' },
  { key: 'desk', title: 'The desk decides', blurb: 'You or the front desk accept or decline, on Personal training. The coach is told when assigned.' },
  { key: 'coach_desk', title: 'Coach, then desk', blurb: 'The coach says yes first, then you or the desk confirm — only then is the coach assigned. A decline by either is final.' },
];

/**
 * Who approves a member's pick of a coach (0258, gym styles phase 2): the coach, the desk, or the coach then the
 * desk. Saved the moment it is picked. Renders nothing before 0258 is live — a setting nothing reads is a lie.
 */
function CoachingApproval() {
  const [mode, setMode] = useState<Approval | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('my_coaching_approval');
      if (!error && (data === 'coach' || data === 'desk' || data === 'coach_desk')) setMode(data);
    })();
  }, []);
  if (!mode) return null;
  const pick = async (next: Approval) => {
    const before = mode;
    setMode(next);
    setSaving(true);
    const { error } = await supabase.rpc('set_coaching_approval', { p_mode: next });
    setSaving(false);
    if (error) { setMode(before); showToast(error.message, 'error'); return; }
    showToast('Saved — it applies to the next request.', 'success');
  };
  return (
    <div data-coaching-approval>
      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Who approves a member’s pick of a coach</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>When a member taps “I want … as my coach”.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who approves a member's pick of a coach">
        {APPROVALS.map((a) => {
          const on = mode === a.key;
          return (
            <button key={a.key} type="button" role="radio" aria-checked={on} disabled={saving} data-approval={a.key}
              onClick={() => { if (!on) void pick(a.key); }}
              className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
              style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' }}>
              <span className="mt-0.5 shrink-0">
                {on ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                  : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{a.title}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{a.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
