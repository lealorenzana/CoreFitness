import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Status pill badge — only ever uses Violet, Yellow or White tones.
 *
 * Domain variants are mapped semantically:
 *   - "Active", "Confirmed", "Completed", "Premium" → Violet
 *   - "Pending", "Expiring", "Standard"             → Yellow
 *   - "Cancelled", "Inactive", "Basic"              → White / muted
 *   - "Expired", "Rejected", "Failed", "Suspended"  → Yellow (warning)
 *
 * No greens, reds, blues — the design system enforces this.
 */
type DomainVariant =
  | 'Basic' | 'Standard' | 'Premium'
  | 'Active' | 'Expired' | 'Expiring' | 'Suspended' | 'Inactive'
  | 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed' | 'Failed' | 'Rejected'
  | 'QR' | 'Manual'
  | 'violet' | 'yellow' | 'white'
  | string;

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: DomainVariant;
}

const VIOLET = {
  background: 'var(--color-primary-light)',
  color:      'var(--color-primary)',
  border:     'rgba(124,58,237,0.25)',
};

const YELLOW = {
  background: 'var(--color-secondary-light)',
  color:      'var(--color-secondary)',
  border:     'rgba(245,158,11,0.30)',
};

const WHITE = {
  background: 'var(--color-border)',
  color:      'var(--color-text-secondary)',
  border:     'var(--color-border)',
};

const STYLE_MAP: Record<string, { background: string; color: string; border: string }> = {
  // Membership tiers
  Basic:    WHITE,
  Standard: YELLOW,
  Premium:  VIOLET,

  // Member status
  Active:    VIOLET,
  Expired:   YELLOW,
  Expiring:  YELLOW,
  Suspended: YELLOW,
  Inactive:  WHITE,

  // Booking / payment
  Confirmed: VIOLET,
  Pending:   YELLOW,
  Completed: VIOLET,
  Cancelled: WHITE,
  Failed:    YELLOW,
  Rejected:  YELLOW,

  // Methods
  QR:     VIOLET,
  Manual: YELLOW,

  // Generic
  violet: VIOLET,
  yellow: YELLOW,
  white:  WHITE,
};

/**
 * What each status means, shown on hover (TooltipLayer). Keyed by the variant,
 * or by the badge's own text when the variant is a colour — "Pending" in a
 * yellow badge is still Pending.
 */
const STATUS_TIPS: Record<string, string> = {
  Active: 'Paid up and able to use the gym',
  Expired: 'The membership ended — renew it to let them back in',
  Expiring: 'Ends within a few days and has not been renewed',
  Suspended: 'Access is paused by the desk; nothing is deleted',
  Inactive: 'No current membership',
  Archived: 'Kept on record but hidden from the working lists — members are never deleted',
  Frozen: 'Paused on request: no access, and the frozen days are added back to the end date',
  Pending: 'Waiting for someone at the desk to approve it',
  Confirmed: 'Booked and holding a place',
  Completed: 'It happened',
  Cancelled: 'Called off — the place was given back',
  Failed: 'It did not go through',
  Rejected: 'Turned down',
  QR: 'Checked in by scanning their QR code',
  Manual: 'Checked in by hand at the desk',
  Trial: 'On a free trial',
  Free: 'On the free plan — the free workout library is never locked',
  Premium: 'On a paid plan that unlocks the premium features',
};

function Badge({ className, variant = 'violet', children, style, ...props }: BadgeProps) {
  const tokens = STYLE_MAP[variant] ?? VIOLET;
  const said = typeof children === 'string' ? children.trim() : '';
  const tip = STATUS_TIPS[variant] ?? STATUS_TIPS[said] ?? STATUS_TIPS[said.charAt(0).toUpperCase() + said.slice(1).toLowerCase()];
  return (
    <div
      data-tip={tip}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        className,
      )}
      style={{
        background: tokens.background,
        color: tokens.color,
        borderColor: tokens.border,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export type { BadgeProps };
export default Badge;
export { Badge };
