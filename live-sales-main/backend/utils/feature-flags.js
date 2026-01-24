/**
 * Feature Flags Service
 *
 * Backend-only source of truth for feature flags.
 * Frontend NEVER decides - it only reads capabilities.
 *
 * Priority order:
 * 1. Redis override per company: ff:{flagName}:{companyId}
 * 2. Redis global override: ff:{flagName}:global
 * 3. rolloutPercent (deterministic hash of companyId)
 * 4. default from config
 *
 * IMPORTANT: Missing flag = false (never implicit true)
 */

const Redis = require('ioredis');
const crypto = require('crypto');
const logger = require('./logger');
const { FEATURE_FLAGS, isValidFlag, getAllFlagNames, getFlagConfig } = require('../config/feature-flags.config');

// Redis key prefix
const REDIS_PREFIX = 'ff';

/**
 * FeatureFlags class - singleton
 */
class FeatureFlags {
  constructor() {
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection
   * Call this once at app startup
   */
  init() {
    if (this.initialized) {
      return;
    }

    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        this.redis.on('error', (err) => {
          logger.error('FeatureFlags Redis error', { error: err.message });
        });

        this.redis.on('connect', () => {
          logger.info('FeatureFlags Redis connected');
        });

        // Attempt connection
        this.redis.connect().catch((err) => {
          logger.warn('FeatureFlags Redis connection failed, using defaults only', {
            error: err.message,
          });
          this.redis = null;
        });
      } catch (error) {
        logger.warn('FeatureFlags Redis init failed, using defaults only', {
          error: error.message,
        });
        this.redis = null;
      }
    } else {
      logger.warn('REDIS_URL not set, feature flags will use defaults only');
    }

