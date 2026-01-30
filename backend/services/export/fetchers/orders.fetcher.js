/**
 * Orders Fetcher
 *
 * Pobiera zamówienia z BaseLinker API (getOrders).
 * Dataset: orders
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class OrdersFetcher extends BaseFetcher {
  constructor() {
    super('orders');
  }

  /**
   * Pobiera zamówienia z BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    this.logFetchStart({ filters });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz zamówienia z paginacją
    const orders = await this.fetchAllPages(async (lastOrderId) => {
      const params = {
        ...apiFilters,
        get_unconfirmed_orders: !filters.confirmedOnly
      };

      // Paginacja przez order_id
      if (lastOrderId) {
        params.order_id = lastOrderId;
      }

      const response = await client.getOrders(params);

      if (!response || !response.orders) {
        return { data: [], nextPageToken: null };
      }

      const ordersArray = Object.values(response.orders);

      // Następna strona jeśli jest 100 rekordów (limit API)
      const nextPageToken = ordersArray.length === 100
        ? ordersArray[ordersArray.length - 1].order_id
        : null;

      return {
        data: ordersArray,
        nextPageToken
      };
    });

    // Normalizuj dane zamówień
    const normalizedOrders = orders.map(order => this.normalizeOrder(order));

    this.logFetchComplete(normalizedOrders.length);

    return normalizedOrders;
  }

  /**
   * Normalizuje strukturę zamówienia
   * @param {Object} order - Surowe zamówienie z API
   * @returns {Object}
   */
  normalizeOrder(order) {
    return {
      // Podstawowe
      order_id: order.order_id,
      shop_order_id: order.shop_order_id || '',
      external_order_id: order.external_order_id || '',
      order_source: order.order_source || '',
      order_source_id: order.order_source_id,
      order_source_info: order.order_source_info || '',
      order_status_id: order.order_status_id,
      date_add: order.date_add,
      date_confirmed: order.date_confirmed,
      date_in_status: order.date_in_status,
      confirmed: order.order_status_id > 0, // Zamówienia ze statusem > 0 są potwierdzone
      want_invoice: order.want_invoice === '1' || order.want_invoice === true,
      admin_comments: order.admin_comments || '',
      user_comments: order.user_comments || '',
      user_login: order.user_login || '',

      // Dane klienta
      email: order.email || '',
      phone: order.phone || '',

      // Adres dostawy
      delivery_fullname: order.delivery_fullname || '',
      delivery_company: order.delivery_company || '',
      delivery_address: order.delivery_address || '',
      delivery_city: order.delivery_city || '',
      delivery_postcode: order.delivery_postcode || '',
      delivery_state_code: order.delivery_state_code || '',
      delivery_country: order.delivery_country || '',
      delivery_country_code: order.delivery_country_code || '',

      // Punkt odbioru
      delivery_point_id: order.delivery_point_id || '',
      delivery_point_name: order.delivery_point_name || '',
      delivery_point_address: order.delivery_point_address || '',
      delivery_point_postcode: order.delivery_point_postcode || '',
      delivery_point_city: order.delivery_point_city || '',

      // Dane do faktury
      invoice_fullname: order.invoice_fullname || '',
      invoice_company: order.invoice_company || '',
      invoice_nip: order.invoice_nip || '',
      invoice_address: order.invoice_address || '',
      invoice_city: order.invoice_city || '',
      invoice_postcode: order.invoice_postcode || '',
      invoice_state_code: order.invoice_state_code || '',
      invoice_country: order.invoice_country || '',
      invoice_country_code: order.invoice_country_code || '',

      // Płatność
      currency: order.currency || 'PLN',
      payment_method: order.payment_method || '',
      payment_method_cod: order.payment_method_cod === '1' || order.payment_method_cod === true,
      payment_done: Number(order.payment_done) || 0,
      payment_date: order.payment_date || null,

      // Dostawa
      delivery_method: order.delivery_method || '',
      delivery_price: Number(order.delivery_price) || 0,
      delivery_price_brutto: Number(order.delivery_price) || 0,
      delivery_vat_rate: this.extractDeliveryVatRate(order),
      delivery_package_module: order.delivery_package_module || '',

      // Produkty (do obliczeń i rozwinięcia w order_items)
      products: order.products || [],

      // Extra fields
      extra_field_1: order.extra_field_1 || '',
      extra_field_2: order.extra_field_2 || '',
      ...this.extractExtraFields(order)
    };
  }

  /**
   * Wyciąga stawkę VAT dostawy
   * @param {Object} order
   * @returns {number}
   */
  extractDeliveryVatRate(order) {
    // BaseLinker nie zawsze zwraca VAT dostawy
    // Spróbuj wyciągnąć z delivery_price lub domyślnie 23%
    if (order.delivery_vat_rate !== undefined) {
      return Number(order.delivery_vat_rate);
    }
    return 23; // Domyślna stawka VAT w Polsce
  }

  /**
   * Wyciąga pola dodatkowe (extra_field_*)
   * @param {Object} order
   * @returns {Object}
   */
  extractExtraFields(order) {
    const extraFields = {};

    for (const key of Object.keys(order)) {
      if (key.startsWith('extra_field_')) {
        extraFields[key] = order[key] || '';
      }
    }

    return extraFields;
  }

  /**
   * Konwertuje filtry specyficzne dla zamówień
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = super.convertFilters(filters);

    // Filtr po ID zamówienia
    if (filters.orderId) {
      apiFilters.order_id = filters.orderId;
    }

    // Filtr po ID statusu (może być tablica)
    if (filters.statusIds && Array.isArray(filters.statusIds)) {
      apiFilters.filter_order_source_id = filters.statusIds;
    }

    return apiFilters;
  }
}

module.exports = OrdersFetcher;
