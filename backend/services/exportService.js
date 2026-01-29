/**
 * Export Service
 *
 * Handles data export from BaseLinker to Google Sheets.
 * Supports 4 datasets: orders, products, invoices, order_products
 *
 * Features:
 * - Advanced filtering with AND/OR groups and 10 operators
 * - Hybrid filtering (API-side + application-side)
 * - Multiple target sheets per export
 * - Retry with exponential backoff
 * - Pagination for large datasets (respects 100 req/min API limit)
 */

const crypto = require('crypto');
const { getClient } = require('./baselinker');
const googleSheetsService = require('./googleSheetsService');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const exportFields = require('../config/export-fields');

const prisma = new PrismaClient();

// ============================================
// TIMEOUT CONFIGURATION
// ============================================

// Global timeout for entire export operation (10 minutes)
// Prevents exports from hanging indefinitely
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

// ============================================
// PRICE CALCULATION HELPERS
// ============================================

/**
 * Calculate netto from brutto or brutto from netto
 * @param {number} price - Source price
 * @param {number} taxRate - VAT percentage (e.g., 23, 8, 5, 0)
 * @param {'to_netto'|'to_brutto'} direction - Calculation direction
 * @returns {number} - Calculated price, rounded to 2 decimal places
 */
function calculatePriceVariant(price, taxRate, direction) {
  if (price === null || price === undefined || isNaN(price) || !price) return 0;
  if (taxRate === null || taxRate === undefined || isNaN(taxRate) || taxRate < 0) {
    return Math.round(Number(price) * 100) / 100;
  }
  const rate = Number(taxRate);
  const p = Number(price);
  if (direction === 'to_netto') {
    return Math.round((p / (1 + rate / 100)) * 100) / 100;
  } else {
    return Math.round((p * (1 + rate / 100)) * 100) / 100;
  }
}

/**
 * Backward compatibility: map old field keys to new ones
 */
const FIELD_MIGRATIONS = {
  'inv_purchase_price': 'inv_purchase_price_brutto',
  'inv_average_cost': 'inv_average_cost_brutto',
  'delivery_price': 'delivery_price_brutto',
};

/**
 * Execute a promise with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name for error message
 * @returns {Promise} - Result or timeout error
 */
