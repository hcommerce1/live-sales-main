/**
 * Password Validator
 *
 * Validates password strength according to security requirements.
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
function validatePasswordStrength(password) {
  const errors = [];

  if (!password || password.length < 12) {
    errors.push('Hasło musi mieć minimum 12 znaków');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Hasło musi zawierać wielką literę');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Hasło musi zawierać małą literę');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Hasło musi zawierać cyfrę');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Hasło musi zawierać znak specjalny');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if password is commonly used (basic check)
 * @param {string} password
 * @returns {boolean}
 */
function isCommonPassword(password) {
  const commonPasswords = [
    'password123456',
    'qwerty123456',
    '123456789012',
    'admin12345678',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

module.exports = {
  validatePasswordStrength,
  isCommonPassword,
};
