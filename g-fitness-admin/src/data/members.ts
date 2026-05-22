import type { Member } from '../types';

export const MEMBERS: Member[] = [
  {
    id: 'mem-001',
    gymId: 'gym-001',
    firstName: 'Juan',
    lastName: 'dela Cruz',
    fullName: 'Juan dela Cruz',
    email: 'juan.delacruz@email.com',
    phone: '+63 917 555 0001',
    address: 'Poblacion, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/juan-delacruz.jpg',
    membershipType: 'Premium',
    membershipStatus: 'Active',
    startDate: new Date('2023-06-15'),
    expiryDate: new Date('2024-06-15'),
    emergencyContact: {
      name: 'Maria dela Cruz',
      phone: '+63 917 555 0002',
      relationship: 'Spouse'
    },
    qrCode: 'MEM001-GFIT-2024'
  },
  {
    id: 'mem-002',
    gymId: 'gym-001',
    firstName: 'Maria',
    lastName: 'Santos',
    fullName: 'Maria Santos',
    email: 'maria.santos@email.com',
    phone: '+63 917 555 0003',
    address: 'Barangay Payompon, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/maria-santos.jpg',
    membershipType: 'Standard',
    membershipStatus: 'Active',
    startDate: new Date('2023-08-01'),
    expiryDate: new Date('2024-08-01'),
    emergencyContact: {
      name: 'Pedro Santos',
      phone: '+63 917 555 0004',
      relationship: 'Father'
    },
    qrCode: 'MEM002-GFIT-2024'
  },
  {
    id: 'mem-003',
    gymId: 'gym-002',
    firstName: 'Pedro',
    lastName: 'Reyes',
    fullName: 'Pedro Reyes',
    email: 'pedro.reyes@email.com',
    phone: '+63 917 555 0005',
    address: 'Barangay Tayamaan, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/pedro-reyes.jpg',
    membershipType: 'Basic',
    membershipStatus: 'Active',
    startDate: new Date('2024-01-10'),
    expiryDate: new Date('2025-01-10'),
    emergencyContact: {
      name: 'Ana Reyes',
      phone: '+63 917 555 0006',
      relationship: 'Sister'
    },
    qrCode: 'MEM003-FREG-2024'
  },
  {
    id: 'mem-004',
    gymId: 'gym-002',
    firstName: 'Ana',
    lastName: 'Garcia',
    fullName: 'Ana Garcia',
    email: 'ana.garcia@email.com',
    phone: '+63 917 555 0007',
    address: 'Poblacion, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/ana-garcia.jpg',
    membershipType: 'Premium',
    membershipStatus: 'Active',
    startDate: new Date('2023-05-20'),
    expiryDate: new Date('2024-05-20'),
    emergencyContact: {
      name: 'Jose Garcia',
      phone: '+63 917 555 0008',
      relationship: 'Husband'
    },
    qrCode: 'MEM004-FREG-2024'
  },
  {
    id: 'mem-005',
    gymId: 'gym-003',
    firstName: 'Jose',
    lastName: 'Mendoza',
    fullName: 'Jose Mendoza',
    email: 'jose.mendoza@email.com',
    phone: '+63 917 555 0009',
    address: 'Barangay Payompon, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/jose-mendoza.jpg',
    membershipType: 'Standard',
    membershipStatus: 'Expired',
    startDate: new Date('2023-03-15'),
    expiryDate: new Date('2024-03-15'),
    emergencyContact: {
      name: 'Rosa Mendoza',
      phone: '+63 917 555 0010',
      relationship: 'Mother'
    },
    qrCode: 'MEM005-FERR-2024'
  },
  {
    id: 'mem-006',
    gymId: 'gym-003',
    firstName: 'Rosa',
    lastName: 'Torres',
    fullName: 'Rosa Torres',
    email: 'rosa.torres@email.com',
    phone: '+63 917 555 0011',
    address: 'Barangay Tayamaan, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/rosa-torres.jpg',
    membershipType: 'Basic',
    membershipStatus: 'Active',
    startDate: new Date('2024-02-01'),
    expiryDate: new Date('2025-02-01'),
    emergencyContact: {
      name: 'Miguel Torres',
      phone: '+63 917 555 0012',
      relationship: 'Brother'
    },
    qrCode: 'MEM006-FERR-2024'
  },
  {
    id: 'mem-007',
    gymId: 'gym-001',
    firstName: 'Miguel',
    lastName: 'Ramos',
    fullName: 'Miguel Ramos',
    email: 'miguel.ramos@email.com',
    phone: '+63 917 555 0013',
    address: 'Poblacion, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/miguel-ramos.jpg',
    membershipType: 'Premium',
    membershipStatus: 'Active',
    startDate: new Date('2023-09-10'),
    expiryDate: new Date('2024-09-10'),
    emergencyContact: {
      name: 'Carmen Ramos',
      phone: '+63 917 555 0014',
      relationship: 'Wife'
    },
    qrCode: 'MEM007-GFIT-2024'
  },
  {
    id: 'mem-008',
    gymId: 'gym-001',
    firstName: 'Carmen',
    lastName: 'Flores',
    fullName: 'Carmen Flores',
    email: 'carmen.flores@email.com',
    phone: '+63 917 555 0015',
    address: 'Barangay Payompon, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/carmen-flores.jpg',
    membershipType: 'Standard',
    membershipStatus: 'Active',
    startDate: new Date('2023-11-05'),
    expiryDate: new Date('2024-11-05'),
    emergencyContact: {
      name: 'Antonio Flores',
      phone: '+63 917 555 0016',
      relationship: 'Father'
    },
    qrCode: 'MEM008-GFIT-2024'
  },
  {
    id: 'mem-009',
    gymId: 'gym-002',
    firstName: 'Antonio',
    lastName: 'Gonzales',
    fullName: 'Antonio Gonzales',
    email: 'antonio.gonzales@email.com',
    phone: '+63 917 555 0017',
    address: 'Barangay Tayamaan, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/antonio-gonzales.jpg',
    membershipType: 'Basic',
    membershipStatus: 'Suspended',
    startDate: new Date('2023-12-01'),
    expiryDate: new Date('2024-12-01'),
    emergencyContact: {
      name: 'Elena Gonzales',
      phone: '+63 917 555 0018',
      relationship: 'Sister'
    },
    qrCode: 'MEM009-FREG-2024'
  },
  {
    id: 'mem-010',
    gymId: 'gym-002',
    firstName: 'Elena',
    lastName: 'Rivera',
    fullName: 'Elena Rivera',
    email: 'elena.rivera@email.com',
    phone: '+63 917 555 0019',
    address: 'Poblacion, Mamburao, Occidental Mindoro',
    photoUrl: '/avatars/elena-rivera.jpg',
    membershipType: 'Premium',
    membershipStatus: 'Active',
    startDate: new Date('2023-07-15'),
    expiryDate: new Date('2024-07-15'),
    emergencyContact: {
      name: 'Ramon Rivera',
      phone: '+63 917 555 0020',
      relationship: 'Husband'
    },
    qrCode: 'MEM010-FREG-2024'
  }
];