async function withTimeout(promise, timeoutMs, operationName = 'Operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================
// IDEMPOTENCY HELPERS
// ============================================

/**
 * Check if error is a unique constraint violation for ExportRun (exportId, runId)
 * IMPORTANT: We check the constraint target to avoid catching other P2002 errors
 *
 * @param {Error} error - Prisma error
 * @returns {boolean}
 */
function isExportRunDuplicateViolation(error) {
  // Prisma P2002 = Unique constraint failed
  if (error.code !== 'P2002') return false;

  // Check if it's our specific constraint (exportId + runId)
  const target = error.meta?.target;

  // Prisma may return array ['exportId', 'runId'] or string
  if (Array.isArray(target)) {
    return target.includes('exportId') && target.includes('runId');
  }

  // Or constraint name (depends on Prisma version/config)
  return target === 'ExportRun_exportId_runId_key' ||
         target === 'export_runs_export_id_run_id_key';
}

// Stale threshold for pending exports (15 minutes)
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

// In-memory storage for export configurations
// TODO: Migrate to database in production
let exportConfigs = {};

// ============================================
// FILTER OPERATORS
// ============================================

/**
 * Evaluate a single filter condition
 * @param {any} value - Field value from record
 * @param {string} operator - Operator name
 * @param {any} target - Target value from condition
 * @returns {boolean}
 */
function evaluateCondition(value, operator, target) {
  // Handle null/undefined values
  const strValue = value !== null && value !== undefined ? String(value) : '';
  const isEmpty = strValue === '' || value === null || value === undefined;

  switch (operator) {
    case 'is_empty':
      return isEmpty;

    case 'is_not_empty':
      return !isEmpty;

    case 'equals':
      // For numbers, compare numerically; for strings, case-insensitive
      if (typeof value === 'number' || !isNaN(Number(value))) {
        return Number(value) === Number(target);
      }
      return strValue.toLowerCase() === String(target).toLowerCase();

    case 'not_equals':
      if (typeof value === 'number' || !isNaN(Number(value))) {
        return Number(value) !== Number(target);
      }
      return strValue.toLowerCase() !== String(target).toLowerCase();

    case 'contains':
      return strValue.toLowerCase().includes(String(target).toLowerCase());

    case 'not_contains':
      return !strValue.toLowerCase().includes(String(target).toLowerCase());

    case 'greater_than':
      return Number(value) > Number(target);

    case 'less_than':
      return Number(value) < Number(target);

    case 'greater_or_equal':
      return Number(value) >= Number(target);

    case 'less_or_equal':
      return Number(value) <= Number(target);

    default:
      logger.warn('Unknown filter operator', { operator });
      return true;
  }
}

/**
 * Apply advanced filters with AND/OR groups to data
 *
 * Filter structure:
 * {
 *   logic: 'AND' | 'OR',  // Main connector between groups
 *   groups: [
 *     {
 *       logic: 'AND' | 'OR',  // Connector within group
 *       conditions: [
 *         { field: 'delivery_city', operator: 'contains', value: 'Warszawa' },
 *         { field: 'total_price', operator: 'greater_than', value: 100 }
 *       ]
 *     }
 *   ]
 * }
 *
 * @param {Array} data - Array of records
 * @param {object} filterConfig - Filter configuration
 * @returns {Array} - Filtered data
 */
function applyFilters(data, filterConfig) {
  if (!filterConfig || !filterConfig.groups || filterConfig.groups.length === 0) {
    return data;
  }

  return data.filter(record => {
    const groupResults = filterConfig.groups.map(group => {
      if (!group.conditions || group.conditions.length === 0) {
        return true;
      }

      // Filter out empty conditions (no field or no operator)
      const validConditions = group.conditions.filter(c =>
        c.field && c.operator && c.field.trim() !== '' && c.operator.trim() !== ''
      );

      // If no valid conditions, pass all records
      if (validConditions.length === 0) {
        return true;
      }

      const conditionResults = validConditions.map(condition => {
        const value = record[condition.field];
        return evaluateCondition(value, condition.operator, condition.value);
      });

      // Apply group logic (AND/OR)
      const groupLogic = group.logic || 'AND';
      return groupLogic === 'AND'
        ? conditionResults.every(r => r)
        : conditionResults.some(r => r);
    });

    // Apply main logic between groups
    const mainLogic = filterConfig.logic || 'AND';
    return mainLogic === 'AND'
      ? groupResults.every(r => r)
      : groupResults.some(r => r);
  });
}

/**
 * Split filters into API-side and application-side
 * Some filters can be applied by BaseLinker API directly (more efficient)
 *
 * @param {object} filterConfig - Filter configuration
 * @param {string} dataset - Dataset type
 * @returns {{ apiFilters: object, appFilters: object }}
 */
function splitFilters(filterConfig, dataset) {
  const apiFilters = {};
  const appFilters = { logic: filterConfig?.logic || 'AND', groups: [] };

  if (!filterConfig || !filterConfig.groups) {
    return { apiFilters, appFilters };
  }

  for (const group of filterConfig.groups) {
    const appConditions = [];

    for (const condition of group.conditions || []) {
      // Skip empty conditions
      if (!condition.field || !condition.operator ||
          condition.field.trim() === '' || condition.operator.trim() === '') {
        continue;
      }

      // Check if this filter can be handled by API
      let handledByApi = false;

      if (dataset === 'orders') {
        // Date filters - API can handle these directly
        if (condition.field === 'date_confirmed' || condition.field === 'date_add') {
          if (['greater_than', 'greater_or_equal'].includes(condition.operator)) {
            apiFilters.date_from = condition.value;
            handledByApi = true;
          } else if (['less_than', 'less_or_equal'].includes(condition.operator)) {
            apiFilters.date_to = condition.value;
            handledByApi = true;
          }
        }
        // Status filter - API can handle equals only
        if (condition.field === 'order_status_id' && condition.operator === 'equals') {
          apiFilters.status = condition.value;
          handledByApi = true;
        }
        // Order source filter
        if (condition.field === 'order_source' && condition.operator === 'equals') {
          apiFilters.order_source = condition.value;
          handledByApi = true;
        }
      }

      if (dataset === 'invoices') {
        if (condition.field === 'date_add') {
          if (['greater_than', 'greater_or_equal'].includes(condition.operator)) {
            apiFilters.date_from = condition.value;
            handledByApi = true;
          }
        }
        if (condition.field === 'series_id' && condition.operator === 'equals') {
          apiFilters.series_id = condition.value;
          handledByApi = true;
        }
      }

      // If not handled by API, add to application filters
      if (!handledByApi) {
        appConditions.push(condition);
      }
    }

    // Only add group if it has remaining conditions
    if (appConditions.length > 0) {
      appFilters.groups.push({
        logic: group.logic || 'AND',
        conditions: appConditions
      });
    }
  }

  return { apiFilters, appFilters };
}

// ============================================
// EXPORT SERVICE CLASS
// ============================================

class ExportService {
  // ============================================
  // SEC-2 & SEC-3: SANITIZATION HELPERS
  // ============================================

  /**
   * Mask Google Sheets URL for logging (SEC-3)
   * Extracts only spreadsheetId to prevent URL leakage in logs
   * @param {string} url - Full Google Sheets URL
   * @returns {string} - Masked version showing only spreadsheetId
   */
  maskSheetUrl(url) {
    if (!url) return '[no-url]';
    try {
      // Extract spreadsheet ID from URL
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        const id = match[1];
        // Show first 8 and last 4 chars of ID
        if (id.length > 12) {
          return `sheets:${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
        }
        return `sheets:${id}`;
      }
      return '[invalid-url]';
    } catch {
      return '[parse-error]';
    }
  }

  /**
   * Remove sensitive data from export before returning to client
   * SEC-2: Prevents baselinkerToken and other secrets from leaking
   * @param {object} exportConfig - Export configuration
   * @returns {object} - Sanitized export (without sensitive fields)
   */
  sanitizeExport(exportConfig) {
    if (!exportConfig) return null;

    // List of sensitive fields to remove
    const sensitiveFields = ['baselinkerToken', 'baselinker_token', 'apiToken', 'api_token'];

    const sanitized = { ...exportConfig };
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
      }
    }

    return sanitized;
  }

  // ============================================
  // DATABASE METHODS (SEC-1 compliant)
  // ============================================

  /**
   * Get all export configurations for a specific company
   * SEC-1: Filters by companyId to prevent cross-company data access
   * @param {string} companyId - Company ID
   * @returns {Promise<Array>} - List of exports for this company
   */
  async getAllExportsByCompany(companyId) {
    if (!companyId) {
      logger.warn('getAllExportsByCompany called without companyId');
      return [];
    }

    try {
      const exports = await prisma.export.findMany({
        where: { companyId },
        include: {
          sheets: true,
          runs: {
            take: 1,
            orderBy: { runAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Also update in-memory cache
      for (const exp of exports) {
        exportConfigs[exp.id] = this.dbExportToConfig(exp);
      }

      return exports.map(exp => this.dbExportToConfig(exp));
    } catch (error) {
      logger.error('Failed to get exports by company', { companyId, error: error.message });
      throw error;
    }
  }

  /**
   * Get export configuration by ID from database
   * @param {string} exportId - Export ID
   * @returns {Promise<object|null>} - Export configuration
   */
  async getExportById(exportId) {
    try {
      const exp = await prisma.export.findUnique({
        where: { id: exportId },
        include: {
          sheets: true
        }
      });

      if (!exp) return null;

      const config = this.dbExportToConfig(exp);
      // Update in-memory cache
      exportConfigs[exportId] = config;

      return config;
    } catch (error) {
      logger.error('Failed to get export by ID', { exportId, error: error.message });
      throw error;
    }
  }

  /**
   * Convert database Export model to config format used by service
   * @param {object} dbExport - Prisma Export model
   * @returns {object} - Config format
   */
  dbExportToConfig(dbExport) {
    return {
      id: dbExport.id,
      name: dbExport.name,
      dataset: dbExport.dataset,
      status: dbExport.status,
      filters: dbExport.filters,
      selected_fields: dbExport.selectedFields,
      selectedFields: dbExport.selectedFields,
      baselinkerToken: dbExport.baselinkerToken, // Keep for internal use
      sheetsUrl: dbExport.sheetsUrl,
      sheetsWriteMode: dbExport.sheetsWriteMode,
      schedule_minutes: dbExport.scheduleMinutes,
      scheduleMinutes: dbExport.scheduleMinutes,
      last_run: dbExport.lastRun?.toISOString(),
      lastRun: dbExport.lastRun,
      userId: dbExport.userId,
      companyId: dbExport.companyId,
      createdBy: dbExport.createdBy,
      createdAt: dbExport.createdAt?.toISOString(),
      updatedAt: dbExport.updatedAt?.toISOString(),
      settings: dbExport.settings || {},
      // Multiple sheets support
      sheets: dbExport.sheets?.map(s => ({
        sheet_url: s.sheetUrl,
        sheet_name: s.sheetName,
        write_mode: s.writeMode
      })),
      sheets_config: dbExport.sheets?.map(s => ({
        sheet_url: s.sheetUrl,
        sheet_name: s.sheetName,
        write_mode: s.writeMode
      }))
    };
  }

  /**
   * Extract spreadsheet ID and GID from Google Sheets URL
   * Used for duplicate detection
   * @param {string} url - Google Sheets URL
   * @returns {object} - { spreadsheetId, gid }
   */
  extractSheetIdentifiers(url) {
    if (!url) return { spreadsheetId: null, gid: null };

    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/[#&?]gid=(\d+)/);

    return {
      spreadsheetId: spreadsheetMatch ? spreadsheetMatch[1] : null,
      gid: gidMatch ? gidMatch[1] : '0' // Default to first sheet (gid=0)
    };
  }

  /**
   * Check if a sheet URL is already used by another export in the same company
   * Validates both spreadsheetId + gid as unique key
   * @param {string} sheetUrl - Sheet URL to check
   * @param {string} companyId - Company ID
   * @param {string} excludeExportId - Export ID to exclude (for updates)
   * @returns {Promise<object>} - { isDuplicate, existingExportName }
   */
  async checkDuplicateSheetUrl(sheetUrl, companyId, excludeExportId = null) {
    if (!sheetUrl || !companyId) {
      return { isDuplicate: false, existingExportName: null };
    }

    const { spreadsheetId, gid } = this.extractSheetIdentifiers(sheetUrl);

    if (!spreadsheetId) {
      return { isDuplicate: false, existingExportName: null };
    }

    try {
      // Check in ExportSheet table for existing usage
      const existingSheet = await prisma.exportSheet.findFirst({
        where: {
          sheetUrl: {
            contains: spreadsheetId
          },
          export: {
            companyId,
            id: excludeExportId ? { not: excludeExportId } : undefined
          }
        },
        include: {
          export: {
            select: { id: true, name: true }
          }
        }
      });

      if (existingSheet) {
        // Check if both spreadsheetId AND gid match (exact match)
        const existingIdentifiers = this.extractSheetIdentifiers(existingSheet.sheetUrl);
        if (existingIdentifiers.spreadsheetId === spreadsheetId && existingIdentifiers.gid === gid) {
          return {
            isDuplicate: true,
            existingExportName: existingSheet.export.name,
            existingExportId: existingSheet.export.id
          };
        }
      }

      // Also check legacy sheetsUrl field in Export table
      const existingExport = await prisma.export.findFirst({
        where: {
          sheetsUrl: {
            contains: spreadsheetId
          },
          companyId,
          id: excludeExportId ? { not: excludeExportId } : undefined
        },
        select: { id: true, name: true, sheetsUrl: true }
      });

      if (existingExport) {
        // Check if both spreadsheetId AND gid match (exact match)
        const existingIdentifiers = this.extractSheetIdentifiers(existingExport.sheetsUrl);
        if (existingIdentifiers.spreadsheetId === spreadsheetId && existingIdentifiers.gid === gid) {
          return {
            isDuplicate: true,
            existingExportName: existingExport.name,
            existingExportId: existingExport.id
          };
        }
      }

      return { isDuplicate: false, existingExportName: null };
    } catch (error) {
      logger.error('Failed to check duplicate sheet URL', {
        sheetUrl: this.maskSheetUrl(sheetUrl),
        companyId,
        error: error.message
      });
      // Fail-close: block export creation on validation error (security)
      const validationError = new Error('Nie udało się zweryfikować unikalności arkusza. Spróbuj ponownie.');
      validationError.code = 'DUPLICATE_CHECK_FAILED';
      throw validationError;
    }
  }

  /**
   * Update export status in database
   * @param {string} exportId - Export ID
   * @param {string} status - New status ('active', 'paused', 'error')
   * @param {string} userId - User making the change
   * @returns {Promise<object>} - Updated export config
   */
  async updateExportStatus(exportId, status, userId) {
    try {
      const updated = await prisma.export.update({
        where: { id: exportId },
        data: {
          status,
          updatedAt: new Date()
        },
        include: { sheets: true }
      });

      const config = this.dbExportToConfig(updated);
      // Update in-memory cache
      exportConfigs[exportId] = config;

      logger.info('Export status updated', { exportId, status, userId });
      return config;
    } catch (error) {
      logger.error('Failed to update export status', { exportId, status, error: error.message });
      throw error;
    }
  }

  // ============================================
  // LEGACY IN-MEMORY METHODS (for backward compatibility)
  // ============================================

  /**
   * Get all export configurations (LEGACY - from memory)
   * @deprecated Use getAllExportsByCompany() instead
   * @returns {Array} - List of exports
   */
  getAllExports() {
    return Object.values(exportConfigs);
  }

  /**
   * Get export configuration by ID (LEGACY - from memory first, then DB)
   * @param {string} exportId - Export ID
   * @returns {object|null} - Export configuration
   */
  getExport(exportId) {
    return exportConfigs[exportId] || null;
  }

  /**
   * Save export configuration to database AND memory
   * FAZA 1: Now saves to Prisma instead of just memory
   * @param {string} exportId - Export ID
   * @param {object} config - Export configuration
   * @param {string} userId - User ID (owner of the export)
   * @returns {Promise<object>} - Saved export configuration
   */
  async saveExport(exportId, config, userId = null) {
    const effectiveUserId = userId || config.userId;
    const companyId = config.companyId;

    if (!companyId) {
      logger.error('saveExport called without companyId', { exportId });
      throw new Error('companyId is required to save export');
    }

    if (!effectiveUserId) {
      logger.error('saveExport called without userId', { exportId });
      throw new Error('userId is required to save export');
    }

    try {
      // Prepare data for Prisma
      const exportData = {
        name: config.name || 'Nowy eksport',
        dataset: config.dataset || 'orders',
        status: config.status || 'active',
        filters: config.filters || null,
        selectedFields: config.selected_fields || config.selectedFields || [],
        baselinkerToken: config.baselinkerToken || config.baselinker_token || '',
        sheetsUrl: config.sheetsUrl || config.sheets_url || '',
        sheetsWriteMode: config.sheetsWriteMode || config.sheets_write_mode || 'append',
        scheduleMinutes: config.schedule_minutes || config.scheduleMinutes || null,
        settings: config.settings || null,
        companyId,
        createdBy: effectiveUserId
      };

      // Upsert to database
      const saved = await prisma.export.upsert({
        where: { id: exportId },
        create: {
          id: exportId,
          userId: effectiveUserId,
          ...exportData
        },
        update: {
          ...exportData,
          updatedAt: new Date()
        },
        include: { sheets: true }
      });

      // Handle multiple sheets if provided
      if (config.sheets_config || config.sheets) {
        const sheetsData = config.sheets_config || config.sheets;
        if (Array.isArray(sheetsData) && sheetsData.length > 0) {
          // Delete existing sheets and recreate
          await prisma.exportSheet.deleteMany({
            where: { exportId }
          });

          await prisma.exportSheet.createMany({
            data: sheetsData.map((s, idx) => {
              const url = s.sheet_url || s.sheetUrl;
              const identifiers = this.extractSheetIdentifiers(url);
              return {
                exportId,
                companyId, // For unique constraint
                sheetUrl: url,
                spreadsheetId: identifiers.spreadsheetId || '',
                gid: identifiers.gid || '0',
                sheetName: s.sheet_name || s.sheetName || null,
                writeMode: s.write_mode || s.writeMode || 'append',
                sortOrder: idx
              };
            })
          });
        }
      }

      // Convert to config format and update memory cache
      const savedConfig = this.dbExportToConfig(saved);
      exportConfigs[exportId] = savedConfig;

      logger.info('Export configuration saved to database', { exportId, userId: effectiveUserId, companyId });
      return savedConfig;
    } catch (error) {
      logger.error('Failed to save export to database', {
        exportId,
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Delete export configuration from database AND memory
   * @param {string} exportId - Export ID
   * @returns {Promise<boolean>} - True if deleted
   */
  async deleteExport(exportId) {
    try {
      // Delete from database (cascades to sheets and runs)
      await prisma.export.delete({
        where: { id: exportId }
      });

      // Remove from memory cache
      if (exportConfigs[exportId]) {
        delete exportConfigs[exportId];
      }

      logger.info('Export configuration deleted', { exportId });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found in DB, try memory only
        if (exportConfigs[exportId]) {
          delete exportConfigs[exportId];
          logger.info('Export configuration deleted from memory', { exportId });
          return true;
        }
        return false;
      }
      logger.error('Failed to delete export', { exportId, error: error.message });
      throw error;
    }
  }

  /**
   * Run export - fetch data from BaseLinker and write to Google Sheets
   * Now supports: orders, products, invoices, order_products
   *
   * IDEMPOTENCY: Uses persist-first pattern with unique constraint on (exportId, runId)
   * - If runId provided and already exists: returns cached result
   * - If runId not provided: generates UUID (backward compatible, always new export)
   *
   * @param {string} exportId - Export ID
   * @param {string} userId - User ID (to fetch BaseLinker token)
   * @param {object} options - Optional parameters
   * @param {string} options.runId - Client-provided idempotency key
   * @param {string} options.trigger - 'manual' or 'scheduler'
   * @returns {Promise<object>} - Export result with cached/inProgress/stale flags
   */
  async runExport(exportId, userId = null, options = {}) {
    const { runId: providedRunId, trigger = 'manual' } = options;
    const startTime = Date.now();

    // 1. BACKWARD COMPAT: If no runId provided, generate UUID
    // (runId is NOT NULL in DB, so we always need a value)
    const effectiveRunId = providedRunId?.trim() || crypto.randomUUID();

    logger.info('=== EXPORT RUN START ===', {
      exportId,
      userId,
      providedRunId: providedRunId || null,
      effectiveRunId,
      trigger,
      timestamp: new Date().toISOString()
    });

    const config = this.getExport(exportId);

    logger.info('Export config loaded', {
      exportId,
      configFound: !!config,
      configKeys: config ? Object.keys(config) : null,
      configCompanyId: config?.companyId,
      configUserId: config?.userId,
      configDataset: config?.dataset,
      configStatus: config?.status
    });

    if (!config) {
      logger.error('Export configuration not found', { exportId });
      throw new Error(`Export configuration not found: ${exportId}`);
    }

    const effectiveUserId = userId || config.userId;
    const companyId = config.companyId;

    logger.info('Resolved IDs', {
      exportId,
      effectiveUserId,
      companyId,
      originalUserId: userId,
      configUserId: config.userId
    });

    if (!companyId) {
      logger.error('Company ID not available', {
        exportId,
        config: JSON.stringify(config, null, 2)
      });
      throw new Error('Company ID not available for this export');
    }

    // 2. TRY CREATE FIRST - let DB decide on duplicate (persist-first pattern)
    let exportRun;

    try {
      exportRun = await prisma.exportRun.create({
        data: {
          exportId,
          runId: effectiveRunId,
          status: 'pending',
          totalRecords: 0,
          metadata: {
            trigger,
            providedRunId: providedRunId || null,
            startedAt: new Date().toISOString()
          }
        }
      });

      logger.info('ExportRun record created', {
        exportRunId: exportRun.id,
        exportId,
        runId: effectiveRunId
      });
    } catch (error) {
      // 3. CATCH UNIQUE VIOLATION = duplicate runId for this export
      if (isExportRunDuplicateViolation(error)) {
        const existingRun = await prisma.exportRun.findUnique({
          where: {
            exportId_runId: { exportId, runId: effectiveRunId }
          }
        });

        logger.info('Duplicate runId detected (unique constraint)', {
          exportId,
          clientRunId: effectiveRunId,
          existingRunId: existingRun?.id,
          existingStatus: existingRun?.status
        });

        // If still pending - may still be processing
        if (existingRun?.status === 'pending') {
          // D0.4: Stale detection (>15 min)
          const isStale = existingRun.runAt &&
            (Date.now() - new Date(existingRun.runAt).getTime()) > STALE_THRESHOLD_MS;

          return {
            success: false,
            cached: true,
            inProgress: true,
            stale: isStale,
            runId: existingRun.id,
            clientRunId: effectiveRunId,
            status: existingRun.status,
            totalRecords: 0,
            message: isStale
              ? 'Export appears stale (pending > 15 min)'
              : 'Export is currently in progress with this runId'
          };
        }

        // Already completed (success, failure, or partial_failure)
        return {
          success: existingRun?.status === 'success',
          cached: true,
          inProgress: false,
          stale: false,
          runId: existingRun?.id,
          clientRunId: effectiveRunId,
          status: existingRun?.status,
          totalRecords: existingRun?.totalRecords || 0,
          message: 'Export already processed with this runId'
        };
      }

      // Other error - rethrow
      throw error;
    }

    // 4. EXECUTE EXPORT
    logger.info('Running export', {
      exportId,
      userId: effectiveUserId,
      companyId,
      dataset: config.dataset,
      selectedFields: config.selected_fields,
      filters: JSON.stringify(config.filters),
      sheets: config.sheets ? config.sheets.length : 0
    });

    const metadata = {
      trigger,
      providedRunId: providedRunId || null,
      startedAt: new Date().toISOString(),
      phases: {}
    };

    try {
      // Get BaseLinker client for company
      logger.info('Getting BaseLinker client', { companyId });
      const client = await getClient(companyId);
      logger.info('BaseLinker client obtained successfully', { companyId });

      // Split filters into API-side and application-side
      const { apiFilters, appFilters } = splitFilters(config.filters, config.dataset);

      // Fetch data from BaseLinker
      const fetchStart = Date.now();
      let rawData = [];

      switch (config.dataset) {
        case 'orders':
          rawData = await this.fetchOrders(client, apiFilters, config.selected_fields || [], config.settings || {});
          break;
        case 'products':
          rawData = await this.fetchProducts(client, apiFilters);
          break;
        case 'invoices':
          rawData = await this.fetchInvoices(client, apiFilters);
          break;
        case 'order_products':
          rawData = await this.fetchOrderProducts(client, apiFilters, config.selected_fields || [], config.settings || {});
          break;
        default:
          throw new Error(`Unknown dataset type: ${config.dataset}`);
      }

      metadata.phases.fetchFromBaseLinker = Date.now() - fetchStart;
      metadata.recordsBeforeFilter = rawData.length;

      logger.info('Fetched records from BaseLinker', {
        exportId,
        count: rawData.length,
        dataset: config.dataset
      });

      // Apply application-side filters
      const filterStart = Date.now();
      const filteredData = applyFilters(rawData, appFilters);
      metadata.phases.applyFilters = Date.now() - filterStart;
      metadata.recordsAfterFilter = filteredData.length;

      logger.info('Applied filters', {
        exportId,
        beforeFilter: rawData.length,
        afterFilter: filteredData.length
      });

      // Transform data according to selected fields
      const transformStart = Date.now();
      const { headers, data } = this.transformData(
        filteredData,
        config.selected_fields || [],
        config.dataset,
        config.settings || {}
      );
      metadata.phases.transformData = Date.now() - transformStart;

      if (data.length === 0) {
        logger.warn('No data to export', { exportId });

        // 5. UPDATE SUCCESS (no data)
        await prisma.exportRun.update({
          where: { id: exportRun.id },
          data: {
            status: 'success',
            totalRecords: 0,
            durationMs: Date.now() - startTime,
            metadata: {
              ...metadata,
              completedAt: new Date().toISOString()
            }
          }
        });

        return {
          success: true,
          cached: false,
          inProgress: false,
          stale: false,
          runId: exportRun.id,
          clientRunId: effectiveRunId,
          status: 'success',
          totalRecords: 0,
          message: 'No data matched the filters',
          metadata
        };
      }

      // Write to Google Sheets (supports multiple sheets)
      const writeStart = Date.now();
      const writeResults = await this.writeToSheets(config, headers, data);
      metadata.phases.writeToSheets = Date.now() - writeStart;

      // Update last run timestamp
      exportConfigs[exportId].last_run = new Date().toISOString();
      exportConfigs[exportId].status = 'active';

      // Determine overall status
      const allSuccess = writeResults.every(r => r.success);
      const someSuccess = writeResults.some(r => r.success);
      const finalStatus = allSuccess ? 'success' : (someSuccess ? 'partial_failure' : 'failure');

      metadata.sheetsWritten = writeResults;
      metadata.durationMs = Date.now() - startTime;
      metadata.completedAt = new Date().toISOString();

      // 5. UPDATE SUCCESS/PARTIAL_FAILURE
      await prisma.exportRun.update({
        where: { id: exportRun.id },
        data: {
          status: finalStatus,
          totalRecords: data.length,
          durationMs: Date.now() - startTime,
          sheetResults: writeResults,
          metadata
        }
      });

      logger.info('Export completed', {
        exportId,
        exportRunId: exportRun.id,
        recordCount: data.length,
        status: finalStatus,
        durationMs: metadata.durationMs
      });

      return {
        success: allSuccess,
        cached: false,
        inProgress: false,
        stale: false,
        runId: exportRun.id,
        clientRunId: effectiveRunId,
        status: finalStatus,
        totalRecords: data.length,
        writeResults,
        metadata
      };
    } catch (error) {
      // 6. UPDATE FAILURE
      await prisma.exportRun.update({
        where: { id: exportRun.id },
        data: {
          status: 'failure',
          errorMessage: error.message,
          durationMs: Date.now() - startTime,
          metadata: {
            ...metadata,
            failedAt: new Date().toISOString(),
            error: error.message
          }
        }
      });

      logger.error('Export failed', {
        exportId,
        exportRunId: exportRun.id,
        error: error.message,
        durationMs: Date.now() - startTime
      });

      if (exportConfigs[exportId]) {
        exportConfigs[exportId].status = 'error';
        exportConfigs[exportId].lastError = error.message;
      }

      throw error;
    }
  }

  /**
   * Write data to one or multiple Google Sheets with retry
   * @param {object} config - Export configuration
   * @param {Array} headers - Column headers
   * @param {Array} data - Data rows
   * @returns {Promise<Array>} - Array of results per sheet
   */
  async writeToSheets(config, headers, data) {
    // SEC-3: Debug log without full URLs - only structure info
    logger.info('[writeToSheets] Config fields', {
      hasSheets: !!config.sheets,
      hasSheetsConfig: !!config.sheets_config,
      hasSheetsUrl: !!config.sheetsUrl,
      sheetsType: config.sheets ? (Array.isArray(config.sheets) ? 'array' : typeof config.sheets) : 'undefined',
      sheetsConfigType: config.sheets_config ? (Array.isArray(config.sheets_config) ? 'array' : typeof config.sheets_config) : 'undefined',
      sheetsCount: config.sheets?.length || config.sheets_config?.length || (config.sheetsUrl ? 1 : 0)
    });

    // Support multiple naming conventions: sheets_config, sheets (array), sheets (object), sheetsUrl
    let sheets;
    if (config.sheets_config && Array.isArray(config.sheets_config)) {
      sheets = config.sheets_config;
    } else if (config.sheets && Array.isArray(config.sheets)) {
      sheets = config.sheets;
    } else if (config.sheets && config.sheets.sheet_url) {
      sheets = [config.sheets];
    } else if (config.sheetsUrl) {
      sheets = [{
        sheet_url: config.sheetsUrl,
        sheet_name: null,
        write_mode: config.sheetsWriteMode || 'append'
      }];
    } else {
      logger.error('[writeToSheets] No valid sheets configuration found!', {
        configKeys: Object.keys(config)
      });
      throw new Error('No Google Sheets URL configured');
    }

    // SEC-3: Log masked URLs only
    logger.info('[writeToSheets] Resolved sheets config', {
      sheetsCount: sheets.length,
      sheets: sheets.map(s => ({ url: this.maskSheetUrl(s.sheet_url), mode: s.write_mode }))
    });

    const MAX_RETRIES = 3;
    const RETRY_TIMEOUT_MS = 30000;
    const results = [];

    for (const sheet of sheets) {
      let success = false;
      let lastError = null;
      let attempts = 0;
      const sheetStartTime = Date.now();

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        attempts = attempt;

        // Check global timeout
        if (Date.now() - sheetStartTime > RETRY_TIMEOUT_MS) {
          lastError = new Error('Retry timeout exceeded');
          break;
        }

        try {
          await googleSheetsService.writeData(
            sheet.sheet_url,
            headers,
            data,
            sheet.write_mode || 'append'
          );
          success = true;
          break;
        } catch (error) {
          lastError = error;

          // Don't retry authorization errors
          if (error.code === 403 || error.code === 401 ||
              error.message?.includes('403') || error.message?.includes('401') ||
              error.message?.includes('permission') || error.message?.includes('access')) {
            // Get actual service account email from config
            const sheetsConfig = require('../config/googleSheets');
            const serviceEmail = sheetsConfig.credentialsJson?.client_email ||
                                 sheetsConfig.serviceAccountEmail ||
                                 'live-sales-worker@livesales-483523.iam.gserviceaccount.com';

            // SEC-3: Log masked URL only
            logger.error('Google Sheets auth error - not retrying', {
              sheetUrl: this.maskSheetUrl(sheet.sheet_url),
              error: error.message,
              serviceAccountEmail: serviceEmail,
              hint: `Upewnij się że arkusz jest udostępniony dla: ${serviceEmail} z uprawnieniami Edytora`
            });
            // Create more descriptive error
            lastError = new Error(
              `Brak dostępu do arkusza. Udostępnij arkusz dla: ${serviceEmail} (uprawnienia: Edytor)`
            );
            lastError.code = error.code || 403;
            break;
          }

          // Exponential backoff: 1s, 2s, 4s
          if (attempt < MAX_RETRIES) {
            const backoffMs = Math.pow(2, attempt - 1) * 1000;
            // SEC-3: Log masked URL only
            logger.warn('Google Sheets write failed, retrying', {
              sheetUrl: this.maskSheetUrl(sheet.sheet_url),
              attempt,
              backoffMs,
              error: error.message
            });
            await new Promise(r => setTimeout(r, backoffMs));
          }
        }
      }

      results.push({
        sheetUrl: sheet.sheet_url,
        sheetName: sheet.sheet_name,
        success,
        attempts,
        error: success ? null : lastError?.message,
        recordsWritten: success ? data.length : 0
      });
    }

    return results;
  }

  /**
   * Fetch orders from BaseLinker
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters
   * @param {Array<string>} selectedFields - Selected fields (to determine if enrichment needed)
   * @param {object} settings - Export settings { deliveryTaxRate, inventoryPriceFormat }
   * @returns {Promise<Array>} - List of orders (flat structure)
   */
  async fetchOrders(client, apiFilters = {}, selectedFields = [], settings = {}) {
    try {
      // Include commission data if commission fields are selected
      const filtersWithCommission = {
        ...apiFilters,
        include_commission_data: this.needsCommissionData(selectedFields)
      };
      const orders = await client.getOrdersWithPagination(filtersWithCommission);
      const deliveryTaxRate = settings.deliveryTaxRate || 23;

      // Transform orders to flat structure with all available fields
      const flatOrders = orders.map(order => ({
        order_id: order.order_id,
        shop_order_id: order.shop_order_id,
        external_order_id: order.external_order_id,
        order_source: order.order_source,
        order_source_id: order.order_source_id,
        order_source_info: order.order_source_info,
        order_status_id: order.order_status_id,
        date_add: order.date_add,
        date_confirmed: order.date_confirmed,
        date_in_status: order.date_in_status,
        confirmed: order.confirmed,
        user_login: order.user_login,
        currency: order.currency,
        payment_method: order.payment_method,
        payment_method_cod: order.payment_method_cod,
        payment_done: order.payment_done,
        email: order.email,
        phone: order.phone,
        delivery_method: order.delivery_method,
        delivery_method_id: order.delivery_method_id,
        // Delivery price brutto/netto (calculated from raw delivery_price)
        delivery_price_brutto: order.delivery_price || 0,
        delivery_price_netto: calculatePriceVariant(order.delivery_price, deliveryTaxRate, 'to_netto'),
        delivery_package_module: order.delivery_package_module,
        delivery_package_nr: order.delivery_package_nr,
        delivery_fullname: order.delivery_fullname,
        delivery_company: order.delivery_company,
        delivery_address: order.delivery_address,
        delivery_city: order.delivery_city,
        delivery_postcode: order.delivery_postcode,
        delivery_state: order.delivery_state,
        delivery_country: order.delivery_country,
        delivery_country_code: order.delivery_country_code,
        delivery_point_id: order.delivery_point_id,
        delivery_point_name: order.delivery_point_name,
        delivery_point_address: order.delivery_point_address,
        delivery_point_postcode: order.delivery_point_postcode,
        delivery_point_city: order.delivery_point_city,
        invoice_fullname: order.invoice_fullname,
        invoice_company: order.invoice_company,
        invoice_nip: order.invoice_nip,
        invoice_address: order.invoice_address,
        invoice_postcode: order.invoice_postcode,
        invoice_city: order.invoice_city,
        invoice_state: order.invoice_state,
        invoice_country: order.invoice_country,
        invoice_country_code: order.invoice_country_code,
        want_invoice: order.want_invoice,
        user_comments: order.user_comments,
        admin_comments: order.admin_comments,
        extra_field_1: order.extra_field_1,
        extra_field_2: order.extra_field_2,
        order_page: order.order_page,
        pick_state: order.pick_state,
        pack_state: order.pack_state,
        // Commission data (marketplace fees)
        commission_net: order.commission?.net || null,
        commission_gross: order.commission?.gross || null,
        commission_currency: order.commission?.currency || null,
        // Store products for enrichment pipelines
        _products: order.products
      }));

      let enrichedOrders = flatOrders;

      // Document enrichment pipeline (invoices + receipts for fv_* and ds_* fields)
      if (this.needsDocumentEnrichment(selectedFields) && enrichedOrders.length > 0) {
        logger.info('Document enrichment requested for orders', {
          orderCount: enrichedOrders.length,
          selectedDocFields: selectedFields.filter(f => f.startsWith('fv_') || f.startsWith('ds1_') || f.startsWith('ds2_'))
        });

        const documentMap = await this.fetchDocumentDataForOrders(client, apiFilters);

        enrichedOrders = enrichedOrders.map(order =>
          this.mergeDocumentData(order, documentMap.get(order.order_id))
        );
      }

      // Product summary enrichment pipeline (for products_* aggregate fields)
      if (this.needsProductSummaryEnrichment(selectedFields) && enrichedOrders.length > 0) {
        logger.info('Product summary enrichment requested for orders', {
          orderCount: enrichedOrders.length,
          selectedSummaryFields: selectedFields.filter(f => f.startsWith('products_'))
        });

        let inventoryData = null;

        // Fetch inventory data if needed for purchase costs/margin
        if (this.needsInventoryForSummary(selectedFields)) {
          const productIds = new Set();
          enrichedOrders.forEach(o => {
            const products = o._products || [];
            products.forEach(p => {
              if (p.product_id) productIds.add(String(p.product_id));
            });
          });

          if (productIds.size > 0) {
            inventoryData = await this.fetchInventoryDataForProducts(client, [...productIds]);
          }
        }

        // Calculate product summaries
        enrichedOrders = enrichedOrders.map(order => {
          const summary = this.calculateProductSummary(order, inventoryData, settings);
          return { ...order, ...summary };
        });
      }

      return enrichedOrders;
    } catch (error) {
      logger.error('Failed to fetch orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch products from BaseLinker inventory
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters
   * @returns {Promise<Array>} - List of products
   */
  async fetchProducts(client, apiFilters = {}) {
    try {
      const inventoryId = apiFilters.inventory_id || 35072; // Default inventory
      const products = await client.getInventoryProductsList(inventoryId, apiFilters);

      if (products.length === 0) {
        return [];
      }

      // Get detailed product data
      const productIds = products.map(p => p.product_id);
      const detailedData = await client.getInventoryProductsData(productIds, inventoryId);

      // Merge list and detailed data
      return products.map(product => {
        const details = detailedData[product.product_id] || {};
        return {
          product_id: product.product_id,
          name: details.name || product.name,
          ean: details.ean || product.ean,
          sku: details.sku || product.sku,
          quantity: product.quantity || 0,
          price_brutto: details.prices?.[0]?.price_brutto || null,
          stock: product.stock || 0,
          location: details.location || '',
          weight: details.weight || 0,
          manufacturer: details.manufacturer || '',
          category: details.category || '',
          description: details.description || '',
          tax_rate: details.tax_rate || 23,
          purchase_price: details.purchase_price || 0,
          profit_margin: details.profit_margin || 0,
          average_cost: details.average_cost || 0,
          height: details.height || 0,
          width: details.width || 0,
          length: details.length || 0,
          image_url: details.images ? Object.values(details.images)[0] || '' : '',
        };
      });
    } catch (error) {
      logger.error('Failed to fetch products', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch invoices from BaseLinker
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters
   * @returns {Promise<Array>} - List of invoices
   */
  async fetchInvoices(client, apiFilters = {}) {
    try {
      const invoices = await client.getInvoicesWithPagination(apiFilters);

      // Transform to flat structure
      return invoices.map(invoice => ({
        invoice_id: invoice.invoice_id,
        order_id: invoice.order_id,
        series_id: invoice.series_id,
        type: invoice.type,
        number: invoice.number,
        sub_id: invoice.sub_id,
        month: invoice.month,
        year: invoice.year,
        postfix: invoice.postfix,
        date_add: invoice.date_add,
        date_sell: invoice.date_sell,
        date_pay_to: invoice.date_pay_to,
        currency: invoice.currency,
        total_price_brutto: invoice.total_price_brutto,
        total_price_netto: invoice.total_price_netto,
        payment: invoice.payment,
        additional_info: invoice.additional_info,
        invoice_fullname: invoice.invoice_fullname,
        invoice_company: invoice.invoice_company,
        invoice_nip: invoice.invoice_nip,
        invoice_address: invoice.invoice_address,
        invoice_postcode: invoice.invoice_postcode,
        invoice_city: invoice.invoice_city,
        invoice_country: invoice.invoice_country,
        invoice_country_code: invoice.invoice_country_code,
        seller: invoice.seller,
        issuer: invoice.issuer,
        correcting_to_invoice_id: invoice.correcting_to_invoice_id,
        correcting_reason: invoice.correcting_reason,
        correcting_items: invoice.correcting_items,
        correcting_data: invoice.correcting_data,
        external_invoice_number: invoice.external_invoice_number,
        exchange_currency: invoice.exchange_currency,
        exchange_rate: invoice.exchange_rate,
        exchange_date: invoice.exchange_date,
        exchange_info: invoice.exchange_info,
        external_id: invoice.external_id,
        // Store items for potential future use
        _items: invoice.items
      }));
    } catch (error) {
      logger.error('Failed to fetch invoices', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if any selected fields require inventory enrichment
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {boolean}
   */
  needsInventoryEnrichment(selectedFields) {
    if (!selectedFields || selectedFields.length === 0) return false;
    return selectedFields.some(field => field.startsWith('inv_'));
  }

  /**
   * Check if any selected fields require document enrichment (invoices/receipts)
   * Includes fv_* fields (legacy) and ds1_*, ds2_* fields (new sales document slots)
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {boolean}
   */
  needsDocumentEnrichment(selectedFields) {
    if (!selectedFields || selectedFields.length === 0) return false;
    return selectedFields.some(field =>
      field.startsWith('fv_') ||
      field.startsWith('ds1_') ||
      field.startsWith('ds2_')
    );
  }

  /**
   * Check if any selected fields require product summary enrichment
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {boolean}
   */
  needsProductSummaryEnrichment(selectedFields) {
    if (!selectedFields || selectedFields.length === 0) return false;
    const summaryFields = [
      'products_total_value_brutto', 'products_total_value_netto',
      'products_total_purchase_cost_brutto', 'products_total_purchase_cost_netto',
      'products_total_quantity', 'products_total_weight',
      'products_average_margin', 'products_count'
    ];
    return selectedFields.some(f => summaryFields.includes(f));
  }

  /**
   * Check if product summary requires inventory data (for purchase costs and margin)
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {boolean}
   */
  needsInventoryForSummary(selectedFields) {
    if (!selectedFields || selectedFields.length === 0) return false;
    const inventoryRequiredFields = [
      'products_total_purchase_cost_brutto', 'products_total_purchase_cost_netto',
      'products_average_margin'
    ];
    return selectedFields.some(f => inventoryRequiredFields.includes(f));
  }

  /**
   * Check if any selected fields require commission data from BaseLinker API
   * @param {Array<string>} selectedFields - Selected field keys
   * @returns {boolean}
   */
  needsCommissionData(selectedFields) {
    if (!selectedFields || selectedFields.length === 0) return false;
    const commissionFields = ['commission_net', 'commission_gross', 'commission_currency'];
    return selectedFields.some(f => commissionFields.includes(f));
  }

  /**
   * Calculate product summary aggregations for an order
   * @param {object} order - Order with _products array
   * @param {Map|null} inventoryData - Map of product_id -> inventory data
   * @param {object} settings - Export settings
   * @returns {object} - Product summary fields
   */
  calculateProductSummary(order, inventoryData, settings = {}) {
    const products = order._products || order.products || [];
    const inventoryPriceFormat = settings.inventoryPriceFormat || 'brutto';

    let totalValueBrutto = 0;
    let totalValueNetto = 0;
    let totalPurchaseCostBrutto = 0;
    let totalPurchaseCostNetto = 0;
    let totalQuantity = 0;
    let totalWeight = 0;
    const margins = [];

    for (const product of products) {
      const qty = Number(product.quantity) || 0;
      const priceBrutto = Number(product.price_brutto) || 0;
      const taxRate = Number(product.tax_rate) || 23;

      // Sales values
      totalValueBrutto += priceBrutto * qty;
      totalValueNetto += calculatePriceVariant(priceBrutto, taxRate, 'to_netto') * qty;
      totalQuantity += qty;
      totalWeight += (Number(product.weight) || 0) * qty;

      // Purchase costs from inventory (if available)
      if (inventoryData) {
        const invData = inventoryData.get(String(product.product_id));
        if (invData) {
          const rawPurchasePrice = Number(invData.purchase_price) || 0;
          const invTaxRate = Number(invData.tax_rate) || taxRate;

          // Calculate purchase price netto/brutto based on format
          let purchasePriceNetto, purchasePriceBrutto;
          if (inventoryPriceFormat === 'netto') {
            purchasePriceNetto = rawPurchasePrice;
            purchasePriceBrutto = calculatePriceVariant(rawPurchasePrice, invTaxRate, 'to_brutto');
          } else {
            purchasePriceBrutto = rawPurchasePrice;
            purchasePriceNetto = calculatePriceVariant(rawPurchasePrice, invTaxRate, 'to_netto');
          }

          totalPurchaseCostBrutto += purchasePriceBrutto * qty;
          totalPurchaseCostNetto += purchasePriceNetto * qty;

          // Margin calculation
          if (priceBrutto > 0 && purchasePriceNetto > 0) {
            const priceNetto = calculatePriceVariant(priceBrutto, taxRate, 'to_netto');
            const margin = ((priceNetto - purchasePriceNetto) / purchasePriceNetto) * 100;
            margins.push(margin);
          }
        }
      }
    }

    return {
      products_total_value_brutto: Math.round(totalValueBrutto * 100) / 100,
      products_total_value_netto: Math.round(totalValueNetto * 100) / 100,
      products_total_purchase_cost_brutto: Math.round(totalPurchaseCostBrutto * 100) / 100,
      products_total_purchase_cost_netto: Math.round(totalPurchaseCostNetto * 100) / 100,
      products_total_quantity: totalQuantity,
      products_total_weight: Math.round(totalWeight * 1000) / 1000,
      products_average_margin: margins.length > 0
        ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 100) / 100
        : null,
      products_count: products.length
    };
  }

  /**
   * Fetch inventory product data for a list of product IDs
   * Handles batching (max 1000 per API call) and missing products gracefully
   *
   * @param {object} client - BaseLinker client
   * @param {Array<string>} productIds - Unique product IDs to look up
   * @returns {Promise<Map<string, object>>} - Map of product_id -> inventory data
   */
  async fetchInventoryDataForProducts(client, productIds) {
    const BATCH_SIZE = 1000;
    const inventoryMap = new Map();

    if (!productIds || productIds.length === 0) {
      return inventoryMap;
    }

    // Filter out invalid product IDs
    const validIds = productIds.filter(id => id && id !== '0' && id !== 0 && id !== 'undefined' && id !== 'null');

    if (validIds.length === 0) {
      return inventoryMap;
    }

    // Dynamically fetch inventory ID from getInventories()
    let inventoryId;
    try {
      const inventories = await client.getInventories();
      if (!inventories || inventories.length === 0) {
        logger.warn('No inventories found for enrichment, skipping inventory lookup');
        return inventoryMap;
      }
      inventoryId = inventories[0].inventory_id;
      logger.info('Using inventory for enrichment', { inventoryId, totalInventories: inventories.length });
    } catch (error) {
      logger.warn('Failed to fetch inventories for enrichment', { error: error.message });
      return inventoryMap;
    }

    logger.info('Fetching inventory data for order product enrichment', {
      totalProductIds: productIds.length,
      validProductIds: validIds.length,
      inventoryId,
      batchCount: Math.ceil(validIds.length / BATCH_SIZE)
    });

    // Process in batches
    for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
      const batch = validIds.slice(i, i + BATCH_SIZE);

      try {
        const batchData = await client.getInventoryProductsData(batch, inventoryId);

        for (const [productId, data] of Object.entries(batchData)) {
          inventoryMap.set(String(productId), data);
        }
      } catch (error) {
        logger.warn('Failed to fetch inventory batch for enrichment', {
          batchStart: i,
          batchSize: batch.length,
          inventoryId,
          error: error.message
        });
      }
    }

    logger.info('Inventory enrichment data fetched', {
      requested: validIds.length,
      found: inventoryMap.size,
      missing: validIds.length - inventoryMap.size
    });

    return inventoryMap;
  }

  /**
   * Merge inventory data into an order product record
   * Calculates netto/brutto variants based on user's price format setting
   * @param {object} orderProduct - Order product row
   * @param {object|null} inventoryData - Inventory product data (or null if not found)
   * @param {string} inventoryPriceFormat - 'netto' or 'brutto' (user's BaseLinker setting)
   * @returns {object} - Order product with inv_ fields added
   */
  mergeInventoryData(orderProduct, inventoryData, inventoryPriceFormat = 'brutto') {
    const details = inventoryData || {};
    const format = inventoryPriceFormat || 'brutto';
    const invTaxRate = details.tax_rate || 0;

    // Calculate purchase price netto/brutto
    const rawPurchasePrice = details.purchase_price || 0;
    let purchasePriceNetto, purchasePriceBrutto;
    if (format === 'netto') {
      purchasePriceNetto = Math.round(rawPurchasePrice * 100) / 100;
      purchasePriceBrutto = calculatePriceVariant(rawPurchasePrice, invTaxRate, 'to_brutto');
    } else {
      purchasePriceBrutto = Math.round(rawPurchasePrice * 100) / 100;
      purchasePriceNetto = calculatePriceVariant(rawPurchasePrice, invTaxRate, 'to_netto');
    }

    // Calculate average cost netto/brutto
    const rawAverageCost = details.average_cost || 0;
    let averageCostNetto, averageCostBrutto;
    if (format === 'netto') {
      averageCostNetto = Math.round(rawAverageCost * 100) / 100;
      averageCostBrutto = calculatePriceVariant(rawAverageCost, invTaxRate, 'to_brutto');
    } else {
      averageCostBrutto = Math.round(rawAverageCost * 100) / 100;
      averageCostNetto = calculatePriceVariant(rawAverageCost, invTaxRate, 'to_netto');
    }

    return {
      ...orderProduct,
      inv_manufacturer: details.manufacturer || '',
      inv_category: details.category || '',
      inv_description: details.description || '',
      inv_image_url: details.images ? Object.values(details.images)[0] || '' : '',
      inv_purchase_price_netto: purchasePriceNetto,
      inv_purchase_price_brutto: purchasePriceBrutto,
      inv_stock: details.stock || 0,
      inv_weight: details.weight || 0,
      inv_height: details.height || 0,
      inv_width: details.width || 0,
      inv_length: details.length || 0,
      inv_location: details.location || '',
      inv_tax_rate: invTaxRate,
      inv_profit_margin: details.profit_margin || 0,
      inv_average_cost_netto: averageCostNetto,
      inv_average_cost_brutto: averageCostBrutto,
    };
  }

  /**
   * Fetch sales document data (invoices + receipts) for order enrichment.
   * Builds a Map of order_id -> { invoice, correction, receipt } for fast lookup.
   *
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters (date_from used for date range)
   * @returns {Promise<Map<number, object>>} - Map of order_id -> document data
   */
  async fetchDocumentDataForOrders(client, apiFilters = {}) {
    const documentMap = new Map();

    // Fetch invoices
    let invoices = [];
    try {
      invoices = await client.getInvoicesWithPagination({
        date_from: apiFilters.date_confirmed_from || apiFilters.date_from,
      });
      logger.info('Fetched invoices for order enrichment', { count: invoices.length });
    } catch (error) {
      logger.warn('Failed to fetch invoices for order enrichment', { error: error.message });
    }

    // Fetch receipts
    let receipts = [];
    try {
      receipts = await client.getReceiptsWithPagination({
        date_from: apiFilters.date_confirmed_from || apiFilters.date_from,
      });
      logger.info('Fetched receipts for order enrichment', { count: receipts.length });
    } catch (error) {
      logger.warn('Failed to fetch receipts for order enrichment', { error: error.message });
    }

    // Group invoices by order_id, picking latest normal + latest correcting
    for (const inv of invoices) {
      const orderId = inv.order_id;
      if (!orderId) continue;

      if (!documentMap.has(orderId)) {
        documentMap.set(orderId, { invoice: null, correction: null, receipt: null });
      }
      const entry = documentMap.get(orderId);

      if (inv.type === 'correcting') {
        if (!entry.correction || inv.invoice_id > entry.correction.invoice_id) {
          entry.correction = inv;
        }
      } else {
        // type 'normal' or any other = regular invoice
        if (!entry.invoice || inv.invoice_id > entry.invoice.invoice_id) {
          entry.invoice = inv;
        }
      }
    }

    // Group receipts by order_id, picking latest
    for (const rcpt of receipts) {
      const orderId = rcpt.order_id;
      if (!orderId) continue;

      if (!documentMap.has(orderId)) {
        documentMap.set(orderId, { invoice: null, correction: null, receipt: null });
      }
      const entry = documentMap.get(orderId);

      if (!entry.receipt || rcpt.receipt_id > (entry.receipt.receipt_id || 0)) {
        entry.receipt = rcpt;
      }
    }

    logger.info('Document enrichment data built', {
      ordersWithDocuments: documentMap.size,
      totalInvoices: invoices.length,
      totalReceipts: receipts.length,
    });

    return documentMap;
  }

  /**
   * Merge sales document data into an order record
   * Adds fv_* fields (legacy invoice/receipt details) and ds1_*, ds2_* fields (sales document slots)
   * @param {object} order - Order row
   * @param {object|null} docData - { invoice, correction, receipt } or null
   * @returns {object} - Order with fv_ and ds_ fields added
   */
  mergeDocumentData(order, docData) {
    const docs = docData || { invoice: null, correction: null, receipt: null };
    const inv = docs.invoice || {};
    const corr = docs.correction || {};
    const rcpt = docs.receipt || {};

    // Dokument sprzedaży 1 = Paragon (slot 1)
    let ds1_type = '';
    let ds1_number = '';
    let ds1_date = null;
    if (rcpt && (rcpt.receipt_full_nr || rcpt.receipt_id)) {
      ds1_type = 'Paragon';
      ds1_number = rcpt.receipt_full_nr || '';
      ds1_date = rcpt.date_add || null;
    }

    // Dokument sprzedaży 2 = Faktura (slot 2)
    let ds2_type = '';
    let ds2_number = '';
    let ds2_date = null;
    if (inv && (inv.number || inv.invoice_id)) {
      ds2_type = inv.type === 'correcting' ? 'Korekta' : 'Faktura';
      ds2_number = inv.number || '';
      ds2_date = inv.date_add || null;
    }

    return {
      ...order,
      // Faktura sprzedażowa (szczegóły - legacy fv_* fields)
      fv_number: inv.number || '',
      fv_date_add: inv.date_add || '',
      fv_date_sell: inv.date_sell || '',
      fv_date_pay_to: inv.date_pay_to || '',
      fv_total_brutto: inv.total_price_brutto || 0,
      fv_total_netto: inv.total_price_netto || 0,
      fv_currency: inv.currency || '',
      fv_payment: inv.payment || '',
      fv_seller: inv.seller || '',
      fv_external_number: inv.external_invoice_number || '',
      // Korekta
      fv_correction_number: corr.number || '',
      fv_correction_reason: corr.correcting_reason || '',
      fv_correction_date: corr.date_add || '',
      // Paragon (szczegóły - legacy fv_* fields)
      fv_receipt_nr: rcpt.receipt_full_nr || '',
      fv_receipt_date: rcpt.date_add || '',
      fv_receipt_nip: rcpt.nip || '',
      // Dokument sprzedaży 1 (Paragon - slot 1)
      ds1_type,
      ds1_number,
      ds1_date,
      // Dokument sprzedaży 2 (Faktura - slot 2)
      ds2_type,
      ds2_number,
      ds2_date,
    };
  }

  /**
   * Fetch order products (one row per product in order)
   * If selectedFields contains any inv_* fields, enriches with inventory data
   *
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters
   * @param {Array<string>} selectedFields - Selected fields (to determine if enrichment needed)
   * @param {object} settings - Export settings { inventoryPriceFormat, deliveryTaxRate }
   * @returns {Promise<Array>} - List of order products (flattened, optionally enriched)
   */
  async fetchOrderProducts(client, apiFilters = {}, selectedFields = [], settings = {}) {
    try {
      // Include commission data if commission fields are selected
      const filtersWithCommission = {
        ...apiFilters,
        include_commission_data: this.needsCommissionData(selectedFields)
      };
      const orders = await client.getOrdersWithPagination(filtersWithCommission);
      const deliveryTaxRate = settings.deliveryTaxRate || 23;

      // Flatten: one row per product
      const orderProducts = [];

      for (const order of orders) {
        if (!order.products || order.products.length === 0) {
          continue;
        }

        for (const product of order.products) {
          orderProducts.push({
            // === Zamówienie (kontekst) ===
            order_id: order.order_id,
            shop_order_id: order.shop_order_id,
            external_order_id: order.external_order_id,
            date_add: order.date_add,
            date_confirmed: order.date_confirmed,
            order_status_id: order.order_status_id,
            order_source: order.order_source,
            order_source_id: order.order_source_id,
            order_source_info: order.order_source_info,
            confirmed: order.confirmed,
            date_in_status: order.date_in_status,

            // === Dane klienta ===
            email: order.email,
            phone: order.phone,
            user_login: order.user_login,
            delivery_fullname: order.delivery_fullname,
            delivery_company: order.delivery_company,
            delivery_address: order.delivery_address,
            delivery_city: order.delivery_city,
            delivery_postcode: order.delivery_postcode,
            delivery_state: order.delivery_state,
            delivery_country: order.delivery_country,
            delivery_country_code: order.delivery_country_code,

            // === Punkt odbioru ===
            delivery_point_id: order.delivery_point_id,
            delivery_point_name: order.delivery_point_name,
            delivery_point_address: order.delivery_point_address,
            delivery_point_postcode: order.delivery_point_postcode,
            delivery_point_city: order.delivery_point_city,

            // === Płatność ===
            currency: order.currency,
            payment_method: order.payment_method,
            payment_method_cod: order.payment_method_cod,
            payment_done: order.payment_done,
            delivery_method: order.delivery_method,
            delivery_method_id: order.delivery_method_id,
            delivery_price_brutto: order.delivery_price || 0,
            delivery_price_netto: calculatePriceVariant(order.delivery_price, deliveryTaxRate, 'to_netto'),

            // === Wysyłka ===
            delivery_package_module: order.delivery_package_module,
            delivery_package_nr: order.delivery_package_nr,

            // === Faktura ===
            invoice_fullname: order.invoice_fullname,
            invoice_company: order.invoice_company,
            invoice_nip: order.invoice_nip,
            invoice_address: order.invoice_address,
            invoice_postcode: order.invoice_postcode,
            invoice_city: order.invoice_city,
            invoice_state: order.invoice_state,
            invoice_country: order.invoice_country,
            invoice_country_code: order.invoice_country_code,
            want_invoice: order.want_invoice,

            // === Komentarze ===
            user_comments: order.user_comments,
            admin_comments: order.admin_comments,
            extra_field_1: order.extra_field_1,
            extra_field_2: order.extra_field_2,

            // === Status ===
            order_page: order.order_page,
            pick_state: order.pick_state,
            pack_state: order.pack_state,

            // === Prowizja marketplace ===
            commission_net: order.commission?.net || null,
            commission_gross: order.commission?.gross || null,
            commission_currency: order.commission?.currency || null,

            // === Pozycja zamówienia (produkt) ===
            order_product_id: product.order_product_id,
            product_id: product.product_id,
            variant_id: product.variant_id,
            name: product.name,
            sku: product.sku,
            ean: product.ean,
            attributes: product.attributes,
            location: product.location,
            auction_id: product.auction_id,
            quantity: product.quantity,
            price_brutto: product.price_brutto,
            price_netto: calculatePriceVariant(product.price_brutto, product.tax_rate, 'to_netto'),
            tax_rate: product.tax_rate,
            weight: product.weight,
            storage: product.storage,
            storage_id: product.storage_id,
            warehouse_id: product.warehouse_id,
            bundle_id: product.bundle_id,
          });
        }
      }

      // Inventory enrichment pipeline
      if (this.needsInventoryEnrichment(selectedFields) && orderProducts.length > 0) {
        logger.info('Inventory enrichment requested for order_products', {
          orderProductCount: orderProducts.length,
          selectedInvFields: selectedFields.filter(f => f.startsWith('inv_'))
        });

        // Collect unique product_ids
        const uniqueProductIds = [...new Set(
          orderProducts
            .map(op => String(op.product_id))
            .filter(id => id && id !== '0' && id !== 'undefined' && id !== 'null')
        )];

        // Fetch inventory data
        const inventoryMap = await this.fetchInventoryDataForProducts(client, uniqueProductIds);

        const inventoryPriceFormat = settings.inventoryPriceFormat || 'brutto';

        // Merge inventory data into each order product
        return orderProducts.map(op =>
          this.mergeInventoryData(op, inventoryMap.get(String(op.product_id)), inventoryPriceFormat)
        );
      }

      return orderProducts;
    } catch (error) {
      logger.error('Failed to fetch order products', { error: error.message });
      throw error;
    }
  }

  /**
   * Transform raw data to match selected fields
   * @param {Array} rawData - Raw data from BaseLinker
   * @param {Array<string>} selectedFields - Selected field keys
   * @param {string} dataset - Dataset type
   * @param {object} settings - Export settings { decimalSeparator }
   * @returns {object} - { headers, data }
   */
  transformData(rawData, selectedFields, dataset, settings = {}) {
    if (selectedFields.length === 0) {
      return { headers: [], data: [] };
    }

    // Get field labels and types from export-fields config
    const datasetConfig = exportFields.datasets[dataset];
    const fieldLabels = {};
    const fieldTypes = {};

    if (datasetConfig) {
      for (const field of datasetConfig.fields) {
        fieldLabels[field.key] = field.label;
        fieldTypes[field.key] = field.type;
      }
    }

    // Get decimal separator from settings (default: comma for Polish format)
    const decimalSeparator = settings?.decimalSeparator || ',';

    // Create headers (with backward compatibility for renamed fields)
    const headers = selectedFields.map(fieldKey => {
      const effectiveKey = FIELD_MIGRATIONS[fieldKey] || fieldKey;
      return fieldLabels[effectiveKey] || fieldLabels[fieldKey] || fieldKey;
    });

    // Create data rows
    const data = rawData.map(record => {
      return selectedFields.map(fieldKey => {
        const effectiveKey = FIELD_MIGRATIONS[fieldKey] || fieldKey;
        let value = record[effectiveKey];

        // Format numbers with correct decimal separator
        if (fieldTypes[effectiveKey] === 'number' && typeof value === 'number') {
          value = String(value).replace('.', decimalSeparator);
        }

        // Format dates (unix timestamp to readable)
        if (fieldKey.includes('date_') && typeof value === 'number' && value > 0) {
          value = new Date(value * 1000).toISOString().slice(0, 19).replace('T', ' ');
        }

        // Format booleans
        if (typeof value === 'boolean') {
          value = value ? 'Tak' : 'Nie';
        }

        return value !== undefined && value !== null ? String(value) : '';
      });
    });

    return { headers, data };
  }

  /**
   * Get field labels mapping (legacy - now uses export-fields config)
   * @returns {object} - Field key to label mapping
   */
  getFieldLabels() {
    const labels = {};

    for (const [datasetKey, dataset] of Object.entries(exportFields.datasets)) {
      for (const field of dataset.fields) {
        labels[field.key] = field.label;
      }
    }

    return labels;
  }

  /**
   * Get export statistics
   * @param {string} exportId - Export ID
   * @returns {object} - Export statistics
   */
  getExportStats(exportId) {
    const config = exportConfigs[exportId];
    if (!config) {
      return null;
    }

    return {
      id: exportId,
      name: config.name,
      status: config.status || 'active',
      last_run: config.last_run,
      dataset: config.dataset,
      field_count: (config.selected_fields || []).length,
      schedule_minutes: config.schedule_minutes,
    };
  }
}

module.exports = new ExportService();
