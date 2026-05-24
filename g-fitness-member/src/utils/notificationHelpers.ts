/**
 * Notification Helper Functions
 * Trigger notifications based on various events
 */

import { notificationService } from '../services/notificationService';

export const notificationHelpers = {
  /**
   * Send payment reminder notification
   */
  async sendPaymentReminder(userId: string, daysRemaining: number) {
    await notificationService.sendNotification(
      userId,
      'payment',
      'Payment Due Soon',
      `Your membership expires in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}. Renew now to avoid interruption.`,
      '/member/renew-membership'
    );
  },

  /**
   * Send booking confirmation
   */
  async sendBookingConfirmation(userId: string, trainerName: string, date: string, time: string) {
    await notificationService.sendNotification(
      userId,
      'booking',
      'Booking Confirmed',
      `Your session with ${trainerName} on ${date} at ${time} is confirmed.`,
      '/member/booking-history'
    );
  },

  /**
   * Send booking request to trainer
   */
  async sendBookingRequest(trainerId: string, memberName: string, date: string, time: string) {
    await notificationService.sendNotification(
      trainerId,
      'booking',
      'New Booking Request',
      `${memberName} requested a session on ${date} at ${time}.`,
      '/trainer/bookings'
    );
  },

  /**
   * Send achievement notification
   */
  async sendAchievement(userId: string, achievementName: string, description: string) {
    await notificationService.sendNotification(
      userId,
      'achievement',
      `${achievementName} 🏆`,
      description,
      '/member/progress?tab=badges'
    );
  },

  /**
   * Send goal milestone notification
   */
  async sendGoalMilestone(userId: string, goalName: string, percentage: number) {
    await notificationService.sendNotification(
      userId,
      'goal_milestone',
      'Goal Milestone Reached! 🎯',
      `You've reached ${percentage}% of your ${goalName} goal. Keep it up!`,
      '/member/progress?tab=goals'
    );
  },

  /**
   * Send trainer feedback notification
   */
  async sendTrainerFeedback(userId: string, trainerName: string) {
    await notificationService.sendNotification(
      userId,
      'trainer_feedback',
      'New Trainer Feedback',
      `${trainerName} left feedback on your recent workout session.`,
      '/member/progress?tab=feedback'
    );
  },

  /**
   * Send event announcement
   */
  async sendEventAnnouncement(userId: string, eventName: string, date: string) {
    await notificationService.sendNotification(
      userId,
      'event',
      `New Event: ${eventName}`,
      `Join us for ${eventName} on ${date}.`,
      '/member/events'
    );
  },

  /**
   * Send membership upgrade notification
   */
  async sendMembershipUpgrade(userId: string, planName: string) {
    await notificationService.sendNotification(
      userId,
      'membership',
      'Membership Upgraded',
      `Your membership has been upgraded to ${planName}. Enjoy exclusive benefits!`
    );
  },

  /**
   * Send attendance streak notification
   */
  async sendStreakAchievement(userId: string, days: number) {
    await notificationService.sendNotification(
      userId,
      'achievement',
      `${days}-Day Streak! 🔥`,
      `Congratulations! You've maintained a ${days}-day check-in streak.`,
      '/member/progress?tab=attend'
    );
  },

  /**
   * Send system notification (admin to all users)
   */
  async sendSystemNotification(userIds: string[], title: string, message: string) {
    await notificationService.sendBulkNotifications(
      userIds,
      'system',
      title,
      message
    );
  },

  /**
   * Send schedule reminder to trainer
   */
  async sendScheduleReminder(trainerId: string, sessionCount: number) {
    await notificationService.sendNotification(
      trainerId,
      'info',
      'Schedule Reminder',
      `You have ${sessionCount} session${sessionCount > 1 ? 's' : ''} scheduled for tomorrow.`
    );
  },

  /**
   * Send new member assignment to trainer
   */
  async sendMemberAssignment(trainerId: string, memberName: string) {
    await notificationService.sendNotification(
      trainerId,
      'system',
      'New Member Assigned',
      `${memberName} has been assigned to your training group.`
    );
  },

  /**
   * Send rating milestone to trainer
   */
  async sendRatingMilestone(trainerId: string, rating: number) {
    await notificationService.sendNotification(
      trainerId,
      'achievement',
      'Rating Milestone! ⭐',
      `Your average rating reached ${rating}! Great work!`
    );
  },
};
