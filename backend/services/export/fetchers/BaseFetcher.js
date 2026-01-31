/**
 * BaseFetcher - Klasa bazowa dla wszystkich fetcherów datasetów
 *
 * Zapewnia:
 * - Paginację (przez id_from lub page number)
 * - Normalizację danych
 * - Obsługę błędów i rate limiting
 * - Logowanie
 */

const logger = require('../../../utils/logger');
const baselinkerService = require('../../baselinkerService');

class BaseFetcher {
  /**
   * @param {string} datasetId - ID datasetu (np. 'orders', 'products_catalog')
   */
  constructor(datasetId) {
    this.datasetId = datasetId;
    this.baselinkerService = baselinkerService;
    this.stats = {
      apiCalls: 0,
      recordsFetched: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Pobiera dane z API BaseLinker
   * Musi być nadpisane w klasach potomnych
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry (dateFrom, dateTo, statusId, etc.)
   * @param {object} options - Dodatkowe opcje (inventoryId, storageId, etc.)
   * @returns {Promise<Array>} - Tablica znormalizowanych rekordów
   */
  async fetch(token, filters = {}, options = {}) {
    throw new Error(`fetch() must be implemented in ${this.constructor.name}`);
  }

  /**
   * Normalizuje pojedynczy rekord z API do standardowego formatu
   * Musi być nadpisane w klasach potomnych
   *
   * @param {object} rawRecord - Surowy rekord z API
   * @returns {object} - Znormalizowany rekord
   */
  normalize(rawRecord) {
    throw new Error(`normalize() must be implemented in ${this.constructor.name}`);
  }

  /**
   * Konwertuje filtry z formatu UI do formatu API BaseLinker
   *
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
      converted.status_id = filters.statusId;
    }
    if (filters.orderSourceId) {
      converted.filter_order_source_id = filters.orderSourceId;
    }
    if (filters.confirmedOnly !== undefined) {
      converted.get_unconfirmed_orders = !filters.confirmedOnly;
    }

    return converted;
  }

  /**
   * Konwertuje datę na Unix timestamp
   *
   * @param {string|Date|number} date - Data do konwersji
   * @returns {number} - Unix timestamp (sekundy)
   */
  toUnixTimestamp(date) {
    if (typeof date === 'number') {
      // Jeśli już jest timestamp, sprawdź czy w sekundach czy milisekundach
      return date > 9999999999 ? Math.floor(date / 1000) : date;
    }
    return Math.floor(new Date(date).getTime() / 1000);
  }

  /**
   * Konwertuje Unix timestamp na ISO string
   *
   * @param {number} timestamp - Unix timestamp (sekundy)
   * @returns {string|null} - ISO date string lub null
   */
  fromUnixTimestamp(timestamp) {
    if (!timestamp || timestamp === 0) return null;
    return new Date(timestamp * 1000).toISOString();
  }

  /**
   * Pobiera wszystkie strony danych z paginacją
   *
   * @param {Function} fetchPage - Funkcja pobierająca pojedynczą stronę
   *   Musi zwracać { data: [], nextPageToken: string|number|null }
   * @param {number} maxRecords - Maksymalna liczba rekordów (default: 10000)
   * @returns {Promise<Array>} - Wszystkie pobrane rekordy
   */
  async fetchAllPages(fetchPage, maxRecords = 10000) {
    const allData = [];
    let pageToken = null;
    let hasMore = true;

    while (hasMore && allData.length < maxRecords) {
      this.stats.apiCalls++;

      const result = await fetchPage(pageToken);
      const { data, nextPageToken } = result;

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData.push(...data);
        pageToken = nextPageToken;
        hasMore = nextPageToken !== null && data.length > 0;
      }

      // Rate limiting - BaseLinker ma limit 100 req/min
      // Dodaj małe opóźnienie między stronami
      if (hasMore) {
        await this.rateLimit();
      }
    }

    return allData.slice(0, maxRecords);
  }

  /**
   * Opóźnienie dla rate limiting
   * @param {number} ms - Milisekundy opóźnienia (default: 100)
   */
  async rateLimit(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Loguje rozpoczęcie pobierania
   * @param {object} context - Dodatkowy kontekst do logowania
   */
  logFetchStart(context = {}) {
    this.stats.startTime = Date.now();
    logger.info(`${this.constructor.name}: Starting fetch`, {
      datasetId: this.datasetId,
      ...context
    });
  }

  /**
   * Loguje zakończenie pobierania
   * @param {number} recordCount - Liczba pobranych rekordów
   */
  logFetchComplete(recordCount) {
    this.stats.endTime = Date.now();
    this.stats.recordsFetched = recordCount;

    logger.info(`${this.constructor.name}: Fetch complete`, {
      datasetId: this.datasetId,
      recordsFetched: recordCount,
      apiCalls: this.stats.apiCalls,
      durationMs: this.stats.endTime - this.stats.startTime
    });
  }

  /**
   * Loguje błąd
   * @param {string} message - Wiadomość błędu
   * @param {Error} error - Obiekt błędu
   */
  logError(message, error) {
    logger.error(`${this.constructor.name}: ${message}`, {
      datasetId: this.datasetId,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Pobiera statystyki fetchera
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
      recordsFetched: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Bezpieczne pobranie zagnieżdżonej wartości
   *
   * @param {object} obj - Obiekt źródłowy
   * @param {string} path - Ścieżka do wartości (np. 'a.b.c')
   * @param {*} defaultValue - Wartość domyślna
   * @returns {*} - Wartość lub defaultValue
   */
  getNestedValue(obj, path, defaultValue = null) {
    if (!obj || !path) return defaultValue;

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Parsuje wartość liczbową
   *
   * @param {*} value - Wartość do sparsowania
   * @param {number} defaultValue - Wartość domyślna
   * @returns {number} - Sparsowana liczba
   */
  parseNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parsuje wartość boolean
   *
   * @param {*} value - Wartość do sparsowania
   * @returns {boolean} - Boolean
   */
  parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  /**
   * Konwertuje obiekt na tablicę
   * BaseLinker często zwraca obiekty z kluczami jako ID
   *
   * @param {object|Array} data - Dane do konwersji
   * @returns {Array} - Tablica
   */
  objectToArray(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];

    return Object.entries(data).map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return { _key: key, ...value };
      }
      return { _key: key, value };
    });
  }
}

module.exports = BaseFetcher;
