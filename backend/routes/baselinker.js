/**
 * BaseLinker Routes
 *
 * API endpoints for BaseLinker integration.
 * All routes require authentication and company context.
 *
 * P0 FIX: Now properly retrieves token from CompanySecret
 * and uses BaseLinkerClientFactory for client creation.
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { companyContextMiddleware, requireCompany } = require('../middleware/companyContext');
const { featureFlagMiddleware } = require('../middleware/featureFlag');
const { getClient } = require('../services/baselinker');
const {
  validate,
  orderIdParamSchema,
  packageIdParamSchema,
  courierCodeParamSchema,
  journalQuerySchema,
  ordersByEmailQuerySchema,
  ordersByPhoneQuerySchema,
  transactionQuerySchema,
  paymentsHistoryQuerySchema,
  pickPackQuerySchema,
  statusHistoryQuerySchema,
  receiptsQuerySchema,
  newReceiptsQuerySchema,
  courierServicesQuerySchema,
} = require('../validators/schemas');

// ============================================
// Middleware Stack
// ============================================

// All routes require company context
router.use(companyContextMiddleware);
router.use(requireCompany);

// ============================================
// Helper: Get BaseLinker client for company
// ============================================

async function getBaseLinkerClient(req, res) {
  try {
    const client = await getClient(req.company.id);
    return client;
  } catch (error) {
    if (error.code === 'TOKEN_NOT_CONFIGURED') {
      res.status(400).json({
        success: false,
        error: 'BaseLinker API token not configured',
        code: 'BASELINKER_NOT_CONFIGURED',
        message: 'Please configure your BaseLinker API token in Settings → Integrations',
      });
      return null;
    }
    throw error;
  }
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/baselinker/orders
 * Get orders from Baselinker
 */
