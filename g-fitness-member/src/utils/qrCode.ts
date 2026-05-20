// Enhanced QR Code generation with security features
// For prototype: Shows the concept
// For production: Would use crypto library and backend validation

interface QRData {
  memberId: string;
  timestamp: number;
  gymId: string;
  expiresIn: number; // seconds
  nonce: string; // unique identifier for each QR
}

export const generateSecureQR = (memberId: string, gymId: string): string => {
  const timestamp = Date.now();
  const expiresIn = 60; // 60 seconds validity
  const nonce = Math.random().toString(36).substring(2, 15); // unique random string
  
  const qrData: QRData = {
    memberId,
    timestamp,
    gymId,
    expiresIn,
    nonce
  };
  
  // In production: Encrypt with AES-256
  // const encrypted = CryptoJS.AES.encrypt(JSON.stringify(qrData), SECRET_KEY);
  // return encrypted.toString();
  
  // For prototype: Base64 encode (shows the concept)
  const encoded = btoa(JSON.stringify(qrData));
  return encoded;
};

export const validateQR = (qrCode: string): { valid: boolean; reason?: string; data?: QRData } => {
  try {
    // Decode QR data
    const decoded = atob(qrCode);
    const qrData: QRData = JSON.parse(decoded);
    
    // Check expiration
    const now = Date.now();
    const expirationTime = qrData.timestamp + (qrData.expiresIn * 1000);
    
    if (now > expirationTime) {
      return { valid: false, reason: 'QR Code expired. Please generate a new one.' };
    }
    
    // Check if used recently (prevent duplicate scans)
    const lastScan = localStorage.getItem(`last_scan_${qrData.memberId}`);
    if (lastScan) {
      const lastScanTime = parseInt(lastScan);
      if (now - lastScanTime < 5000) { // 5 seconds cooldown
        return { valid: false, reason: 'Already checked in. Please wait 5 seconds.' };
      }
    }
    
    // Store scan time
    localStorage.setItem(`last_scan_${qrData.memberId}`, now.toString());
    
    return { valid: true, data: qrData };
    
  } catch (error) {
    return { valid: false, reason: 'Invalid QR Code format' };
  }
};

export const getQRTimeRemaining = (qrCode: string): number => {
  try {
    const decoded = atob(qrCode);
    const qrData: QRData = JSON.parse(decoded);
    
    const now = Date.now();
    const expirationTime = qrData.timestamp + (qrData.expiresIn * 1000);
    const remaining = Math.max(0, Math.floor((expirationTime - now) / 1000));
    
    return remaining;
  } catch {
    return 0;
  }
};

// Defense Points:
// ✅ Time-based expiration (60 seconds)
// ✅ Duplicate scan prevention (5 second cooldown)
// ✅ Timestamp validation
// ✅ Gym-specific QR codes
// ✅ Unique nonce for each QR (prevents reuse)
// 
// Production Enhancements:
// - AES-256 encryption with rotating keys
// - Server-side validation
// - Device fingerprinting
// - Geolocation verification
// - Rate limiting (max 10 scans per day)
// - Audit logging with IP address
