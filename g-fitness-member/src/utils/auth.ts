// Simple authentication utility for prototype
// In production, this would connect to backend API with JWT tokens

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  membershipType: string;
  membershipStatus: string;
}

// Mock user database (in production, this would be in backend)
const MOCK_USERS = [
  {
    id: 'GF-2024-001',
    email: 'eya.lorenzana@email.com',
    password: 'password123', // In production: bcrypt hashed
    firstName: 'Eya',
    lastName: 'Lorenzana',
    membershipType: 'Premium',
    membershipStatus: 'Active'
  },
  {
    id: 'GF-2024-002',
    email: 'maria@email.com',
    password: 'password123',
    firstName: 'Maria',
    lastName: 'Santos',
    membershipType: 'Standard',
    membershipStatus: 'Active'
  }
];

export const login = (email: string, password: string): { success: boolean; user?: User; error?: string } => {
  // Get registered users from localStorage
  const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  
  // Combine mock users with registered users
  const allUsers = [...MOCK_USERS, ...registeredUsers];
  
  // Find user
  const user = allUsers.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Store in localStorage (in production: use httpOnly cookies)
  const userData = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    membershipType: user.membershipType,
    membershipStatus: user.membershipStatus
  };
  
  localStorage.setItem('user', JSON.stringify(userData));
  localStorage.setItem('isAuthenticated', 'true');
  
  return { success: true, user: userData };
};

export const register = (data: any): { success: boolean; error?: string } => {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { success: false, error: 'Invalid email format' };
  }

  // Get existing users
  const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  const allUsers = [...MOCK_USERS, ...registeredUsers];
  
  // Check if email already exists
  const exists = allUsers.find(u => u.email === data.email);
  if (exists) {
    return { success: false, error: 'Email already registered' };
  }

  // Validate password strength
  if (data.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }

  // Create new user
  const newUser = {
    id: `GF-2024-${Date.now()}`,
    email: data.email,
    password: data.password,
    firstName: data.firstName,
    lastName: data.lastName,
    membershipType: data.selectedPlan,
    membershipStatus: 'Active'
  };

  // Save to localStorage
  registeredUsers.push(newUser);
  localStorage.setItem('registeredUsers', JSON.stringify(registeredUsers));
  
  return { success: true };
};

export const logout = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('isAuthenticated');
};

export const getCurrentUser = (): User | null => {
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
};

export const isAuthenticated = (): boolean => {
  return localStorage.getItem('isAuthenticated') === 'true';
};

// Defense Note: In production, this would be:
// - JWT tokens stored in httpOnly cookies
// - Passwords hashed with bcrypt (12 rounds)
// - Email verification required
// - 2FA optional
// - Session timeout after 30 minutes
// - Refresh token rotation
