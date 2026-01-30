/**
 * Base Enricher
 *
 * Abstrakcyjna klasa bazowa dla wszystkich enricherów.
 * Definiuje wspólny interfejs i pomocnicze metody.
 */

const logger = require('../../../utils/logger');
const { getClient } = require('../../baselinker');

class BaseEnricher {
  constructor(name) {
    this.name = name;
  }

  /**
   * Wzbogaca dane o dodatkowe informacje
   * @param {Object[]} data - Dane do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje (currencyConfig, inventoryId, etc.)
   * @returns {Promise<Object[]>}
   */
  async enrich(data, token, options = {}) {
    throw new Error('enrich() must be implemented by subclass');
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
   * Helper: Loguje początek wzbogacania
   * @param {number} recordCount
   * @param {Object} params
   */
  logEnrichStart(recordCount, params = {}) {
    logger.debug(`Enricher [${this.name}] starting`, {
      enricher: this.name,
      recordCount,
      ...params
    });
  }

  /**
   * Helper: Loguje zakończenie wzbogacania
   * @param {number} enrichedCount
   */
  logEnrichComplete(enrichedCount) {
    logger.debug(`Enricher [${this.name}] completed`, {
      enricher: this.name,
      enrichedCount
    });
  }

  /**
   * Helper: Grupuje rekordy po kluczu
   * @param {Object[]} data - Tablica rekordów
   * @param {string} keyField - Nazwa pola klucza
   * @returns {Map<any, Object[]>}
   */
  groupBy(data, keyField) {
    const groups = new Map();

    for (const record of data) {
      const key = record[keyField];

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(record);
    }

    return groups;
  }

  /**
   * Helper: Pobiera unikalne wartości pola
   * @param {Object[]} data - Tablica rekordów
   * @param {string} field - Nazwa pola
   * @returns {any[]}
   */
  getUniqueValues(data, field) {
    const values = new Set();

    for (const record of data) {
      const value = record[field];

      if (value !== null && value !== undefined) {
        values.add(value);
      }
    }

    return Array.from(values);
  }

  /**
   * Helper: Batch processing dla API calls
   * @param {any[]} items - Elementy do przetworzenia
   * @param {number} batchSize - Rozmiar batcha
   * @param {Function} processor - Funkcja przetwarzająca batch
   * @returns {Promise<any[]>}
   */
  async processBatches(items, batchSize, processor) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);

      if (Array.isArray(batchResults)) {
        results.push(...batchResults);
      } else {
        results.push(batchResults);
      }
    }

    return results;
  }
}

module.exports = BaseEnricher;
