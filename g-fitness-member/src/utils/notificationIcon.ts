import {
  Barbell, CalendarCheck, CrownSimple, HandsClapping, CalendarStar, ChatCircleText, IdentificationCard, Info, Medal, Megaphone, QrCode, Receipt, Target,
  type Icon,
} from '@phosphor-icons/react';
import type { NotificationType } from '../services/notificationService';

/**
 * What kind of thing a notification is, as an icon and a tone (redesign,
 * 2026-10-26): violet (`mine`) for what is yours — a visit, a badge, a booking,
 * a coach's note; amber (`act`) where something is waiting on the member — the
 * membership, today's plan; grey (`info`) for news. One row reads at a glance
 * as a payment, a badge or the gym talking, instead of thirty identical lines.
 */
export const NOTIFICATION_ICON: Record<NotificationType, { icon: Icon; tone: 'mine' | 'act' | 'info' }> = {
  attendance: { icon: QrCode, tone: 'mine' },
  achievement: { icon: Medal, tone: 'mine' },
  goal_milestone: { icon: Target, tone: 'mine' },
  booking: { icon: CalendarCheck, tone: 'mine' },
  trainer_feedback: { icon: ChatCircleText, tone: 'mine' },
  // A friend request, an accepted one, or a cheer (0217): a friend did something for you.
  friends: { icon: HandsClapping, tone: 'mine' },
  // A trainee's win, to their coach (0218): someone they coach did something.
  trainee_win: { icon: CrownSimple, tone: 'mine' },
  membership: { icon: IdentificationCard, tone: 'act' },
  gym_plan: { icon: Barbell, tone: 'act' },
  payment: { icon: Receipt, tone: 'info' },
  event: { icon: CalendarStar, tone: 'info' },
  system: { icon: Megaphone, tone: 'info' },
  info: { icon: Info, tone: 'info' },
};

export const TILE: Record<'mine' | 'act' | 'info', { bg: string; edge: string; fg: string }> = {
  mine: { bg: 'var(--color-primary-light)', edge: 'color-mix(in srgb, var(--color-primary) 45%, transparent)', fg: 'var(--color-primary-300)' },
  act: { bg: 'var(--color-secondary-light)', edge: 'color-mix(in srgb, var(--color-secondary) 40%, transparent)', fg: 'var(--color-secondary-300)' },
  info: { bg: 'var(--color-surface-raised)', edge: 'var(--color-hairline)', fg: 'var(--color-text-secondary)' },
};
