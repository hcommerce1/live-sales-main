/**
 * BaseEnricher - Klasa bazowa dla wszystkich enricherów
 *
 * Enrichery wzbogacają dane pobrane przez fetchery o dodatkowe informacje
 * z innych endpointów API BaseLinker.
 *
 * Przykłady:
 * - PackagesEnricher: dodaje dane przesyłek do zamówień
 * - DocumentsEnricher: dodaje faktury/paragony do zamówień
 * - StockEnricher: dodaje stany magazynowe do produktów
 */

const logger = require('../../../utils/logger');
const baselinkerService = require('../../baselinkerService');

class BaseEnricher {
  /**
   * @param {string} enricherName - Nazwa enrichera (np. 'packages', 'documents')
   */
  constructor(enricherName) {
    this.enricherName = enricherName;
    this.baselinkerService = baselinkerService;
    this.stats = {
      apiCalls: 0,
      recordsEnriched: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Wzbogaca dane o dodatkowe informacje
   * Musi być nadpisane w klasach potomnych
   *
   * @param {Array} records - Tablica rekordów do wzbogacenia
   * @param {string} token - Token API BaseLinker
   * @param {object} options - Dodatkowe opcje
   * @returns {Promise<Array>} - Wzbogacone rekordy
   */
  async enrich(records, token, options = {}) {
    throw new Error(`enrich() must be implemented in ${this.constructor.name}`);
  }

  /**
   * Wyciąga unikalne wartości pola z rekordów
   *
   * @param {Array} records - Tablica rekordów
   * @param {string} fieldKey - Klucz pola
   * @returns {Array} - Unikalne wartości (bez null/undefined)
   */
  getUniqueValues(records, fieldKey) {
    const values = new Set();

    for (const record of records) {
      const value = record[fieldKey];
      if (value !== null && value !== undefined) {
        values.add(value);
      }
    }

    return Array.from(values);
  }

  /**
   * Tworzy mapę rekordów po kluczu
   *
   * @param {Array} records - Tablica rekordów
   * @param {string} keyField - Pole klucza
   * @returns {Map} - Mapa: klucz -> rekord
   */
  createRecordMap(records, keyField) {
    const map = new Map();

    for (const record of records) {
      const key = record[keyField];
      if (key !== null && key !== undefined) {
        map.set(key, record);
      }
    }

    return map;
  }

  /**
   * Merguje dane enrichmentu do rekordu
   * Nie nadpisuje istniejących pól (chyba że są null/undefined)
   *
   * @param {object} record - Rekord bazowy
   * @param {object} enrichmentData - Dane do dodania
   * @param {string} prefix - Prefiks dla nowych pól (opcjonalnie)
   * @returns {object} - Wzbogacony rekord
   */
  mergeEnrichment(record, enrichmentData, prefix = '') {
    if (!enrichmentData || typeof enrichmentData !== 'object') {
      return record;
    }

    const merged = { ...record };

    for (const [key, value] of Object.entries(enrichmentData)) {
      const fieldKey = prefix ? `${prefix}${key}` : key;

      // Nie nadpisuj istniejących niepustych wartości
      if (merged[fieldKey] === null || merged[fieldKey] === undefined) {
        merged[fieldKey] = value;
      }
    }

    return merged;
  }

  /**
   * Spłaszcza tablicę obiektów do pól z numerowanym prefiksem
   * Np. packages[] -> pkg1_courier, pkg1_tracking, pkg2_courier, pkg2_tracking...
   *
   * @param {Array} items - Tablica obiektów do spłaszczenia
   * @param {string} prefix - Prefiks (np. 'pkg')
   * @param {number} maxItems - Maksymalna liczba itemów (default: 5)
   * @param {Array<string>} fields - Pola do wyciągnięcia
   * @returns {object} - Spłaszczone pola
   */
  flattenToNumberedFields(items, prefix, maxItems = 5, fields = []) {
    const result = {};

    // Inicjalizuj puste wartości dla wszystkich pól
    for (let i = 1; i <= maxItems; i++) {
      for (const field of fields) {
        result[`${prefix}${i}_${field}`] = null;
      }
    }

    // Wypełnij wartościami z items
    const itemsToProcess = (items || []).slice(0, maxItems);

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const num = i + 1;

      for (const field of fields) {
        const value = item[field];
        result[`${prefix}${num}_${field}`] = value !== undefined ? value : null;
      }
    }

    return result;
  }

  /**
   * Grupuje rekordy po kluczu i wywołuje enrichment dla każdej grupy
   * Przydatne gdy enrichment wymaga batch API calls
   *
   * @param {Array} records - Rekordy do przetworzenia
   * @param {string} keyField - Pole grupujące
   * @param {Function} enrichFn - Funkcja enrichmentu dla grupy
   * @returns {Promise<Array>} - Wzbogacone rekordy
   */
  async enrichInBatches(records, keyField, enrichFn, batchSize = 100) {
    const uniqueKeys = this.getUniqueValues(records, keyField);
    const enrichmentMap = new Map();

    // Przetwarzaj w batchach
    for (let i = 0; i < uniqueKeys.length; i += batchSize) {
      const batch = uniqueKeys.slice(i, i + batchSize);

      this.stats.apiCalls++;
      const batchResults = await enrichFn(batch);

      // Dodaj wyniki do mapy
      for (const [key, data] of Object.entries(batchResults)) {
        enrichmentMap.set(key, data);
      }

      // Rate limiting
      if (i + batchSize < uniqueKeys.length) {
        await this.rateLimit();
      }
    }

    // Wzbogać rekordy
    return records.map(record => {
      const key = record[keyField];
      const enrichmentData = enrichmentMap.get(String(key)) || enrichmentMap.get(key);

      if (enrichmentData) {
        return this.mergeEnrichment(record, enrichmentData);
      }

      return record;
    });
  }

  /**
   * Opóźnienie dla rate limiting
   * @param {number} ms - Milisekundy opóźnienia
   */
  async rateLimit(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Loguje rozpoczęcie enrichmentu
   * @param {number} recordCount - Liczba rekordów
   */
  logEnrichStart(recordCount) {
    this.stats.startTime = Date.now();
    logger.info(`${this.constructor.name}: Starting enrichment`, {
      enricherName: this.enricherName,
      recordCount
    });
  }

  /**
   * Loguje zakończenie enrichmentu
   * @param {number} recordCount - Liczba wzbogaconych rekordów
   */
  logEnrichComplete(recordCount) {
    this.stats.endTime = Date.now();
    this.stats.recordsEnriched = recordCount;

    logger.info(`${this.constructor.name}: Enrichment complete`, {
      enricherName: this.enricherName,
      recordsEnriched: recordCount,
      apiCalls: this.stats.apiCalls,
      durationMs: this.stats.endTime - this.stats.startTime
    });
  }

  /**
   * Loguje błąd
   * @param {string} message - Wiadomość
   * @param {Error} error - Błąd
   */
  logError(message, error) {
    logger.error(`${this.constructor.name}: ${message}`, {
      enricherName: this.enricherName,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Pobiera statystyki
   * @returns {object} - Statystyki
   */
  getStats() {
    return {
      ...this.stats,
      durationMs: this.stats.endTime
        ? this.stats.endTime - this.stats.startTime
        : null
    };
  }

  /**
   * Resetuje statystyki
   */
  resetStats() {
    this.stats = {
      apiCalls: 0,
      recordsEnriched: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Konwertuje Unix timestamp na ISO string
   * @param {number} timestamp - Unix timestamp
   * @returns {string|null} - ISO string
   */
  fromUnixTimestamp(timestamp) {
    if (!timestamp || timestamp === 0) return null;
    return new Date(timestamp * 1000).toISOString();
  }

  /**
   * Parsuje liczbę
   * @param {*} value - Wartość
   * @param {number} defaultValue - Domyślna wartość
   * @returns {number} - Liczba
   */
  parseNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

module.exports = BaseEnricher;
