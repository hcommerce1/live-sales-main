/**
 * Returns Fetcher
 *
 * Pobiera zwroty zamówień z API BaseLinker (getOrderReturns).
 * Obsługuje paginację przez id_from (max 100 zwrotów/request).
 */

const BaseFetcher = require('./BaseFetcher');

class ReturnsFetcher extends BaseFetcher {
  constructor() {
    super('returns');
  }

  /**
   * Pobiera zwroty z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {string} filters.dateFrom - Data od
   * @param {string} filters.dateTo - Data do
   * @param {number} filters.statusId - ID statusu zwrotu
   * @param {string} filters.orderReturnSource - Źródło zwrotu
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych zwrotów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const apiFilters = this.convertFilters(filters);
      const maxRecords = options.maxRecords || 10000;

      // Pobierz zwroty z paginacją przez id_from
      const allReturns = await this.fetchAllPages(
        async (lastId) => {
          const params = {
            ...apiFilters,
            include_custom_extra_fields: true,
            include_connect_data: true
          };

          if (lastId) {
            params.id_from = lastId;
          }

          const response = await this.baselinkerService.makeRequest(
            token,
            'getOrderReturns',
            params
          );

          const returns = response.returns || [];

          // Oblicz nextPageToken (ostatni ID + 1)
          let nextPageToken = null;
          if (returns.length === 100) {
            const lastReturn = returns[returns.length - 1];
            nextPageToken = lastReturn.return_id + 1;
          }

          return {
            data: returns,
            nextPageToken
          };
        },
        maxRecords
      );

      // Normalizuj wszystkie zwroty
      const normalizedReturns = allReturns.map(ret => this.normalize(ret));

      this.logFetchComplete(normalizedReturns.length);

      return normalizedReturns;

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

    // Note: getOrderReturns nie ma parametru date_to w standardowej wersji
    // Filtrowanie dateTo musi być po stronie aplikacji

    if (filters.statusId) {
      converted.status_id = filters.statusId;
    }

    if (filters.orderReturnSource) {
      converted.filter_order_return_source = filters.orderReturnSource;
    }

    if (filters.orderReturnSourceId) {
      converted.filter_order_return_source_id = filters.orderReturnSourceId;
    }

    return converted;
  }

  /**
   * Normalizuje zwrot z API do standardowego formatu
   *
   * @param {object} returnData - Surowy zwrot z API
   * @returns {object} - Znormalizowany zwrot
   */
  normalize(returnData) {
    const products = returnData.products || [];

    // Oblicz wartości computed
    const productsValue = products.reduce(
      (sum, p) => sum + (this.parseNumber(p.price_brutto) * this.parseNumber(p.quantity)),
      0
    );
    const productsCount = products.length;

    // Podsumowanie produktów
    const productsSummary = products
      .map(p => `${p.name} (${p.quantity}x)`)
      .join(', ');

    return {
      // Basic
      return_id: returnData.return_id,
      order_id: returnData.order_id || null,
      shop_order_id: returnData.shop_order_id || null,
      external_order_id: returnData.external_order_id || null,
      reference_number: returnData.reference_number || null,
      date_add: this.fromUnixTimestamp(returnData.date_add),
      date_in_status: this.fromUnixTimestamp(returnData.date_in_status),

      // Source
      order_return_source: returnData.order_return_source || null,
      order_return_source_id: returnData.order_return_source_id || null,

      // Status
      status_id: returnData.status_id || null,
      status_name: null, // Computed - wymaga mapy statusów
      fulfillment_status: returnData.fulfillment_status || null,
      fulfillment_status_name: this.mapFulfillmentStatus(returnData.fulfillment_status),

      // Customer
      email: returnData.email || null,
      phone: returnData.phone || null,
      user_login: returnData.user_login || null,

      // Delivery
      delivery_fullname: returnData.delivery_fullname || null,
      delivery_company: returnData.delivery_company || null,
      delivery_address: returnData.delivery_address || null,
      delivery_postcode: returnData.delivery_postcode || null,
      delivery_city: returnData.delivery_city || null,
      delivery_state: returnData.delivery_state || null,
      delivery_country: returnData.delivery_country || null,
      delivery_country_code: returnData.delivery_country_code || null,

      // Values
      currency: returnData.currency || 'PLN',
      refunded: this.parseNumber(returnData.refunded),
      delivery_price: this.parseNumber(returnData.delivery_price),
      products_value: productsValue,
      products_count: productsCount,

      // Products summary
      products_summary: productsSummary || null,
      ...this.flattenProducts(products),

      // Refund account
      refund_account_number: returnData.refund_account_number || returnData.order_return_account_number || null,
      refund_iban: returnData.refund_iban || returnData.order_return_iban || null,
      refund_swift: returnData.refund_swift || returnData.order_return_swift || null,

      // Shipment
      delivery_package_module: returnData.delivery_package_module || null,
      delivery_package_nr: returnData.delivery_package_nr || null,

      // Comments
      admin_comments: returnData.admin_comments || null,

      // Extra fields
      extra_field_1: returnData.extra_field_1 || null,
      extra_field_2: returnData.extra_field_2 || null,
      ...this.normalizeExtraFields(returnData.custom_extra_fields),

      // Base Connect
      connect_integration_id: returnData.connect_data?.connect_integration_id || null,
      connect_contractor_id: returnData.connect_data?.connect_contractor_id || null,

      // Placeholder dla enrichmentu payments
      last_payment_date: null,
      last_payment_amount: null,
      total_payments: null,

      // Raw products for enrichment use
      _products: products
    };
  }

  /**
   * Mapuje status realizacji na nazwę
   *
   * @param {number} status - Kod statusu
   * @returns {string|null} - Nazwa statusu
   */
  mapFulfillmentStatus(status) {
    const statusMap = {
      0: 'Aktywny',
      1: 'Zakończony',
      2: 'Anulowany',
      5: 'Zaakceptowany'
    };

    return statusMap[status] || null;
  }

  /**
   * Spłaszcza produkty do pól product1_*, product2_*
   *
   * @param {Array} products - Tablica produktów
   * @returns {object} - Spłaszczone pola
   */
  flattenProducts(products) {
    const result = {
      product1_name: null,
      product1_sku: null,
      product1_quantity: null,
      product1_price: null,
      product2_name: null,
      product2_sku: null,
      product2_quantity: null,
      product2_price: null
    };

    if (products && products.length > 0) {
      const p1 = products[0];
      result.product1_name = p1.name || null;
      result.product1_sku = p1.sku || null;
      result.product1_quantity = this.parseNumber(p1.quantity);
      result.product1_price = this.parseNumber(p1.price_brutto);
    }

    if (products && products.length > 1) {
      const p2 = products[1];
      result.product2_name = p2.name || null;
      result.product2_sku = p2.sku || null;
      result.product2_quantity = this.parseNumber(p2.quantity);
      result.product2_price = this.parseNumber(p2.price_brutto);
    }

    return result;
  }

  /**
   * Normalizuje dynamiczne pola dodatkowe
   */
  normalizeExtraFields(customExtraFields) {
    if (!customExtraFields || typeof customExtraFields !== 'object') {
      return {};
    }

    const result = {};

    for (const [key, value] of Object.entries(customExtraFields)) {
      result[`ref_${key}`] = value || null;
    }

    return result;
  }
}

module.exports = ReturnsFetcher;
