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
