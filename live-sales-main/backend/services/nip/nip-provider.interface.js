/**
 * NIP Provider Interface
 *
 * Abstract interface for NIP lookup providers.
 * Implementations: GusBir1Provider, Nip24Provider, ManualFallbackProvider
 */

/**
 * @typedef {Object} NipLookupResult
 * @property {string} nip - Normalized NIP (10 digits)
 * @property {string|null} name - Company name
 * @property {string|null} regon - REGON number
 * @property {string|null} krs - KRS number
 * @property {Object} address - Address object
 * @property {string|null} address.street
 * @property {string|null} address.city
 * @property {string|null} address.postalCode
 * @property {string} address.country
 * @property {'active'|'exempt'|'inactive'|null} vatStatus
 * @property {'gus_bir1'|'nip24'|'manual'} source
 * @property {boolean} [requiresManualEntry] - True if data needs manual completion
 */

/**
 * Base interface for NIP providers
 * @interface
 */
class INipProvider {
  /**
   * Provider name for logging
   * @type {string}
   */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Priority for fallback chain (lower = try first)
   * @type {number}
   */
  get priority() {
    throw new Error('Not implemented');
  }

  /**
   * Check if provider is available (API keys configured, service up)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('Not implemented');
  }

  /**
   * Lookup company data by NIP
   * @param {string} nip - Normalized 10-digit NIP
   * @returns {Promise<NipLookupResult|null>} - Result or null if not found
   */
  async lookup(nip) {
    throw new Error('Not implemented');
  }
}

module.exports = { INipProvider };
