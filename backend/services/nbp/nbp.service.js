/**
 * NBP Currency Exchange Service
 *
 * Pobiera kursy walut z API NBP (Narodowy Bank Polski).
 * Używa tabeli A (kursy średnie).
 *
 * API: https://api.nbp.pl/
 *
 * Funkcje:
 * - Pobieranie kursu dla waluty i daty
 * - Cache kursów w pamięci
 * - Fallback do najbliższej dostępnej daty
 */

const logger = require('../../utils/logger');

// Cache kursów w pamięci
// Format: { "EUR:2024-01-15": { rate: 4.3521, date: "2024-01-15" } }
const ratesCache = new Map();

// Czas życia cache (24 godziny)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Timestamp ostatniego czyszczenia cache
let lastCacheCleanup = Date.now();

/**
 * Czyści przestarzałe wpisy z cache
 */
function cleanupCache() {
  const now = Date.now();

  // Czyszczenie raz na godzinę
  if (now - lastCacheCleanup < 60 * 60 * 1000) {
    return;
  }

  lastCacheCleanup = now;

  for (const [key, value] of ratesCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      ratesCache.delete(key);
    }
  }

  logger.debug('NBP cache cleanup', { remainingEntries: ratesCache.size });
}

/**
 * Pobiera kurs waluty na konkretną datę z API NBP
 * @param {string} currency - Kod waluty (EUR, USD, GBP, etc.)
 * @param {string} date - Data w formacie YYYY-MM-DD
 * @returns {Promise<Object|null>} { rate, date } lub null
 */
async function fetchRateFromApi(currency, date) {
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${date}/?format=json`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      // Brak kursu na ten dzień (weekend, święto)
      return null;
    }

    if (!response.ok) {
      throw new Error(`NBP API error: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.rates && data.rates[0]) {
      return {
        rate: data.rates[0].mid,
        date: data.rates[0].effectiveDate
      };
    }

    return null;

  } catch (error) {
    logger.warn('NBP API request failed', {
      currency,
      date,
      error: error.message
    });
    return null;
  }
}

/**
 * Pobiera najnowszy dostępny kurs (do 7 dni wstecz)
 * @param {string} currency - Kod waluty
 * @param {string} startDate - Data początkowa
 * @returns {Promise<Object|null>}
 */
async function fetchNearestRate(currency, startDate) {
  const date = new Date(startDate);

  // Szukaj kursu do 7 dni wstecz
  for (let i = 0; i < 7; i++) {
    const dateStr = date.toISOString().split('T')[0];
    const rate = await fetchRateFromApi(currency, dateStr);

    if (rate) {
      return rate;
    }

    // Cofnij o jeden dzień
    date.setDate(date.getDate() - 1);
  }

  return null;
}

/**
 * Pobiera kurs waluty z NBP
 * @param {string} sourceCurrency - Waluta źródłowa (np. EUR)
 * @param {string} targetCurrency - Waluta docelowa (np. PLN)
 * @param {string} date - Data kursu (YYYY-MM-DD)
 * @returns {Promise<Object>} { rate, date }
 */
