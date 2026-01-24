const argon2 = require('argon2');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Password hashing using Argon2id (winner of Password Hashing Competition)
 *
 * SECURITY PARAMETERS:
 * - Algorithm: Argon2id (hybrid of Argon2i and Argon2d)
 * - Memory: 65536 KB (64 MB) - high memory cost prevents GPU attacks
 * - Iterations: 3 - time cost
 * - Parallelism: 4 - threads
 * - Salt: 32 bytes random (generated automatically)
 * - Pepper: 32 bytes secret from environment (additional layer)
 */

class PasswordService {
  constructor() {
    // Pepper: secret value mixed with password (stored in env, not database)
    const pepper = process.env.PASSWORD_PEPPER;

    if (!pepper) {
      // SECURITY: Pepper is required in production
      if (process.env.NODE_ENV === 'production') {
        throw new Error('PASSWORD_PEPPER is required in production');
      }
      logger.warn('PASSWORD_PEPPER not set - using empty pepper (development only)');
      this.pepper = '';
    } else if (pepper.length < 32) {
      throw new Error('PASSWORD_PEPPER must be at least 32 characters');
    } else {
      this.pepper = pepper;
    }

    // Argon2 configuration
    this.argonOptions = {
      type: argon2.argon2id, // Hybrid (best for password hashing)
      memoryCost: 65536,     // 64 MB
      timeCost: 3,           // Iterations
      parallelism: 4,        // Threads
      hashLength: 32,        // 256 bits output
    };
  }

  /**
   * Hash password using Argon2id with pepper
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  async hash(password) {
    try {
      // Validate password strength
      this.validatePasswordStrength(password);

      // Add pepper to password
      const pepperedPassword = password + this.pepper;

      // Hash with Argon2id
      const hash = await argon2.hash(pepperedPassword, this.argonOptions);

      logger.debug('Password hashed successfully');
      return hash;
    } catch (error) {
      logger.error('Password hashing failed', { error: error.message });
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} - True if password matches
   */
  async verify(password, hash) {
    try {
      // Add pepper to password
      const pepperedPassword = password + this.pepper;

      // Verify with Argon2id
      const isValid = await argon2.verify(hash, pepperedPassword);

      logger.debug('Password verification completed', { isValid });
      return isValid;
    } catch (error) {
      logger.error('Password verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @throws {Error} - If password is too weak
   */
  validatePasswordStrength(password) {
    const minLength = 12;
    const errors = [];

    // Length check
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters`);
    }

    // Complexity checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain special characters');
    }

    // Check for common patterns
    const commonPasswords = [
      'password', 'Password123!', '12345678', 'qwerty',
      'admin', 'letmein', 'welcome', 'monkey'
    ];

    if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
      errors.push('Password contains common patterns');
    }

    if (errors.length > 0) {
      throw new Error(`Password validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate secure random password
   * @param {number} length - Password length (default: 16)
   * @returns {string} - Random password
   */
  generatePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    let password = '';

    // Ensure at least one of each required character type
    password += this.getRandomChar('abcdefghijklmnopqrstuvwxyz');
    password += this.getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    password += this.getRandomChar('0123456789');
    password += this.getRandomChar('!@#$%^&*()_+-=');

    // Fill remaining with random characters
    for (let i = password.length; i < length; i++) {
      password += this.getRandomChar(charset);
    }

    // Shuffle the password
    return password.split('').sort(() => crypto.randomBytes(1)[0] - 128).join('');
  }

  /**
   * Get random character from charset
   * @param {string} charset - Character set
   * @returns {string} - Random character
   */
  getRandomChar(charset) {
    const randomIndex = crypto.randomInt(0, charset.length);
    return charset[randomIndex];
  }

  /**
   * Check if password needs rehashing (algorithm upgraded)
   * @param {string} hash - Current hash
   * @returns {boolean} - True if rehash recommended
   */
  needsRehash(hash) {
    try {
      return argon2.needsRehash(hash, this.argonOptions);
    } catch (error) {
      return true; // If error, recommend rehash
    }
  }
}

module.exports = new PasswordService();
