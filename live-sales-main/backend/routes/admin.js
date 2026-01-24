/**
 * Admin Routes
 *
 * SECURITY:
 * - All endpoints require authentication
 * - Feature flag endpoints require 'admin' role OR DEV environment
 * - All changes are audit logged
 */

const express = require('express');
const router = express.Router();
const featureFlags = require('../utils/feature-flags');
const logger = require('../utils/logger');
const { isValidFlag, getAllFlagNames } = require('../config/feature-flags.config');

/**
 * Check if user has admin access
 * In production: requires 'admin' role
 * In development: allows any authenticated user (for testing)
 */
function requireAdminAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH',
    });
  }

  const isDev = process.env.NODE_ENV === 'development';
  const isAdmin = req.user.role === 'admin';

  if (!isDev && !isAdmin) {
    // Log unauthorized access attempt
    logger.warn('Unauthorized admin access attempt', {
      level: 'SECURITY',
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
  }

  next();
}

/**
 * GET /api/admin/feature-flags
 * Get all feature flags and their current states
 *
 * Query params:
 *   - companyId: optional, get flags resolved for specific company
 */
router.get('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { companyId } = req.query;

    const flags = await featureFlags.getAllFlags(companyId || null);

    logger.info('Feature flags retrieved', {
      userId: req.user.id,
      companyId: companyId || 'global',
      flagCount: Object.keys(flags).length,
    });

    res.json({
      success: true,
      companyId: companyId || null,
      flags,
      redisConnected: featureFlags.isRedisConnected(),
    });
  } catch (error) {
    logger.error('Failed to get feature flags', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve feature flags',
      code: 'FEATURE_FLAGS_ERROR',
    });
  }
});

/**
 * POST /api/admin/feature-flags
 * Set feature flag override
 *
 * Body:
 *   - flagName: string (required)
 *   - value: boolean (required)
 *   - companyId: string (optional, null for global)
 */
router.post('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { flagName, value, companyId } = req.body;

    // Validate input
    if (!flagName || typeof flagName !== 'string') {
      return res.status(400).json({
        error: 'flagName is required and must be a string',
        code: 'INVALID_INPUT',
      });
    }

    if (typeof value !== 'boolean') {
      return res.status(400).json({
        error: 'value is required and must be a boolean',
        code: 'INVALID_INPUT',
      });
    }

    // Validate flag exists
    if (!isValidFlag(flagName)) {
      return res.status(400).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
        validFlags: getAllFlagNames(),
      });
    }

    // Get old value for audit
    const oldOverride = await featureFlags.getOverride(flagName, companyId || null);
    const oldEnabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    // Set new override
    const success = await featureFlags.setOverride(flagName, value, companyId || null);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to set feature flag (Redis unavailable?)',
        code: 'SET_FAILED',
      });
    }

    // Audit log - detailed
    logger.info('Feature flag override changed', {
      level: 'SECURITY',
      action: 'FEATURE_FLAG_CHANGE',
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      flagName,
      companyId: companyId || 'global',
      oldValue: {
        hadOverride: oldOverride.hasOverride,
        overrideValue: oldOverride.value,
        resolvedValue: oldEnabled,
      },
      newValue: value,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      flagName,
      companyId: companyId || null,
      newValue: value,
      previousValue: oldEnabled,
    });
  } catch (error) {
    logger.error('Failed to set feature flag', {
      error: error.message,
      userId: req.user.id,
      body: req.body,
    });

    res.status(500).json({
      error: 'Failed to set feature flag',
      code: 'SET_FAILED',
    });
  }
});

/**
 * DELETE /api/admin/feature-flags
 * Remove feature flag override (revert to default/rollout)
 *
 * Body:
 *   - flagName: string (required)
 *   - companyId: string (optional, null for global)
 */
router.delete('/feature-flags', requireAdminAccess, async (req, res) => {
  try {
    const { flagName, companyId } = req.body;

    // Validate input
    if (!flagName || typeof flagName !== 'string') {
      return res.status(400).json({
        error: 'flagName is required and must be a string',
        code: 'INVALID_INPUT',
      });
    }

    if (!isValidFlag(flagName)) {
      return res.status(400).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
      });
    }

    // Get old value for audit
    const oldOverride = await featureFlags.getOverride(flagName, companyId || null);

    if (!oldOverride.hasOverride) {
      return res.status(404).json({
        error: 'No override exists for this flag',
        code: 'NO_OVERRIDE',
      });
    }

    // Remove override
    const success = await featureFlags.removeOverride(flagName, companyId || null);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to remove feature flag override',
        code: 'REMOVE_FAILED',
      });
    }

    // Get new resolved value
    const newEnabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    // Audit log
    logger.info('Feature flag override removed', {
      level: 'SECURITY',
      action: 'FEATURE_FLAG_REMOVE',
      userId: req.user.id,
      userEmail: req.user.email,
      flagName,
      companyId: companyId || 'global',
      oldOverrideValue: oldOverride.value,
      newResolvedValue: newEnabled,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      flagName,
      companyId: companyId || null,
      overrideRemoved: true,
      newResolvedValue: newEnabled,
    });
  } catch (error) {
    logger.error('Failed to remove feature flag', {
      error: error.message,
      userId: req.user.id,
      body: req.body,
    });

    res.status(500).json({
      error: 'Failed to remove feature flag override',
      code: 'REMOVE_FAILED',
    });
  }
});

/**
 * GET /api/admin/feature-flags/:flagName/check
 * Check specific flag value for a company (quick check)
 */
router.get('/feature-flags/:flagName/check', requireAdminAccess, async (req, res) => {
  try {
    const { flagName } = req.params;
    const { companyId } = req.query;

    if (!isValidFlag(flagName)) {
      return res.status(404).json({
        error: `Unknown feature flag: ${flagName}`,
        code: 'UNKNOWN_FLAG',
      });
    }

    const enabled = await featureFlags.isEnabled(flagName, { companyId: companyId || null });

    res.json({
      flagName,
      companyId: companyId || null,
      enabled,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check feature flag',
      code: 'CHECK_FAILED',
    });
  }
});

module.exports = router;
