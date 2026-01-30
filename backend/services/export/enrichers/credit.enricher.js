/**
 * Credit Enricher
 *
 * Wzbogaca kontrahentów Base Connect o dane kredytowe.
 * Używa API: getConnectContractorCreditInfo
 *
 * Dodaje pola credit_*, orders_*.
 * Używane dla datasetu: base_connect
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class CreditEnricher extends BaseEnricher {
  constructor() {
    super('credit');
  }

  /**
   * Wzbogaca kontrahentów o dane kredytowe
   * @param {Object[]} contractors - Kontrahenci do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async enrich(contractors, token, options = {}) {
    this.logEnrichStart(contractors.length);

    const client = this.getBaseLinkerClient(token);

    // Pobierz dane kredytowe dla każdego kontrahenta
    const enrichedContractors = await Promise.all(
      contractors.map(async (contractor) => {
        if (!contractor.contractor_id) {
          return this.enrichWithEmptyCredit(contractor);
        }

        try {
          const creditData = await this.fetchCreditData(
            client,
            contractor.contractor_id,
            contractor.integration_id || contractor._integrationId
          );
          return this.enrichContractorWithCredit(contractor, creditData);
        } catch (error) {
          logger.warn(`Failed to fetch credit for contractor ${contractor.contractor_id}`, {
            error: error.message
          });
          return this.enrichWithEmptyCredit(contractor);
        }
      })
    );

    this.logEnrichComplete(enrichedContractors.length);

    return enrichedContractors;
  }

  /**
   * Pobiera dane kredytowe dla kontrahenta
   * @param {Object} client - Klient BaseLinker
   * @param {number} contractorId - ID kontrahenta
   * @param {number} integrationId - ID integracji
   * @returns {Promise<Object|null>}
   */
  async fetchCreditData(client, contractorId, integrationId) {
    const response = await client.makeRequest('getConnectContractorCreditInfo', {
      contractor_id: contractorId,
      integration_id: integrationId
    });

    return response || null;
  }

  /**
   * Wzbogaca kontrahenta o dane kredytowe
   * @param {Object} contractor - Kontrahent
   * @param {Object|null} creditData - Dane kredytowe
   * @returns {Object}
   */
  enrichContractorWithCredit(contractor, creditData) {
    const enriched = { ...contractor };

    if (!creditData) {
      return this.enrichWithEmptyCredit(enriched);
    }

    // Dane kredytowe
    enriched.credit_current_debt = Number(creditData.current_debt) || 0;
    enriched.credit_overdue = Number(creditData.overdue_debt) || 0;

    // Dostępny kredyt = limit - aktualne zadłużenie
    const creditLimit = Number(contractor.credit_limit) || 0;
    const currentDebt = enriched.credit_current_debt;
    enriched.credit_available = Math.max(0, creditLimit - currentDebt);

    // Statystyki zamówień
    enriched.orders_total_value = Number(creditData.orders_total_value) || 0;
    enriched.orders_count = Number(creditData.orders_count) || 0;
    enriched.last_order_date = creditData.last_order_date || null;

    return enriched;
  }

  /**
   * Wzbogaca kontrahenta o puste dane kredytowe
   * @param {Object} contractor
   * @returns {Object}
   */
  enrichWithEmptyCredit(contractor) {
    return {
      ...contractor,
      credit_current_debt: 0,
      credit_overdue: 0,
      credit_available: Number(contractor.credit_limit) || 0,
      orders_total_value: 0,
      orders_count: 0,
      last_order_date: null
    };
  }
}

module.exports = CreditEnricher;