router.get('/orders', featureFlagMiddleware('baselinker.orders'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const filters = {
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      filter_id: req.query.filter_id,
      get_unconfirmed: req.query.get_unconfirmed === 'true',
    };

    const orders = await client.getOrders(filters);

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    if (error.code === 'AUTH_ERROR') {
      return res.status(401).json({
        success: false,
        error: 'BaseLinker authentication failed',
        code: 'BASELINKER_AUTH_ERROR',
        message: 'Please check your BaseLinker API token',
      });
    }

    logger.error('Failed to fetch orders', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/order/:id
 * Get single order details
 */
router.get('/order/:id', featureFlagMiddleware('baselinker.orders'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID',
      });
    }

    const order = await client.getOrderDetails(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Failed to fetch order details', {
      error: error.message,
      orderId: req.params.id,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/products
 * Get products from Baselinker inventory
 */
router.get('/products', featureFlagMiddleware('baselinker.products'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const inventoryId = parseInt(req.query.inventory_id, 10);
    if (!inventoryId || isNaN(inventoryId)) {
      return res.status(400).json({
        success: false,
        error: 'inventory_id is required',
      });
    }

    const filters = {
      category_id: req.query.category_id,
      ean: req.query.ean,
      sku: req.query.sku,
      name: req.query.name,
      price_from: req.query.price_from,
      price_to: req.query.price_to,
      quantity_from: req.query.quantity_from,
      quantity_to: req.query.quantity_to,
      page: parseInt(req.query.page, 10) || 1,
    };

    const products = await client.getInventoryProductsList(inventoryId, filters);

    res.json({
      success: true,
      count: products.length,
      page: filters.page,
      data: products,
    });
  } catch (error) {
    logger.error('Failed to fetch products', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/products/:inventoryId/data
 * Get detailed product data
 */
router.get(
  '/products/:inventoryId/data',
  featureFlagMiddleware('baselinker.products'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const inventoryId = parseInt(req.params.inventoryId, 10);
      const productIds = req.query.ids?.split(',').map((id) => parseInt(id, 10));

      if (!inventoryId || isNaN(inventoryId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid inventory ID',
        });
      }

      if (!productIds || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Product IDs required (comma-separated)',
        });
      }

      const products = await client.getInventoryProductsData(productIds, inventoryId);

      res.json({
        success: true,
        count: Object.keys(products).length,
        data: products,
      });
    } catch (error) {
      logger.error('Failed to fetch product data', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/products/:inventoryId/stock
 * Get product stock levels
 */
router.get(
  '/products/:inventoryId/stock',
  featureFlagMiddleware('baselinker.products'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const inventoryId = parseInt(req.params.inventoryId, 10);
      const page = parseInt(req.query.page, 10) || 1;

      if (!inventoryId || isNaN(inventoryId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid inventory ID',
        });
      }

      const stock = await client.getInventoryProductsStock(inventoryId, page);

      res.json({
        success: true,
        page,
        data: stock,
      });
    } catch (error) {
      logger.error('Failed to fetch product stock', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order-statuses
 * Get available order statuses
 */
router.get('/order-statuses', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const statuses = await client.getOrderStatusList();

    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    logger.error('Failed to fetch order statuses', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/order-sources
 * Get available order sources (shop, personal, marketplaces)
 */
router.get('/order-sources', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const sources = await client.getOrderSources();

    res.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    logger.error('Failed to fetch order sources', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/invoices
 * Get invoices from BaseLinker
 */
router.get('/invoices', featureFlagMiddleware('baselinker.invoices'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const filters = {
      invoice_id: req.query.invoice_id ? parseInt(req.query.invoice_id, 10) : null,
      order_id: req.query.order_id ? parseInt(req.query.order_id, 10) : null,
      date_from: req.query.date_from,
      id_from: req.query.id_from ? parseInt(req.query.id_from, 10) : null,
      series_id: req.query.series_id ? parseInt(req.query.series_id, 10) : null,
      get_external_invoices: req.query.get_external_invoices !== 'false',
    };

    const invoices = await client.getInvoices(filters);

    res.json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (error) {
    logger.error('Failed to fetch invoices', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/invoice/:id/file
 * Get invoice PDF file
 */
router.get('/invoice/:id/file', featureFlagMiddleware('baselinker.invoices'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice ID',
      });
    }

    const getExternal = req.query.external === 'true';
    const result = await client.getInvoiceFile(invoiceId, getExternal);

    if (!result.invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice file not found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to fetch invoice file', {
      error: error.message,
      invoiceId: req.params.id,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/inventories
 * Get available inventories
 */
router.get('/inventories', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const inventories = await client.getInventories();

    res.json({
      success: true,
      data: inventories,
    });
  } catch (error) {
    logger.error('Failed to fetch inventories', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/external-storages
 * Get list of external storages (shops, wholesalers)
 */
router.get('/external-storages', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const response = await client.makeRequest('getExternalStoragesList', {});

    res.json({
      success: true,
      data: response.storages || [],
    });
  } catch (error) {
    logger.error('Failed to fetch external storages', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/connect-integrations
 * Get Base Connect integrations (B2B)
 */
router.get('/connect-integrations', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const response = await client.makeRequest('getConnectIntegrations', {});

    res.json({
      success: true,
      data: response.integrations || {},
    });
  } catch (error) {
    logger.error('Failed to fetch connect integrations', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/status
 * Get integration status (is token configured?)
 */
router.get('/status', async (req, res) => {
  try {
    const companySecretService = require('../services/companySecret.service');

    const hasToken = await companySecretService.hasSecret(
      req.company.id,
      companySecretService.SECRET_TYPES.BASELINKER_TOKEN
    );

    res.json({
      success: true,
      data: {
        configured: hasToken,
        companyId: req.company.id,
      },
    });
  } catch (error) {
    logger.error('Failed to get integration status', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Courier Shipments
// ============================================

/**
 * GET /api/baselinker/couriers
 * Get list of available couriers (reference data, no feature flag)
 */
router.get('/couriers', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const couriers = await client.getCouriersList();

    res.json({
      success: true,
      count: couriers.length,
      data: couriers,
    });
  } catch (error) {
    logger.error('Failed to fetch couriers list', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/couriers/:code/accounts
 * Get courier accounts (reference data, no feature flag)
 */
router.get('/couriers/:code/accounts', validate(courierCodeParamSchema, 'params'), async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const accounts = await client.getCourierAccounts(req.params.code);

    res.json({
      success: true,
      count: accounts.length,
      data: accounts,
    });
  } catch (error) {
    logger.error('Failed to fetch courier accounts', {
      error: error.message,
      courierCode: req.params.code,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/baselinker/couriers/:code/services
 * Get available courier services for an order
 */
router.get(
  '/couriers/:code/services',
  featureFlagMiddleware('baselinker.courier'),
  validate(courierCodeParamSchema, 'params'),
  validate(courierServicesQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      let fields, packages;
      try {
        fields = JSON.parse(req.query.fields);
        packages = JSON.parse(req.query.packages);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON in fields or packages parameter',
        });
      }

      const accountId = req.query.account_id ? parseInt(req.query.account_id, 10) : undefined;
      const orderId = parseInt(req.query.order_id, 10);

      const services = await client.getCourierServices(
        req.params.code,
        orderId,
        fields,
        packages,
        accountId
      );

      res.json({
        success: true,
        data: services,
      });
    } catch (error) {
      logger.error('Failed to fetch courier services', {
        error: error.message,
        courierCode: req.params.code,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/packages/status-history
 * Get courier packages status history (BEFORE :id routes)
 */
router.get(
  '/packages/status-history',
  featureFlagMiddleware('baselinker.courier'),
  validate(statusHistoryQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const packageIds = req.query.ids.split(',').map(Number);

      if (packageIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 100 package IDs allowed per request',
        });
      }

      const history = await client.getCourierPackagesStatusHistory(packageIds);

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Failed to fetch packages status history', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/packages/:id/details
 * Get package details (dimensions, weight, etc.)
 */
router.get(
  '/packages/:id/details',
  featureFlagMiddleware('baselinker.courier'),
  validate(packageIdParamSchema, 'params'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const packageId = parseInt(req.params.id, 10);
      const details = await client.getPackageDetails(packageId);

      res.json({
        success: true,
        data: details,
      });
    } catch (error) {
      logger.error('Failed to fetch package details', {
        error: error.message,
        packageId: req.params.id,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order/:id/packages
 * Get packages for an order
 */
router.get(
  '/order/:id/packages',
  featureFlagMiddleware('baselinker.courier'),
  validate(orderIdParamSchema, 'params'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orderId = parseInt(req.params.id, 10);
      const packages = await client.getOrderPackages(orderId);

      res.json({
        success: true,
        count: packages.length,
        data: packages,
      });
    } catch (error) {
      logger.error('Failed to fetch order packages', {
        error: error.message,
        orderId: req.params.id,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ============================================
// Orders Extended
// ============================================

/**
 * GET /api/baselinker/order/:id/transaction
 * Get order transaction data
 */
router.get(
  '/order/:id/transaction',
  featureFlagMiddleware('baselinker.orders'),
  validate(orderIdParamSchema, 'params'),
  validate(transactionQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orderId = parseInt(req.params.id, 10);
      const options = {
        include_complex_taxes: req.query.include_complex_taxes === 'true',
        include_amazon_data: req.query.include_amazon_data === 'true',
      };

      const data = await client.getOrderTransactionData(orderId, options);

      res.json({
        success: true,
        data: data,
      });
    } catch (error) {
      logger.error('Failed to fetch order transaction data', {
        error: error.message,
        orderId: req.params.id,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order/:id/payments-history
 * Get order payments history
 */
router.get(
  '/order/:id/payments-history',
  featureFlagMiddleware('baselinker.orders'),
  validate(orderIdParamSchema, 'params'),
  validate(paymentsHistoryQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orderId = parseInt(req.params.id, 10);
      const showFullHistory = req.query.show_full_history === 'true';

      const payments = await client.getOrderPaymentsHistory(orderId, showFullHistory);

      res.json({
        success: true,
        count: payments.length,
        data: payments,
      });
    } catch (error) {
      logger.error('Failed to fetch order payments history', {
        error: error.message,
        orderId: req.params.id,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order/:id/pick-pack-history
 * Get order pick & pack history
 */
router.get(
  '/order/:id/pick-pack-history',
  featureFlagMiddleware('baselinker.orders'),
  validate(orderIdParamSchema, 'params'),
  validate(pickPackQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orderId = parseInt(req.params.id, 10);
      const actionType = req.query.action_type ? parseInt(req.query.action_type, 10) : undefined;

      const history = await client.getOrderPickPackHistory(orderId, actionType);

      res.json({
        success: true,
        count: history.length,
        data: history,
      });
    } catch (error) {
      logger.error('Failed to fetch order pick-pack history', {
        error: error.message,
        orderId: req.params.id,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/orders/by-email
 * Find orders by customer email
 */
router.get(
  '/orders/by-email',
  featureFlagMiddleware('baselinker.orders'),
  validate(ordersByEmailQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orders = await client.getOrdersByEmail(req.query.email);

      res.json({
        success: true,
        count: orders.length,
        data: orders,
      });
    } catch (error) {
      logger.error('Failed to fetch orders by email', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/orders/by-phone
 * Find orders by customer phone
 */
router.get(
  '/orders/by-phone',
  featureFlagMiddleware('baselinker.orders'),
  validate(ordersByPhoneQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const orders = await client.getOrdersByPhone(req.query.phone);

      res.json({
        success: true,
        count: orders.length,
        data: orders,
      });
    } catch (error) {
      logger.error('Failed to fetch orders by phone', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/journal
 * Get order journal (change log). Max 3 days of logs.
 */
router.get(
  '/journal',
  featureFlagMiddleware('baselinker.orders'),
  validate(journalQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const filters = {
        last_log_id: req.query.last_log_id ? parseInt(req.query.last_log_id, 10) : undefined,
        logs_types: req.query.logs_types ? req.query.logs_types.split(',').map(Number) : undefined,
        order_id: req.query.order_id ? parseInt(req.query.order_id, 10) : undefined,
      };

      const logs = await client.getJournalList(filters);

      res.json({
        success: true,
        count: logs.length,
        data: logs,
      });
    } catch (error) {
      logger.error('Failed to fetch journal list', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/order-extra-fields
 * Get order extra field definitions (reference data, no feature flag)
 */
router.get('/order-extra-fields', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const extraFields = await client.getOrderExtraFields();

    res.json({
      success: true,
      data: extraFields,
    });
  } catch (error) {
    logger.error('Failed to fetch order extra fields', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Receipts
// ============================================

/**
 * GET /api/baselinker/receipts/new
 * Get new receipts (not yet printed) — BEFORE /receipts
 */
router.get(
  '/receipts/new',
  featureFlagMiddleware('baselinker.receipts'),
  validate(newReceiptsQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const filters = {
        series_id: req.query.series_id ? parseInt(req.query.series_id, 10) : undefined,
        id_from: req.query.id_from ? parseInt(req.query.id_from, 10) : undefined,
      };

      const receipts = await client.getNewReceipts(filters);

      res.json({
        success: true,
        count: receipts.length,
        data: receipts,
      });
    } catch (error) {
      logger.error('Failed to fetch new receipts', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/receipts
 * Get receipts (max 100 per request)
 */
router.get(
  '/receipts',
  featureFlagMiddleware('baselinker.receipts'),
  validate(receiptsQuerySchema, 'query'),
  async (req, res) => {
    try {
      const client = await getBaseLinkerClient(req, res);
      if (!client) return;

      const filters = {
        series_id: req.query.series_id ? parseInt(req.query.series_id, 10) : undefined,
        id_from: req.query.id_from ? parseInt(req.query.id_from, 10) : undefined,
        date_from: req.query.date_from ? parseInt(req.query.date_from, 10) : undefined,
        date_to: req.query.date_to ? parseInt(req.query.date_to, 10) : undefined,
      };

      const receipts = await client.getReceipts(filters);

      res.json({
        success: true,
        count: receipts.length,
        data: receipts,
      });
    } catch (error) {
      logger.error('Failed to fetch receipts', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/baselinker/series
 * Get numbering series (reference data, no feature flag)
 */
router.get('/series', async (req, res) => {
  try {
    const client = await getBaseLinkerClient(req, res);
    if (!client) return;

    const series = await client.getSeries();

    res.json({
      success: true,
      count: series.length,
      data: series,
    });
  } catch (error) {
    logger.error('Failed to fetch series', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