async function getExchangeRate(sourceCurrency, targetCurrency, date) {
  // Normalizuj kody walut
  const source = sourceCurrency.toUpperCase();
  const target = targetCurrency.toUpperCase();

  // Jeśli ta sama waluta, kurs = 1
  if (source === target) {
    return { rate: 1, date: date };
  }

  // PLN jako źródło lub cel wymaga odwrotnego przeliczenia
  if (source === 'PLN') {
    // Np. PLN -> EUR: potrzebujemy kurs EUR/PLN i odwracamy
    const euroRate = await getExchangeRate(target, 'PLN', date);
    return {
      rate: 1 / euroRate.rate,
      date: euroRate.date
    };
  }

  if (target !== 'PLN') {
    // Np. EUR -> USD: przeliczamy przez PLN
    // EUR -> PLN, potem PLN -> USD (czyli 1 / USD/PLN)
    const sourceToPlnRate = await getExchangeRate(source, 'PLN', date);
    const targetToPlnRate = await getExchangeRate(target, 'PLN', date);

    return {
      rate: sourceToPlnRate.rate / targetToPlnRate.rate,
      date: sourceToPlnRate.date
    };
  }

  // Standardowy przypadek: SOURCE -> PLN
  const cacheKey = `${source}:${date}`;

  // Sprawdź cache
  cleanupCache();

  if (ratesCache.has(cacheKey)) {
    const cached = ratesCache.get(cacheKey);
    logger.debug('NBP rate from cache', { currency: source, date });
    return { rate: cached.rate, date: cached.date };
  }

  // Pobierz z API
  logger.debug('Fetching NBP rate', { currency: source, date });

  let rateData = await fetchRateFromApi(source, date);

  // Jeśli brak kursu na ten dzień, szukaj najbliższego
  if (!rateData) {
    logger.debug('No rate for date, searching nearest', { currency: source, date });
    rateData = await fetchNearestRate(source, date);
  }

  // Jeśli nadal brak, użyj najnowszego dostępnego
  if (!rateData) {
    logger.warn('No rate found, using latest', { currency: source, date });
    rateData = await fetchLatestRate(source);
  }

  if (!rateData) {
    throw new Error(`No exchange rate found for ${source}`);
  }

  // Zapisz w cache
  ratesCache.set(cacheKey, {
    rate: rateData.rate,
    date: rateData.date,
    timestamp: Date.now()
  });

  return {
    rate: rateData.rate,
    date: rateData.date
  };
}

/**
 * Pobiera najnowszy kurs waluty
 * @param {string} currency - Kod waluty
 * @returns {Promise<Object|null>}
 */
async function fetchLatestRate(currency) {
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency}/?format=json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data && data.rates && data.rates[0]) {
      return {
        rate: data.rates[0].mid,
        date: data.rates[0].effectiveDate
      };
    }

    return null;

  } catch (error) {
    logger.warn('Failed to fetch latest rate', {
      currency,
      error: error.message
    });
    return null;
  }
}

/**
 * Pobiera wszystkie kursy na dany dzień
 * @param {string} date - Data w formacie YYYY-MM-DD
 * @returns {Promise<Object>} { [currency]: { rate, date } }
 */
async function getAllRates(date) {
  const url = `https://api.nbp.pl/api/exchangerates/tables/a/${date}/?format=json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      // Spróbuj bez daty (najnowsze)
      return getAllLatestRates();
    }

    const data = await response.json();

    if (!data || !data[0] || !data[0].rates) {
      return {};
    }

    const rates = {};

    for (const rate of data[0].rates) {
      rates[rate.code] = {
        rate: rate.mid,
        date: data[0].effectiveDate
      };

      // Zapisz w cache
      const cacheKey = `${rate.code}:${data[0].effectiveDate}`;
      ratesCache.set(cacheKey, {
        rate: rate.mid,
        date: data[0].effectiveDate,
        timestamp: Date.now()
      });
    }

    return rates;

  } catch (error) {
    logger.error('Failed to fetch all rates', {
      date,
      error: error.message
    });
    return {};
  }
}

/**
 * Pobiera wszystkie najnowsze kursy
 * @returns {Promise<Object>}
 */
async function getAllLatestRates() {
  const url = 'https://api.nbp.pl/api/exchangerates/tables/a/?format=json';

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {};
    }

    const data = await response.json();

    if (!data || !data[0] || !data[0].rates) {
      return {};
    }

    const rates = {};

    for (const rate of data[0].rates) {
      rates[rate.code] = {
        rate: rate.mid,
        date: data[0].effectiveDate
      };
    }

    return rates;

  } catch (error) {
    logger.error('Failed to fetch latest rates', { error: error.message });
    return {};
  }
}

/**
 * Lista wspieranych walut
 */
const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'DKK', 'NOK', 'SEK',
  'AUD', 'CAD', 'HUF', 'JPY', 'RON', 'BGN', 'HRK', 'UAH'
];

/**
 * Sprawdza czy waluta jest wspierana
 * @param {string} currency
 * @returns {boolean}
 */
function isCurrencySupported(currency) {
  return currency === 'PLN' || SUPPORTED_CURRENCIES.includes(currency.toUpperCase());
}

module.exports = {
  getExchangeRate,
  getAllRates,
  getAllLatestRates,
  isCurrencySupported,
  SUPPORTED_CURRENCIES
};
