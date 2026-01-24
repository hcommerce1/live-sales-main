/**
 * Feature Gate Middleware
 *
 * Middleware do blokowania dostępu na podstawie planu subskrypcji.
 * Używa FeatureService do sprawdzania uprawnień.
 *
 * Feature flag: features.gating.enabled
 *
 * Użycie:
 * router.post('/exports',
 *   authMiddleware,
 *   companyContextMiddleware,
 *   requireFeature('exports.create'),
 *   exportController.create
 * );
 */

const featureService = require('../services/feature.service');
const logger = require('../utils/logger');

/**
 * Custom error dla feature gate
 */
class FeatureGateError extends Error {
  constructor(featureId, reason, requiredPlan = null) {
    super(reason || `Access to feature '${featureId}' denied`);
    this.name = 'FeatureGateError';
    this.featureId = featureId;
    this.requiredPlan = requiredPlan;
    this.status = 403;
    this.code = 'FEATURE_NOT_AVAILABLE';
  }
}

/**
 * Middleware factory - wymaga dostępu do konkretnej funkcji
 *
 * @param {string} featureId - ID feature (np. 'exports.fields.pro')
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/exports', requireFeature('exports.create'), createExport);
 */
function requireFeature(featureId) {
  return async (req, res, next) => {
    try {
      // Require company context
      if (!req.company) {
        logger.warn('Feature gate called without company context', {
          featureId,
          path: req.path,
        });
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      // Check feature access
      const result = await featureService.checkAccess(req.company.id, featureId);

      // Store result in request for later use
      req.featureAccess = req.featureAccess || {};
      req.featureAccess[featureId] = result;

      if (!result.allowed) {
        logger.info('Feature access denied', {
          companyId: req.company.id,
          featureId,
          reason: result.reason,
          requiredPlan: result.requiredPlan,
        });

        return res.status(403).json({
          error: result.reason || `Funkcja '${featureId}' wymaga wyższego planu`,
          code: 'FEATURE_NOT_AVAILABLE',
          featureId,
          requiredPlan: result.requiredPlan,
        });
      }

      // Log grace period warning
      if (result.inGracePeriod) {
        logger.warn('Access granted during grace period', {
          companyId: req.company.id,
          featureId,
        });
      }

      next();
    } catch (error) {
      logger.error('Feature gate middleware error', {
        featureId,
        companyId: req.company?.id,
        error: error.message,
      });
      next(error);
    }
  };
}

/**
 * Middleware factory - wymaga dostępu do wielu funkcji (AND logic)
 *
 * @param {...string} featureIds - IDs features
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/advanced', requireFeatures('exports.fields.pro', 'api.access'), handler);
 */
function requireFeatures(...featureIds) {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      const deniedFeatures = [];
      req.featureAccess = req.featureAccess || {};

      for (const featureId of featureIds) {
        const result = await featureService.checkAccess(req.company.id, featureId);
        req.featureAccess[featureId] = result;

        if (!result.allowed) {
          deniedFeatures.push({
            featureId,
            reason: result.reason,
            requiredPlan: result.requiredPlan,
          });
        }
      }

      if (deniedFeatures.length > 0) {
        const highestPlan = findHighestRequiredPlan(deniedFeatures);

        return res.status(403).json({
          error: 'Brak dostępu do wymaganych funkcji',
          code: 'FEATURES_NOT_AVAILABLE',
          deniedFeatures,
          requiredPlan: highestPlan,
        });
      }

      next();
    } catch (error) {
      logger.error('Feature gate middleware error', {
        featureIds,
        companyId: req.company?.id,
        error: error.message,
      });
      next(error);
    }
  };
}

/**
 * Middleware factory - wymaga dostępu do przynajmniej jednej funkcji (OR logic)
 *
 * @param {...string} featureIds - IDs features
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/data', requireAnyFeature('baselinker.orders', 'baselinker.products'), handler);
 */
