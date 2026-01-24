/**
 * Feature Flag Middleware
 *
 * Blocks requests before reaching controller if feature flag is disabled.
 * Backend-only enforcement - frontend NEVER decides.
 *
 * Usage:
 *   router.get('/new-feature',
 *     featureFlagMiddleware('company.enabled'),
 *     controller.newFeature
 *   );
 */

const featureFlags = require('../utils/feature-flags');
const logger = require('../utils/logger');

/**
 * Feature Flag Middleware Factory
 *
 * @param {string} flagName - The feature flag to check
 * @param {object} options - Optional configuration
 * @param {function} options.getCompanyId - Function to extract companyId from req (default: req.company?.id)
 * @returns {function} Express middleware
 */
function featureFlagMiddleware(flagName, options = {}) {
  const { getCompanyId } = options;

  return async (req, res, next) => {
    try {
      // Extract companyId from request
      // Priority: custom function > req.company.id > null
      let companyId = null;

      if (typeof getCompanyId === 'function') {
        companyId = getCompanyId(req);
      } else if (req.company && req.company.id) {
        companyId = req.company.id;
      }

      // Check if feature is enabled
      const isEnabled = await featureFlags.isEnabled(flagName, { companyId });

      if (!isEnabled) {
        // Log security event
        logger.warn('Feature flag blocked request', {
          level: 'SECURITY',
          flagName,
          companyId: companyId || 'none',
          userId: req.user?.id || 'anonymous',
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        // Return explicit error
        return res.status(403).json({
          error: 'Feature not available',
          code: 'FEATURE_DISABLED',
          feature: flagName,
          message: 'This feature is not currently enabled for your account.',
        });
      }

      // Feature is enabled - continue to controller
      next();
    } catch (error) {
      // On error, log and block (fail-secure)
      logger.error('Feature flag middleware error', {
        level: 'SECURITY',
        flagName,
        error: error.message,
        path: req.path,
      });

      return res.status(500).json({
        error: 'Feature check failed',
        code: 'FEATURE_CHECK_ERROR',
      });
    }
  };
}

/**
 * Require multiple feature flags (AND logic)
 *
 * @param {string[]} flagNames - Array of flag names
 * @param {object} options
 * @returns {function} Express middleware
 */
function requireAllFeatures(flagNames, options = {}) {
  return async (req, res, next) => {
    try {
      const { getCompanyId } = options;
      let companyId = null;

      if (typeof getCompanyId === 'function') {
        companyId = getCompanyId(req);
      } else if (req.company && req.company.id) {
        companyId = req.company.id;
      }

      // Check all flags
      const results = await Promise.all(
        flagNames.map(async (flagName) => ({
          flagName,
          enabled: await featureFlags.isEnabled(flagName, { companyId }),
        }))
      );

      const disabled = results.filter((r) => !r.enabled);

      if (disabled.length > 0) {
        logger.warn('Feature flags blocked request (multiple)', {
          level: 'SECURITY',
          disabledFlags: disabled.map((d) => d.flagName),
          companyId: companyId || 'none',
          userId: req.user?.id || 'anonymous',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        return res.status(403).json({
          error: 'Features not available',
          code: 'FEATURE_DISABLED',
          features: disabled.map((d) => d.flagName),
          message: 'One or more required features are not enabled for your account.',
        });
      }

      next();
    } catch (error) {
      logger.error('Feature flags middleware error (multiple)', {
        level: 'SECURITY',
        flagNames,
        error: error.message,
        path: req.path,
      });

      return res.status(500).json({
        error: 'Feature check failed',
        code: 'FEATURE_CHECK_ERROR',
      });
    }
  };
}

/**
 * Require any of the feature flags (OR logic)
 *
 * @param {string[]} flagNames - Array of flag names
 * @param {object} options
 * @returns {function} Express middleware
 */
function requireAnyFeature(flagNames, options = {}) {
  return async (req, res, next) => {
    try {
      const { getCompanyId } = options;
      let companyId = null;

      if (typeof getCompanyId === 'function') {
        companyId = getCompanyId(req);
      } else if (req.company && req.company.id) {
        companyId = req.company.id;
      }

      // Check all flags
      for (const flagName of flagNames) {
        const enabled = await featureFlags.isEnabled(flagName, { companyId });
        if (enabled) {
          return next();
        }
      }

      // None enabled
      logger.warn('Feature flags blocked request (any)', {
        level: 'SECURITY',
        flagNames,
        companyId: companyId || 'none',
        userId: req.user?.id || 'anonymous',
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Features not available',
        code: 'FEATURE_DISABLED',
        features: flagNames,
        message: 'None of the required features are enabled for your account.',
      });
    } catch (error) {
      logger.error('Feature flags middleware error (any)', {
        level: 'SECURITY',
        flagNames,
        error: error.message,
        path: req.path,
      });

      return res.status(500).json({
        error: 'Feature check failed',
        code: 'FEATURE_CHECK_ERROR',
      });
    }
  };
}

module.exports = {
  featureFlagMiddleware,
  requireAllFeatures,
  requireAnyFeature,
};
