const axios = require('axios');
const config = require('../config/baselinker');
const logger = require('../utils/logger');

class BaselinkerService {
  constructor() {
    this.apiUrl = config.apiUrl;
    this.timeout = config.timeout;
  }

  /**
   * Make API request to Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {string} method - API method name
   * @param {object} parameters - Request parameters
   * @returns {Promise<object>} - API response
   */
  async makeRequest(userToken, method, parameters = {}) {
    try {
      if (!userToken) {
        throw new Error('BaseLinker token is required. Please configure your token in Settings.');
      }

      logger.info(`Baselinker API Request: ${method}`, { parameters });

      const response = await axios.post(
        this.apiUrl,
        new URLSearchParams({
          token: userToken,
          method: method,
          parameters: JSON.stringify(parameters)
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: this.timeout
        }
      );

      if (response.data.status === 'ERROR') {
        throw new Error(`Baselinker API Error: ${response.data.error_message || 'Unknown error'}`);
      }

      logger.info(`Baselinker API Response: ${method}`, {
        status: response.data.status
      });

      return response.data;
    } catch (error) {
      logger.error(`Baselinker API Request Failed: ${method}`, {
        error: error.message,
        parameters
      });
      throw error;
    }
  }

  /**
   * Get orders from Baselinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Order filters
   * @returns {Promise<Array>} - List of orders
   */
  async getOrders(userToken, filters = {}) {
    const parameters = {
      date_confirmed_from: filters.date_from ? Math.floor(new Date(filters.date_from).getTime() / 1000) : null,
      date_confirmed_to: filters.date_to ? Math.floor(new Date(filters.date_to).getTime() / 1000) : null,
      order_status_id: filters.status || null,
      get_unconfirmed_orders: filters.get_unconfirmed || false,
      filter_id: filters.filter_id || null,
    };

    // Remove null values
    Object.keys(parameters).forEach(key => {
      if (parameters[key] === null) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest(userToken, 'getOrders', parameters);
    return response.orders || [];
  }

  /**
   * Get products from inventory
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} inventoryId - Inventory ID
   * @param {object} filters - Product filters
   * @returns {Promise<Array>} - List of products
   */
  async getInventoryProductsList(userToken, inventoryId = config.inventories.main, filters = {}) {
    const parameters = {
      inventory_id: inventoryId,
      filter_id: filters.filter_id || null,
      filter_category_id: filters.category_id || null,
      filter_ean: filters.ean || null,
      filter_sku: filters.sku || null,
      filter_name: filters.name || null,
      filter_price_from: filters.price_from || null,
      filter_price_to: filters.price_to || null,
      filter_quantity_from: filters.quantity_from || null,
      filter_quantity_to: filters.quantity_to || null,
      page: filters.page || 1,
    };

    // Remove null values
    Object.keys(parameters).forEach(key => {
      if (parameters[key] === null) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest(userToken, 'getInventoryProductsList', parameters);
    return response.products || [];
  }

  /**
   * Get detailed product data
   * @param {string} userToken - User's BaseLinker API token
   * @param {Array<number>} productIds - Array of product IDs
   * @param {number} inventoryId - Inventory ID
   * @returns {Promise<object>} - Product details
   */
  async getInventoryProductsData(userToken, productIds, inventoryId = config.inventories.main) {
    const parameters = {
      inventory_id: inventoryId,
      products: productIds
    };

    const response = await this.makeRequest(userToken, 'getInventoryProductsData', parameters);
    return response.products || {};
  }

  /**
   * Get inventory products stock
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} inventoryId - Inventory ID
   * @param {number} page - Page number
   * @returns {Promise<object>} - Products stock data
   */
  async getInventoryProductsStock(userToken, inventoryId = config.inventories.main, page = 1) {
    const parameters = {
      inventory_id: inventoryId,
      page: page
    };

    const response = await this.makeRequest(userToken, 'getInventoryProductsStock', parameters);
    return response.products || {};
  }

  /**
   * Get order details
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} orderId - Order ID
   * @returns {Promise<object>} - Order details
   */
  async getOrderDetails(userToken, orderId) {
    const parameters = {
      order_id: orderId
    };

    const response = await this.makeRequest(userToken, 'getOrderDetails', parameters);
    return response.order || null;
  }

  /**
   * Get available order statuses
   * @param {string} userToken - User's BaseLinker API token
   * @returns {Promise<Array>} - List of order statuses
   */
  async getOrderStatusList(userToken) {
    const response = await this.makeRequest(userToken, 'getOrderStatusList', {});
    return response.statuses || [];
  }

  /**
   * Get inventories list
   * @param {string} userToken - User's BaseLinker API token
   * @returns {Promise<Array>} - List of inventories
   */
  async getInventories(userToken) {
    const response = await this.makeRequest(userToken, 'getInventories', {});
    return response.inventories || [];
  }

  /**
   * Get order sources
   * Returns types of order sources along with their IDs.
   * @param {string} userToken - User's BaseLinker API token
   * @returns {Promise<object>} - Order sources grouped by type
   */
  async getOrderSources(userToken) {
    const response = await this.makeRequest(userToken, 'getOrderSources', {});
    return response.sources || {};
  }

  /**
   * Get invoices from BaseLinker
   * Maximum 100 invoices are returned at a time.
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Invoice filters
   * @param {number} filters.invoice_id - (optional) Specific invoice ID
   * @param {number} filters.order_id - (optional) Order ID to get invoice for
   * @param {number} filters.date_from - (optional) Unix timestamp start date
   * @param {number} filters.id_from - (optional) Invoice ID to paginate from
   * @param {number} filters.series_id - (optional) Numbering series ID
   * @param {boolean} filters.get_external_invoices - (optional) If false, omits external invoices
   * @returns {Promise<Array>} - List of invoices
   */
  async getInvoices(userToken, filters = {}) {
    const parameters = {
      invoice_id: filters.invoice_id || null,
      order_id: filters.order_id || null,
      date_from: filters.date_from ? Math.floor(new Date(filters.date_from).getTime() / 1000) : null,
      id_from: filters.id_from || null,
      series_id: filters.series_id || null,
      get_external_invoices: filters.get_external_invoices !== undefined ? filters.get_external_invoices : true,
    };

    // Remove null values
    Object.keys(parameters).forEach(key => {
      if (parameters[key] === null) {
        delete parameters[key];
      }
    });

    const response = await this.makeRequest(userToken, 'getInvoices', parameters);
    return response.invoices || [];
  }

  /**
   * Get invoice file (PDF) from BaseLinker
   * @param {string} userToken - User's BaseLinker API token
   * @param {number} invoiceId - Invoice ID
   * @param {boolean} getExternal - If true, get external invoice if available
   * @returns {Promise<object>} - { invoice: base64, invoice_number: string }
   */
  async getInvoiceFile(userToken, invoiceId, getExternal = false) {
    const parameters = {
      invoice_id: invoiceId,
      get_external: getExternal
    };

    const response = await this.makeRequest(userToken, 'getInvoiceFile', parameters);
    return {
      invoice: response.invoice || null,
      invoice_number: response.invoice_number || null
    };
  }

  /**
   * Get orders with pagination support for large datasets
   * Fetches all orders in batches of 100 (BaseLinker limit)
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Order filters
   * @param {number} maxRecords - Maximum records to fetch (default 10000)
   * @returns {Promise<Array>} - List of all orders
   */
  async getOrdersWithPagination(userToken, filters = {}, maxRecords = 10000) {
    const BATCH_SIZE = 100;
    let allOrders = [];
    let lastDateConfirmed = filters.date_from ? Math.floor(new Date(filters.date_from).getTime() / 1000) : 0;
    let hasMore = true;

    while (hasMore && allOrders.length < maxRecords) {
      const batchFilters = {
        ...filters,
        date_from: null // We use date_confirmed_from directly
      };

      const parameters = {
        date_confirmed_from: lastDateConfirmed,
        date_confirmed_to: filters.date_to ? Math.floor(new Date(filters.date_to).getTime() / 1000) : null,
        order_status_id: filters.status || null,
        get_unconfirmed_orders: filters.get_unconfirmed || false,
        filter_order_source: filters.order_source || null,
        filter_order_source_id: filters.order_source_id || null,
      };

      // Remove null values
      Object.keys(parameters).forEach(key => {
        if (parameters[key] === null) {
          delete parameters[key];
        }
      });

      const response = await this.makeRequest(userToken, 'getOrders', parameters);
      const batch = response.orders || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allOrders = allOrders.concat(batch);

        // Prepare for next page - use last order's date_confirmed + 1 second
        const lastOrder = batch[batch.length - 1];
        lastDateConfirmed = lastOrder.date_confirmed + 1;
        hasMore = batch.length === BATCH_SIZE;
      }

      // Rate limiting - API has 100 req/min limit
      // Add small delay between batches to be safe
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`Fetched ${allOrders.length} orders with pagination`, {
      filters,
      batchCount: Math.ceil(allOrders.length / BATCH_SIZE)
    });

    return allOrders;
  }

  /**
   * Get invoices with pagination support
   * Fetches all invoices in batches of 100 (BaseLinker limit)
   * @param {string} userToken - User's BaseLinker API token
   * @param {object} filters - Invoice filters
   * @param {number} maxRecords - Maximum records to fetch (default 10000)
   * @returns {Promise<Array>} - List of all invoices
   */
  async getInvoicesWithPagination(userToken, filters = {}, maxRecords = 10000) {
    const BATCH_SIZE = 100;
    let allInvoices = [];
    let lastId = filters.id_from || 0;
    let hasMore = true;

    while (hasMore && allInvoices.length < maxRecords) {
      const parameters = {
        id_from: lastId,
        date_from: filters.date_from ? Math.floor(new Date(filters.date_from).getTime() / 1000) : null,
        series_id: filters.series_id || null,
        get_external_invoices: filters.get_external_invoices !== undefined ? filters.get_external_invoices : true,
      };

      // Remove null values
      Object.keys(parameters).forEach(key => {
        if (parameters[key] === null) {
          delete parameters[key];
        }
      });

      const response = await this.makeRequest(userToken, 'getInvoices', parameters);
      const batch = response.invoices || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allInvoices = allInvoices.concat(batch);

        // Prepare for next page - use last invoice's ID + 1
        const lastInvoice = batch[batch.length - 1];
        lastId = lastInvoice.invoice_id + 1;
        hasMore = batch.length === BATCH_SIZE;
      }

      // Rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`Fetched ${allInvoices.length} invoices with pagination`, {
      filters,
      batchCount: Math.ceil(allInvoices.length / BATCH_SIZE)
    });

    return allInvoices;
  }
}

module.exports = new BaselinkerService();
