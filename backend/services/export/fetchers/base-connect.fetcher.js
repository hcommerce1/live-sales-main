/**
 * Base Connect Fetcher
 *
 * Pobiera dane kontrahentów B2B z integracji Base Connect:
 * 1. getConnectIntegrations - lista integracji
 * 2. getConnectIntegrationContractors - kontrahenci dla każdej integracji
 *
 * Zwraca spłaszczoną listę kontrahentów z danymi integracji.
 */

const BaseFetcher = require('./BaseFetcher');

class BaseConnectFetcher extends BaseFetcher {
  constructor() {
    super('base_connect');
  }

  /**
   * Pobiera kontrahentów Base Connect
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {number} filters.integrationId - ID konkretnej integracji (opcjonalne)
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych kontrahentów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const maxRecords = options.maxRecords || 10000;
      const targetIntegrationId = filters.integrationId || options.integrationId;

      // 1. Pobierz listę integracji
      this.stats.apiCalls++;
      const integrationsResponse = await this.baselinkerService.makeRequest(
        token,
        'getConnectIntegrations',
        {}
      );

      const integrations = integrationsResponse.integrations || {};
      const ownIntegrations = integrations.own_integrations || [];
      const connectedIntegrations = integrations.connected_integrations || [];

      // Połącz wszystkie integracje z oznaczeniem typu
      const allIntegrations = [
        ...ownIntegrations.map(i => ({ ...i, type: 'own' })),
        ...connectedIntegrations.map(i => ({ ...i, type: 'connected' }))
      ];

      // Filtruj po integrationId jeśli podano
      const filteredIntegrations = targetIntegrationId
        ? allIntegrations.filter(i => i.connect_integration_id === targetIntegrationId)
        : allIntegrations;

      // 2. Dla każdej integracji pobierz kontrahentów
      const allContractors = [];

      for (const integration of filteredIntegrations) {
        if (allContractors.length >= maxRecords) break;

        try {
          this.stats.apiCalls++;
          const contractorsResponse = await this.baselinkerService.makeRequest(
            token,
            'getConnectIntegrationContractors',
            { connect_integration_id: integration.connect_integration_id }
          );

          const contractors = contractorsResponse.contractors || {};

          // contractors to obiekt gdzie klucz to ID
          for (const [contractorId, contractor] of Object.entries(contractors)) {
            if (allContractors.length >= maxRecords) break;

            allContractors.push(this.normalize(contractor, integration));
          }

          // Rate limiting między integracjami
          await this.rateLimit(100);

        } catch (error) {
          this.logError(`Failed to get contractors for integration ${integration.connect_integration_id}`, error);
        }
      }

      this.logFetchComplete(allContractors.length);

      return allContractors;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Normalizuje kontrahenta
   */
  normalize(contractor, integration) {
    const creditData = contractor.credit_data || {};

    return {
      // Integracja
      connect_integration_id: integration.connect_integration_id,
      integration_name: integration.name || null,
      integration_type: integration.type || null,

      // Kontrahent
      connect_contractor_id: contractor.connect_contractor_id,
      contractor_name: contractor.name || null,

      // Kredyt kupiecki
      credit_limit: this.parseNumber(creditData.limit),
      credit_used: this.parseNumber(creditData.used),
      credit_available: this.parseNumber(creditData.available),
      credit_currency: creditData.currency || 'PLN',

      // Ustawienia
      settings_json: contractor.settings ? JSON.stringify(contractor.settings) : null
    };
  }
}

module.exports = BaseConnectFetcher;
