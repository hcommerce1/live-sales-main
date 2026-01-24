/**
 * NIP (Polish Tax ID) Validator
 *
 * Validates NIP according to Polish tax authority rules.
 * NIP is a 10-digit number with a checksum.
 *
 * Format: XXX-XXX-XX-XX or XXXXXXXXXX
 * Checksum: Weighted sum mod 11
 */

const logger = require('./logger');

/**
 * NIP validation weights for checksum calculation
 * Used in the modulo 11 algorithm
 */
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/**
 * Validate Polish NIP (Tax Identification Number)
 *
 * @param {string} nip - NIP to validate (with or without dashes/spaces)
 * @returns {{valid: boolean, normalized: string|null, reason: string|null}}
 */
function validateNIP(nip) {
  // Handle null/undefined
  if (!nip) {
    return {
      valid: false,
      normalized: null,
      reason: 'NIP is required',
    };
  }

  // Convert to string and remove dashes, spaces
  const cleanNip = String(nip).replace(/[\s-]/g, '');

  // Check length
  if (cleanNip.length !== 10) {
    return {
      valid: false,
      normalized: null,
      reason: 'NIP must be exactly 10 digits',
    };
  }

  // Check if all characters are digits
  if (!/^\d{10}$/.test(cleanNip)) {
    return {
      valid: false,
      normalized: null,
      reason: 'NIP must contain only digits',
    };
  }

  // Calculate checksum
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanNip[i], 10) * NIP_WEIGHTS[i];
  }

  const checksum = sum % 11;
  const lastDigit = parseInt(cleanNip[9], 10);

  // Checksum of 10 is invalid (would require two-digit control number)
  if (checksum === 10) {
    return {
      valid: false,
      normalized: null,
      reason: 'Invalid NIP checksum',
    };
  }

  // Verify checksum matches last digit
  if (checksum !== lastDigit) {
    return {
      valid: false,
      normalized: null,
      reason: 'Invalid NIP checksum',
    };
  }

  return {
    valid: true,
    normalized: cleanNip,
    reason: null,
  };
}

/**
 * Format NIP for display
 *
 * @param {string} nip - Normalized NIP (10 digits)
 * @returns {string} Formatted NIP (XXX-XXX-XX-XX)
 */
function formatNIP(nip) {
  const clean = String(nip).replace(/[\s-]/g, '');
  if (clean.length !== 10) {
    return nip; // Return as-is if not valid length
  }
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 8)}-${clean.slice(8, 10)}`;
}

/**
 * NIP validation middleware factory
 *
 * @param {string} paramLocation - Where to find NIP ('body', 'params', 'query')
 * @param {string} paramName - Name of the parameter (default: 'nip')
 */
function validateNIPMiddleware(paramLocation = 'body', paramName = 'nip') {
  return (req, res, next) => {
    const source = req[paramLocation];
    const nip = source ? source[paramName] : null;

    const result = validateNIP(nip);

    if (!result.valid) {
      logger.debug('NIP validation failed', {
        paramLocation,
        paramName,
        reason: result.reason,
      });

      return res.status(400).json({
        error: 'Invalid NIP',
        code: 'INVALID_NIP',
        field: paramName,
        reason: result.reason,
      });
    }

    // Replace with normalized NIP
    if (source) {
      source[paramName] = result.normalized;
    }

    next();
  };
}

/**
 * Check if NIP is a test/example NIP
 * Test NIPs are used in documentation and should not be allowed in production
 */
function isTestNIP(nip) {
  const testNIPs = [
    '1234567890', // Common test NIP
    '0000000000', // Zero NIP
    '1111111111', // Repeated digits
    '5260250274', // Example from official docs
  ];

  const clean = String(nip).replace(/[\s-]/g, '');
  return testNIPs.includes(clean);
}

module.exports = {
  validateNIP,
  formatNIP,
  validateNIPMiddleware,
  isTestNIP,
  NIP_WEIGHTS,
};