    this.initialized = true;
  }

  /**
   * Build Redis key for flag
   * @param {string} flagName
   * @param {string|null} companyId - null for global override
   * @returns {string}
   */
  _buildKey(flagName, companyId = null) {
    if (companyId) {
      return `${REDIS_PREFIX}:${flagName}:${companyId}`;
    }
    return `${REDIS_PREFIX}:${flagName}:global`;
  }

  /**
   * Deterministic hash for rollout percentage
   * Same companyId always gets same result
   * @param {string} companyId
   * @returns {number} 0-99
   */
  _hashForRollout(companyId) {
    const hash = crypto.createHash('md5').update(companyId).digest('hex');
    // Take first 8 chars of hex, convert to int, mod 100
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  /**
   * Check if feature flag is enabled
   *
   * @param {string} flagName - Flag name from config
   * @param {object} context - Optional context { companyId }
   * @returns {Promise<boolean>}
   */
  async isEnabled(flagName, context = {}) {
    // 1. Validate flag exists
    if (!isValidFlag(flagName)) {
      logger.warn('Unknown feature flag requested', { flagName });
      return false; // Unknown flag = false
    }

    const config = getFlagConfig(flagName);
    const { companyId } = context;

    // 2. Check Redis override per company (if companyId provided)
    if (this.redis && companyId) {
      try {
        const companyOverride = await this.redis.get(this._buildKey(flagName, companyId));
        if (companyOverride !== null) {
          const result = companyOverride === 'true';
          logger.debug('Feature flag from company override', {
            flagName,
            companyId,
            value: result,
          });
          return result;
        }
      } catch (error) {
        logger.warn('Redis read failed for company override', {
          flagName,
          companyId,
          error: error.message,
        });
      }
    }

    // 3. Check Redis global override
    if (this.redis) {
      try {
        const globalOverride = await this.redis.get(this._buildKey(flagName, null));
        if (globalOverride !== null) {
          const result = globalOverride === 'true';
          logger.debug('Feature flag from global override', {
            flagName,
            value: result,
          });
          return result;
        }
      } catch (error) {
        logger.warn('Redis read failed for global override', {
          flagName,
          error: error.message,
        });
      }
    }

    // 4. Check rollout percentage (only if companyId provided and rolloutPercent > 0)
    if (config.rolloutPercent > 0 && companyId) {
      const hash = this._hashForRollout(companyId);
      const result = hash < config.rolloutPercent;
      logger.debug('Feature flag from rollout', {
        flagName,
        companyId,
        hash,
        rolloutPercent: config.rolloutPercent,
        value: result,
      });
      return result;
    }

    // 5. Return default
    logger.debug('Feature flag from default', {
      flagName,
      value: config.default,
    });
    return config.default;
  }

  /**
   * Set override for a flag
   *
   * @param {string} flagName - Flag name
   * @param {boolean} value - New value
   * @param {string|null} companyId - null for global override
   * @returns {Promise<boolean>} success
   */
  async setOverride(flagName, value, companyId = null) {
    if (!isValidFlag(flagName)) {
      logger.warn('Attempt to set unknown feature flag', { flagName });
      return false;
    }

    if (!this.redis) {
      logger.error('Cannot set feature flag override: Redis not available');
      return false;
    }

    const key = this._buildKey(flagName, companyId);
    const stringValue = value ? 'true' : 'false';

    try {
      await this.redis.set(key, stringValue);
      logger.info('Feature flag override set', {
        flagName,
        companyId: companyId || 'global',
        value,
        key,
      });
      return true;
    } catch (error) {
      logger.error('Failed to set feature flag override', {
        flagName,
        companyId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Remove override for a flag (revert to default/rollout)
   *
   * @param {string} flagName
   * @param {string|null} companyId
   * @returns {Promise<boolean>}
   */
  async removeOverride(flagName, companyId = null) {
    if (!isValidFlag(flagName)) {
      return false;
    }

    if (!this.redis) {
      logger.error('Cannot remove feature flag override: Redis not available');
      return false;
    }

    const key = this._buildKey(flagName, companyId);

    try {
      await this.redis.del(key);
      logger.info('Feature flag override removed', {
        flagName,
        companyId: companyId || 'global',
      });
      return true;
    } catch (error) {
      logger.error('Failed to remove feature flag override', {
        flagName,
        companyId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get current override value (for admin/debug)
   *
   * @param {string} flagName
   * @param {string|null} companyId
   * @returns {Promise<{hasOverride: boolean, value: boolean|null}>}
   */
  async getOverride(flagName, companyId = null) {
    if (!isValidFlag(flagName) || !this.redis) {
      return { hasOverride: false, value: null };
    }

    const key = this._buildKey(flagName, companyId);

    try {
      const value = await this.redis.get(key);
      if (value === null) {
        return { hasOverride: false, value: null };
      }
      return { hasOverride: true, value: value === 'true' };
    } catch (error) {
      return { hasOverride: false, value: null };
    }
  }

  /**
   * Get all flags with their current resolved values for a company
   * For admin/debug only - NOT for regular UI
   *
   * @param {string|null} companyId
   * @returns {Promise<object>}
   */
  async getAllFlags(companyId = null) {
    const flags = {};
    const flagNames = getAllFlagNames();

    for (const flagName of flagNames) {
      const config = getFlagConfig(flagName);
      const enabled = await this.isEnabled(flagName, { companyId });
      const override = await this.getOverride(flagName, companyId);
      const globalOverride = companyId ? await this.getOverride(flagName, null) : { hasOverride: false };

      flags[flagName] = {
        enabled,
        default: config.default,
        description: config.description,
        rolloutPercent: config.rolloutPercent,
        hasCompanyOverride: override.hasOverride,
        companyOverrideValue: override.value,
        hasGlobalOverride: globalOverride.hasOverride,
        globalOverrideValue: globalOverride.value,
      };
    }

    return flags;
  }

  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isRedisConnected() {
    return this.redis !== null && this.redis.status === 'ready';
  }
}

// Singleton instance
const featureFlags = new FeatureFlags();

module.exports = featureFlags;
