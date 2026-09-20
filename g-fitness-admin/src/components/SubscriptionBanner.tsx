import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { getGymBilling, subscriptionWarning } from '../lib/api/subscription';

/**
 * The one line an owner needs about their own Core Fitness subscription.
 *
 * It exists because the first anyone knew of a lock used to be a gym that had
 * stopped working: `paid_until` passed, seven days went by, and the desk found
 * out when a payment would not save. Now the warning arrives a week early, on
 * every screen, and stops the moment it is settled.
 *
 * Silent by default. A gym that is paid up and well inside its plan sees
 * nothing — a banner that is always there is furniture, and furniture does not
 * get read on the day it matters. It is also admin-only: `my_gym_billing()`
 * returns no row to staff, so the front desk is never shown the gym's bills.
 */
export default function SubscriptionBanner() {
  const [warning, setWarning] = useState<ReturnType<typeof subscriptionWarning>>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const billing = await getGymBilling();
      if (alive) setWarning(subscriptionWarning(billing));
    })();
    return () => { alive = false; };
  }, []);

  if (!warning) return null;
  const bad = warning.tone === 'warn';

  return (
    <div
      className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm"
      style={{
        // Amber, not red: this app has no red, and `--color-warning` does not
        // exist — a token that resolves to nothing is the same bug as a class
        // that does nothing (CLAUDE.md).
        borderColor: bad ? 'var(--color-secondary)' : 'var(--color-border)',
        background: bad ? 'var(--color-secondary-light)' : 'var(--color-surface)',
        color: bad ? 'var(--color-secondary)' : 'var(--color-text-secondary)',
      }}
      role={bad ? 'alert' : undefined}
    >
      {bad ? <AlertTriangle size={16} className="mt-0.5 shrink-0" />
           : <Info size={16} className="mt-0.5 shrink-0" />}
      <span>{warning.text}</span>
    </div>
  );
}
