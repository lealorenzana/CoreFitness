import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, DollarSign, MessageSquare, Users } from 'lucide-react';
import Button from './ui/Button';
import FormField from './ui/FormField';
import { StatTiles } from './ui/kit';
import { showToast } from '../utils/toast';
import { formatUsd, getAiUsage, setAiLimits, type AiUsageResult } from '../lib/api/aiCoach';
import { getGymContext } from '../lib/gymContext';
import { Link } from 'react-router-dom';

/**
 * The AI coach on Your app (0147): its two limits, and this Manila month's
 * totals with an estimated cost.
 *
 * **Totals only.** The database returns counts and sums for the whole gym —
 * how many members used it, never who; never a word anyone wrote to it — and
 * this card adds nothing per person. The cost is the coach model's list price
 * times the tokens counted, so it says it is an estimate and where the real
 * bill is: a figure in dollars that looks like an invoice would be a claim the
 * gym cannot check.
 *
 * Only the owner (`admin`) changes the limits; anyone else sees them as plain
 * figures with no Save, because a button the database would refuse is a
 * control writing a flag nothing honours (CLAUDE.md). The role is read here
 * rather than trusted from the page, so the card is honest wherever it is
 * mounted.
 *
 * Before 0147 is pasted the card says so and shows nothing else — zero
 * messages would read as "nobody used it", which is a different fact.
 */
