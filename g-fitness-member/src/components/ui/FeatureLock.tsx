import type { ReactNode } from 'react';
import { Lock, WarningCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useFeatures } from '../../hooks/useFeatures';
import { findFeature, type FeatureKey } from '../../lib/api/planFeatures';
import { NocButton, Panel } from './noc';

/**
 * The one way a subscription withholds something (migration 0049).
 *
 * ## The route still exists
 *
 * A locked feature renders its screen and replaces the *interactive part* with
 * this panel. Hiding the route instead would be tidier and worse: the member
 * never learns the paid tier offers more, and the gym's own plan becomes a
 * hidden rulebook — the failure 0041 was written to fix.
 *
 * ## The words come from the database
 *
 * `label` and `description` are read from the same `features` row that
 * `plan_allows()` consulted to deny it. There is deliberately no prop for
 * custom copy at the call site: that is how a gate ships with nothing to say, or
 * says something the rule no longer does.
 *
 * ## A failed load is not a lock
 *
 * If the entitlement fetch fails, this says the check could not be completed
 * and offers a retry — it does not draw a lock. "Upgrade to unlock" at someone
 * who already paid, because the network dropped, is the same class of lie as an
 * empty section reading "nothing here".
 *
 * No horizontal margin (Nocturne redesign): the page already owns the gutter,
 * and the old `mx-4` indented this panel twice.
 */

interface FeatureLockProps {
  feature: FeatureKey;
  /** Rendered when the plan includes this feature. */
  children: ReactNode;
  /**
   * Shown above the lock panel — the parts of the screen that stay useful
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
      <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Checking your membership…
      </p>
    );
  }

  if (error) {
    return (
      <>
        {context}
        <Panel>
          <p className="flex items-center" style={{ gap: 8, fontSize: 14.5, color: 'var(--color-text-primary)' }}>
            <WarningCircle size={17} style={{ color: 'var(--color-secondary)' }} /> Could not check your membership
          </p>
          <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            This is not a limit on your plan — the gym's records could not be reached. Check your connection
            and try again.
          </p>
          <NocButton variant="action" className="w-full" style={{ marginTop: 14 }} onClick={() => window.location.reload()}>
            Try again
          </NocButton>
        </Panel>
      </>
    );
  }

  const row = findFeature(features, feature);
  if (row?.enabled) return <>{children}</>;

  return (
    <>
      {context}
      <Panel>
        <p className="flex items-center" style={{ gap: 8, fontSize: 14.5, color: 'var(--color-text-primary)' }}>
          <Lock size={16} style={{ color: 'var(--color-primary-400)' }} /> {row?.label ?? 'Not included in your plan'}
        </p>
        {row?.description && (
          <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            {row.description}
          </p>
        )}
        <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
          This is not part of your current membership. The front desk can tell you which plan includes it —
          payment is in person, in cash.
        </p>
        <NocButton variant="action" className="w-full" style={{ marginTop: 14 }} onClick={() => navigate('/member/renew')}>
          See the plans
        </NocButton>
      </Panel>
    </>
  );
}
