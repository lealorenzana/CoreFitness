import type { ReactNode } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from './Card';
import { useFeatures } from '../../hooks/useFeatures';
import { findFeature, type FeatureKey } from '../../lib/api/planFeatures';

/**
 * The one way a subscription withholds something (migration 0049).
 *
 * ## The route still exists
 *
 * A locked feature renders its screen and replaces the *interactive part* with
 * this card. Hiding the route instead would be tidier and worse: the member
 * never learns the paid tier offers more, and the gym's own plan becomes a
 * hidden rulebook — the failure 0041 was written to fix, where entitlements
 * bound bookings from 0017 and surfaced nowhere for twenty-four migrations.
 *
 * ## The words come from the database
 *
 * `label` and `description` are read from the same `features` row that
 * `plan_allows()` consulted to deny it. There is deliberately no prop for
 * writing custom copy at the call site: that is how a gate ships with nothing
 * to say, or says something the rule no longer does.
 *
 * ## A failed load is not a lock
 *
 * If the entitlement fetch fails, this says the check could not be completed
 * and offers a retry — it does not draw a lock. Rendering "upgrade to unlock"
 * at someone who already paid, because the network dropped, is the same class
 * of lie as an empty section reading "nothing here".
 */

interface FeatureLockProps {
  feature: FeatureKey;
  /** Rendered when the plan includes this feature. */
  children: ReactNode;
  /**
   * Shown above the lock card — the parts of the screen that stay useful
   * without the feature, such as a heading or existing history.
   */
  context?: ReactNode;
}

export default function FeatureLock({ feature, children, context }: FeatureLockProps) {
  const { features, loading, error } = useFeatures();
  const navigate = useNavigate();

  // Nothing is drawn until the answer is known. A brief blank beats showing the
  // feature and snatching it back, or showing a lock and then unlocking it.
  if (loading) {
    return (
      <div className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
        Checking your membership…
      </div>
    );
  }

  if (error) {
    return (
      <>
        {context}
        <Card className="mx-4 my-3">
          <div className="flex gap-3">
            <AlertCircle size={18} style={{ color: 'var(--color-secondary)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600 }}>
                Couldn't check your membership
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 4 }}>
                This isn't a limit on your plan — we just couldn't reach the gym's
                records. Check your connection and try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 rounded-full px-4 py-2"
                style={{
                  background: 'var(--color-secondary)',
                  color: '#1A1200',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const row = findFeature(features, feature);
  if (row?.enabled) return <>{children}</>;

  return (
    <>
      {context}
      <Card className="mx-4 my-3">
        <div className="flex gap-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              background: 'var(--color-primary-light)',
            }}
          >
            <Lock size={17} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div className="min-w-0">
            <p style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600 }}>
              {row?.label ?? 'Not included in your plan'}
            </p>
            {row?.description && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 4 }}>
                {row.description}
              </p>
            )}
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 8 }}>
              This isn't part of your current membership. The front desk can tell you
              which plan includes it — payment is in person, in cash.
            </p>
            <button
              onClick={() => navigate('/member/renew')}
              className="mt-3 rounded-full px-4 py-2"
              style={{
                background: 'var(--color-secondary)',
                color: '#1A1200',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              See the plans
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}
