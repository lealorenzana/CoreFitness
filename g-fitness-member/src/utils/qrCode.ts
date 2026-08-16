// Check-in QR payload.
//
// Format: `CF1.<timestamp base36>.<member id>`, uppercased.
//
// This used to be base64(JSON) carrying memberId, timestamp, gymId, expiresIn
// and nonce — about 196 characters. That produced a QR dense enough (~57 modules
// across) that a webcam at the front desk could not reliably decode it off a
// phone screen. The scanner only ever read `memberId` and `timestamp`; gymId,
// expiresIn and nonce were dead weight, so they're gone.
//
// Uppercase, digits, '-' and '.' all live inside QR *alphanumeric* mode, which
// packs far tighter than the mixed-case base64 this replaces. The result is
// roughly a third of the previous module count.
//
// Member ids are lowercase UUIDs in Postgres, so parsing lowercases them again
// before they're used as a lookup key.

/** Seconds a generated code stays valid. Mirrored in the admin scanner. */
export const QR_TTL_SECONDS = 60;

const QR_PREFIX = 'CF1';

export interface QRData {
  memberId: string;
  timestamp: number;
}

export const generateSecureQR = (memberId: string): string =>
  `${QR_PREFIX}.${Date.now().toString(36)}.${memberId}`.toUpperCase();

/** Returns null when the string isn't one of our codes at all. */
export const parseQR = (qrCode: string): QRData | null => {
  const parts = qrCode.trim().split('.');
  if (parts.length !== 3) return null;
  if (parts[0].toUpperCase() !== QR_PREFIX) return null;

  const timestamp = parseInt(parts[1], 36);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (!parts[2]) return null;

  return { memberId: parts[2].toLowerCase(), timestamp };
};

export const validateQR = (
  qrCode: string
): { valid: boolean; reason?: string; data?: QRData } => {
  const data = parseQR(qrCode);
  if (!data) return { valid: false, reason: 'Invalid QR Code format' };

  if (Date.now() > data.timestamp + QR_TTL_SECONDS * 1000) {
    return { valid: false, reason: 'QR Code expired. Please generate a new one.' };
  }

  return { valid: true, data };
};

export const getQRTimeRemaining = (qrCode: string): number => {
  const data = parseQR(qrCode);
  if (!data) return 0;
  const expiresAt = data.timestamp + QR_TTL_SECONDS * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
};
