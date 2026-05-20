// Shared localStorage keys between Member and Admin apps
// This simulates a backend database for the prototype

export const STORAGE_KEYS = {
  // Members data - shared between apps
  MEMBERS: 'gfitness_members',
  
  // Bookings data - shared between apps
  BOOKINGS: 'gfitness_bookings',
  
  // Payments data - shared between apps
  PAYMENTS: 'gfitness_payments',
  
  // Attendance data - shared between apps
  ATTENDANCE: 'gfitness_attendance',
  
  // Member-specific data
  MEMBER_PROFILE: (memberId: string) => `gfitness_member_${memberId}`,
};

// Helper functions for shared data access
export const SharedStorage = {
  // Get all members
  getMembers: () => {
    const data = localStorage.getItem(STORAGE_KEYS.MEMBERS);
    return data ? JSON.parse(data) : [];
  },

  // Save all members
  setMembers: (members: any[]) => {
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));
  },

  // Get single member
  getMember: (memberId: string) => {
    const members = SharedStorage.getMembers();
    return members.find((m: any) => m.id === memberId || m.qrCode === memberId || m.email === memberId);
  },

  // Update single member
  updateMember: (memberId: string, updates: any) => {
    const members = SharedStorage.getMembers();
    const updatedMembers = members.map((m: any) => 
      (m.id === memberId || m.qrCode === memberId || m.email === memberId) ? { ...m, ...updates } : m
    );
    SharedStorage.setMembers(updatedMembers);
  },

  // Get all bookings
  getBookings: () => {
    const data = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
    return data ? JSON.parse(data) : [];
  },

  // Save all bookings
  setBookings: (bookings: any[]) => {
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
  },

  // Add new booking
  addBooking: (booking: any) => {
    const bookings = SharedStorage.getBookings();
    bookings.push(booking);
    SharedStorage.setBookings(bookings);
  },

  // Update booking status
  updateBooking: (bookingId: string, updates: any) => {
    const bookings = SharedStorage.getBookings();
    const updatedBookings = bookings.map((b: any) => 
      b.id === bookingId ? { ...b, ...updates } : b
    );
    SharedStorage.setBookings(updatedBookings);
  },

  // Update booking status (shorthand)
  updateBookingStatus: (bookingId: string, status: string) => {
    SharedStorage.updateBooking(bookingId, { status });
  },

  // Get member's bookings
  getMemberBookings: (memberId: string) => {
    const bookings = SharedStorage.getBookings();
    return bookings.filter((b: any) => b.memberId === memberId || b.memberEmail === memberId);
  },

  // Get all payments
  getPayments: () => {
    const data = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    return data ? JSON.parse(data) : [];
  },

  // Save all payments
  setPayments: (payments: any[]) => {
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
  },

  // Add new payment
  addPayment: (payment: any) => {
    const payments = SharedStorage.getPayments();
    payments.push(payment);
    SharedStorage.setPayments(payments);
  },

  // Get member's payments
  getMemberPayments: (memberId: string) => {
    const payments = SharedStorage.getPayments();
    return payments.filter((p: any) => p.memberId === memberId || p.memberEmail === memberId);
  },

  // Get all attendance
  getAttendance: () => {
    const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    return data ? JSON.parse(data) : [];
  },

  // Save all attendance
  setAttendance: (attendance: any[]) => {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
  },

  // Add attendance record
  addAttendance: (record: any) => {
    const attendance = SharedStorage.getAttendance();
    attendance.push(record);
    SharedStorage.setAttendance(attendance);
  },

  // Clear all data (for testing)
  clearAll: () => {
    localStorage.removeItem(STORAGE_KEYS.MEMBERS);
    localStorage.removeItem(STORAGE_KEYS.BOOKINGS);
    localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
  },
};
