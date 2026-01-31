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
// SEC-1: Resource ownership middleware for authorization
const { requireOwnership } = require('../middleware/resourceOwnership');
// Rate limiting for export runs
const { exportLimiter } = require('../middleware/rateLimiter');

// Legacy FIELD_DEFINITIONS - cleared, no plan-based restrictions
const FIELD_DEFINITIONS = {};

// Field definitions service (new dataset structure)
const fieldDefinitionsService = require('../services/export/fieldDefinitionsService');
const { decrypt } = require('../utils/crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
    // Get BaseLinker token from company secrets
    let token = null;

    if (req.company?.id) {
      const secret = await prisma.companySecret.findFirst({
        where: {
          companyId: req.company.id,
          secretType: 'baselinker_token'
        }
      });

      if (secret?.encryptedValue) {
        try {
          token = decrypt(secret.encryptedValue);
        } catch (e) {
          logger.warn('Failed to decrypt BaseLinker token');
        }
      }
    }

    // Get field definitions from service
    const definitions = await fieldDefinitionsService.getFieldDefinitions(token);
    const dynamicFields = definitions.dynamicFields || {};

    // Log dynamic fields for debugging
    logger.info('Dynamic fields loaded for field-definitions', {
      priceGroupsCount: (dynamicFields.priceGroups || []).length,
      warehousesCount: (dynamicFields.warehouses || []).length,
      orderExtraFieldsCount: (dynamicFields.orderExtraFields || []).length
    });

    // Transform to format expected by frontend
    const datasets = {};
    for (const ds of definitions.datasets) {
      // Merge dynamic fields into field groups
      const enrichedFieldGroups = ds.fieldGroups.map(group => {
        if (group.dynamic && group.source) {
          // Find matching dynamic fields for this source
          const sourceFields = dynamicFields[group.source] || [];
          return {
            ...group,
            fields: [...group.fields, ...sourceFields.map(f => ({ ...f, group: group.label }))]
          };
        }
        return group;
      });

      datasets[ds.id] = {
        id: ds.id,
        label: ds.label || ds.name,
        description: ds.description,
        requiresInventory: ds.requiresInventory || false,
        requiresStorage: ds.requiresStorage || false,
        requiresIntegration: ds.requiresIntegration || false,
        requiresDataType: ds.requiresDataType || false,
        dataTypes: ds.dataTypes || [],
        availableFilters: ds.availableFilters || [],
        // Flatten fieldGroups to fields array for frontend compatibility
        fields: enrichedFieldGroups.flatMap(g =>
          g.fields.map(f => ({ ...f, group: g.label }))
        ),
        fieldGroups: enrichedFieldGroups
      };
    }

    // Filter operators
    const operators = [
      { value: '=', label: 'równe' },
      { value: '!=', label: 'różne od' },
      { value: '>', label: 'większe niż' },
      { value: '>=', label: 'większe lub równe' },
      { value: '<', label: 'mniejsze niż' },
      { value: '<=', label: 'mniejsze lub równe' },
      { value: 'contains', label: 'zawiera' },
      { value: 'not_contains', label: 'nie zawiera' },
      { value: 'starts_with', label: 'zaczyna się od' },
      { value: 'ends_with', label: 'kończy się na' }
    ];

    res.json({
      success: true,
      data: {
        currentPlan: 'free',
        operators,
        datasets,
        dynamicFields: definitions.dynamicFields || {},
        supportedCurrencies: definitions.supportedCurrencies || ['PLN', 'EUR', 'USD', 'GBP'],
        currencyRateSources: definitions.currencyRateSources || []
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
 * GET /api/exports/v2/field-definitions
 * Get field definitions for all datasets (new structure)
 *
 * Returns all datasets with field groups, dynamic fields from BaseLinker,
 * and currency conversion options.
 *
 * Query params:
 * - inventoryId: ID katalogu (dla pól tekstowych produktów)
 */
router.get('/v2/field-definitions', requireCompany, async (req, res) => {
  try {
    // Get BaseLinker token from company secrets
    let token = null;

    if (req.company?.id) {
      const secret = await prisma.companySecret.findFirst({
        where: {
          companyId: req.company.id,
          secretType: 'baselinker_token'
        }
      });

      if (secret?.encryptedValue) {
        try {
          token = decrypt(secret.encryptedValue);
        } catch (e) {
          logger.warn('Failed to decrypt BaseLinker token');
        }
      }
    }

    const options = {};

    if (req.query.inventoryId) {
      options.inventoryId = parseInt(req.query.inventoryId, 10);
    }

    // Get field definitions (with dynamic fields if token available)
    const definitions = await fieldDefinitionsService.getFieldDefinitions(token, options);

    res.json({
      success: true,
      data: definitions
    });

  } catch (error) {
    logger.error('Failed to get v2 field definitions', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/v2/dataset/:datasetId/fields
 * Get field definitions for a specific dataset
 */
router.get('/v2/dataset/:datasetId/fields', requireCompany, async (req, res) => {
  try {
    const { datasetId } = req.params;

    // Get BaseLinker token
    let token = null;

    if (req.company?.id) {
      const secret = await prisma.companySecret.findFirst({
        where: {
          companyId: req.company.id,
          secretType: 'baselinker_token'
        }
      });

      if (secret?.encryptedValue) {
        try {
          token = decrypt(secret.encryptedValue);
        } catch (e) {
          logger.warn('Failed to decrypt BaseLinker token');
        }
      }
    }

    const options = {};

    if (req.query.inventoryId) {
      options.inventoryId = parseInt(req.query.inventoryId, 10);
    }

    const dataset = await fieldDefinitionsService.getDatasetFieldDefinitions(datasetId, token, options);

    if (!dataset) {
      return res.status(404).json({
        success: false,
        error: `Dataset not found: ${datasetId}`
      });
    }

    res.json({
      success: true,
      data: dataset
    });

  } catch (error) {
    logger.error('Failed to get dataset field definitions', {
      datasetId: req.params.datasetId,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports
 * Get all export configurations for current company
 * SEC-1: Now filters by companyId to prevent cross-company data leak
 */
router.get('/', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;
    const exports = await exportService.getAllExportsByCompany(companyId);

    // SEC-2: Sanitize exports before returning (remove sensitive data)
    const sanitizedExports = exports.map(exp => exportService.sanitizeExport(exp));

    res.json({
      success: true,
      count: sanitizedExports.length,
      data: sanitizedExports
    });
  } catch (error) {
    logger.error('Failed to get exports', { error: error.message, companyId: req.company?.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id
 * Get export configuration by ID
 * SEC-1: requireOwnership validates company owns this export
 */
router.get('/:id', requireCompany, requireOwnership('export'), async (req, res) => {
  try {
    const exportConfig = await exportService.getExportById(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // SEC-2: Sanitize export before returning (remove sensitive data)
    const sanitizedExport = exportService.sanitizeExport(exportConfig);

    res.json({
      success: true,
      data: sanitizedExport
    });
  } catch (error) {
    logger.error('Failed to get export', { error: error.message, exportId: req.params.id });
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

      // Validate duplicate sheet URLs
      const sheetUrls = [];
      if (config.sheetsUrl) sheetUrls.push(config.sheetsUrl);
      if (config.sheets_config && Array.isArray(config.sheets_config)) {
        sheetUrls.push(...config.sheets_config.map(s => s.sheet_url).filter(Boolean));
      }
      if (config.sheets && Array.isArray(config.sheets)) {
        sheetUrls.push(...config.sheets.map(s => s.sheet_url || s.sheetUrl).filter(Boolean));
      }

      // Check for duplicates within the same export config
      const seenSheets = new Map(); // key: "spreadsheetId:gid" -> url
      for (const url of sheetUrls) {
        const { spreadsheetId, gid } = exportService.extractSheetIdentifiers(url);
        if (spreadsheetId) {
          const key = `${spreadsheetId}:${gid}`;
          if (seenSheets.has(key)) {
            return res.status(400).json({
              success: false,
              error: 'Ten sam arkusz nie może być użyty wielokrotnie w jednym eksporcie.',
              code: 'DUPLICATE_SHEET_IN_EXPORT',
              duplicateUrl: url
            });
          }
          seenSheets.set(key, url);
        }
      }

      // Check for duplicates across other exports in the company
      for (const sheetUrl of sheetUrls) {
        const duplicateCheck = await exportService.checkDuplicateSheetUrl(
          sheetUrl,
          companyId,
          config.id // Exclude current export (for updates)
        );

        if (duplicateCheck.isDuplicate) {
          return res.status(400).json({
            success: false,
            error: `Ten arkusz jest już używany przez inny eksport: "${duplicateCheck.existingExportName}"`,
            code: 'DUPLICATE_SHEET_URL',
            existingExportId: duplicateCheck.existingExportId,
            existingExportName: duplicateCheck.existingExportName
          });
        }
      }

      // Save export with company context (now saves to database)
      const savedConfig = await exportService.saveExport(config.id, {
        ...config,
        companyId // Add company context
      }, userId);

      // Update scheduler if export is active
      if (savedConfig.status === 'active' && savedConfig.schedule_minutes) {
        scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
      } else {
        scheduler.stopExport(savedConfig.id);
      }

      // SEC-2: Sanitize before returning
      const sanitizedConfig = exportService.sanitizeExport(savedConfig);

      res.json({
        success: true,
        data: sanitizedConfig
      });
    } catch (error) {
      logger.error('Failed to save export', {
        error: error.message,
        code: error.code,
        companyId: req.company?.id
      });

      // Handle specific error codes
      if (error.code === 'DUPLICATE_CHECK_FAILED') {
        return res.status(503).json({
          success: false,
          error: error.message,
          code: 'DUPLICATE_CHECK_FAILED'
        });
      }

      // Handle Prisma unique constraint violation (race condition fallback)
      if (error.code === 'P2002' && error.meta?.target?.includes('unique_sheet_per_company')) {
        return res.status(400).json({
          success: false,
          error: 'Ten arkusz jest już używany przez inny eksport w Twojej firmie.',
          code: 'DUPLICATE_SHEET_URL'
        });
      }

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
 * SEC-1: requireOwnership validates company owns this export
 */
router.delete('/:id', requireCompany, requireOwnership('export'), async (req, res) => {
  try {
    const deleted = await exportService.deleteExport(req.params.id);

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
    logger.error('Failed to delete export', { error: error.message, exportId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/run
 * Run export immediately
 * SEC-1: requireOwnership validates company owns this export
 *
 * Request body (optional):
 * - runId: Client-provided idempotency key. If same runId is sent again,
 *          returns cached result instead of re-running export.
 * - trigger: 'manual' or 'scheduler' (default: 'manual')
 *
 * Response includes:
 * - cached: true if this was a duplicate request (same runId)
 * - inProgress: true if export is still running (status=pending)
 * - stale: true if pending > 15 min (alert signal)
 * - runId: Database record ID
 * - clientRunId: The idempotency key (provided or auto-generated)
 */
router.post('/:id/run', requireCompany, requireOwnership('export'), exportLimiter, async (req, res) => {
  const exportId = req.params.id;
  const userId = req.user?.id;
  const companyId = req.company?.id;
  const { runId, trigger } = req.body || {};

  logger.info('=== EXPORT RUN REQUEST ===', {
    exportId,
    userId,
    companyId,
    runId: runId || '(auto-generated)',
    trigger: trigger || 'manual',
    companyName: req.company?.name,
    headers: {
      'x-company-id': req.headers['x-company-id'],
      'authorization': req.headers['authorization'] ? 'Bearer ...' : 'missing'
    },
    timestamp: new Date().toISOString()
  });

  try {
    logger.info('Calling exportService.runExport', { exportId, userId, runId, trigger });

    // Pass runId and trigger to service for deduplication
    const result = await exportService.runExport(exportId, userId, { runId, trigger });

    // Log with cached/inProgress info
    logger.info('Export request completed', {
      exportId,
      userId,
      cached: result.cached || false,
      inProgress: result.inProgress || false,
      stale: result.stale || false,
      status: result.status,
      totalRecords: result.totalRecords
    });

    // Return unified response structure
    // HTTP 200 for all cases (including cached) per D0.2
    res.json({
      success: result.success,
      cached: result.cached || false,
      inProgress: result.inProgress || false,
      stale: result.stale || false,
      message: result.message,
      result: {
        runId: result.runId,
        clientRunId: result.clientRunId,
        status: result.status,
        totalRecords: result.totalRecords,
        writeResults: result.writeResults,
        metadata: result.metadata
      }
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
      cached: false,
      inProgress: false,
      stale: false,
      error: error.message
    });
  }
});

/**
 * GET /api/exports/:id/stats
 * Get export statistics
 * SEC-1: requireOwnership validates company owns this export
 */
router.get('/:id/stats', requireCompany, requireOwnership('export'), async (req, res) => {
  try {
    const stats = await exportService.getExportStats(req.params.id);

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
    logger.error('Failed to get export stats', { error: error.message, exportId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/exports/:id/toggle
 * Toggle export status (active/paused)
 * SEC-1: requireOwnership validates company owns this export
 */
router.post('/:id/toggle', requireCompany, requireOwnership('export'), async (req, res) => {
  try {
    const userId = req.user.id; // From authMiddleware.authenticate()
    const exportConfig = await exportService.getExportById(req.params.id);

    if (!exportConfig) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    // Toggle status
    const newStatus = exportConfig.status === 'active' ? 'paused' : 'active';

    const savedConfig = await exportService.updateExportStatus(req.params.id, newStatus, userId);

    // SEC-2: Sanitize before returning
    const sanitizedConfig = exportService.sanitizeExport(savedConfig);

    // Update scheduler
    if (newStatus === 'active' && savedConfig.schedule_minutes) {
      scheduler.rescheduleExport(savedConfig.id, savedConfig.schedule_minutes);
    } else {
      scheduler.stopExport(savedConfig.id);
    }

    res.json({
      success: true,
      data: sanitizedConfig
    });
  } catch (error) {
    logger.error('Failed to toggle export status', { error: error.message, exportId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
module.exports.FIELD_DEFINITIONS = FIELD_DEFINITIONS;