export default function AiCoachCard({ switchedOff }: { switchedOff?: boolean }) {
  const [res, setRes] = useState<AiUsageResult | null>(null);
  const [owner, setOwner] = useState(false);
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [r, ctx] = await Promise.all([getAiUsage(), getGymContext()]);
    setRes(r);
    setOwner(ctx?.role === 'admin');
    if (r.ok) {
      setDaily(String(r.usage.daily_limit));
      setMonthly(String(r.usage.monthly_limit));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async () => {
    // The same sentences SQL uses, so a typo never costs a round trip (2.5 would otherwise be cast or refused).
    const d = Number(daily), m = Number(monthly);
    const maxD = (res?.ok ? res.usage.plan_daily_cap : null) ?? 500;
    const maxM = (res?.ok ? res.usage.plan_monthly_cap : null) ?? 100000;
    if (!Number.isInteger(d) || d < 1 || d > maxD) { showToast(`A daily limit is 1 to ${maxD} messages${maxD < 500 ? ' on your plan' : ''}.`, 'error'); return; }
    if (!Number.isInteger(m) || m < 1 || m > maxM) { showToast(`A monthly limit is 1 to ${maxM.toLocaleString('en-PH')} messages${maxM < 100000 ? ' on your plan' : ''}.`, 'error'); return; }
    setSaving(true);
    try {
      await setAiLimits(d, m);
      await load();
      showToast('Saved. The new limits apply to the next message.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };

  // The plan's ceiling (0163); null = none beyond the absolute 500 / 100,000.
  const capD = res?.ok ? res.usage.plan_daily_cap : null;
  const capM = res?.ok ? res.usage.plan_monthly_cap : null;
  const muted = { color: 'var(--color-text-secondary)' };
  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = {
    borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)',
  };

  return (
    <div className="rounded-xl border p-5" data-card="ai-coach"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI coach</h2>

      {res === null ? (
        <p className="mt-1 text-sm" style={muted}>Loading…</p>
      ) : !res.ok ? (
        <p className="mt-1 text-sm" style={muted}>
          {res.missing ? 'This needs migration 0147.' : `The coach's usage could not be loaded: ${res.error}`}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm" style={muted}>
            How much your members can talk to the coach, and how much they have this month. You see
            totals for the whole gym — never who asked what.
          </p>
          {switchedOff && (
            <p className="mt-2 text-xs" style={muted}>
              The coach is switched off under What your gym runs, so your members do not see it right now.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FormField label="Messages per member per day" hint={owner ? `1 to ${capD ?? 500}${capD ? ' — the most your plan allows' : ''}` : null}>
              {owner ? (
                <input id="ai-daily" type="number" min={1} max={capD ?? 500} step={1} className={input} style={inputStyle}
                  value={daily} onChange={(e) => setDaily(e.target.value)} />
              ) : (
                <p id="ai-daily" className="text-sm font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                  {Number(daily).toLocaleString('en-PH')}
                </p>
              )}
            </FormField>
            <FormField label="Messages for the whole gym per month" hint={owner ? `1 to ${(capM ?? 100000).toLocaleString('en-PH')}${capM ? ' — the most your plan allows' : ''}` : null}>
              {owner ? (
                <input id="ai-monthly" type="number" min={1} max={capM ?? 100000} step={1} className={input} style={inputStyle}
                  value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              ) : (
                <p id="ai-monthly" className="text-sm font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                  {Number(monthly).toLocaleString('en-PH')}
                </p>
              )}
            </FormField>
          </div>
          {(capD != null || capM != null) && (
            <p className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
              Your Core Fitness plan allows up to {capD != null ? `${capD} a member a day` : 'any number a day'} and{' '}
              {capM != null ? `${capM.toLocaleString('en-PH')} a month for the gym` : 'any number a month'}. You can set lower limits, never higher.{' '}
              <Link to="/subscription" style={{ color: 'var(--color-primary)' }}>Need more? See plans →</Link>
            </p>
          )}
          {owner ? (
            <Button className="mt-4" onClick={() => void save()} disabled={saving || !daily || !monthly}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : (
            <p className="mt-2 text-xs" style={muted}>Only the gym's owner can change these.</p>
          )}

          <div className="mt-5">
            <StatTiles items={[
              { label: 'Messages this month', value: res.usage.messages_month.toLocaleString('en-PH'), icon: MessageSquare,
                tooltip: `of the gym's ${res.usage.monthly_limit.toLocaleString('en-PH')} for the month` },
              { label: 'Members using it', value: res.usage.members_using_month.toLocaleString('en-PH'), icon: Users,
                tooltip: 'how many members asked it anything this month — a count, never who' },
              { label: 'Today', value: res.usage.messages_today.toLocaleString('en-PH'), icon: CalendarDays,
                tooltip: 'messages since midnight, Manila time' },
              { label: 'Estimated cost', value: formatUsd(res.usage.est_cost_usd_month), icon: DollarSign,
                tooltip: 'this month, in US dollars — an estimate, not a bill' },
            ]} />
            <p className="mt-2 text-xs" style={muted}>
              Estimated at Claude Sonnet 5.5's list price. Your real bill is on console.anthropic.com.
            </p>
          </div>

          <DayBars days={res.usage.days} />
        </>
      )}
    </div>
  );
}

/** One bar per day of this Manila month so far; the height is that day's share of the busiest. */
function DayBars({ days }: { days: { day: string; messages: number }[] }) {
  if (days.length === 0) return null;
  const top = Math.max(1, ...days.map((d) => d.messages));
  const label = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };
  const [yy, mm] = days[0].day.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  const slots = Math.max(days.length, new Date(yy, mm, 0).getDate() || days.length);
  return (
    <div className="mt-5">
      <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Messages each day this month</p>
      {/* A column for every day of the month, so day 3 is as narrow as day 30
          rather than a third of the card; the days still to come stay empty. */}
      <div className="grid items-end gap-[3px] h-14" data-days={days.length}
        style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <div key={d.day} className="min-w-0 h-full flex items-end" tabIndex={0}
            data-tip={`${label(d.day)}: ${d.messages.toLocaleString('en-PH')} message${d.messages === 1 ? '' : 's'}`}>
            <div className="w-full rounded-sm"
              style={{
                height: d.messages ? `${Math.max(6, (d.messages / top) * 100)}%` : 2,
                background: d.messages ? 'var(--color-primary)' : 'var(--color-border)',
              }} />
          </div>
        ))}
      </div>
    </div>
  );
}
