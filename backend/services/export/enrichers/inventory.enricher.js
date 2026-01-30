/**
 * Inventory Enricher
 *
 * Wzbogaca pozycje zamówień (order_items) o dane z magazynu BaseLinker.
 * Używa API: getInventoryProductsData
 *
 * Dodaje pola inv_* (nazwa magazynowa, ceny zakupu, stany, etc.)
 * oraz kalkulacje marży.
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class InventoryEnricher extends BaseEnricher {
  constructor() {
    super('inventory');
  }

  /**
   * Wzbogaca pozycje zamówień o dane magazynowe
   * @param {Object[]} items - Pozycje zamówień do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje (inventoryId)
   * @returns {Promise<Object[]>}
   */
  async enrich(items, token, options = {}) {
    this.logEnrichStart(items.length, { inventoryId: options.inventoryId });

    const client = this.getBaseLinkerClient(token);

    // Pobierz unikalne product_id z pozycji
    const productIds = this.getUniqueValues(items, 'product_id')
      .filter(id => id && id !== '0' && id !== '');

    if (productIds.length === 0) {
      logger.debug('No product IDs to enrich');
      return items.map(item => this.enrichItemWithEmptyInventory(item));
    }

    // Pobierz dane produktów z magazynu (batch po 1000)
    const inventoryMap = await this.fetchInventoryData(client, productIds, options.inventoryId);

    // Wzbogać każdą pozycję
    const enrichedItems = items.map(item => {
      const inventoryData = inventoryMap.get(String(item.product_id));
      return this.enrichItemWithInventory(item, inventoryData);
    });

    this.logEnrichComplete(enrichedItems.length);

    return enrichedItems;
  }

  /**
   * Pobiera dane produktów z magazynu
   * @param {Object} client - Klient BaseLinker
   * @param {string[]} productIds - ID produktów
   * @param {number} inventoryId - ID katalogu (opcjonalny)
   * @returns {Promise<Map<string, Object>>}
   */
  async fetchInventoryData(client, productIds, inventoryId) {
    const inventoryMap = new Map();

    // Podziel na batche po 1000
    const batchSize = 1000;

    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      try {
        const params = {
          products: batch.map(id => ({ product_id: id }))
        };

        if (inventoryId) {
          params.inventory_id = inventoryId;
        }

        const response = await client.makeRequest('getInventoryProductsData', params);

        if (response && response.products) {
          const products = typeof response.products === 'object'
            ? response.products
            : {};

          for (const [id, data] of Object.entries(products)) {
            inventoryMap.set(String(id), data);
          }
        }

      } catch (error) {
        logger.warn(`Failed to fetch inventory batch (${i} - ${i + batch.length})`, {
          error: error.message
        });
      }
    }

    return inventoryMap;
  }

  /**
   * Wzbogaca pozycję o dane z magazynu
   * @param {Object} item - Pozycja zamówienia
   * @param {Object|null} inventoryData - Dane z magazynu
   * @returns {Object}
   */
  enrichItemWithInventory(item, inventoryData) {
    const enriched = { ...item };

    if (inventoryData) {
      // Dane podstawowe
      enriched.inv_name = inventoryData.name || '';
      enriched.inv_sku = inventoryData.sku || '';
      enriched.inv_ean = inventoryData.ean || '';
      enriched.inv_manufacturer = inventoryData.manufacturer || '';
      enriched.inv_category = inventoryData.category_name || '';

      // Ceny zakupu
      const purchaseBrutto = Number(inventoryData.price_brutto_purchase) || 0;
      const purchaseNetto = Number(inventoryData.price_netto_purchase) || 0;
      const taxRate = Number(inventoryData.tax_rate) || 23;

      enriched.inv_purchase_price_brutto = purchaseBrutto;
      enriched.inv_purchase_price_netto = purchaseNetto || (purchaseBrutto / (1 + taxRate / 100));
      enriched.inv_tax_rate = taxRate;

      // Waga
      enriched.inv_weight = Number(inventoryData.weight) || 0;

      // Stany magazynowe (suma ze wszystkich magazynów)
      const stocks = inventoryData.stock || {};
      const stockTotal = Object.values(stocks).reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
      const reservedTotal = Object.values(stocks).reduce((sum, s) => sum + (Number(s.reserved) || 0), 0);

      enriched.inv_stock = stockTotal;
      enriched.inv_reserved = reservedTotal;
      enriched.inv_available = stockTotal - reservedTotal;

      // Średni koszt
      enriched.inv_average_cost = Number(inventoryData.average_cost) || purchaseBrutto;

      // Kalkulacje marży
      const sellingPrice = Number(item.price_brutto) || 0;
      const costPrice = enriched.inv_average_cost || enriched.inv_purchase_price_brutto;
      const quantity = Number(item.quantity) || 0;

      if (costPrice > 0 && sellingPrice > 0) {
        const marginPerUnit = sellingPrice - costPrice;
        const marginTotal = marginPerUnit * quantity;
        const marginPercent = (marginPerUnit / costPrice) * 100;

        enriched.margin_per_unit = Math.round(marginPerUnit * 100) / 100;
        enriched.margin_total = Math.round(marginTotal * 100) / 100;
        enriched.margin_percent = Math.round(marginPercent * 100) / 100;
      } else {
        enriched.margin_per_unit = null;
        enriched.margin_total = null;
        enriched.margin_percent = null;
      }

    } else {
      // Brak danych w magazynie
      return this.enrichItemWithEmptyInventory(enriched);
    }

    return enriched;
  }

  /**
   * Wzbogaca pozycję o puste dane magazynowe
   * @param {Object} item
   * @returns {Object}
   */
  enrichItemWithEmptyInventory(item) {
    return {
      ...item,
      inv_name: '',
      inv_sku: '',
      inv_ean: '',
      inv_manufacturer: '',
      inv_category: '',
      inv_purchase_price_brutto: null,
      inv_purchase_price_netto: null,
      inv_tax_rate: null,
      inv_weight: null,
      inv_stock: null,
      inv_reserved: null,
      inv_available: null,
      inv_average_cost: null,
      margin_per_unit: null,
      margin_total: null,
      margin_percent: null
    };
  }
}

module.exports = InventoryEnricher;
