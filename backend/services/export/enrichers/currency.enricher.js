/**
 * Currency Enricher
 *
 * Wzbogaca rekordy o przewalutowane wartości.
 * Używa kursów NBP z serwisu nbp.service.js
 *
 * Dodaje pola converted_*.
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class CurrencyEnricher extends BaseEnricher {
  constructor() {
    super('currency');
    this.nbpService = null;
  }

  /**
   * Lazy load NBP service
   */
  getNbpService() {
    if (!this.nbpService) {
      try {
        this.nbpService = require('../../nbp/nbp.service');
      } catch (error) {
        logger.warn('NBP service not available', { error: error.message });
        this.nbpService = null;
      }
    }
    return this.nbpService;
  }

  /**
   * Wzbogaca rekordy o przewalutowane wartości
   * @param {Object[]} records - Rekordy do wzbogacenia
   * @param {string} token - Token BaseLinker (nieużywany)
   * @param {Object} options - Opcje (currencyConfig)
   * @returns {Promise<Object[]>}
   */
  async enrich(records, token, options = {}) {
    const currencyConfig = options.currencyConfig;

    if (!currencyConfig || !currencyConfig.targetCurrency) {
      logger.debug('Currency conversion disabled or no target currency');
      return records.map(record => this.enrichWithEmptyCurrency(record));
    }

    this.logEnrichStart(records.length, {
      targetCurrency: currencyConfig.targetCurrency,
      rateSource: currencyConfig.rateSource
    });

    const nbpService = this.getNbpService();

    if (!nbpService) {
      logger.warn('NBP service not available, skipping currency conversion');
      return records.map(record => this.enrichWithEmptyCurrency(record));
    }

    // Pobierz unikalne kombinacje waluta + data
    const ratesNeeded = this.collectRatesNeeded(records, currencyConfig);

    // Pobierz kursy
    const rates = await this.fetchRates(nbpService, ratesNeeded, currencyConfig.targetCurrency);

    // Wzbogać każdy rekord
    const enrichedRecords = records.map(record =>
      this.enrichRecordWithCurrency(record, rates, currencyConfig)
    );

    this.logEnrichComplete(enrichedRecords.length);

    return enrichedRecords;
  }

  /**
   * Zbiera wymagane kursy (waluta + data)
   * @param {Object[]} records
   * @param {Object} currencyConfig
   * @returns {Set<string>} Format: "CURRENCY:YYYY-MM-DD"
   */
  collectRatesNeeded(records, currencyConfig) {
    const ratesNeeded = new Set();
    const targetCurrency = currencyConfig.targetCurrency;

    for (const record of records) {
      const sourceCurrency = record.currency || 'PLN';

      // Nie potrzebujemy kursu jeśli waluta źródłowa = docelowa
      if (sourceCurrency === targetCurrency) {
        continue;
      }

      // Określ datę kursu na podstawie konfiguracji
      const rateDate = this.determinRateDate(record, currencyConfig.rateSource);

      if (rateDate) {
        ratesNeeded.add(`${sourceCurrency}:${rateDate}`);
      }
    }

    return ratesNeeded;
  }

  /**
   * Określa datę kursu na podstawie źródła
   * @param {Object} record
   * @param {string} rateSource - 'document_date', 'order_date', 'ship_date', 'today'
   * @returns {string|null} Format: YYYY-MM-DD
   */
  determinRateDate(record, rateSource) {
    let timestamp = null;

    switch (rateSource) {
      case 'document_date':
        // Data dokumentu sprzedaży (ds1_date)
        timestamp = record.ds1_date || record.date_confirmed;
        break;

      case 'order_date':
        // Data zamówienia
        timestamp = record.date_confirmed || record.date_add;
        break;

      case 'ship_date':
        // Data wysyłki (pierwsza przesyłka)
        timestamp = record.pkg1_date_sent || record.date_confirmed;
        break;

      case 'today':
      default:
        // Dzisiejsza data
        return new Date().toISOString().split('T')[0];
    }

    if (!timestamp) {
      return new Date().toISOString().split('T')[0];
    }

    // Konwertuj timestamp na datę
    const date = typeof timestamp === 'number'
      ? new Date(timestamp * 1000)
      : new Date(timestamp);

    return date.toISOString().split('T')[0];
  }

  /**
   * Pobiera kursy z NBP
   * @param {Object} nbpService
   * @param {Set<string>} ratesNeeded
   * @param {string} targetCurrency
   * @returns {Promise<Map<string, Object>>}
   */
  async fetchRates(nbpService, ratesNeeded, targetCurrency) {
    const rates = new Map();

    for (const key of ratesNeeded) {
      const [currency, date] = key.split(':');

      try {
        const rate = await nbpService.getExchangeRate(currency, targetCurrency, date);

        rates.set(key, {
          rate: rate.rate,
          date: rate.date || date
        });

      } catch (error) {
        logger.warn(`Failed to fetch rate for ${key}`, { error: error.message });

        // Fallback: użyj kursu 1 (bez przeliczenia)
        rates.set(key, { rate: 1, date: date });
      }
    }

    return rates;
  }

  /**
   * Wzbogaca rekord o przewalutowane wartości
   * @param {Object} record
   * @param {Map<string, Object>} rates
   * @param {Object} currencyConfig
   * @returns {Object}
   */
  enrichRecordWithCurrency(record, rates, currencyConfig) {
    const enriched = { ...record };
    const sourceCurrency = record.currency || 'PLN';
    const targetCurrency = currencyConfig.targetCurrency;

    // Jeśli waluta źródłowa = docelowa, nie przeliczamy
    if (sourceCurrency === targetCurrency) {
      enriched.converted_currency = targetCurrency;
      enriched.converted_rate = 1;
      enriched.converted_rate_date = null;
      enriched.converted_products_brutto = record.products_value_brutto || null;
      enriched.converted_products_netto = record.products_value_netto || null;
      enriched.converted_delivery_brutto = record.delivery_price_brutto || null;
      enriched.converted_delivery_netto = record.delivery_price_netto || null;
      enriched.converted_order_brutto = record.order_value_brutto || null;
      enriched.converted_order_netto = record.order_value_netto || null;
      enriched.converted_payment_done = record.payment_done || null;
      return enriched;
    }

    // Pobierz kurs
    const rateDate = this.determinRateDate(record, currencyConfig.rateSource);
    const rateKey = `${sourceCurrency}:${rateDate}`;
    const rateInfo = rates.get(rateKey) || { rate: 1, date: rateDate };

    const rate = rateInfo.rate;

    // Przelicz wartości
    enriched.converted_currency = targetCurrency;
    enriched.converted_rate = rate;
    enriched.converted_rate_date = rateInfo.date;

    enriched.converted_products_brutto = this.convert(record.products_value_brutto, rate);
    enriched.converted_products_netto = this.convert(record.products_value_netto, rate);
    enriched.converted_delivery_brutto = this.convert(record.delivery_price_brutto || record.delivery_price, rate);
    enriched.converted_delivery_netto = this.convert(record.delivery_price_netto, rate);
    enriched.converted_order_brutto = this.convert(record.order_value_brutto, rate);
    enriched.converted_order_netto = this.convert(record.order_value_netto, rate);
    enriched.converted_payment_done = this.convert(record.payment_done, rate);

    return enriched;
  }

  /**
   * Przelicza wartość
   * @param {number|null} value
   * @param {number} rate
   * @returns {number|null}
   */
  convert(value, rate) {
    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }

    return Math.round(Number(value) * rate * 100) / 100;
  }

  /**
   * Wzbogaca rekord o puste pola przewalutowania
   * @param {Object} record
   * @returns {Object}
   */
  enrichWithEmptyCurrency(record) {
    return {
      ...record,
      converted_currency: null,
      converted_rate: null,
      converted_rate_date: null,
      converted_products_brutto: null,
      converted_products_netto: null,
      converted_delivery_brutto: null,
      converted_delivery_netto: null,
      converted_order_brutto: null,
      converted_order_netto: null,
      converted_payment_done: null
    };
  }
}

module.exports = CurrencyEnricher;
