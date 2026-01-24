/**
 * NIP Lookup Service
 *
 * Orchestrates NIP lookup across multiple providers with fallback chain.
 * Priority order:
 * 1. GusBir1Provider (official, free)
 * 2. ManualFallbackProvider (last resort)
 */

const logger = require('../../utils/logger');
const { validateNip, normalizeNip, isTestNip } = require('./nip-validator');
const { GusBir1Provider } = require('./gus-bir1.provider');
const { ManualFallbackProvider } = require('./manual-fallback.provider');

/**
 * NIP Lookup Service
 */
class NipLookupService {
  constructor(options = {}) {
    // Initialize providers
    this.providers = options.providers || [
      new GusBir1Provider(),
      new ManualFallbackProvider(),
    ];

    // Sort by priority (lower = first)
    this.providers.sort((a, b) => a.priority - b.priority);

    // Cache settings
    this.cache = options.cache || null; // Redis client
    this.cacheTtl = options.cacheTtl || 24 * 60 * 60; // 24 hours
  }

  /**
   * Lookup company data by NIP
   *
   * @param {string} nip - NIP to lookup
   * @param {Object} options
   * @param {boolean} options.skipCache - Skip cache lookup
   * @param {boolean} options.allowManual - Allow manual fallback result
   * @returns {Promise<NipLookupResult>}
   */
  async lookup(nip, options = {}) {
    const { skipCache = false, allowManual = true } = options;

    // 1. Validate NIP checksum first
    const validation = validateNip(nip);
    if (!validation.valid) {
      const error = new Error(validation.reason);
      error.code = 'INVALID_NIP';
      throw error;
    }

    const normalizedNip = validation.normalized;

    // 2. Check for test NIPs in production
    if (process.env.NODE_ENV === 'production' && isTestNip(normalizedNip)) {
      const error = new Error('Test NIP not allowed in production');
      error.code = 'TEST_NIP_NOT_ALLOWED';
      throw error;
    }

    // 3. Check cache
    if (!skipCache && this.cache) {
      const cached = await this._getFromCache(normalizedNip);
      if (cached) {
        logger.debug('NIP lookup: Cache hit', { nip: normalizedNip });
        return cached;
      }
    }

    // 4. Try providers in priority order
    let lastError = null;

    for (const provider of this.providers) {
      // Skip manual fallback if not allowed
      if (!allowManual && provider.name === 'MANUAL_FALLBACK') {
        continue;
      }

      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          logger.debug('NIP lookup: Provider not available', { provider: provider.name });
          continue;
        }

        logger.debug('NIP lookup: Trying provider', { provider: provider.name, nip: normalizedNip });

        const result = await provider.lookup(normalizedNip);

        if (result) {
          // Cache successful result (unless it requires manual entry)
          if (!result.requiresManualEntry && this.cache) {
            await this._setCache(normalizedNip, result);
          }

          logger.info('NIP lookup: Success', {
            nip: normalizedNip,
            provider: provider.name,
            requiresManual: result.requiresManualEntry || false,
          });

          return result;
        }
      } catch (error) {
        logger.warn('NIP lookup: Provider failed', {
          provider: provider.name,
          nip: normalizedNip,
          error: error.message,
        });
        lastError = error;
      }
    }

    // 5. All providers failed
    logger.error('NIP lookup: All providers failed', { nip: normalizedNip });

    if (lastError) {
      throw lastError;
    }

    const error = new Error('NIP not found in any provider');
    error.code = 'NIP_NOT_FOUND';
    throw error;
  }

  /**
   * Validate NIP only (no lookup)
   */
  validate(nip) {
    return validateNip(nip);
  }

  /**
   * Normalize NIP
   */
  normalize(nip) {
    return normalizeNip(nip);
  }

  /**
   * Get from cache
   */
  async _getFromCache(nip) {
    if (!this.cache) return null;

    try {
      const key = `nip:lookup:${nip}`;
      const cached = await this.cache.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('NIP cache read error', { error: error.message });
      return null;
    }
  }

  /**
   * Set cache
   */
  async _setCache(nip, result) {
    if (!this.cache) return;

    try {
      const key = `nip:lookup:${nip}`;
      await this.cache.setex(key, this.cacheTtl, JSON.stringify(result));
    } catch (error) {
      logger.warn('NIP cache write error', { error: error.message });
    }
  }

  /**
   * Clear cache for NIP
   */
  async clearCache(nip) {
    if (!this.cache) return;

    const normalized = normalizeNip(nip);
    const key = `nip:lookup:${normalized}`;
    await this.cache.del(key);
  }

  /**
   * Get provider status
   */
  async getProviderStatus() {
    const status = [];

    for (const provider of this.providers) {
      const isAvailable = await provider.isAvailable();
      status.push({
        name: provider.name,
        priority: provider.priority,
        available: isAvailable,
      });
    }

    return status;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance
 */
function getNipLookupService(options) {
  if (!instance) {
    instance = new NipLookupService(options);
  }
  return instance;
}

module.exports = {
  NipLookupService,
  getNipLookupService,
};
