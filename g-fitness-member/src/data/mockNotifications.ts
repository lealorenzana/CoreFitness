import type { Notification } from '../services/notificationService';

// Helper to create timestamps
const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

export const MOCK_NOTIFICATIONS: Notification[] = [
  // Member notifications (eya.lorenzana@email.com)
  {
    id: 'notif-001',
    userId: 'eya.lorenzana@email.com',
    type: 'payment',
    title: 'Payment Due Soon',
    message: 'Your membership expires in 7 days. Renew now to avoid interruption.',
    timestamp: hoursAgo(2),
    read: false,
    actionUrl: '/member/renew-membership',
  },
  {
    id: 'notif-002',
    userId: 'eya.lorenzana@email.com',
    type: 'event',
    title: 'New Event: Yoga Class',
    message: 'Join our special yoga session this Saturday at 9 AM.',
    timestamp: hoursAgo(5),
    read: false,
    actionUrl: '/member/events',
  },
  {
    id: 'notif-003',
    userId: 'eya.lorenzana@email.com',
    type: 'achievement',
    title: 'Streak Achievement! 🔥',
    message: "Congratulations! You've maintained a 7-day check-in streak.",
    timestamp: daysAgo(1),
    read: true,
  },
  {
    id: 'notif-004',
    userId: 'eya.lorenzana@email.com',
    type: 'trainer_feedback',
    title: 'New Trainer Feedback',
    message: 'Coach Ana left feedback on your recent workout session.',
    timestamp: daysAgo(1),
    read: true,
    actionUrl: '/member/progress?tab=feedback',
  },
  {
    id: 'notif-005',
    userId: 'eya.lorenzana@email.com',
    type: 'goal_milestone',
    title: 'Goal Milestone Reached! 🎯',
    message: "You've reached 50% of your weight loss goal. Keep it up!",
    timestamp: daysAgo(2),
    read: true,
    actionUrl: '/member/progress?tab=goals',
  },
  {
    id: 'notif-006',
    userId: 'eya.lorenzana@email.com',
    type: 'booking',
    title: 'Booking Confirmed',
    message: 'Your session with Coach Mike on May 28 at 10:00 AM is confirmed.',
    timestamp: daysAgo(3),
    read: true,
    actionUrl: '/member/booking-history',
  },
  {
    id: 'notif-007',
    userId: 'eya.lorenzana@email.com',
    type: 'info',
    title: 'Gym Schedule Update',
    message: 'G-Fitness will open 1 hour early on weekends starting next month.',
    timestamp: daysAgo(4),
    read: true,
  },
  {
    id: 'notif-008',
    userId: 'eya.lorenzana@email.com',
    type: 'membership',
    title: 'Membership Upgraded',
    message: 'Your membership has been upgraded to Premium. Enjoy exclusive benefits!',
    timestamp: daysAgo(7),
    read: true,
  },

  // Trainer notifications (ana@corefitness.com)
  {
    id: 'notif-101',
    userId: 'ana@corefitness.com',
    type: 'booking',
    title: 'New Booking Request',
    message: 'Clairey Anne Belen requested a session on May 30 at 2:00 PM.',
    timestamp: hoursAgo(3),
    read: false,
    actionUrl: '/trainer/bookings',
  },
  {
    id: 'notif-102',
    userId: 'ana@corefitness.com',
    type: 'system',
    title: 'Schedule Update from Admin',
    message: 'Your Power Hour class has been moved to 5:00 PM today.',
    timestamp: hoursAgo(2),
    read: false,
  },
  {
    id: 'notif-103',
    userId: 'ana@corefitness.com',
    type: 'info',
    title: 'Admin: Class Reminder',
    message: 'You have 2 classes scheduled for today: Morning Strength (6:00 AM) and Power Hour (5:00 PM).',
    timestamp: hoursAgo(6),
    read: false,
  },
  {
    id: 'notif-104',
    userId: 'ana@corefitness.com',
    type: 'system',
    title: 'New Member Assigned by Admin',
    message: 'Aaron Diwa has been assigned to your training group.',
    timestamp: daysAgo(1),
    read: false,
    actionUrl: '/trainer/members',
  },
  {
    id: 'notif-105',
    userId: 'ana@corefitness.com',
    type: 'achievement',
    title: 'Performance Milestone! ⭐',
    message: 'Great work! Your member Ana Par Iturralde hit their weekly goal.',
    timestamp: daysAgo(1),
    read: true,
  },
  {
    id: 'notif-106',
    userId: 'ana@corefitness.com',
    type: 'info',
    title: 'Admin Announcement',
    message: 'Gym will open 1 hour early on weekends starting next month.',
    timestamp: daysAgo(2),
    read: true,
  },
  {
    id: 'notif-107',
    userId: 'ana@corefitness.com',
    type: 'system',
    title: 'Admin: Equipment Maintenance',
    message: 'Squat rack will be under maintenance tomorrow 2-4 PM. Please adjust your class plans.',
    timestamp: daysAgo(3),
    read: true,
  },
  {
    id: 'notif-108',
    userId: 'ana@corefitness.com',
    type: 'booking',
    title: 'Booking Confirmed',
    message: 'Your session with Aaron Diwa on May 28 at 10:00 AM is confirmed.',
    timestamp: daysAgo(3),
    read: true,
    actionUrl: '/trainer/bookings',
  },

  // Cyrelle Joy Duhac (cyrelle@corefitness.com)
  {
    id: 'notif-201',
    userId: 'cyrelle@corefitness.com',
    type: 'booking',
    title: 'New Booking Request',
    message: 'Aaron Diwa requested Strength Basics session on May 29 at 6:00 AM.',
    timestamp: hoursAgo(2),
    read: false,
    actionUrl: '/trainer/bookings',
  },
  {
    id: 'notif-202',
    userId: 'cyrelle@corefitness.com',
    type: 'system',
    title: 'Admin: Class Capacity Update',
    message: 'Morning Strength class is now full (8/12 enrolled). Great job!',
    timestamp: hoursAgo(5),
    read: false,
  },
  {
    id: 'notif-203',
    userId: 'cyrelle@corefitness.com',
    type: 'info',
    title: 'Schedule Reminder',
    message: 'You have 2 classes scheduled for tomorrow.',
    timestamp: hoursAgo(8),
    read: false,
  },
  {
    id: 'notif-204',
    userId: 'cyrelle@corefitness.com',
    type: 'system',
    title: 'Admin: New Equipment Available',
    message: 'New power racks have been installed in the main gym floor.',
    timestamp: daysAgo(1),
    read: false,
  },
];

// Initialize notifications for users
export function initializeMockNotifications() {
  const users = [
    'eya.lorenzana@email.com', 
    'ana@corefitness.com',
    'cyrelle@corefitness.com',
    'nathanniel@corefitness.com'
  ];
  
  users.forEach(userId => {
    const key = `notifications_${userId}`;
    const existing = localStorage.getItem(key);
    
    // Only initialize if no notifications exist
    if (!existing) {
      const userNotifications = MOCK_NOTIFICATIONS.filter(n => n.userId === userId);
      localStorage.setItem(key, JSON.stringify(userNotifications));
    }
  });
}
