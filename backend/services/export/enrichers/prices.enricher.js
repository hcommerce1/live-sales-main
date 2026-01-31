/**
 * Prices Enricher
 *
 * Wzbogaca produkty o ceny z wszystkich grup cenowych z getInventoryProductsPrices.
 * Dodaje dynamiczne pola price_group_{id} z nazwami grup.
 */

const BaseEnricher = require('./BaseEnricher');

class PricesEnricher extends BaseEnricher {
  constructor() {
    super('prices');
  }

  /**
   * Wzbogaca produkty o ceny z grup cenowych
   *
   * @param {Array} records - Tablica produktow
   * @param {string} token - Token API BaseLinker
   * @param {object} options - Opcje
   * @param {number} options.inventoryId - ID katalogu
   * @returns {Promise<Array>} - Wzbogacone produkty
   */
  async enrich(records, token, options = {}) {
    this.resetStats();
    this.logEnrichStart(records.length);

    const inventoryId = options.inventoryId;
    if (!inventoryId) {
      this.logError('inventoryId is required for prices enrichment', new Error('Missing inventoryId'));
      return records;
    }

    try {
      // Pobierz wszystkie ceny dla katalogu
      const pricesMap = await this.fetchAllPrices(token, inventoryId);

      // Wzbogac rekordy
      const enrichedRecords = records.map(record => {
        const productId = record.id;
        const pricesData = pricesMap.get(String(productId)) || pricesMap.get(productId);

        if (!pricesData) {
          return record;
        }

        return {
          ...record,
          ...this.flattenPrices(pricesData)
        };
      });

      this.logEnrichComplete(enrichedRecords.length);

      return enrichedRecords;

    } catch (error) {
      this.logError('Enrichment failed', error);
      throw error;
    }
  }

  /**
   * Pobiera wszystkie ceny dla katalogu
   *
   * @param {string} token - Token API
   * @param {number} inventoryId - ID katalogu
   * @returns {Promise<Map>} - Mapa: product_id -> prices data
   */
  async fetchAllPrices(token, inventoryId) {
    const pricesMap = new Map();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        this.stats.apiCalls++;

        const response = await this.baselinkerService.makeRequest(
          token,
          'getInventoryProductsPrices',
          {
            inventory_id: inventoryId,
            page: page
          }
        );

        const products = response.products || {};
        const productEntries = Object.entries(products);

        if (productEntries.length === 0) {
          hasMore = false;
        } else {
          for (const [productId, pricesData] of productEntries) {
            pricesMap.set(productId, pricesData);
          }

          // BaseLinker zwraca max 1000 produktow na strone
          hasMore = productEntries.length === 1000;
          page++;
        }

        // Rate limiting
        if (hasMore) {
          await this.rateLimit(100);
        }

      } catch (error) {
        this.logError(`Failed to fetch prices page ${page}`, error);
        hasMore = false;
      }
    }

    return pricesMap;
  }

  /**
   * Splaszcza dane cen do pol price_group_{id}
   *
   * @param {object} pricesData - Dane cen z API (zawiera prices i opcjonalnie variants)
   * @returns {object} - Splaszczone pola
   */
  flattenPrices(pricesData) {
    const result = {};

    if (!pricesData || typeof pricesData !== 'object') {
      return result;
    }

    // Ceny produktu glownego
    const prices = pricesData.prices || pricesData;

    if (typeof prices === 'object') {
      for (const [priceGroupId, price] of Object.entries(prices)) {
        // Dynamiczny klucz oparty na ID grupy cenowej
        result[`price_group_${priceGroupId}`] = this.parseNumber(price);
      }
    }

    return result;
  }
}

module.exports = PricesEnricher;
