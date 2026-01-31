/**
 * Stock Enricher
 *
 * Wzbogaca produkty o szczegółowe stany magazynowe z getInventoryProductsStock.
 * Dodaje stany dla poszczególnych magazynów.
 */

const BaseEnricher = require('./BaseEnricher');

class StockEnricher extends BaseEnricher {
  constructor() {
    super('stock');
  }

  /**
   * Wzbogaca produkty o stany magazynowe
   *
   * @param {Array} records - Tablica produktów
   * @param {string} token - Token API BaseLinker
   * @param {object} options - Opcje
   * @param {number} options.inventoryId - ID katalogu
   * @param {Array} options.warehouseIds - Lista ID magazynów do wyciągnięcia
   * @returns {Promise<Array>} - Wzbogacone produkty
   */
  async enrich(records, token, options = {}) {
    this.resetStats();
    this.logEnrichStart(records.length);

    const inventoryId = options.inventoryId;
    if (!inventoryId) {
      this.logError('inventoryId is required for stock enrichment', new Error('Missing inventoryId'));
      return records;
    }

    try {
      // Pobierz stany magazynowe dla całego katalogu
      const stockMap = await this.fetchAllStock(token, inventoryId);

      // Wzbogać rekordy
      const enrichedRecords = records.map(record => {
        const productId = record.id;
        const stockData = stockMap.get(String(productId)) || stockMap.get(productId);

        if (!stockData) {
          return record;
        }

        return {
          ...record,
          ...this.flattenStock(stockData, options.warehouseIds)
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
   * Pobiera wszystkie stany magazynowe dla katalogu
   *
   * @param {string} token - Token API
   * @param {number} inventoryId - ID katalogu
   * @returns {Promise<Map>} - Mapa: product_id -> stock data
   */
  async fetchAllStock(token, inventoryId) {
    const stockMap = new Map();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        this.stats.apiCalls++;

        const response = await this.baselinkerService.makeRequest(
          token,
          'getInventoryProductsStock',
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
          for (const [productId, stockData] of productEntries) {
            stockMap.set(productId, stockData);
          }

          // BaseLinker zwraca max 1000 produktów na stronę
          hasMore = productEntries.length === 1000;
          page++;
        }

        // Rate limiting
        if (hasMore) {
          await this.rateLimit(100);
        }

      } catch (error) {
        this.logError(`Failed to fetch stock page ${page}`, error);
        hasMore = false;
      }
    }

    return stockMap;
  }

  /**
   * Spłaszcza dane stanów do pól stock_warehouse_*
   *
   * @param {object} stockData - Dane stanów (warehouse_id -> quantity)
   * @param {Array} warehouseIds - Lista preferowanych magazynów
   * @returns {object} - Spłaszczone pola
   */
  flattenStock(stockData, warehouseIds = []) {
    const result = {
      stock_warehouse_1: null,
      stock_warehouse_2: null,
      stock_warehouse_3: null
    };

    if (!stockData || typeof stockData !== 'object') {
      return result;
    }

    // Jeśli podano konkretne magazyny, użyj ich
    if (warehouseIds && warehouseIds.length > 0) {
      for (let i = 0; i < Math.min(warehouseIds.length, 3); i++) {
        const warehouseId = warehouseIds[i];
        result[`stock_warehouse_${i + 1}`] = this.parseNumber(stockData[warehouseId]);
      }
    } else {
      // Użyj pierwszych 3 magazynów z odpowiedzi
      const entries = Object.entries(stockData);
      for (let i = 0; i < Math.min(entries.length, 3); i++) {
        result[`stock_warehouse_${i + 1}`] = this.parseNumber(entries[i][1]);
      }
    }

    return result;
  }
}

module.exports = StockEnricher;
