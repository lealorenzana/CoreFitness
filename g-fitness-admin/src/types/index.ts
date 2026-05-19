export interface Gym {
  id: string;
  name: 'G-Fitness' | 'Fitness Regency' | 'Ferrer Fitness';
  location: string;
  address: string;
  phone: string;
  operatingHours: {
    weekday: string;
    weekend: string;
  };
}

export interface Member {
  id: string;
  gymId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  photoUrl: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  membershipStatus: 'Active' | 'Expired' | 'Suspended';
  startDate: Date;
  expiryDate: Date;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  qrCode: string;
}

export interface Attendance {
  id: string;
  memberId: string;
  gymId: string;
  checkInTime: Date;
  checkOutTime: Date | null;
  date: string;
}

export interface Trainer {
  id: string;
  gymId: string;
  name: string;
  specialization: 'Strength' | 'HIIT' | 'Yoga' | 'Boxing' | 'CrossFit';
  photoUrl: string;
  rating: number;
  sessionsCompleted: number;
  availability: {
    day: string;
    slots: string[];
  }[];
}

export interface RetentionData {
  memberId: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  riskScore: number;
  lastVisit: Date;
  checkInsPerMonth: number;
  daysUntilExpiry: number;
  contributingFactors: string[];
  recommendedActions: string[];
}

export interface RevenueData {
  gymId: string;
  month: string;
  totalRevenue: number;
  revenueByType: {
    Basic: number;
    Standard: number;
    Premium: number;
  };
  paymentMethods: {
    Cash: number;
    GCash: number;
    BankTransfer: number;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  message: string;
  timestamp: Date;
  language: 'en' | 'fil';
}

export interface ChatbotResponse {
  pattern: RegExp;
  responses: {
    en: string;
    fil: string;
  };
}

export interface Notification {
  id: string;
  type: 'expiry' | 'class' | 'achievement' | 'promotion';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  icon: string;
}

export interface EditMemberData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  membershipStatus: 'Active' | 'Expired' | 'Expiring';
}

export interface NewMemberData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  startDate: string;
}

export interface BookingHistory {
  id: string;
  memberName: string;
  memberId: string;
  amount: number;
  plan: 'Basic' | 'Standard' | 'Premium';
  method: 'cash' | 'card' | 'gcash' | 'bank';
  status: 'completed' | 'pending' | 'failed';
  bookingDate: string;
  startDate: string;
  expiryDate: string;
  invoiceNumber: string;
}
