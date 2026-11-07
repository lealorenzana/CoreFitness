import { useEffect, useState } from 'react';
import { Bank, HandCoins } from '@phosphor-icons/react';
import { LineRow, Panel, SectionHead, StatusPill } from '../ui/noc';
import { myDues, myEarnings, type DuesMonth, type EarningsMonth, type HouseRules } from '../../lib/api/coachingRules';

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
const monthName = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

/**
 * Packages → Your pay (0235): what members paid this coach for packages, the
 * gym's share of it, and the coach's dues — the money rules this gym set.
 * Read-only: the desk marks the share paid and records dues. Only what the
 * database counted is shown; single sessions record no price, and say so.
 */
export default function CoachMoney({ rules }: { rules: HouseRules }) {
  const [earn, setEarn] = useState<EarningsMonth[] | null>(null);
  const [dues, setDues] = useState<DuesMonth[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [e, d] = await Promise.all([rules.cutOn ? myEarnings(6) : Promise.resolve([]), rules.duesOn ? myDues(12) : Promise.resolve([])]);
        if (alive) { setEarn(e); setDues(d); }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [rules.cutOn, rules.duesOn]);

  if (failed) return <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Your pay could not be loaded. Pull to refresh or try again later.</p>;
  if (!earn || !dues) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading your pay…</p>;

  const now = earn[0];
  const duesNow = dues[0];
  // Behind: an unpaid month before this one. This month unpaid is only "due".
  const late = dues.slice(1).filter((d) => d.paid == null).length;

  return (
    <div data-coach-money>
      {rules.cutOn && now && (
        <>
          <SectionHead title="The gym's share" />
          <Panel>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{monthName(now.month)}</p>
            <p style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: 'var(--color-text-primary)' }} data-paid-total>{peso(now.paidTotal)}</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              paid to you for {now.packages} package{now.packages === 1 ? '' : 's'} · the gym&rsquo;s {now.percent}% is <b style={{ color: 'var(--color-text-primary)' }}>{peso(now.owed)}</b>
            </p>
            <div style={{ marginTop: 8 }}>
              <StatusPill label={now.settled ? 'Given to the gym' : now.owed > 0 ? 'Not given yet' : 'Nothing owed'} tone={now.settled ? 'structure' : now.owed > 0 ? 'action' : 'muted'} />
            </div>
          </Panel>
          {earn.slice(1).filter((m) => m.paidTotal > 0 || m.settled).map((m, i, list) => (
            <LineRow key={m.month} icon={HandCoins} tone="info" title={monthName(m.month)}
              meta={`${peso(m.paidTotal)} paid to you · gym's ${m.percent}%: ${peso(m.owed)}`}
              action={<StatusPill label={m.settled ? 'Given' : 'Not given'} tone={m.settled ? 'structure' : 'action'} />} last={i === list.length - 1} />
          ))}
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
            Counted from packages you marked Received. Single 1-on-1 sessions record no price, so they are not counted. The front desk marks the share given.
          </p>
        </>
      )}

      {rules.duesOn && duesNow && (
        <>
          <div style={{ marginTop: rules.cutOn ? 22 : 0 }}><SectionHead title="Your dues" /></div>
          <LineRow icon={Bank} tone={duesNow.paid != null ? 'mine' : 'act'} title={`${peso(duesNow.due)} for ${monthName(duesNow.month)}`}
            meta={duesNow.paid != null ? 'Paid — thank you' : 'Pay at the front desk'}
            action={late > 0 ? <StatusPill label={`Behind · ${late} month${late === 1 ? '' : 's'}`} tone="action" /> : undefined} last />
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
            Being behind never stops you coaching or checking in — the gym owner simply sees it.
          </p>
        </>
      )}
    </div>
  );
}
