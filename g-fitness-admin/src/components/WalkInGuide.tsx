import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

/**
 * "How walk-ins and day passes work" — one explainer, shown folded on the desk's
 * Attendance → Walk-ins and open in Settings → Walk-ins. There are two ways to
 * pay for a single visit (0185 at the desk, 0194 in the app) and owners mixed
 * them up, so this says plainly which is which. No prices here: the gym's own
 * prices are on the form beside it.
 */
export default function WalkInGuide({ open = false }: { open?: boolean }) {
  const muted = { color: 'var(--color-text-secondary)' };
  const head = 'text-sm font-semibold text-white';
  const cell = 'px-3 py-2 align-top text-xs';
  const rows: [string, string, string][] = [
    ['Who', 'Anyone who walks in — a tourist, a friend, someone trying the gym. No account, no app.', 'Someone who already has an account at your gym but no running paid plan (expired, free tier, or new).'],
    ['How they pay', 'Cash at the desk.', 'In the app, on Renew → "Just today?" — QRPh, GCash, Maya or card, straight to your PayMongo account.'],
    ['Who records it', 'The desk, at Attendance → Walk-ins.', 'Nobody — it records itself the moment it is paid.'],
    ['How they get in', 'The desk lets them in when it records the visit.', 'They show their check-in code; the desk or kiosk sees today’s day pass and lets them in.'],
    ['Classes', 'No booking (they are not in the app).', 'Only if you turn on "Day-pass guests may book a class that day" — a class held that same day.'],
    ['Where the money shows', 'Today’s walk-ins and the cash drawer (closeout).', 'Payments and revenue, as an ordinary payment marked "Paid in the app".'],
    ['Packs', '5- and 10-visit packs, if you price them. Later visits are taken from the pack by phone number.', 'One day at a time.'],
  ];
  return (
    <details open={open} className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card, transparent)' }} data-walkin-guide>
      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-white">
        <HelpCircle size={16} /> How walk-ins and day passes work
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs" style={muted}>
          There are two ways for someone without a membership to pay for one visit. Both use the <b>Day pass</b> price you set below;
          neither makes them a member or counts toward your plan&rsquo;s member limit.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className={`${cell} text-left`} style={muted}></th>
                <th className={`${cell} text-left text-white`}>Walk-in at the desk</th>
                <th className={`${cell} text-left text-white`}>Day pass in the app</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, desk, app]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className={`${cell} font-medium whitespace-nowrap`} style={muted}>{k}</td>
                  <td className={cell} style={{ color: 'var(--color-text-primary)' }}>{desk}</td>
                  <td className={cell} style={{ color: 'var(--color-text-primary)' }}>{app}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className={head}>Set it up (owner, once)</p>
          <ol className="mt-1 list-decimal pl-5 space-y-1 text-xs" style={muted}>
            <li>In <Link to="/settings?tab=walk-ins" className="underline">Settings → Walk-ins</Link>, tick <b>Sell day passes to walk-ins</b> and type the day-pass price.</li>
            <li>Optional: price a 5- or 10-visit pack (leave empty to not sell it), and how many visits in a month before the desk is told to suggest a membership.</li>
            <li>Press <b>Save walk-in prices</b>.</li>
            <li>To sell day passes in the app as well, connect your PayMongo account in <Link to="/gym-app" className="underline">Your app → Online payments</Link>. Without it, only the desk sells them.</li>
            <li>Optional: tick <b>Day-pass guests may book a class that day</b>.</li>
          </ol>
        </div>

        <div>
          <p className={head}>At the desk, when someone walks in</p>
          <ol className="mt-1 list-decimal pl-5 space-y-1 text-xs" style={muted}>
            <li>Open <Link to="/attendance/walk-ins" className="underline">Attendance → Walk-ins</Link>.</li>
            <li>Type their phone number. If they have been before, their name, visits this month and any pack visits left appear.</li>
            <li>New guest: type their name too.</li>
            <li>Press <b>Day pass</b> (or a pack) and take the cash. If they still have visits on a pack, press <b>Use a pack visit</b> instead — no charge.</li>
            <li>Wrong button? Void it from <b>Today&rsquo;s walk-ins</b> — the same day, before the drawer is closed.</li>
          </ol>
          <p className="mt-2 text-xs" style={muted}>
            Someone who bought a day pass <b>in the app</b> does not go through Walk-ins at all — check them in like a member, with their code.
          </p>
        </div>
      </div>
    </details>
  );
}
