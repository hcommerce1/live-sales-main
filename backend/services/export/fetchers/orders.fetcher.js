/**
 * Orders Fetcher
 *
 * Pobiera zamówienia z API BaseLinker (getOrders).
 * Obsługuje paginację przez date_confirmed (max 100 zamówień/request).
 */

const BaseFetcher = require('./BaseFetcher');

class OrdersFetcher extends BaseFetcher {
  constructor() {
    super('orders');
  }

  /**
   * Pobiera zamówienia z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {string} filters.dateFrom - Data od (ISO string lub timestamp)
   * @param {string} filters.dateTo - Data do (ISO string lub timestamp)
   * @param {number} filters.statusId - ID statusu zamówienia
   * @param {number} filters.orderSourceId - ID źródła zamówienia
   * @param {boolean} filters.confirmedOnly - Tylko potwierdzone (default: true)
   * @param {boolean} filters.includeCommissionData - Dołącz dane prowizji
   * @param {object} options - Opcje
   * @param {number} options.maxRecords - Maksymalna liczba rekordów
   * @returns {Promise<Array>} - Tablica znormalizowanych zamówień
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const apiFilters = this.convertFilters(filters);
      const maxRecords = options.maxRecords || 10000;

      // Użyj paginacji przez date_confirmed
      const allOrders = await this.fetchAllPages(
        async (lastDateConfirmed) => {
          const params = {
            ...apiFilters,
            date_confirmed_from: lastDateConfirmed || apiFilters.date_from || 0
          };

          // Usuń date_from jeśli używamy date_confirmed_from
          delete params.date_from;

          const response = await this.baselinkerService.makeRequest(
            token,
            'getOrders',
            params
          );

          const orders = response.orders || [];

          // Oblicz nextPageToken (ostatnia data + 1 sekunda)
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

      // Normalizuj wszystkie zamówienia
      const normalizedOrders = allOrders.map(order => this.normalize(order));

      this.logFetchComplete(normalizedOrders.length);

      return normalizedOrders;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API BaseLinker
   * @param {object} filters - Filtry z UI
   * @returns {object} - Filtry dla API
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

    // Domyślnie pobieramy tylko potwierdzone
    if (filters.confirmedOnly === false) {
      converted.get_unconfirmed_orders = true;
    }

    if (filters.includeCommissionData) {
      converted.include_commission_data = true;
    }

    return converted;
  }

  /**
   * Normalizuje zamówienie z API do standardowego formatu
   *
   * @param {object} order - Surowe zamówienie z API
   * @returns {object} - Znormalizowane zamówienie
   */
  normalize(order) {
    // Oblicz wartości computed
    const products = order.products || [];
    const totalProductsPrice = products.reduce(
      (sum, p) => sum + (this.parseNumber(p.price_brutto) * this.parseNumber(p.quantity)),
      0
    );
    const productsCount = products.length;
    const productsQuantity = products.reduce(
      (sum, p) => sum + this.parseNumber(p.quantity),
      0
    );

    return {
      // Basic
      order_id: order.order_id,
      shop_order_id: order.shop_order_id || null,
      external_order_id: order.external_order_id || null,
      order_source: order.order_source || null,
      order_source_id: order.order_source_id || null,
      order_source_name: null, // Computed - wymaga mapy źródeł
      order_page: order.order_page || null,
      date_add: this.fromUnixTimestamp(order.date_add),
      date_confirmed: this.fromUnixTimestamp(order.date_confirmed),
      date_in_status: this.fromUnixTimestamp(order.date_in_status),

      // Customer
      email: order.email || null,
      phone: order.phone || null,
      user_login: order.user_login || null,

      // Delivery address
      delivery_fullname: order.delivery_fullname || null,
      delivery_company: order.delivery_company || null,
      delivery_address: order.delivery_address || null,
      delivery_postcode: order.delivery_postcode || null,
      delivery_city: order.delivery_city || null,
      delivery_state: order.delivery_state || null,
      delivery_country: order.delivery_country || null,
      delivery_country_code: order.delivery_country_code || null,

      // Pickup point
      delivery_point_id: order.delivery_point_id || null,
      delivery_point_name: order.delivery_point_name || null,
      delivery_point_address: order.delivery_point_address || null,
      delivery_point_postcode: order.delivery_point_postcode || null,
      delivery_point_city: order.delivery_point_city || null,

      // Invoice data
      invoice_fullname: order.invoice_fullname || null,
      invoice_company: order.invoice_company || null,
      invoice_nip: order.invoice_nip || null,
      invoice_address: order.invoice_address || null,
      invoice_postcode: order.invoice_postcode || null,
      invoice_city: order.invoice_city || null,
      invoice_state: order.invoice_state || null,
      invoice_country: order.invoice_country || null,
      invoice_country_code: order.invoice_country_code || null,
      want_invoice: this.parseBoolean(order.want_invoice),

      // Payment
      currency: order.currency || 'PLN',
      payment_method: order.payment_method || null,
      payment_method_cod: this.parseBoolean(order.payment_method_cod),
      payment_done: this.parseNumber(order.payment_done),

      // Delivery
      delivery_method: order.delivery_method || null,
      delivery_method_id: order.delivery_method_id || null,
      delivery_price: this.parseNumber(order.delivery_price),
      delivery_package_module: order.delivery_package_module || null,
      delivery_package_nr: order.delivery_package_nr || null,

      // Totals (computed)
      total_products_price: totalProductsPrice,
      total_price: totalProductsPrice + this.parseNumber(order.delivery_price),
      products_count: productsCount,
      products_quantity: productsQuantity,

      // Status
      order_status_id: order.order_status_id || null,
      order_status_name: null, // Computed - wymaga mapy statusów
      confirmed: this.parseBoolean(order.confirmed),
      pick_status: order.pick_status || null,
      pack_status: order.pack_status || null,

      // Comments
      user_comments: order.user_comments || null,
      admin_comments: order.admin_comments || null,

      // Extra fields
      extra_field_1: order.extra_field_1 || null,
      extra_field_2: order.extra_field_2 || null,

      // Dynamic extra fields
      ...this.normalizeExtraFields(order.custom_extra_fields),

      // Base Connect
      connect_integration_id: order.connect_integration_id || null,
      connect_contractor_id: order.connect_contractor_id || null,

      // Commission data (if requested)
      commission_net: order.commission_data?.commission_net || null,
      commission_gross: order.commission_data?.commission_gross || null,
      commission_currency: order.commission_data?.currency || null,

      // Raw products for enrichment use
      _products: products,

      // Package enrichment placeholder fields (will be filled by enricher)
      pkg1_package_id: null,
      pkg1_courier_code: null,
      pkg1_courier_package_nr: null,
      pkg1_tracking_status: null,
      pkg1_tracking_url: null,
      pkg2_package_id: null,
      pkg2_courier_code: null,
      pkg2_courier_package_nr: null,
      pkg2_tracking_status: null,
      pkg2_tracking_url: null,
      pkg3_package_id: null,
      pkg3_courier_code: null,
      pkg3_courier_package_nr: null,

      // Document enrichment placeholder fields
      ds_type: null,
      ds_number: null,
      ds_date_add: null,
      ds_total_brutto: null,
      ds_total_netto: null,
      ds2_type: null,
      ds2_number: null,
      ds2_date_add: null
    };
  }

  /**
   * Normalizuje dynamiczne pola dodatkowe
   * @param {object} customExtraFields - Obiekt z custom extra fields
   * @returns {object} - Spłaszczone pola z prefiksem ef_
   */
  normalizeExtraFields(customExtraFields) {
    if (!customExtraFields || typeof customExtraFields !== 'object') {
      return {};
    }

    const result = {};

    for (const [key, value] of Object.entries(customExtraFields)) {
      result[`ef_${key}`] = value || null;
    }

    return result;
  }
}

module.exports = OrdersFetcher;
