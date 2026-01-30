/**
 * Base Fetcher
 *
 * Abstrakcyjna klasa bazowa dla wszystkich fetcherów.
 * Definiuje wspólny interfejs i pomocnicze metody.
 */

const logger = require('../../../utils/logger');
const { getClient } = require('../../baselinker');

class BaseFetcher {
  constructor(datasetId) {
    this.datasetId = datasetId;
  }

  /**
   * Pobiera dane z BaseLinker API
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry do zastosowania
   * @param {Object} options - Dodatkowe opcje (inventoryId, etc.)
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    throw new Error('fetch() must be implemented by subclass');
  }

  /**
   * Helper: Pobiera klienta BaseLinker
   * @param {string} token
   * @returns {Object}
   */
  getBaseLinkerClient(token) {
    return getClient(token);
  }

  /**
   * Helper: Loguje początek fetchowania
   * @param {Object} params
   */
  logFetchStart(params = {}) {
    logger.info(`Fetching ${this.datasetId} data`, {
      dataset: this.datasetId,
      ...params
    });
  }

  /**
   * Helper: Loguje zakończenie fetchowania
   * @param {number} count
   */
  logFetchComplete(count) {
    logger.info(`Fetched ${count} ${this.datasetId} records`);
  }

  /**
   * Helper: Konwertuje filtry z formatu eksportu do formatu API BaseLinker
   * @param {Object} filters - Filtry z konfiguracji eksportu
   * @returns {Object} - Filtry w formacie API
   */
  convertFilters(filters) {
    const apiFilters = {};

    // Data od
    if (filters.dateFrom) {
      apiFilters.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    // Data do
    if (filters.dateTo) {
      apiFilters.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    // Status zamówienia
    if (filters.statusId) {
      apiFilters.status_id = filters.statusId;
    }

    // Źródło zamówienia
    if (filters.orderSourceId) {
      apiFilters.order_source_id = filters.orderSourceId;
    }

    // Filtr tylko potwierdzone
    if (filters.confirmedOnly) {
      apiFilters.get_unconfirmed_orders = false;
    }

    return apiFilters;
  }

  /**
   * Konwertuje datę do Unix timestamp
   * @param {string|number|Date} date
   * @returns {number}
   */
  toUnixTimestamp(date) {
    if (typeof date === 'number') {
      // Jeśli to już timestamp w sekundach (mniej niż 10 cyfr oznacza sekundy)
      return date < 10000000000 ? date : Math.floor(date / 1000);
    }

    const d = new Date(date);
    return Math.floor(d.getTime() / 1000);
  }

  /**
   * Paginacja - pobiera wszystkie strony wyników
   * @param {Function} fetchPage - Funkcja pobierająca stronę (pageToken) => Promise<{data, nextPageToken}>
   * @param {number} maxRecords - Maksymalna liczba rekordów
   * @returns {Promise<Object[]>}
   */
  async fetchAllPages(fetchPage, maxRecords = 10000) {
    const allRecords = [];
    let pageToken = null;
    let pageCount = 0;

    do {
      pageCount++;
      logger.debug(`Fetching page ${pageCount}`, { dataset: this.datasetId });

      const result = await fetchPage(pageToken);

      if (result.data && result.data.length > 0) {
        allRecords.push(...result.data);
      }

      pageToken = result.nextPageToken;

      // Sprawdź limit
      if (allRecords.length >= maxRecords) {
        logger.info(`Reached max records limit (${maxRecords})`, {
          dataset: this.datasetId
        });
        break;
      }

    } while (pageToken);

    return allRecords.slice(0, maxRecords);
  }
}

module.exports = BaseFetcher;
