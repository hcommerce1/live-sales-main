/**
 * NIP Validator
 *
 * Validates Polish NIP (Tax Identification Number) using checksum algorithm.
 * NIP format: 10 digits, last digit is checksum.
 */

/**
 * NIP checksum weights
 */
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/**
 * Normalize NIP - remove spaces, dashes
 * @param {string} nip
 * @returns {string}
 */
function normalizeNip(nip) {
  if (!nip || typeof nip !== 'string') {
    return '';
  }
  return nip.replace(/[\s\-\.]/g, '');
}

/**
 * Validate NIP checksum
 *
 * @param {string} nip - Raw or normalized NIP
 * @returns {{valid: boolean, normalized: string|null, reason: string|null}}
 */
function validateNip(nip) {
  const normalized = normalizeNip(nip);

  // Check length
  if (normalized.length !== 10) {
    return {
      valid: false,
      normalized: null,
      reason: 'NIP must be exactly 10 digits',
    };
  }

  // Check if all digits
  if (!/^\d{10}$/.test(normalized)) {
    return {
      valid: false,
      normalized: null,
      reason: 'NIP must contain only digits',
    };
  }

  // Calculate checksum
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(normalized[i], 10) * NIP_WEIGHTS[i];
  }

  const checksum = sum % 11;
  const lastDigit = parseInt(normalized[9], 10);

  // Checksum 10 is invalid (would require two digits)
  if (checksum === 10) {
    return {
      valid: false,
      normalized: null,
      reason: 'Invalid NIP - checksum error',
    };
  }

  if (checksum !== lastDigit) {
    return {
      valid: false,
      normalized: null,
      reason: 'Invalid NIP checksum',
    };
  }

  return {
    valid: true,
    normalized,
    reason: null,
  };
}

/**
 * Format NIP for display (XXX-XXX-XX-XX)
 * @param {string} nip - Normalized NIP
 * @returns {string}
 */
function formatNip(nip) {
  const normalized = normalizeNip(nip);
  if (normalized.length !== 10) {
    return nip;
  }
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8, 10)}`;
}

/**
 * Check if NIP looks like a test/example NIP
 * @param {string} nip
 * @returns {boolean}
 */
function isTestNip(nip) {
  const normalized = normalizeNip(nip);
  const testPatterns = [
    '0000000000',
    '1111111111',
    '1234567890',
    '9999999999',
  ];
  return testPatterns.includes(normalized);
}

module.exports = {
  normalizeNip,
  validateNip,
  formatNip,
  isTestNip,
  NIP_WEIGHTS,
};
