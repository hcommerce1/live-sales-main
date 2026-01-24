const crypto = require('crypto');
const logger = require('./logger');

/**
 * Encryption utilities using AES-256-GCM
 *
 * SECURITY: Master key must be 32 bytes (256 bits) and stored securely
 * Generate with: openssl rand -hex 32
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

class CryptoService {
  constructor() {
    // Master encryption key from environment
    const masterKey = process.env.ENCRYPTION_KEY;

    if (!masterKey) {
      logger.error('ENCRYPTION_KEY not set in environment variables');
      throw new Error('Encryption key not configured');
    }

    // Validate key length (must be 64 hex characters = 32 bytes)
    if (masterKey.length !== 64) {
      logger.error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
      throw new Error('Invalid encryption key length');
    }

    this.masterKey = Buffer.from(masterKey, 'hex');
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @returns {string} - Encrypted data in format: iv:tag:ciphertext (hex encoded)
   */
  encrypt(plaintext) {
    try {
      // Generate random IV (initialization vector)
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

      // Encrypt the plaintext
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Return format: iv:tag:ciphertext (all hex encoded)
      return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext}`;
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encrypted - Encrypted data in format: iv:tag:ciphertext
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encrypted) {
    try {
      // Split the encrypted string
      const parts = encrypted.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const ciphertext = parts[2];

      // Validate lengths
      if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
        throw new Error('Invalid IV or tag length');
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt the ciphertext
      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash data using SHA-256 (for API keys)
   * @param {string} data - Data to hash
   * @returns {string} - Hex encoded hash
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate cryptographically secure random token
   * @param {number} length - Length in bytes (default: 32)
   * @returns {string} - Hex encoded random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate TOTP secret for 2FA
   * @returns {string} - Base32 encoded secret (32 characters)
   */
  generateTOTPSecret() {
    // Generate 20 random bytes
    const buffer = crypto.randomBytes(20);

    // Base32 encode (used by authenticator apps)
    return this.base32Encode(buffer);
  }

  /**
   * Base32 encoding (for TOTP secrets)
   * @param {Buffer} buffer - Data to encode
   * @returns {string} - Base32 encoded string
   */
  base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Constant-time string comparison (prevents timing attacks)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} - True if equal
   */
  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  }
}

module.exports = new CryptoService();
