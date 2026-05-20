// Comprehensive form validation utilities

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateEmail = (email: string): string | null => {
  if (!email) return 'Email is required';
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  
  return null;
};

export const validatePhone = (phone: string): string | null => {
  if (!phone) return 'Phone number is required';
  
  // Philippine phone number format
  const phoneRegex = /^(09|\+639)\d{9}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    return 'Please enter a valid Philippine phone number (09XXXXXXXXX)';
  }
  
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return 'Password is required';
  
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  
  return null;
};

export const validateName = (name: string, fieldName: string): string | null => {
  if (!name) return `${fieldName} is required`;
  
  if (name.length < 2) {
    return `${fieldName} must be at least 2 characters`;
  }
  
  if (!/^[a-zA-Z\s]+$/.test(name)) {
    return `${fieldName} can only contain letters and spaces`;
  }
  
  return null;
};

export const validateAge = (birthdate: string): string | null => {
  if (!birthdate) return 'Birthdate is required';
  
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  if (age < 18) {
    return 'You must be at least 18 years old to register';
  }
  
  if (age > 100) {
    return 'Please enter a valid birthdate';
  }
  
  return null;
};

export const validateRegistrationForm = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  // Validate first name
  const firstNameError = validateName(data.firstName, 'First name');
  if (firstNameError) errors.firstName = firstNameError;
  
  // Validate last name
  const lastNameError = validateName(data.lastName, 'Last name');
  if (lastNameError) errors.lastName = lastNameError;
  
  // Validate email
  const emailError = validateEmail(data.email);
  if (emailError) errors.email = emailError;
  
  // Validate phone
  const phoneError = validatePhone(data.phone);
  if (phoneError) errors.phone = phoneError;
  
  // Validate address
  if (!data.address || data.address.trim().length < 10) {
    errors.address = 'Please enter a complete address (minimum 10 characters)';
  }
  
  // Validate birthdate
  const ageError = validateAge(data.birthdate);
  if (ageError) errors.birthdate = ageError;
  
  // Validate password
  const passwordError = validatePassword(data.password);
  if (passwordError) errors.password = passwordError;
  
  // Validate password confirmation
  if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }
  
  // Validate terms acceptance
  if (!data.termsAccepted) {
    errors.terms = 'You must accept the Terms and Privacy Policy';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const validatePaymentForm = (data: any): ValidationResult => {
  const errors: Record<string, string> = {};
  
  if (!data.memberId) {
    errors.memberId = 'Please select a member';
  }
  
  if (!data.amount || data.amount <= 0) {
    errors.amount = 'Please enter a valid amount';
  }
  
  if (!data.method) {
    errors.method = 'Please select a payment method';
  }
  
  if (!data.date) {
    errors.date = 'Please select a payment date';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Defense Points:
// ✅ Client-side validation for better UX
// ✅ Email format validation
// ✅ Phone number format (Philippine)
// ✅ Password strength requirements
// ✅ Age verification (18+)
// ✅ Required field validation
// 
// Production Enhancements:
// - Server-side validation (never trust client)
// - SQL injection prevention
// - XSS prevention (sanitize inputs)
// - Rate limiting on form submissions
// - CAPTCHA for bot prevention
// - Email verification via OTP