// ── Additional mock members for gym-001 to test pagination ──────────────────
const EXTRA_GYM001: Member[] = [
  { id: 'mem-011', gymId: 'gym-001', firstName: 'Eya', lastName: 'Lorenzana', fullName: 'Eya Lorenzana', email: 'eya.lorenzana@email.com', phone: '+63 912 345 6789', address: 'Brgy. Payompon, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2024-01-15'), expiryDate: new Date('2026-12-31'), emergencyContact: { name: 'Gabby', phone: '+63 912 000 0001', relationship: 'Partner' }, qrCode: 'GF-2024-001' },
  { id: 'mem-012', gymId: 'gym-001', firstName: 'Carlos', lastName: 'Villanueva', fullName: 'Carlos Villanueva', email: 'carlos.v@email.com', phone: '+63 917 555 0021', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Active', startDate: new Date('2024-02-01'), expiryDate: new Date('2025-02-01'), emergencyContact: { name: 'Lina Villanueva', phone: '+63 917 555 0022', relationship: 'Wife' }, qrCode: 'MEM012-GFIT-2024' },
  { id: 'mem-013', gymId: 'gym-001', firstName: 'Patricia', lastName: 'Bautista', fullName: 'Patricia Bautista', email: 'patricia.b@email.com', phone: '+63 917 555 0023', address: 'Brgy. Tayamaan, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Active', startDate: new Date('2024-03-10'), expiryDate: new Date('2025-03-10'), emergencyContact: { name: 'Mark Bautista', phone: '+63 917 555 0024', relationship: 'Brother' }, qrCode: 'MEM013-GFIT-2024' },
  { id: 'mem-014', gymId: 'gym-001', firstName: 'Ricardo', lastName: 'Aquino', fullName: 'Ricardo Aquino', email: 'ricardo.a@email.com', phone: '+63 917 555 0025', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Expiring', startDate: new Date('2023-12-01'), expiryDate: new Date('2024-06-01'), emergencyContact: { name: 'Sofia Aquino', phone: '+63 917 555 0026', relationship: 'Daughter' }, qrCode: 'MEM014-GFIT-2024' },
  { id: 'mem-015', gymId: 'gym-001', firstName: 'Sofia', lastName: 'Lim', fullName: 'Sofia Lim', email: 'sofia.lim@email.com', phone: '+63 917 555 0027', address: 'Brgy. Payompon, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Active', startDate: new Date('2024-01-20'), expiryDate: new Date('2025-01-20'), emergencyContact: { name: 'David Lim', phone: '+63 917 555 0028', relationship: 'Father' }, qrCode: 'MEM015-GFIT-2024' },
  { id: 'mem-016', gymId: 'gym-001', firstName: 'David', lastName: 'Cruz', fullName: 'David Cruz', email: 'david.cruz@email.com', phone: '+63 917 555 0029', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Expired', startDate: new Date('2023-06-01'), expiryDate: new Date('2024-01-01'), emergencyContact: { name: 'Lena Cruz', phone: '+63 917 555 0030', relationship: 'Mother' }, qrCode: 'MEM016-GFIT-2024' },
  { id: 'mem-017', gymId: 'gym-001', firstName: 'Angela', lastName: 'Tan', fullName: 'Angela Tan', email: 'angela.tan@email.com', phone: '+63 917 555 0031', address: 'Brgy. Tayamaan, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2024-04-01'), expiryDate: new Date('2025-04-01'), emergencyContact: { name: 'Kevin Tan', phone: '+63 917 555 0032', relationship: 'Husband' }, qrCode: 'MEM017-GFIT-2024' },
  { id: 'mem-018', gymId: 'gym-001', firstName: 'Kevin', lastName: 'Pascual', fullName: 'Kevin Pascual', email: 'kevin.p@email.com', phone: '+63 917 555 0033', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Active', startDate: new Date('2024-02-15'), expiryDate: new Date('2025-02-15'), emergencyContact: { name: 'Joy Pascual', phone: '+63 917 555 0034', relationship: 'Sister' }, qrCode: 'MEM018-GFIT-2024' },
  { id: 'mem-019', gymId: 'gym-001', firstName: 'Joy', lastName: 'Manalo', fullName: 'Joy Manalo', email: 'joy.manalo@email.com', phone: '+63 917 555 0035', address: 'Brgy. Payompon, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Active', startDate: new Date('2024-05-01'), expiryDate: new Date('2025-05-01'), emergencyContact: { name: 'Ben Manalo', phone: '+63 917 555 0036', relationship: 'Brother' }, qrCode: 'MEM019-GFIT-2024' },
  { id: 'mem-020', gymId: 'gym-001', firstName: 'Benjamin', lastName: 'Ocampo', fullName: 'Benjamin Ocampo', email: 'ben.ocampo@email.com', phone: '+63 917 555 0037', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2023-10-01'), expiryDate: new Date('2024-10-01'), emergencyContact: { name: 'Celia Ocampo', phone: '+63 917 555 0038', relationship: 'Wife' }, qrCode: 'MEM020-GFIT-2024' },
  { id: 'mem-021', gymId: 'gym-001', firstName: 'Celia', lastName: 'Navarro', fullName: 'Celia Navarro', email: 'celia.n@email.com', phone: '+63 917 555 0039', address: 'Brgy. Tayamaan, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Expiring', startDate: new Date('2023-11-15'), expiryDate: new Date('2024-05-30'), emergencyContact: { name: 'Rico Navarro', phone: '+63 917 555 0040', relationship: 'Son' }, qrCode: 'MEM021-GFIT-2024' },
  { id: 'mem-022', gymId: 'gym-001', firstName: 'Rico', lastName: 'Salazar', fullName: 'Rico Salazar', email: 'rico.s@email.com', phone: '+63 917 555 0041', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Active', startDate: new Date('2024-03-20'), expiryDate: new Date('2025-03-20'), emergencyContact: { name: 'Mia Salazar', phone: '+63 917 555 0042', relationship: 'Sister' }, qrCode: 'MEM022-GFIT-2024' },
  { id: 'mem-023', gymId: 'gym-001', firstName: 'Mia', lastName: 'Fernandez', fullName: 'Mia Fernandez', email: 'mia.f@email.com', phone: '+63 917 555 0043', address: 'Brgy. Payompon, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2024-01-05'), expiryDate: new Date('2025-01-05'), emergencyContact: { name: 'Leo Fernandez', phone: '+63 917 555 0044', relationship: 'Father' }, qrCode: 'MEM023-GFIT-2024' },
  { id: 'mem-024', gymId: 'gym-001', firstName: 'Leonardo', lastName: 'Dizon', fullName: 'Leonardo Dizon', email: 'leo.dizon@email.com', phone: '+63 917 555 0045', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Active', startDate: new Date('2024-04-15'), expiryDate: new Date('2025-04-15'), emergencyContact: { name: 'Grace Dizon', phone: '+63 917 555 0046', relationship: 'Wife' }, qrCode: 'MEM024-GFIT-2024' },
  { id: 'mem-025', gymId: 'gym-001', firstName: 'Grace', lastName: 'Soriano', fullName: 'Grace Soriano', email: 'grace.s@email.com', phone: '+63 917 555 0047', address: 'Brgy. Tayamaan, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Suspended', startDate: new Date('2023-09-01'), expiryDate: new Date('2024-09-01'), emergencyContact: { name: 'Paul Soriano', phone: '+63 917 555 0048', relationship: 'Husband' }, qrCode: 'MEM025-GFIT-2024' },
  { id: 'mem-026', gymId: 'gym-001', firstName: 'Paul', lastName: 'Castillo', fullName: 'Paul Castillo', email: 'paul.c@email.com', phone: '+63 917 555 0049', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2024-02-20'), expiryDate: new Date('2025-02-20'), emergencyContact: { name: 'Nina Castillo', phone: '+63 917 555 0050', relationship: 'Sister' }, qrCode: 'MEM026-GFIT-2024' },
  { id: 'mem-027', gymId: 'gym-001', firstName: 'Nina', lastName: 'Aguilar', fullName: 'Nina Aguilar', email: 'nina.a@email.com', phone: '+63 917 555 0051', address: 'Brgy. Payompon, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Active', startDate: new Date('2024-05-10'), expiryDate: new Date('2025-05-10'), emergencyContact: { name: 'Marco Aguilar', phone: '+63 917 555 0052', relationship: 'Brother' }, qrCode: 'MEM027-GFIT-2024' },
  { id: 'mem-028', gymId: 'gym-001', firstName: 'Marco', lastName: 'Villanueva', fullName: 'Marco Villanueva', email: 'marco.v@email.com', phone: '+63 917 555 0053', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Basic', membershipStatus: 'Active', startDate: new Date('2024-06-01'), expiryDate: new Date('2025-06-01'), emergencyContact: { name: 'Tina Villanueva', phone: '+63 917 555 0054', relationship: 'Mother' }, qrCode: 'MEM028-GFIT-2024' },
  { id: 'mem-029', gymId: 'gym-001', firstName: 'Tina', lastName: 'Reyes', fullName: 'Tina Reyes', email: 'tina.r@email.com', phone: '+63 917 555 0055', address: 'Brgy. Tayamaan, Mamburao', photoUrl: '', membershipType: 'Premium', membershipStatus: 'Active', startDate: new Date('2024-03-01'), expiryDate: new Date('2025-03-01'), emergencyContact: { name: 'Alex Reyes', phone: '+63 917 555 0056', relationship: 'Husband' }, qrCode: 'MEM029-GFIT-2024' },
  { id: 'mem-030', gymId: 'gym-001', firstName: 'Alex', lastName: 'Santos', fullName: 'Alex Santos', email: 'alex.santos@email.com', phone: '+63 917 555 0057', address: 'Poblacion, Mamburao', photoUrl: '', membershipType: 'Standard', membershipStatus: 'Expired', startDate: new Date('2023-04-01'), expiryDate: new Date('2024-04-01'), emergencyContact: { name: 'Beth Santos', phone: '+63 917 555 0058', relationship: 'Wife' }, qrCode: 'MEM030-GFIT-2024' },
];

// Merge extra members into the main array
MEMBERS.push(...EXTRA_GYM001);
