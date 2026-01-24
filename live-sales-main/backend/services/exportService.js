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

const { getClient } = require('./baselinker');
const googleSheetsService = require('./googleSheetsService');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const exportFields = require('../config/export-fields');

const prisma = new PrismaClient();

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
  /**
   * Get all export configurations
   * @returns {Array} - List of exports
   */
  getAllExports() {
    return Object.values(exportConfigs);
  }

  /**
   * Get export configuration by ID
   * @param {string} exportId - Export ID
   * @returns {object|null} - Export configuration
   */
  getExport(exportId) {
    return exportConfigs[exportId] || null;
  }

  /**
   * Save export configuration
   * @param {string} exportId - Export ID
   * @param {object} config - Export configuration
   * @param {string} userId - User ID (owner of the export)
   * @returns {object} - Saved export configuration
   */
  saveExport(exportId, config, userId = null) {
    exportConfigs[exportId] = {
      ...config,
      id: exportId,
      userId: userId || config.userId,
      updatedAt: new Date().toISOString(),
    };
    logger.info('Export configuration saved', { exportId, userId });
    return exportConfigs[exportId];
  }

  /**
   * Delete export configuration
   * @param {string} exportId - Export ID
   * @returns {boolean} - True if deleted
   */
  deleteExport(exportId) {
    if (exportConfigs[exportId]) {
      delete exportConfigs[exportId];
      logger.info('Export configuration deleted', { exportId });
      return true;
    }
    return false;
  }

  /**
   * Run export - fetch data from BaseLinker and write to Google Sheets
   * Now supports: orders, products, invoices, order_products
   *
   * @param {string} exportId - Export ID
   * @param {string} userId - User ID (to fetch BaseLinker token)
   * @returns {Promise<object>} - Export result
   */
  async runExport(exportId, userId = null) {
    const startTime = Date.now();

    logger.info('=== EXPORT RUN START ===', {
      exportId,
      userId,
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
      triggeredBy: userId ? 'manual' : 'scheduler',
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
          rawData = await this.fetchOrders(client, apiFilters);
          break;
        case 'products':
          rawData = await this.fetchProducts(client, apiFilters);
          break;
        case 'invoices':
          rawData = await this.fetchInvoices(client, apiFilters);
          break;
        case 'order_products':
          rawData = await this.fetchOrderProducts(client, apiFilters);
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
        config.dataset
      );
      metadata.phases.transformData = Date.now() - transformStart;

      if (data.length === 0) {
        logger.warn('No data to export', { exportId });
        return {
          success: true,
          recordCount: 0,
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

      metadata.sheetsWritten = writeResults;
      metadata.durationMs = Date.now() - startTime;

      logger.info('Export completed', {
        exportId,
        recordCount: data.length,
        status: allSuccess ? 'success' : (someSuccess ? 'partial_failure' : 'failure'),
        durationMs: metadata.durationMs
      });

      return {
        success: allSuccess,
        status: allSuccess ? 'success' : (someSuccess ? 'partial_failure' : 'failure'),
        recordCount: data.length,
        writeResults,
        metadata
      };
    } catch (error) {
      logger.error('Export failed', {
        exportId,
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
    // Debug: log all sheet-related config fields
    logger.info('[writeToSheets] Config fields', {
      hasSheets: !!config.sheets,
      hasSheetsConfig: !!config.sheets_config,
      hasSheetsUrl: !!config.sheetsUrl,
      sheetsType: config.sheets ? (Array.isArray(config.sheets) ? 'array' : typeof config.sheets) : 'undefined',
      sheetsConfigType: config.sheets_config ? (Array.isArray(config.sheets_config) ? 'array' : typeof config.sheets_config) : 'undefined',
      sheetsContent: JSON.stringify(config.sheets),
      sheetsConfigContent: JSON.stringify(config.sheets_config)
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

    logger.info('[writeToSheets] Resolved sheets config', {
      sheetsCount: sheets.length,
      sheets: JSON.stringify(sheets)
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

            logger.error('Google Sheets auth error - not retrying', {
              sheetUrl: sheet.sheet_url,
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
            logger.warn('Google Sheets write failed, retrying', {
              sheetUrl: sheet.sheet_url,
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
   * @returns {Promise<Array>} - List of orders (flat structure)
   */
  async fetchOrders(client, apiFilters = {}) {
    try {
      const orders = await client.getOrdersWithPagination(apiFilters);

      // Transform orders to flat structure with all available fields
      return orders.map(order => ({
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
        delivery_price: order.delivery_price,
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
        // Store products for order_products dataset
        _products: order.products
      }));
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
   * Fetch order products (one row per product in order)
   * @param {object} client - BaseLinker client
   * @param {object} apiFilters - API-side filters
   * @returns {Promise<Array>} - List of order products (flattened)
   */
  async fetchOrderProducts(client, apiFilters = {}) {
    try {
      const orders = await client.getOrdersWithPagination(apiFilters);

      // Flatten: one row per product
      const orderProducts = [];

      for (const order of orders) {
        if (!order.products || order.products.length === 0) {
          continue;
        }

        for (const product of order.products) {
          orderProducts.push({
            // Order context
            order_id: order.order_id,
            date_add: order.date_add,
            date_confirmed: order.date_confirmed,
            order_status_id: order.order_status_id,
            order_source: order.order_source,
            email: order.email,
            delivery_fullname: order.delivery_fullname,

            // Product data
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
            tax_rate: product.tax_rate,
            weight: product.weight,
            storage: product.storage,
            storage_id: product.storage_id,
            warehouse_id: product.warehouse_id,
            bundle_id: product.bundle_id,
          });
        }
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
   * @returns {object} - { headers, data }
   */
  transformData(rawData, selectedFields, dataset) {
    if (selectedFields.length === 0) {
      return { headers: [], data: [] };
    }

    // Get field labels from export-fields config
    const datasetConfig = exportFields.datasets[dataset];
    const fieldLabels = {};

    if (datasetConfig) {
      for (const field of datasetConfig.fields) {
        fieldLabels[field.key] = field.label;
      }
    }

    // Create headers
    const headers = selectedFields.map(fieldKey => {
      return fieldLabels[fieldKey] || fieldKey;
    });

    // Create data rows
    const data = rawData.map(record => {
      return selectedFields.map(fieldKey => {
        let value = record[fieldKey];

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
