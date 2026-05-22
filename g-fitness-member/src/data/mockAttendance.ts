// Mock attendance — replace with API call when backend is ready

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string;            // YYYY-MM-DD
  time: string;            // HH:mm
  method: 'QR' | 'Manual';
}

const today = new Date();
const offset = (n: number) =>
  new Date(today.getTime() - n * 86400000).toISOString().split('T')[0];

export const MOCK_ATTENDANCE: AttendanceRecord[] = [
  { id: 'a-001', memberId: 'eya.lorenzana@email.com', date: offset(0),  time: '07:15', method: 'QR' },
  { id: 'a-002', memberId: 'eya.lorenzana@email.com', date: offset(1),  time: '06:45', method: 'QR' },
  { id: 'a-003', memberId: 'eya.lorenzana@email.com', date: offset(2),  time: '17:30', method: 'QR' },
  { id: 'a-004', memberId: 'eya.lorenzana@email.com', date: offset(3),  time: '07:00', method: 'Manual' },
  { id: 'a-005', memberId: 'eya.lorenzana@email.com', date: offset(5),  time: '06:30', method: 'QR' },
  { id: 'a-006', memberId: 'eya.lorenzana@email.com', date: offset(7),  time: '18:00', method: 'QR' },
  { id: 'a-007', memberId: 'eya.lorenzana@email.com', date: offset(9),  time: '07:00', method: 'QR' },
  { id: 'a-008', memberId: 'eya.lorenzana@email.com', date: offset(11), time: '06:45', method: 'QR' },
  { id: 'a-009', memberId: 'eya.lorenzana@email.com', date: offset(13), time: '17:00', method: 'Manual' },
  { id: 'a-010', memberId: 'eya.lorenzana@email.com', date: offset(15), time: '06:30', method: 'QR' },
  { id: 'a-011', memberId: 'eya.lorenzana@email.com', date: offset(18), time: '07:30', method: 'QR' },
  { id: 'a-012', memberId: 'eya.lorenzana@email.com', date: offset(21), time: '06:00', method: 'QR' },
];
