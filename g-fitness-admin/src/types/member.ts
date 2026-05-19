export interface NewMemberData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: 'Basic' | 'Standard' | 'Premium';
  startDate: string;
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

export interface PaymentData {
  memberId: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
}
