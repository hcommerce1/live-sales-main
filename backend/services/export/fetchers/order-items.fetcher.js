/**
 * Order Items Fetcher
 *
 * Pobiera zamówienia z API BaseLinker i rozbija tablicę products[]
 * na osobne wiersze - każdy produkt to osobny rekord.
 */

const BaseFetcher = require('./BaseFetcher');

class OrderItemsFetcher extends BaseFetcher {
  constructor() {
    super('order_items');
  }

  /**
   * Pobiera pozycje zamówień z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych pozycji
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const apiFilters = this.convertFilters(filters);
      const maxRecords = options.maxRecords || 10000;

      // Pobierz zamówienia z paginacją
      const allOrders = await this.fetchAllPages(
        async (lastDateConfirmed) => {
          const params = {
            ...apiFilters,
            date_confirmed_from: lastDateConfirmed || apiFilters.date_from || 0
          };

          delete params.date_from;

          const response = await this.baselinkerService.makeRequest(
            token,
            'getOrders',
            params
          );

          const orders = response.orders || [];

          let nextPageToken = null;
          if (orders.length === 100) {
            const lastOrder = orders[orders.length - 1];
            nextPageToken = lastOrder.date_confirmed + 1;
          }

          return {
            data: orders,
            nextPageToken
          };
        },
        maxRecords
      );

      // Rozbij zamówienia na pozycje
      const allItems = this.flattenOrdersToItems(allOrders);

      this.logFetchComplete(allItems.length);

      return allItems;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API BaseLinker
   */
  convertFilters(filters) {
    const converted = {};

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.dateTo) {
      converted.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    if (filters.statusId) {
      converted.order_status_id = filters.statusId;
    }

    if (filters.orderSourceId) {
      converted.filter_order_source_id = filters.orderSourceId;
    }

    if (filters.confirmedOnly === false) {
      converted.get_unconfirmed_orders = true;
    }

    return converted;
  }

  /**
   * Rozbija tablicę zamówień na tablicę pozycji
   * Każdy produkt z zamówienia staje się osobnym rekordem
   *
   * @param {Array} orders - Tablica zamówień
   * @returns {Array} - Tablica pozycji
   */
  flattenOrdersToItems(orders) {
    const items = [];

    for (const order of orders) {
      const products = order.products || [];

      // Jeśli zamówienie nie ma produktów, pomijamy je
      if (products.length === 0) {
        continue;
      }

      // Dane zamówienia do skopiowania do każdej pozycji
      const orderData = this.extractOrderData(order);

      // Dla każdego produktu tworzymy osobny rekord
      for (const product of products) {
        const item = this.normalizeItem(product, orderData);
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Wyciąga dane zamówienia do skopiowania do pozycji
   *
   * @param {object} order - Zamówienie
   * @returns {object} - Dane zamówienia
   */
  extractOrderData(order) {
    return {
      order_id: order.order_id,
      shop_order_id: order.shop_order_id || null,
      external_order_id: order.external_order_id || null,
      order_source: order.order_source || null,
      date_add: this.fromUnixTimestamp(order.date_add),
      date_confirmed: this.fromUnixTimestamp(order.date_confirmed),
      order_status_id: order.order_status_id || null,
      order_status_name: null, // Computed - wymaga mapy statusów
      currency: order.currency || 'PLN',
      email: order.email || null,
      phone: order.phone || null,
      delivery_fullname: order.delivery_fullname || null,
      delivery_company: order.delivery_company || null,
      delivery_city: order.delivery_city || null,
      delivery_country: order.delivery_country || null
    };
  }

  /**
   * Normalizuje pojedynczą pozycję produktową
   *
   * @param {object} product - Produkt z zamówienia
   * @param {object} orderData - Dane zamówienia
   * @returns {object} - Znormalizowana pozycja
   */
  normalizeItem(product, orderData) {
    const priceBrutto = this.parseNumber(product.price_brutto);
    const quantity = this.parseNumber(product.quantity);

    return {
      // Dane zamówienia
      ...orderData,

      // Podstawowe dane pozycji
      order_product_id: product.order_product_id || null,
      product_id: product.product_id || null,
      variant_id: product.variant_id || null,
      name: product.name || null,
      sku: product.sku || null,
      ean: product.ean || null,

      // Szczegóły pozycji
      attributes: product.attributes || null,
      location: product.location || null,
      warehouse_id: product.warehouse_id || null,

      // Ceny i ilości
      price_brutto: priceBrutto,
      tax_rate: this.parseNumber(product.tax_rate),
      quantity: quantity,
      weight: this.parseNumber(product.weight),
      line_total: priceBrutto * quantity,

      // Flagi
      bundle_id: product.bundle_id || null,
      auction_id: product.auction_id || null,

      // Magazyn
      storage: product.storage || null,
      storage_id: product.storage_id || null,

      // Placeholder dla enrichmentu product-details
      catalog_name: null,
      catalog_sku: null,
      catalog_ean: null,
      category_id: null,
      manufacturer_id: null,
      description: null
    };
  }
}

module.exports = OrderItemsFetcher;
