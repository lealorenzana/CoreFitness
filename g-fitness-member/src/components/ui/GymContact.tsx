import { useEffect, useState } from 'react';
import { getGymSettings, type GymSettingsRow } from '../../lib/api/settings';

/**
 * How to reach the gym, on the two legal pages — read from `gym_settings`,
 * never written into the page.
 *
 * Both pages used to print `support@gfitness.com` and `+63 912 345 6789`. The
 * first is the old brand at a domain the gym does not own; the second is the
 * placeholder number every Philippine form example uses. A privacy policy whose
 * contact details do not work is worse than one with none, because it is the
 * line a member reads when they have something to complain about — and a panel
 * asking "what happens if I want my data corrected" gets a dead address.
 *
 * So the details come from the row the admin edits in Settings. When a field is
 * blank the gym has not set it, and this says **"visit the front desk"** rather
 * than inventing something plausible: the desk is somewhere that definitely
 * exists. A failed read does the same, quietly — a legal page that renders an
 * error where its contact line belongs is not an improvement.
 */
export default function GymContact({ lead, accent }: { lead: string; accent: string }) {
  const [gym, setGym] = useState<GymSettingsRow | null>(null);

  useEffect(() => {
    let alive = true;
    // Wrapped rather than called directly: the lint rule that catches
    // set-state-in-effect follows a directly-called async function into its
    // setState. The catch is deliberate and silent, per the note above.
    (async () => {
      try {
        const row = await getGymSettings();
        if (alive) setGym(row);
      } catch {
        if (alive) setGym(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const email = gym?.email?.trim() || null;
  const phone = gym?.phone?.trim() || null;
  const name = gym?.gym_name?.trim() || 'the gym';

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: `1px solid ${accent}` }}>
      <p className="text-sm leading-relaxed">
        <span className="font-bold text-white">{lead}</span>{' '}
        {email || phone ? (
          <>
            Reach {name} at{' '}
            {email && (
              <a href={`mailto:${email}`} className="font-semibold underline" style={{ color: accent }}>
                {email}
              </a>
            )}
            {email && phone ? ' or ' : ''}
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-semibold underline" style={{ color: accent }}>
                {phone}
              </a>
            )}
            , or ask at the front desk.
          </>
        ) : (
          <>Ask at the front desk — someone there can answer it or pass it to the owner.</>
        )}
      </p>
    </div>
  );
}
