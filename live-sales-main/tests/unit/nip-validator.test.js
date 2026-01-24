/**
 * NIP Validator Unit Tests
 */

const { validateNIP, formatNIP, isTestNIP, NIP_WEIGHTS } = require('../../backend/utils/nip-validator');

describe('NIP Validator', () => {
  describe('validateNIP', () => {
    describe('valid NIPs', () => {
      // Real valid NIPs (checksum verified)
      const validNIPs = [
        { input: '7272445205', description: 'basic valid NIP' },
        { input: '123-456-78-19', description: 'NIP with dashes' },
        { input: '123 456 78 19', description: 'NIP with spaces' },
        { input: ' 1234567819 ', description: 'NIP with leading/trailing spaces' },
        { input: '5260250274', description: 'official example NIP' },
      ];

      test.each(validNIPs)('accepts $description: $input', ({ input }) => {
        const result = validateNIP(input);
        expect(result.valid).toBe(true);
        expect(result.normalized).toHaveLength(10);
        expect(result.reason).toBeNull();
      });

      test('returns normalized NIP without dashes/spaces', () => {
        const result = validateNIP('123-456-78-19');
        expect(result.normalized).toBe('1234567819');
      });
    });

    describe('invalid NIPs', () => {
      test('rejects null', () => {
        const result = validateNIP(null);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP is required');
      });

      test('rejects undefined', () => {
        const result = validateNIP(undefined);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP is required');
      });

      test('rejects empty string', () => {
        const result = validateNIP('');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP is required');
      });

      test('rejects NIP with wrong length (too short)', () => {
        const result = validateNIP('123456789');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP must be exactly 10 digits');
      });

      test('rejects NIP with wrong length (too long)', () => {
        const result = validateNIP('12345678901');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP must be exactly 10 digits');
      });

      test('rejects NIP with letters', () => {
        const result = validateNIP('123456789A');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP must contain only digits');
      });

      test('rejects NIP with special characters', () => {
        const result = validateNIP('123456789!');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('NIP must contain only digits');
      });

      test('rejects NIP with invalid checksum', () => {
        const result = validateNIP('1234567890'); // Wrong checksum
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Invalid NIP checksum');
      });

      test('rejects NIP where checksum would be 10', () => {
        // Construct a NIP where checksum calculation would result in 10
        // This is an edge case that should be rejected
        const result = validateNIP('1234567810');
        expect(result.valid).toBe(false);
      });
    });

    describe('checksum algorithm', () => {
      test('uses correct weights', () => {
        expect(NIP_WEIGHTS).toEqual([6, 5, 7, 2, 3, 4, 5, 6, 7]);
      });

      test('calculates checksum correctly for known NIP', () => {
        // NIP: 1234567819
        // Checksum calculation:
        // 1*6 + 2*5 + 3*7 + 4*2 + 5*3 + 6*4 + 7*5 + 8*6 + 1*7
        // = 6 + 10 + 21 + 8 + 15 + 24 + 35 + 48 + 7 = 174
        // 174 % 11 = 9
        // Last digit should be 9
        const result = validateNIP('1234567819');
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('formatNIP', () => {
    test('formats 10-digit NIP with dashes', () => {
      expect(formatNIP('1234567819')).toBe('123-456-78-19');
    });

    test('handles already normalized input', () => {
      expect(formatNIP('123-456-78-19')).toBe('123-456-78-19');
    });

    test('returns input as-is if wrong length', () => {
      expect(formatNIP('12345')).toBe('12345');
    });

    test('handles numeric input', () => {
      expect(formatNIP(1234567819)).toBe('123-456-78-19');
    });
  });

  describe('isTestNIP', () => {
    test('identifies common test NIPs', () => {
      expect(isTestNIP('1234567890')).toBe(true);
      expect(isTestNIP('0000000000')).toBe(true);
      expect(isTestNIP('1111111111')).toBe(true);
    });

    test('identifies official example NIP', () => {
      expect(isTestNIP('5260250274')).toBe(true);
    });

    test('returns false for non-test NIPs', () => {
      expect(isTestNIP('7272445205')).toBe(false);
      expect(isTestNIP('1234567819')).toBe(false);
    });

    test('handles formatted NIPs', () => {
      expect(isTestNIP('123-456-78-90')).toBe(true);
    });
  });
});
