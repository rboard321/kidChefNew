import * as Crypto from 'expo-crypto';

/**
 * Secure PIN handling utilities
 * Uses SHA-256 hashing with salt to securely store PINs
 */

// Generate a random salt for PIN hashing
function generateSalt(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 16; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/**
 * Hash a PIN with salt for secure storage
 */
export async function hashPin(pin: string): Promise<string> {
  if (!pin || pin.length < 4) {
    throw new Error('PIN must be at least 4 characters');
  }

  const salt = generateSalt();
  const hashInput = `${pin}:${salt}`;
  // PIN hashing in progress (security-sensitive operation)

  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashInput);
  const result = `${hash}:${salt}`;

  // PIN hash generated successfully

  // Store as "hash:salt" format
  return result;
}

/**
 * Verify a PIN against a stored hash
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    // PIN verification in progress

    if (!pin || !storedHash) {
      // PIN verification failed: missing parameters
      return false;
    }

    // Parse stored hash format "hash:salt"
    const [hash, salt] = storedHash.split(':');
    // PIN hash components parsed

    if (!hash || !salt) {
      console.error('🔓 Invalid PIN hash format - expected hash:salt', { hash: !!hash, salt: !!salt });
      return false;
    }

    // Hash the provided PIN with the stored salt
    const hashInput = `${pin}:${salt}`;
    // Computing verification hash

    const computedHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashInput);
    // PIN hash comparison completed

    const result = computedHash === hash;
    // PIN verification result determined
    return result;
  } catch (error) {
    console.error('🔓 Error verifying PIN:', error);
    return false;
  }
}


/**
 * Validate PIN format (4-6 digits)
 */
export function validatePinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}