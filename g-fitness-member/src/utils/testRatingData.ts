// Test utility to create a booking from yesterday for testing ratings
export function createTestYesterdayBooking() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const testBooking = {
    id: 'test-booking-yesterday-001',
    memberId: 'mem-001',
    memberEmail: 'eya.lorenzana@email.com',
    memberName: 'Eya Lorenzana',
    trainerId: 'trainer-001',
    trainerName: 'Cyrelle Joy Duhac',
    className: 'Strength Training',
    date: yesterdayStr,
    time: '10:00 AM',
    status: 'Confirmed',
    createdAt: yesterday.toISOString(),
  };

  // Get existing bookings
  const bookingsStr = localStorage.getItem('gfitness_bookings');
  const bookings = bookingsStr ? JSON.parse(bookingsStr) : [];

  // Check if test booking already exists
  const exists = bookings.some((b: any) => b.id === testBooking.id);
  
  if (!exists) {
    bookings.push(testBooking);
    localStorage.setItem('gfitness_bookings', JSON.stringify(bookings));
    return true;
  } else {
    return false;
  }
}

// Clear test data
export function clearTestRatingData() {
  localStorage.removeItem('rated_sessions');
  localStorage.removeItem('session_ratings');
  localStorage.removeItem('dismissed_ratings');
}
