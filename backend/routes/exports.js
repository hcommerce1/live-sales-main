const express = require('express');
const router = express.Router();
const exportService = require('../services/exportService');
const scheduler = require('../scheduler');
const logger = require('../utils/logger');

// Feature gating imports
const featureService = require('../services/feature.service');
const { companyContextMiddleware, requireCompany } = require('../middleware/companyContext');
const {
  requireFeature,
  validateScheduleInterval,
} = require('../middleware/featureGate');
const featureFlags = require('../utils/feature-flags');

// Export fields configuration (centralized in config file)
const exportFields = require('../config/export-fields');

// Legacy FIELD_DEFINITIONS for backward compatibility
// New code should use exportFields.validateFieldsForPlan()
const FIELD_DEFINITIONS = {};
// Build from exportFields for backward compatibility
for (const [datasetKey, dataset] of Object.entries(exportFields.datasets)) {
  for (const field of dataset.fields) {
    FIELD_DEFINITIONS[field.key] = {
      higher_plan: field.plan === 'pro'
    };
  }
}

// Apply company context to all routes
router.use(companyContextMiddleware);

/**
 * GET /api/exports/field-definitions
 * Get field definitions for all datasets with plan-based filtering
 *
 * Returns operators, datasets with fields, and locked fields based on user's plan.
 * Used by ExportWizard to show available fields and operators.
 */
router.get('/field-definitions', requireCompany, async (req, res) => {
  try {
    // Get user's plan from subscription
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    let userPlan = 'free';

    if (req.company?.id) {
      const subscription = await prisma.subscription.findUnique({
        where: { companyId: req.company.id },
        select: { planId: true, status: true }
      });

      // Only active/trialing subscriptions count
      if (subscription && ['active', 'trialing'].includes(subscription.status)) {
        userPlan = subscription.planId || 'free';
      }
    }

    // Get full config based on plan
    const config = exportFields.getFullConfig(userPlan);

    res.json({
      success: true,
      data: {
        currentPlan: userPlan,
        ...config
      }
    });
  } catch (error) {
    logger.error('Failed to get field definitions', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports
 * Get all export configurations
 */
router.get('/', (req, res) => {
  try {
    const exports = exportService.getAllExports();
    res.json({
      success: true,
      count: exports.length,
      data: exports
    });
  } catch (error) {
    logger.error('Failed to get exports', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id
 * Get export configuration by ID
 */
router.get('/:id', (req, res) => {
  try {
    const exportConfig = exportService.getExport(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    res.json({
      success: true,
      data: exportConfig
    });
  } catch (error) {
    logger.error('Failed to get export', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports
 * Create or update export configuration
 *
 * Feature gates:
 * - exports.max_count: limit on number of exports
 * - exports.fields.pro: PRO fields validation
 * - exports.schedule_min_interval: minimum schedule interval
 */
router.post('/',
  requireCompany,
  validateScheduleInterval(),
  async (req, res) => {
    try {
      const config = req.body;
      const userId = req.user.id;
      const companyId = req.company.id;

      if (!config.id) {
        return res.status(400).json({
          success: false,
          error: 'Export ID is required'
        });
      }

      // Check if feature gating is enabled
      const gatingEnabled = await featureFlags.isEnabled('features.gating.enabled', { companyId });

      if (gatingEnabled) {
        // Check if this is a new export (not update)
        const existingExport = exportService.getExport(config.id);
        const isNewExport = !existingExport;

        if (isNewExport) {
          // Check export limit
          const canCreate = await featureService.canCreateExport(companyId);
          if (!canCreate.allowed) {
            return res.status(403).json({
              success: false,
              error: canCreate.reason || 'Limit eksportów wyczerpany',
              code: 'EXPORT_LIMIT_REACHED',
              limit: canCreate.limit,
              usage: canCreate.usage,
              requiredPlan: 'basic'
            });
          }
        }

        // Validate selected fields against plan
        if (config.selected_fields && Array.isArray(config.selected_fields)) {
          const validation = await featureService.validateSelectedFields(
            companyId,
            config.selected_fields,
            FIELD_DEFINITIONS
          );

          if (!validation.valid) {
            return res.status(403).json({
              success: false,
              error: validation.reason,
              code: 'PRO_FIELDS_NOT_AVAILABLE',
              blockedFields: validation.blockedFields,
              requiredPlan: validation.requiredPlan
            });
          }
        }

        // Validate schedule interval
        if (config.schedule_minutes) {
          const minInterval = await featureService.getMinScheduleInterval(companyId);
          if (config.schedule_minutes < minInterval) {
            return res.status(403).json({
              success: false,
              error: `Minimalny interwał dla Twojego planu to ${minInterval} minut`,
              code: 'SCHEDULE_INTERVAL_TOO_LOW',
              requestedInterval: config.schedule_minutes,
              minInterval,
              requiredPlan: config.schedule_minutes < 5 ? 'pro' : 'basic'
            });
          }
        }
      }

      // Save export with company context
      const savedConfig = exportService.saveExport(config.id, {
        ...config,
        companyId // Add company context
      }, userId);

      // Update scheduler if export is active
      if (savedConfig.status === 'active' && savedConfig.schedule_minutes) {
        scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
      } else {
        scheduler.stopExport(savedConfig.id);
      }

      res.json({
        success: true,
        data: savedConfig
      });
    } catch (error) {
      logger.error('Failed to save export', {
        error: error.message,
        companyId: req.company?.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * DELETE /api/exports/:id
 * Delete export configuration
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = exportService.deleteExport(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Stop scheduled job
    scheduler.stopExport(req.params.id);

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete export', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/run
 * Run export immediately
 */
router.post('/:id/run', async (req, res) => {
  const exportId = req.params.id;
  const userId = req.user?.id;
  const companyId = req.company?.id;

  logger.info('=== EXPORT RUN REQUEST ===', {
    exportId,
    userId,
    companyId,
    companyName: req.company?.name,
    headers: {
      'x-company-id': req.headers['x-company-id'],
      'authorization': req.headers['authorization'] ? 'Bearer ...' : 'missing'
    },
    timestamp: new Date().toISOString()
  });

  try {
    logger.info('Calling exportService.runExport', { exportId, userId });
    const result = await exportService.runExport(exportId, userId);

    logger.info('Export completed successfully', {
      exportId,
      userId,
      result: JSON.stringify(result)
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('=== EXPORT FAILED ===', {
      exportId,
      userId,
      companyId,
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id/stats
 * Get export statistics
 */
router.get('/:id/stats', (req, res) => {
  try {
    const stats = exportService.getExportStats(req.params.id);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Add scheduler info
    stats.isScheduled = scheduler.isScheduled(req.params.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get export stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/toggle
 * Toggle export status (active/paused)
 */
router.post('/:id/toggle', (req, res) => {
  try {
    const userId = req.user.id; // From authMiddleware.authenticate()
    const exportConfig = exportService.getExport(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Toggle status
    const newStatus = exportConfig.status === 'active' ? 'paused' : 'active';
    exportConfig.status = newStatus;

    const savedConfig = exportService.saveExport(exportConfig.id, exportConfig, userId);

    // Update scheduler
    if (newStatus === 'active' && savedConfig.schedule_minutes) {
      scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
    } else {
      scheduler.stopExport(savedConfig.id);
    }

    res.json({
      success: true,
      data: savedConfig
    });
  } catch (error) {
    logger.error('Failed to toggle export status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
module.exports.FIELD_DEFINITIONS = FIELD_DEFINITIONS;
