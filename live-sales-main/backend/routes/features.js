/**
 * Features Routes
 *
 * Endpoints dla feature gating i capabilities.
 * Feature flag: features.gating.enabled
 *
 * Endpoints:
 * - GET /api/features/capabilities - Get current capabilities for frontend
 * - GET /api/features/check/:featureId - Check specific feature access
 * - GET /api/features/usage - Get usage summary
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const featureService = require('../services/feature.service');
const authMiddleware = require('../middleware/auth');
const { companyContextMiddleware, requireCompany } = require('../middleware/companyContext');
const { FEATURES, PLANS } = require('../config/plans');

// All routes require authentication and company context
router.use(authMiddleware.authenticate());
router.use(companyContextMiddleware);

/**
 * GET /api/features/capabilities
 *
 * Returns all capabilities for the current company.
 * Used by frontend to show/hide features and display limits.
 */
router.get('/capabilities', requireCompany, async (req, res) => {
  try {
    const capabilities = await featureService.getCapabilities(req.company.id);

    res.json({
      success: true,
      ...capabilities,
    });
  } catch (error) {
    logger.error('Failed to get capabilities', {
      companyId: req.company?.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve capabilities',
      code: 'CAPABILITIES_ERROR',
    });
  }
});

/**
 * GET /api/features/check/:featureId
 *
 * Check access to a specific feature.
 * Useful for conditional UI rendering.
 */
router.get('/check/:featureId', requireCompany, async (req, res) => {
  try {
    const { featureId } = req.params;

    // Validate feature exists
    if (!FEATURES[featureId]) {
      return res.status(400).json({
        error: `Unknown feature: ${featureId}`,
        code: 'UNKNOWN_FEATURE',
      });
    }

    const access = await featureService.checkAccess(req.company.id, featureId);

    res.json({
      success: true,
      featureId,
      ...access,
    });
  } catch (error) {
    logger.error('Failed to check feature', {
      companyId: req.company?.id,
      featureId: req.params.featureId,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to check feature access',
      code: 'FEATURE_CHECK_ERROR',
    });
  }
});

/**
 * GET /api/features/usage
 *
 * Get usage summary for countable features.
 */
router.get('/usage', requireCompany, async (req, res) => {
  try {
    // Get usage for key countable features
    const usage = {
      exports: {
        current: await featureService.getUsage(req.company.id, 'exports.max_count'),
        feature: 'exports.max_count',
      },
      teamMembers: {
        current: await featureService.getUsage(req.company.id, 'team.max_members'),
        feature: 'team.max_members',
      },
    };

    // Add limits from capabilities
    const capabilities = await featureService.getCapabilities(req.company.id);

    res.json({
      success: true,
      usage: {
        exports: {
          ...usage.exports,
          limit: capabilities.limits.exports.max,
          remaining: capabilities.limits.exports.max - usage.exports.current,
        },
        teamMembers: {
          ...usage.teamMembers,
          limit: capabilities.limits.teamMembers.max,
          remaining: capabilities.limits.teamMembers.max - usage.teamMembers.current,
        },
      },
      plan: capabilities.plan,
      status: capabilities.status,
    });
  } catch (error) {
    logger.error('Failed to get usage', {
      companyId: req.company?.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve usage',
      code: 'USAGE_ERROR',
    });
  }
});

/**
 * GET /api/features/plans
 *
 * Get available plans with their features.
 * Public information about what each plan offers.
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = Object.values(PLANS).map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: {
        monthly: plan.price.monthly,
        yearly: plan.price.yearly,
        monthlyFormatted: formatPrice(plan.price.monthly),
        yearlyFormatted: formatPrice(plan.price.yearly),
      },
      features: plan.features,
      highlighted: plan.id === 'pro', // Highlight Pro plan
    }));

    res.json({
      success: true,
      plans,
    });
  } catch (error) {
    logger.error('Failed to get plans', { error: error.message });

    res.status(500).json({
      error: 'Failed to retrieve plans',
      code: 'PLANS_ERROR',
    });
  }
});

/**
 * GET /api/features/definitions
 *
 * Get feature definitions.
 * Useful for building dynamic UIs.
 */
router.get('/definitions', async (req, res) => {
  try {
    const definitions = Object.entries(FEATURES).map(([id, def]) => ({
      id,
      name: def.name,
      description: def.description,
      category: def.category,
      limitType: def.limitType,
    }));

    // Group by category
    const byCategory = definitions.reduce((acc, def) => {
      if (!acc[def.category]) {
        acc[def.category] = [];
      }
      acc[def.category].push(def);
      return acc;
    }, {});

    res.json({
      success: true,
      features: definitions,
      byCategory,
    });
  } catch (error) {
    logger.error('Failed to get feature definitions', { error: error.message });

    res.status(500).json({
      error: 'Failed to retrieve feature definitions',
      code: 'DEFINITIONS_ERROR',
    });
  }
});

/**
 * POST /api/features/validate-fields
 *
 * Validate if selected fields are available for current plan.
 * Used before creating/updating exports.
 */
router.post('/validate-fields', requireCompany, async (req, res) => {
  try {
    const { selectedFields, fieldDefinitions } = req.body;

    if (!selectedFields || !Array.isArray(selectedFields)) {
      return res.status(400).json({
        error: 'selectedFields must be an array',
        code: 'INVALID_INPUT',
      });
    }

    if (!fieldDefinitions || typeof fieldDefinitions !== 'object') {
      return res.status(400).json({
        error: 'fieldDefinitions must be an object',
        code: 'INVALID_INPUT',
      });
    }

    const result = await featureService.validateSelectedFields(
      req.company.id,
      selectedFields,
      fieldDefinitions
    );

    res.json({
      success: true,
      valid: result.valid,
      blockedFields: result.blockedFields || [],
      reason: result.reason || null,
      requiredPlan: result.requiredPlan || null,
    });
  } catch (error) {
    logger.error('Failed to validate fields', {
      companyId: req.company?.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to validate fields',
      code: 'VALIDATION_ERROR',
    });
  }
});

/**
 * Format price in PLN
 */
function formatPrice(grosze) {
  const zloty = grosze / 100;
  return zloty.toLocaleString('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  });
}

module.exports = router;
