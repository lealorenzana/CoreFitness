export interface GymEvent {
  id: string;
  title: string;
  type: 'Gym Event' | 'BMS' | 'Announcement' | 'Competition' | 'Workshop';
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
  capacity?: number;
  registered?: number;
  price?: number;
  isFree: boolean;
  organizer: string;
  tags: string[];
}

export const gymEvents: GymEvent[] = [
  {
    id: 'E001',
    title: 'Summer Fitness Challenge',
    type: 'Competition',
    date: '2024-06-15',
    time: '08:00 AM',
    location: 'G-Fitness Mamburao',
    description: '8-week transformation challenge with prizes for top performers. Track your progress and compete with fellow members!',
    image: '/events/challenge.jpg',
    capacity: 50,
    registered: 32,
    price: 1500,
    isFree: false,
    organizer: 'G-Fitness Management',
    tags: ['Competition', 'Transformation', 'Prizes'],
  },
  {
    id: 'E002',
    title: 'Bible & Muscle Study (BMS)',
    type: 'BMS',
    date: '2024-05-28',
    time: '07:00 PM',
    location: 'Community Room',
    description: 'Weekly Bible study session combining faith and fitness. Open to all members.',
    image: '/events/bms.jpg',
    isFree: true,
    organizer: 'BMS Ministry Team',
    tags: ['Faith', 'Community', 'Weekly'],
  },
  {
    id: 'E003',
    title: 'Nutrition Workshop',
    type: 'Workshop',
    date: '2024-06-05',
    time: '06:00 PM',
    location: 'Studio A',
    description: 'Learn about meal planning, macros, and nutrition strategies from certified nutritionists.',
    image: '/events/nutrition.jpg',
    capacity: 30,
    registered: 18,
    price: 800,
    isFree: false,
    organizer: 'Coach Maria Lopez',
    tags: ['Education', 'Nutrition', 'Health'],
  },
  {
    id: 'E004',
    title: 'New Equipment Launch',
    type: 'Announcement',
    date: '2024-06-01',
    time: '10:00 AM',
    location: 'Main Gym Floor',
    description: 'Grand unveiling of our new state-of-the-art equipment. Free trial sessions available!',
    image: '/events/equipment.jpg',
    isFree: true,
    organizer: 'G-Fitness Management',
    tags: ['Announcement', 'Equipment', 'Free Trial'],
  },
  {
    id: 'E005',
    title: 'Charity Fun Run',
    type: 'Gym Event',
    date: '2024-06-20',
    time: '05:00 AM',
    location: 'Mamburao Town Plaza',
    description: '5K fun run to raise funds for local community projects. All fitness levels welcome!',
    image: '/events/funrun.jpg',
    capacity: 100,
    registered: 67,
    price: 500,
    isFree: false,
    organizer: 'G-Fitness Community Outreach',
    tags: ['Charity', 'Running', 'Community'],
  },
  {
    id: 'E006',
    title: 'Yoga & Meditation Retreat',
    type: 'Workshop',
    date: '2024-07-10',
    time: '06:00 AM',
    location: 'Beach Resort, Mamburao',
    description: 'Full-day wellness retreat featuring yoga, meditation, and healthy meals.',
    image: '/events/retreat.jpg',
    capacity: 25,
    registered: 20,
    price: 2500,
    isFree: false,
    organizer: 'Coach Sarah Reyes',
    tags: ['Wellness', 'Yoga', 'Retreat'],
  },
  {
    id: 'E007',
    title: 'BMS Prayer & Workout',
    type: 'BMS',
    date: '2024-06-04',
    time: '06:00 AM',
    location: 'Outdoor Area',
    description: 'Start your week with prayer and a group workout session.',
    image: '/events/prayer-workout.jpg',
    isFree: true,
    organizer: 'BMS Ministry Team',
    tags: ['Faith', 'Workout', 'Community'],
  },
  {
    id: 'E008',
    title: 'Membership Appreciation Day',
    type: 'Gym Event',
    date: '2024-06-30',
    time: '12:00 PM',
    location: 'G-Fitness Mamburao',
    description: 'Special day for our members with free classes, raffles, and refreshments!',
    image: '/events/appreciation.jpg',
    isFree: true,
    organizer: 'G-Fitness Management',
    tags: ['Appreciation', 'Free', 'Celebration'],
  },
];
