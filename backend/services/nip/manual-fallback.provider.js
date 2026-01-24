/**
 * Manual Fallback Provider
 *
 * Last resort when external APIs are unavailable.
 * Returns a result that requires manual data entry.
 * Only validates NIP checksum.
 */

const logger = require('../../utils/logger');
const { INipProvider } = require('./nip-provider.interface');
const { validateNip } = require('./nip-validator');

/**
 * Manual Fallback Provider Implementation
 */
class ManualFallbackProvider extends INipProvider {
  constructor() {
    super();
  }

  get name() {
    return 'MANUAL_FALLBACK';
  }

  get priority() {
    return 99; // Lowest priority - last resort
  }

  /**
   * Always available as it doesn't depend on external services
   */
  async isAvailable() {
    return true;
  }

  /**
   * Returns a shell result requiring manual completion
   */
  async lookup(nip) {
    const validation = validateNip(nip);

    if (!validation.valid) {
      logger.warn('Manual fallback: Invalid NIP checksum', { nip, reason: validation.reason });
      return null;
    }

    logger.info('Manual fallback: Returning shell result for manual entry', { nip });

    return {
      nip: validation.normalized,
      name: null, // User must provide
      regon: null,
      krs: null,
      address: {
        street: null,
        city: null,
        postalCode: null,
        country: 'PL',
      },
      vatStatus: null,
      source: 'manual',
      requiresManualEntry: true,
    };
  }
}

module.exports = { ManualFallbackProvider };
