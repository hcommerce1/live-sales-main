/**
 * Base Connect Fetcher
 *
 * Pobiera kontrahentów z integracji Base Connect (getConnectIntegrationContractors).
 * Dataset: base_connect
 *
 * Wymaga podania integration_id.
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class BaseConnectFetcher extends BaseFetcher {
  constructor() {
    super('base_connect');
  }

  /**
   * Pobiera kontrahentów z Base Connect
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje (integrationId wymagany)
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    if (!options.integrationId) {
      throw new Error('integrationId is required for base_connect dataset');
    }

    this.logFetchStart({ filters, integrationId: options.integrationId });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz kontrahentów z paginacją
    const contractors = await this.fetchAllPages(async (page) => {
      const params = {
        integration_id: options.integrationId,
        ...apiFilters,
        page: page || 1
      };

      // BaseLinker API: getConnectIntegrationContractors
      const response = await client.makeRequest('getConnectIntegrationContractors', params);

      if (!response || !response.contractors) {
        return { data: [], nextPageToken: null };
      }

      const contractorsArray = Array.isArray(response.contractors)
        ? response.contractors
        : Object.values(response.contractors);

      const nextPageToken = contractorsArray.length === 100
        ? (page || 1) + 1
        : null;

      return {
        data: contractorsArray,
        nextPageToken
      };
    });

    // Normalizuj dane kontrahentów
    const normalizedContractors = contractors.map(contractor =>
      this.normalizeContractor(contractor, options.integrationId)
    );

    this.logFetchComplete(normalizedContractors.length);

    return normalizedContractors;
  }

  /**
   * Normalizuje strukturę kontrahenta
   * @param {Object} contractor - Surowy kontrahent z API
   * @param {number} integrationId - ID integracji
   * @returns {Object}
   */
  normalizeContractor(contractor, integrationId) {
    return {
      // Podstawowe
      contractor_id: contractor.contractor_id,
      integration_id: integrationId,
      external_id: contractor.external_id || '',

      // Dane firmy
      name: contractor.name || '',
      nip: contractor.nip || '',
      regon: contractor.regon || '',
      krs: contractor.krs || '',
      email: contractor.email || '',
      phone: contractor.phone || '',
      website: contractor.website || '',

      // Adres
      address: contractor.address || '',
      city: contractor.city || '',
      postcode: contractor.postcode || '',
      country: contractor.country || '',
      country_code: contractor.country_code || '',

      // Warunki handlowe
      payment_term_days: Number(contractor.payment_term_days) || 0,
      credit_limit: Number(contractor.credit_limit) || 0,
      currency: contractor.currency || 'PLN',
      price_group: contractor.price_group || '',
      discount_percent: Number(contractor.discount_percent) || 0,

      // Kontakt
      contact_person: contractor.contact_person || '',
      contact_email: contractor.contact_email || '',
      contact_phone: contractor.contact_phone || '',

      // Dane kredytowe (placeholder - wypełni enricher 'credit')
      credit_current_debt: null,
      credit_overdue: null,
      credit_available: null,
      orders_total_value: null,
      orders_count: null,
      last_order_date: null,

      // Metadata
      _integrationId: integrationId
    };
  }

  /**
   * Konwertuje filtry specyficzne dla kontrahentów
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = {};

    // Filtr po nazwie
    if (filters.name) {
      apiFilters.filter_name = filters.name;
    }

    // Filtr po NIP
    if (filters.nip) {
      apiFilters.filter_nip = filters.nip;
    }

    // Filtr po mieście
    if (filters.city) {
      apiFilters.filter_city = filters.city;
    }

    // Filtr po grupie cenowej
    if (filters.priceGroup) {
      apiFilters.filter_price_group = filters.priceGroup;
    }

    return apiFilters;
  }
}

module.exports = BaseConnectFetcher;
