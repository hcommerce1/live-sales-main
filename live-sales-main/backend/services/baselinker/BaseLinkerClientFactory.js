/**
 * BaseLinker Client Factory
 *
 * Creates BaseLinker API clients per company with:
 * - Token retrieval from CompanySecret
 * - Rate limiting per company
 * - Client caching with TTL
 *
 * This fixes the P0 bug where routes didn't pass tokens to the service.
 */

const axios = require('axios');
const companySecretService = require('../companySecret.service');
const logger = require('../../utils/logger');
const config = require('../../config/baselinker');

// Client cache with TTL (5 minutes)
const clientCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Rate limiter state per company
 * Uses token bucket algorithm
 */
const rateLimiters = new Map();

class RateLimiter {
  constructor(companyId, maxTokens = 100, refillPerSecond = 1.67) {
    this.companyId = companyId;
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillPerSecond = refillPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;

    if (this.tokens < 1) {
      // Calculate wait time
      const waitTime = Math.ceil((1 - this.tokens) / this.refillPerSecond * 1000);
      logger.debug('Rate limit reached, waiting', {
        companyId: this.companyId,
        waitTime,
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.acquire(); // Retry after wait
    }

    this.tokens -= 1;
    return true;
  }
}

/**
 * Get or create rate limiter for company
 */
function getRateLimiter(companyId) {
  if (!rateLimiters.has(companyId)) {
    rateLimiters.set(companyId, new RateLimiter(companyId));
  }
  return rateLimiters.get(companyId);
}

/**
 * BaseLinker Client for a specific company
 */
class BaseLinkerClient {
  constructor(token, companyId) {
    this.token = token;
    this.companyId = companyId;
    this.apiUrl = config.apiUrl || 'https://api.baselinker.com/connector.php';
    this.timeout = config.timeout || 30000;
    this.rateLimiter = getRateLimiter(companyId);
  }

  /**
   * Make API request with rate limiting and retry
   */
  async makeRequest(method, parameters = {}) {
    // Acquire rate limit token
    await this.rateLimiter.acquire();

    let lastError;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('BaseLinker API request', {
          companyId: this.companyId,
          method,
          attempt,
        });

        const response = await axios.post(
          this.apiUrl,
          new URLSearchParams({
            token: this.token,
            method: method,
            parameters: JSON.stringify(parameters),
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: this.timeout,
          }
        );

        if (response.data.status === 'ERROR') {
          const errorCode = response.data.error_code;
          const errorMessage = response.data.error_message || 'Unknown error';

          // Check for auth errors
          if (errorCode === 'ERROR_INVALID_TOKEN' || errorCode === 'ERROR_NO_ACCESS') {
            const error = new Error(`Authentication failed: ${errorMessage}`);
            error.code = 'AUTH_ERROR';
            throw error;
          }

          // Check for rate limit errors
          if (errorCode === 'ERROR_TOO_MANY_REQUESTS') {
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 1000;
              logger.warn('BaseLinker rate limited, backing off', {
                companyId: this.companyId,
                method,
                backoffMs,
              });
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
          }

          throw new Error(`BaseLinker API Error: ${errorMessage}`);
        }

        logger.debug('BaseLinker API response', {
          companyId: this.companyId,
          method,
          status: response.data.status,
        });

        return response.data;
      } catch (error) {
        lastError = error;

        // Don't retry auth errors
        if (error.code === 'AUTH_ERROR') {
          throw error;
        }

        // Retry on timeout or 5xx errors
        if (attempt < maxRetries) {
          const isRetryable =
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            (error.response && error.response.status >= 500);

          if (isRetryable) {
            const backoffMs = Math.pow(2, attempt) * 1000;
            logger.warn('BaseLinker request failed, retrying', {
              companyId: this.companyId,
              method,
              attempt,
              backoffMs,
              error: error.message,
            });
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError;
  }

  // ============================================
  // API Methods
  // ============================================

  async getOrders(filters = {}) {
    const parameters = {
      date_confirmed_from: filters.date_from
        ? Math.floor(new Date(filters.date_from).getTime() / 1000)
        : undefined,
      date_confirmed_to: filters.date_to
        ? Math.floor(new Date(filters.date_to).getTime() / 1000)
        : undefined,
      order_status_id: filters.status || undefined,
      get_unconfirmed_orders: filters.get_unconfirmed || false,
      filter_id: filters.filter_id || undefined,
    };

    // Remove undefined values
    Object.keys(parameters).forEach((key) => {
      if (parameters[key] === undefined) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest('getOrders', parameters);
    return response.orders || [];
  }

  async getOrderDetails(orderId) {
    const response = await this.makeRequest('getOrderDetails', { order_id: orderId });
    return response.order || null;
  }

  async getOrderStatusList() {
    const response = await this.makeRequest('getOrderStatusList', {});
    return response.statuses || [];
  }

  async getInventories() {
    const response = await this.makeRequest('getInventories', {});
    return response.inventories || [];
  }

  async getInventoryProductsList(inventoryId, filters = {}) {
    const parameters = {
      inventory_id: inventoryId,
      filter_id: filters.filter_id || undefined,
      filter_category_id: filters.category_id || undefined,
      filter_ean: filters.ean || undefined,
      filter_sku: filters.sku || undefined,
      filter_name: filters.name || undefined,
      filter_price_from: filters.price_from || undefined,
      filter_price_to: filters.price_to || undefined,
      filter_quantity_from: filters.quantity_from || undefined,
      filter_quantity_to: filters.quantity_to || undefined,
      page: filters.page || 1,
    };

    // Remove undefined values
    Object.keys(parameters).forEach((key) => {
      if (parameters[key] === undefined) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest('getInventoryProductsList', parameters);
    return response.products || [];
  }

  async getInventoryProductsData(productIds, inventoryId) {
    const response = await this.makeRequest('getInventoryProductsData', {
      inventory_id: inventoryId,
      products: productIds,
    });
    return response.products || {};
  }

  async getInventoryProductsStock(inventoryId, page = 1) {
    const response = await this.makeRequest('getInventoryProductsStock', {
      inventory_id: inventoryId,
      page: page,
    });
    return response.products || {};
  }

  /**
   * Get order sources (shop, personal, marketplaces)
   */
  async getOrderSources() {
    const response = await this.makeRequest('getOrderSources', {});
    return response.sources || {};
  }

  /**
   * Get invoices with optional filters
   */
  async getInvoices(filters = {}) {
    const parameters = {
      invoice_id: filters.invoice_id || undefined,
      order_id: filters.order_id || undefined,
      date_from: filters.date_from
        ? Math.floor(new Date(filters.date_from).getTime() / 1000)
        : undefined,
      id_from: filters.id_from || undefined,
      series_id: filters.series_id || undefined,
      get_external_invoices: filters.get_external_invoices !== undefined
        ? filters.get_external_invoices
        : true,
    };

    // Remove undefined values
    Object.keys(parameters).forEach((key) => {
      if (parameters[key] === undefined) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest('getInvoices', parameters);
    return response.invoices || [];
  }

  /**
   * Get invoice PDF file
   */
  async getInvoiceFile(invoiceId, getExternal = false) {
    const response = await this.makeRequest('getInvoiceFile', {
      invoice_id: invoiceId,
      get_external: getExternal,
    });
    return {
      invoice: response.invoice || null,
      invoice_number: response.invoice_number || null,
    };
  }

  /**
   * Get orders with pagination (fetches all in batches of 100)
   * @param {object} filters - Order filters
   * @param {number} maxRecords - Maximum records to fetch
   */
  async getOrdersWithPagination(filters = {}, maxRecords = 10000) {
    const BATCH_SIZE = 100;
    let allOrders = [];
    let lastDateConfirmed = filters.date_from
      ? Math.floor(new Date(filters.date_from).getTime() / 1000)
      : 0;
    let hasMore = true;

    while (hasMore && allOrders.length < maxRecords) {
      const parameters = {
        date_confirmed_from: lastDateConfirmed,
        date_confirmed_to: filters.date_to
          ? Math.floor(new Date(filters.date_to).getTime() / 1000)
          : undefined,
        order_status_id: filters.status || undefined,
        get_unconfirmed_orders: filters.get_unconfirmed || false,
        filter_order_source: filters.order_source || undefined,
        filter_order_source_id: filters.order_source_id || undefined,
      };

      // Remove undefined values
      Object.keys(parameters).forEach((key) => {
        if (parameters[key] === undefined) {
          delete parameters[key];
        }
      });

      const response = await this.makeRequest('getOrders', parameters);
      const batch = response.orders || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allOrders = allOrders.concat(batch);
        const lastOrder = batch[batch.length - 1];
        lastDateConfirmed = lastOrder.date_confirmed + 1;
        hasMore = batch.length === BATCH_SIZE;
      }
    }

    logger.info('Fetched orders with pagination', {
      companyId: this.companyId,
      count: allOrders.length,
      batchCount: Math.ceil(allOrders.length / BATCH_SIZE),
    });

    return allOrders;
  }

  /**
   * Get invoices with pagination (fetches all in batches of 100)
   * @param {object} filters - Invoice filters
   * @param {number} maxRecords - Maximum records to fetch
   */
  async getInvoicesWithPagination(filters = {}, maxRecords = 10000) {
    const BATCH_SIZE = 100;
    let allInvoices = [];
    let lastId = filters.id_from || 0;
    let hasMore = true;

    while (hasMore && allInvoices.length < maxRecords) {
      const parameters = {
        id_from: lastId,
        date_from: filters.date_from
          ? Math.floor(new Date(filters.date_from).getTime() / 1000)
          : undefined,
        series_id: filters.series_id || undefined,
        get_external_invoices: filters.get_external_invoices !== undefined
          ? filters.get_external_invoices
          : true,
      };

      // Remove undefined values
      Object.keys(parameters).forEach((key) => {
        if (parameters[key] === undefined) {
          delete parameters[key];
        }
      });

      const response = await this.makeRequest('getInvoices', parameters);
      const batch = response.invoices || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allInvoices = allInvoices.concat(batch);
        const lastInvoice = batch[batch.length - 1];
        lastId = lastInvoice.invoice_id + 1;
        hasMore = batch.length === BATCH_SIZE;
      }
    }

    logger.info('Fetched invoices with pagination', {
      companyId: this.companyId,
      count: allInvoices.length,
      batchCount: Math.ceil(allInvoices.length / BATCH_SIZE),
    });

    return allInvoices;
  }
}

/**
 * Create BaseLinker client for company
 *
 * @param {string} companyId
 * @returns {Promise<BaseLinkerClient>}
 * @throws {Error} If token not configured
 */
async function createForCompany(companyId) {
  logger.info('=== CREATE BASELINKER CLIENT ===', {
    companyId,
    companyIdType: typeof companyId,
    timestamp: new Date().toISOString()
  });

  // Check cache first
  const cacheKey = `bl:${companyId}`;
  const cached = clientCache.get(cacheKey);

  logger.info('Cache check', {
    companyId,
    cacheKey,
    hasCached: !!cached,
    cachedCreatedAt: cached?.createdAt,
    cacheAge: cached ? Date.now() - cached.createdAt : null,
    cacheTTL: CACHE_TTL_MS,
    isCacheValid: cached && Date.now() - cached.createdAt < CACHE_TTL_MS
  });

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    logger.info('Returning cached client', { companyId });
    return cached.client;
  }

  // Get token from CompanySecret
  logger.info('Fetching token from CompanySecret', {
    companyId,
    secretType: companySecretService.SECRET_TYPES.BASELINKER_TOKEN
  });

  const secret = await companySecretService.getSecret(
    companyId,
    companySecretService.SECRET_TYPES.BASELINKER_TOKEN
  );

  logger.info('CompanySecret lookup result', {
    companyId,
    secretFound: !!secret,
    secretHasValue: secret ? !!secret.value : false,
    secretValueLength: secret?.value ? secret.value.length : 0,
    secretCreatedAt: secret?.createdAt,
    secretUpdatedAt: secret?.updatedAt,
    secretLastUsedAt: secret?.lastUsedAt
  });

  if (!secret) {
    logger.error('BaseLinker token NOT FOUND in CompanySecret', {
      companyId,
      secretType: companySecretService.SECRET_TYPES.BASELINKER_TOKEN,
      suggestion: 'User needs to save token in Configuration page'
    });
    const error = new Error('BaseLinker token not configured for this company');
    error.code = 'TOKEN_NOT_CONFIGURED';
    throw error;
  }

  // Create client
  logger.info('Creating BaseLinker client', {
    companyId,
    tokenLength: secret.value.length,
    tokenPrefix: secret.value.substring(0, 8) + '...'
  });

  const client = new BaseLinkerClient(secret.value, companyId);

  // Cache it
  clientCache.set(cacheKey, {
    client,
    createdAt: Date.now(),
  });

  logger.info('BaseLinker client created and cached', { companyId, cacheKey });

  // Clean cache after TTL
  setTimeout(() => {
    clientCache.delete(cacheKey);
  }, CACHE_TTL_MS);

  return client;
}

/**
 * Invalidate cached client for company
 *
 * @param {string} companyId
 */
function invalidateCache(companyId) {
  const cacheKey = `bl:${companyId}`;
  clientCache.delete(cacheKey);
}

/**
 * Express middleware to inject BaseLinker client into request
 *
 * Usage:
 *   router.get('/orders', baseLinkerMiddleware, async (req, res) => {
 *     const orders = await req.baselinker.getOrders(filters);
 *   });
 */
function baseLinkerMiddleware(req, res, next) {
  // Require company context
  if (!req.company) {
    return res.status(400).json({
      error: 'Company context required',
      code: 'COMPANY_REQUIRED',
    });
  }

  // Lazy load client on first access
  let client = null;

  Object.defineProperty(req, 'baselinker', {
    get: async function () {
      if (!client) {
        try {
          client = await createForCompany(req.company.id);
        } catch (error) {
          if (error.code === 'TOKEN_NOT_CONFIGURED') {
            throw {
              status: 400,
              message: 'Please configure your BaseLinker API token in settings',
              code: 'BASELINKER_NOT_CONFIGURED',
            };
          }
          throw error;
        }
      }
      return client;
    },
  });

  next();
}

/**
 * Alternative: Get client directly (for use in services)
 */
async function getClient(companyId) {
  return createForCompany(companyId);
}

module.exports = {
  BaseLinkerClient,
  createForCompany,
  getClient,
  invalidateCache,
  baseLinkerMiddleware,
};
