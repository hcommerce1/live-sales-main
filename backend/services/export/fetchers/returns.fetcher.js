/**
 * Returns Fetcher
 *
 * Pobiera zwroty z BaseLinker API (getOrderReturns).
 * Dataset: returns
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class ReturnsFetcher extends BaseFetcher {
  constructor() {
    super('returns');
  }

  /**
   * Pobiera zwroty z BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    this.logFetchStart({ filters });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz zwroty z paginacją
    const returns = await this.fetchAllPages(async (lastReturnId) => {
      const params = { ...apiFilters };

      if (lastReturnId) {
        params.return_id = lastReturnId;
      }

      // BaseLinker API: getOrderReturns
      const response = await client.makeRequest('getOrderReturns', params);

      if (!response || !response.returns) {
        return { data: [], nextPageToken: null };
      }

      const returnsArray = Object.values(response.returns);

      const nextPageToken = returnsArray.length === 100
        ? returnsArray[returnsArray.length - 1].return_id
        : null;

      return {
        data: returnsArray,
        nextPageToken
      };
    });

    // Normalizuj dane zwrotów
    const normalizedReturns = returns.map(ret => this.normalizeReturn(ret));

    this.logFetchComplete(normalizedReturns.length);

    return normalizedReturns;
  }

  /**
   * Normalizuje strukturę zwrotu
   * @param {Object} ret - Surowy zwrot z API
   * @returns {Object}
   */
  normalizeReturn(ret) {
    // Agreguj produkty zwrotu
    const products = ret.products || [];
    const productsCount = products.length;
    const productsQuantity = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
    const productsNames = products.map(p => p.name).filter(Boolean).join(', ');

    return {
      // Podstawowe
      return_id: ret.return_id,
      order_id: ret.order_id,
      date_add: ret.date_add,
      return_status_id: ret.status_id,
      return_status_name: ret.status_name || '',
      return_reason_id: ret.reason_id,
      return_reason_name: ret.reason_name || '',
      refund_reason: ret.refund_reason || '',

      // Dane klienta
      email: ret.email || '',
      phone: ret.phone || '',
      client_name: ret.client_name || '',

      // Adres zwrotu
      return_address: ret.return_address || '',
      return_city: ret.return_city || '',
      return_postcode: ret.return_postcode || '',
      return_country_code: ret.return_country_code || '',

      // Wartości
      refund_value: Number(ret.refund_value) || 0,
      refund_done: Number(ret.refund_done) || 0,
      refund_remaining: (Number(ret.refund_value) || 0) - (Number(ret.refund_done) || 0),
      currency: ret.currency || 'PLN',

      // Produkty zwrotu (agregowane)
      products_count: productsCount,
      products_quantity: productsQuantity,
      products_names: productsNames,

      // Komentarze
      admin_comments: ret.admin_comments || '',
      user_comments: ret.user_comments || '',

      // Extra fields
      ...this.extractExtraFields(ret),

      // Oryginalne produkty (do ewentualnego enrichment)
      _products: products
    };
  }

  /**
   * Wyciąga pola dodatkowe
   * @param {Object} ret
   * @returns {Object}
   */
  extractExtraFields(ret) {
    const extraFields = {};

    for (const key of Object.keys(ret)) {
      if (key.startsWith('extra_field_')) {
        extraFields[key] = ret[key] || '';
      }
    }

    return extraFields;
  }

  /**
   * Konwertuje filtry specyficzne dla zwrotów
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = super.convertFilters(filters);

    // Filtr po statusie zwrotu
    if (filters.returnStatusId) {
      apiFilters.status_id = filters.returnStatusId;
    }

    // Filtr po ID zamówienia
    if (filters.orderId) {
      apiFilters.order_id = filters.orderId;
    }

    return apiFilters;
  }
}

module.exports = ReturnsFetcher;