function requireAnyFeature(...featureIds) {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      req.featureAccess = req.featureAccess || {};
      let hasAccess = false;

      for (const featureId of featureIds) {
        const result = await featureService.checkAccess(req.company.id, featureId);
        req.featureAccess[featureId] = result;

        if (result.allowed) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Brak dostępu do żadnej z wymaganych funkcji',
          code: 'FEATURES_NOT_AVAILABLE',
          requiredFeatures: featureIds,
        });
      }

      next();
    } catch (error) {
      logger.error('Feature gate middleware error', {
        featureIds,
        companyId: req.company?.id,
        error: error.message,
      });
      next(error);
    }
  };
}

/**
 * Middleware - sprawdza limit bez blokowania (soft check)
 * Dodaje informację do req.featureAccess ale nie blokuje
 *
 * @param {string} featureId - ID feature
 * @returns {Function} Express middleware
 */
function checkFeature(featureId) {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        req.featureAccess = { [featureId]: { allowed: false, reason: 'No company context' } };
        return next();
      }

      const result = await featureService.checkAccess(req.company.id, featureId);
      req.featureAccess = req.featureAccess || {};
      req.featureAccess[featureId] = result;

      next();
    } catch (error) {
      logger.error('Feature check middleware error', {
        featureId,
        error: error.message,
      });
      req.featureAccess = { [featureId]: { allowed: false, reason: 'Check failed' } };
      next();
    }
  };
}

/**
 * Middleware - waliduje wybrane pola w body pod kątem PRO features
 *
 * @param {string} bodyField - nazwa pola w body z wybranymi polami
 * @param {Object} fieldDefinitions - definicje pól z higher_plan flag
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/exports',
 *   validateSelectedFields('selectedFields', FIELD_DEFINITIONS),
 *   createExport
 * );
 */
function validateSelectedFields(bodyField, fieldDefinitions) {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      const selectedFields = req.body[bodyField];

      if (!selectedFields || !Array.isArray(selectedFields)) {
        return next(); // No fields to validate
      }

      const result = await featureService.validateSelectedFields(
        req.company.id,
        selectedFields,
        fieldDefinitions
      );

      if (!result.valid) {
        logger.info('PRO fields blocked', {
          companyId: req.company.id,
          blockedFields: result.blockedFields,
        });

        return res.status(403).json({
          error: result.reason,
          code: 'PRO_FIELDS_NOT_AVAILABLE',
          blockedFields: result.blockedFields,
          requiredPlan: result.requiredPlan,
        });
      }

      next();
    } catch (error) {
      logger.error('Field validation middleware error', {
        bodyField,
        companyId: req.company?.id,
        error: error.message,
      });
      next(error);
    }
  };
}

/**
 * Middleware - sprawdza minimalny interwał schedulera
 *
 * @returns {Function} Express middleware
 */
function validateScheduleInterval() {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      const requestedInterval = req.body.scheduleMinutes;

      if (!requestedInterval) {
        return next(); // No interval to validate
      }

      const minInterval = await featureService.getMinScheduleInterval(req.company.id);

      if (requestedInterval < minInterval) {
        return res.status(403).json({
          error: `Minimalny interwał dla Twojego planu to ${minInterval} minut`,
          code: 'SCHEDULE_INTERVAL_TOO_LOW',
          requestedInterval,
          minInterval,
          requiredPlan: requestedInterval < 5 ? 'pro' : 'basic',
        });
      }

      next();
    } catch (error) {
      logger.error('Schedule interval validation error', {
        companyId: req.company?.id,
        error: error.message,
      });
      next(error);
    }
  };
}

/**
 * Helper - znajduje najwyższy wymagany plan z listy
 */
function findHighestRequiredPlan(deniedFeatures) {
  const planPriority = { free: 0, basic: 1, pro: 2 };
  let highest = 'basic';

  for (const denied of deniedFeatures) {
    if (denied.requiredPlan && planPriority[denied.requiredPlan] > planPriority[highest]) {
      highest = denied.requiredPlan;
    }
  }

  return highest;
}

module.exports = {
  requireFeature,
  requireFeatures,
  requireAnyFeature,
  checkFeature,
  validateSelectedFields,
  validateScheduleInterval,
  FeatureGateError,
};
