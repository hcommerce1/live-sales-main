/**
 * Currency Service
 *
 * Pobiera kursy wymiany z API Narodowego Banku Polskiego (NBP).
 * Obsługuje historyczne kursy, cache i fallback na dni robocze.
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Cache kursów - 1 godzina TTL
const rateCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 godzina

/**
 * NBP API endpoints:
 * - Tabela A: Średnie kursy walut (główne waluty)
 * - Tabela B: Średnie kursy walut (pozostałe waluty)
 * - Historyczny: /api/exchangerates/rates/{table}/{code}/{date}
 */

class CurrencyService {
  /**
   * Pobiera kurs wymiany z NBP API
   * @param {string} sourceCurrency - Kod waluty źródłowej (np. 'EUR')
   * @param {string} targetCurrency - Kod waluty docelowej (np. 'PLN')
   * @param {string|null} date - Data kursu (format YYYY-MM-DD), null = dzisiaj
   * @returns {Promise<{rate: number, date: string, source: string}>}
   */
  async getExchangeRate(sourceCurrency, targetCurrency, date = null) {
    // Normalizacja walut
    sourceCurrency = (sourceCurrency || '').toUpperCase().trim();
    targetCurrency = (targetCurrency || '').toUpperCase().trim();

    // Jeśli waluty są takie same, zwróć kurs 1
    if (sourceCurrency === targetCurrency) {
      return {
        rate: 1,
        date: date || this._formatDate(new Date()),
        source: 'Ta sama waluta'
      };
    }

    const effectiveDate = date || this._formatDate(new Date());
    const cacheKey = `${sourceCurrency}-${targetCurrency}-${effectiveDate}`;

    // Sprawdź cache
    const cached = rateCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      let rate;
      let actualDate = effectiveDate;
      let source = 'NBP';

      // NBP podaje kursy DO PLN, więc musimy obsłużyć różne scenariusze
      if (targetCurrency === 'PLN') {
        // Bezpośrednia konwersja na PLN
        const result = await this._fetchNBPRate(sourceCurrency, effectiveDate);
        rate = result.rate;
        actualDate = result.date;
      } else if (sourceCurrency === 'PLN') {
        // Konwersja z PLN - odwróć kurs
        const result = await this._fetchNBPRate(targetCurrency, effectiveDate);
        rate = 1 / result.rate;
        actualDate = result.date;
      } else {
        // Kurs krzyżowy: źródło -> PLN -> cel
        const sourceResult = await this._fetchNBPRate(sourceCurrency, effectiveDate);
        const targetResult = await this._fetchNBPRate(targetCurrency, effectiveDate);
        rate = sourceResult.rate / targetResult.rate;
        actualDate = sourceResult.date; // Używamy daty pierwszego kursu
        source = 'NBP (kurs krzyżowy)';
      }

      const result = {
        rate: Math.round(rate * 10000) / 10000, // 4 miejsca po przecinku
        date: actualDate,
        source
      };

      // Zapisz w cache
      rateCache.set(cacheKey, { data: result, timestamp: Date.now() });

      logger.debug('Pobrano kurs wymiany', {
        sourceCurrency,
        targetCurrency,
        rate: result.rate,
        date: result.date
      });

      return result;
    } catch (error) {
      logger.error('Błąd pobierania kursu wymiany', {
        sourceCurrency,
        targetCurrency,
        date: effectiveDate,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Pobiera kurs z NBP API
   * @param {string} currencyCode - Kod waluty (np. 'EUR')
   * @param {string} date - Data w formacie YYYY-MM-DD
   * @returns {Promise<{rate: number, date: string}>} - Kurs do PLN i faktyczna data
   */
  async _fetchNBPRate(currencyCode, date) {
    if (currencyCode === 'PLN') {
      return { rate: 1, date };
    }

    // Najpierw próbuj Tabeli A (główne waluty)
    try {
      return await this._fetchFromTable('a', currencyCode, date);
    } catch (error) {
      if (error.response?.status === 404) {
        // Spróbuj Tabeli B dla mniej popularnych walut
        try {
          return await this._fetchFromTable('b', currencyCode, date);
        } catch (error2) {
          if (error2.response?.status === 404) {
            // NBP nie publikuje kursów w weekendy/święta - spróbuj poprzednich dni
            return this._fetchNBPRateWithFallback(currencyCode, date);
          }
          throw error2;
        }
      }
      throw error;
    }
  }

  /**
   * Pobiera kurs z konkretnej tabeli NBP
   * @param {string} table - 'a' lub 'b'
   * @param {string} currencyCode
   * @param {string} date
   * @returns {Promise<{rate: number, date: string}>}
   */
  async _fetchFromTable(table, currencyCode, date) {
    const url = `https://api.nbp.pl/api/exchangerates/rates/${table}/${currencyCode}/${date}/?format=json`;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });

    return {
      rate: response.data.rates[0].mid,
      date: response.data.rates[0].effectiveDate
    };
  }

  /**
   * Pobiera kurs z fallbackiem na poprzednie dni robocze
   * @param {string} currencyCode
   * @param {string} date
   * @param {number} maxRetries
   * @returns {Promise<{rate: number, date: string}>}
   */
  async _fetchNBPRateWithFallback(currencyCode, date, maxRetries = 7) {
    let currentDate = new Date(date);

    for (let i = 0; i < maxRetries; i++) {
      currentDate.setDate(currentDate.getDate() - 1);
      const dateStr = this._formatDate(currentDate);

      try {
        // Spróbuj obu tabel
        try {
          return await this._fetchFromTable('a', currencyCode, dateStr);
        } catch (e) {
          if (e.response?.status === 404) {
            return await this._fetchFromTable('b', currencyCode, dateStr);
          }
          throw e;
        }
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`Nie znaleziono kursu ${currencyCode} w ostatnich ${maxRetries} dniach roboczych`);
        }
        // Kontynuuj do następnego dnia
      }
    }

