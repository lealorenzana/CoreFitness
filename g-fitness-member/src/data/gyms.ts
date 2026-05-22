export interface GymPackage {
  name: string;
  tier: string;
  price: number;
  inclusions: string;
}

export interface GymInfo {
  id: string;
  name: string;
  owner: string;
  location: string;
  address: string;
  hours: string;
  operatingDays: string;
  email: string;
  phone: string;
  hasTrainers: boolean;
  dailyRate: number;
  perSession?: number;
  monthlyPlans: {
    basic: number;
    standard: number;
    premium: number;
  };
  packages?: GymPackage[];
  amenities: string[];
  description: string;
  tagline: string;
  motivationalText?: string;
  logo: string;
  cover: string;
}

export const GYMS: GymInfo[] = [
  {
    id: 'g-fitness',
    name: 'G-Fitness',
    owner: 'G-Fitness Management',
    location: 'Brgy. Payompon, Mamburao (Beside OMECO Mamburao)',
    address: 'Brgy. Payompon, Mamburao (Beside OMECO Mamburao)',
    hours: '6:00 AM - 10:00 PM',
    operatingDays: 'Monday - Sunday',
    email: 'ylebmiktan888@yahoo.com',
    phone: '0966-729-3439',
    hasTrainers: true,
    dailyRate: 100,
    perSession: 100,
    monthlyPlans: {
      basic: 800,
      standard: 1000,
      premium: 1500,
    },
    packages: [
      {
        name: 'Student Package',
        tier: 'G-Silver',
        price: 800,
        inclusions: 'All equipment except: Treadmill and Boxing',
      },
      {
        name: 'Regular Package',
        tier: 'G-Gold',
        price: 1000,
        inclusions: 'All equipment except: Treadmill',
      },
      {
        name: 'Premium Package',
        tier: 'G-Ruby',
        price: 1500,
        inclusions: 'All equipment with Coach',
      },
    ],
    amenities: [
      'All gym equipment',
      'Personal coaching (Premium)',
      'Student & regular packages',
      'Per session access',
    ],
    description: "LET'S GET STRONGER!",
    tagline: "LET'S GET STRONGER!",
    motivationalText: 'SHAPE YOUR BODY!',
    logo: '/assets/g-fitness-logo.jpg',
    cover: '/assets/g-fitness-cover.jpg',
  },
  {
    id: 'fitness-regency',
    name: 'Fitness Regency',
    owner: 'Fitness Regency Management',
    location: 'Mamburao, Occidental Mindoro',
    address: 'Mamburao, Occidental Mindoro',
    hours: '6:00 AM - 9:00 PM',
    operatingDays: 'Monday - Sunday',
    email: 'info@fitnessregency.com',
    phone: '0917-000-0000',
    hasTrainers: false,
    dailyRate: 40,
    monthlyPlans: {
      basic: 600,
      standard: 1200,
      premium: 0,
    },
    amenities: ['Locker Room', 'Free Weights', 'Cardio Equipment', 'Open Gym'],
    description: 'Affordable gym with essential equipment for your fitness journey.',
    tagline: 'Where Champions Are Made',
    logo: '/assets/fitness-regency-logo.jpg',
    cover: '/assets/fitness-regency-cover.jpg',
  },
  {
    id: 'ferrer-fitness',
    name: 'Ferrer Fitness',
    owner: 'Ferrer Fitness Management',
    location: 'Mamburao, Occidental Mindoro',
    address: 'Mamburao, Occidental Mindoro',
    hours: '5:30 AM - 9:30 PM',
    operatingDays: 'Monday - Sunday',
    email: 'contact@ferrerfitness.com',
    phone: '0918-000-0000',
    hasTrainers: true,
    dailyRate: 45,
    monthlyPlans: {
      basic: 700,
      standard: 1300,
      premium: 2200,
    },
    amenities: ['Personal Trainers', 'Locker Room', 'Shower Facilities', 'Free Weights', 'Cardio Equipment'],
    description: 'Community-focused gym with personalized training programs.',
    tagline: 'Your Fitness, Our Mission',
    logo: '/assets/ferrer-logo.png',
    cover: '/assets/ferrer-cover.png',
  },
];