    throw new Error(`Nie znaleziono kursu ${currencyCode}`);
  }

  /**
   * Konwertuje kwotę między walutami
   * @param {number} amount - Kwota do konwersji
   * @param {string} sourceCurrency
   * @param {string} targetCurrency
   * @param {string|null} date - Data kursu
   * @returns {Promise<{converted: number, rate: number, date: string, source: string}>}
   */
  async convertAmount(amount, sourceCurrency, targetCurrency, date = null) {
    if (!amount || isNaN(amount)) {
      return {
        converted: 0,
        rate: 1,
        date: date || this._formatDate(new Date()),
        source: 'Brak kwoty'
      };
    }

    const { rate, date: rateDate, source } = await this.getExchangeRate(
      sourceCurrency,
      targetCurrency,
      date
    );

    return {
      converted: Math.round(amount * rate * 100) / 100, // 2 miejsca po przecinku
      rate,
      date: rateDate,
      source
    };
  }

  /**
   * Konwertuje wiele kwot jednocześnie (batch)
   * Optymalizacja - pobiera kurs raz dla całego batcha
   * @param {Array<{amount: number, sourceCurrency: string}>} items
   * @param {string} targetCurrency
   * @param {string|null} date
   * @returns {Promise<Array<{converted: number, rate: number}>>}
   */
  async convertBatch(items, targetCurrency, date = null) {
    // Grupuj po walucie źródłowej
    const currencyGroups = new Map();
    items.forEach((item, index) => {
      const currency = (item.sourceCurrency || '').toUpperCase().trim();
      if (!currencyGroups.has(currency)) {
        currencyGroups.set(currency, []);
      }
      currencyGroups.get(currency).push({ ...item, originalIndex: index });
    });

    // Pobierz kursy dla każdej unikalnej waluty
    const rates = new Map();
    for (const currency of currencyGroups.keys()) {
      try {
        const rateInfo = await this.getExchangeRate(currency, targetCurrency, date);
        rates.set(currency, rateInfo);
      } catch (error) {
        logger.warn('Nie udało się pobrać kursu dla waluty', { currency, error: error.message });
        rates.set(currency, { rate: 0, date: date || this._formatDate(new Date()), source: 'Błąd' });
      }
    }

    // Przelicz wszystkie kwoty
    const results = new Array(items.length);
    for (const [currency, group] of currencyGroups) {
      const rateInfo = rates.get(currency);
      for (const item of group) {
        results[item.originalIndex] = {
          converted: rateInfo.rate > 0 ? Math.round((item.amount || 0) * rateInfo.rate * 100) / 100 : 0,
          rate: rateInfo.rate,
          date: rateInfo.date,
          source: rateInfo.source
        };
      }
    }

    return results;
  }

  /**
   * Formatuje datę do formatu YYYY-MM-DD
   * @param {Date} date
   * @returns {string}
   */
  _formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Czyści cache (do testów lub ręcznego odświeżenia)
   */
  clearCache() {
    rateCache.clear();
    logger.info('Cache kursów walut wyczyszczony');
  }

  /**
   * Zwraca statystyki cache
   * @returns {{size: number, ttlMs: number}}
   */
  getCacheStats() {
    return {
      size: rateCache.size,
      ttlMs: CACHE_TTL_MS
    };
  }
}

module.exports = new CurrencyService();
