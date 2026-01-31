/**
 * Product Details Enricher
 *
 * Wzbogaca produkty o szczegółowe dane z getInventoryProductsData.
 * Dodaje: opis, wymiary, tagi, kategorie, obrazy, warianty.
 */

const BaseEnricher = require('./BaseEnricher');

class ProductDetailsEnricher extends BaseEnricher {
  constructor() {
    super('product-details');
  }

  /**
   * Wzbogaca produkty o szczegółowe dane
   *
   * @param {Array} records - Tablica produktów
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
      this.logError('inventoryId is required for product-details enrichment', new Error('Missing inventoryId'));
      return records;
    }

    try {
      // Pobierz unikalne ID produktów
      const productIds = this.getUniqueValues(records, 'id')
        .filter(id => id !== null && id !== undefined);

      if (productIds.length === 0) {
        this.logEnrichComplete(0);
        return records;
      }

      // Pobierz szczegóły produktów w batchach
      const detailsMap = await this.fetchProductDetails(productIds, token, inventoryId);

      // Wzbogać rekordy
      const enrichedRecords = records.map(record => {
        const productId = record.id;
        const details = detailsMap.get(String(productId)) || detailsMap.get(productId);

        if (!details) {
          return record;
        }

        return {
          ...record,
          ...this.normalizeDetails(details)
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
   * Pobiera szczegóły produktów w batchach
   *
   * @param {Array<number>} productIds - Lista ID produktów
   * @param {string} token - Token API
   * @param {number} inventoryId - ID katalogu
   * @returns {Promise<Map>} - Mapa: product_id -> details
   */
  async fetchProductDetails(productIds, token, inventoryId) {
    const detailsMap = new Map();
    const batchSize = 100; // Max 100 produktów na request

    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      try {
        this.stats.apiCalls++;

        const response = await this.baselinkerService.makeRequest(
          token,
          'getInventoryProductsData',
          {
            inventory_id: inventoryId,
            products: batch
          }
        );

        const products = response.products || {};

        for (const [productId, data] of Object.entries(products)) {
          detailsMap.set(productId, data);
        }

      } catch (error) {
        this.logError(`Failed to fetch product details batch ${i}`, error);
      }

      // Rate limiting
      if (i + batchSize < productIds.length) {
        await this.rateLimit(150);
      }
    }

    return detailsMap;
  }

  /**
   * Normalizuje szczegóły produktu
   *
   * @param {object} details - Szczegóły z API
   * @returns {object} - Znormalizowane pola
   */
  normalizeDetails(details) {
    const textFields = details.text_fields || {};
    const images = details.images || {};
    const variants = details.variants || {};
    const tags = details.tags || [];

    return {
      // Podstawowe
      description: textFields.description || null,
      description_extra1: textFields.description_extra1 || null,
      description_extra2: textFields.description_extra2 || null,
      is_bundle: details.is_bundle || false,

      // Klasyfikacja
      category_id: details.category_id || null,
      manufacturer_id: details.manufacturer_id || null,
      tags: Array.isArray(tags) ? tags.join(', ') : null,
      star: details.star || null,

      // Wymiary
      weight: this.parseNumber(details.weight),
      height: this.parseNumber(details.height),
      width: this.parseNumber(details.width),
      length: this.parseNumber(details.length),

      // Podatki
      tax_rate: this.parseNumber(details.tax_rate),

      // Koszty
      average_cost: this.parseNumber(details.average_cost),
      additional_cost: this.parseNumber(details.average_landed_cost) - this.parseNumber(details.average_cost),
      average_landed_cost: this.parseNumber(details.average_landed_cost),

      // Lokalizacje
      locations_json: details.locations ? JSON.stringify(details.locations) : null,

      // Obrazy (do 10)
      image_url_1: images['1'] || null,
      image_url_2: images['2'] || null,
      image_url_3: images['3'] || null,
      image_url_4: images['4'] || null,
      image_url_5: images['5'] || null,
      image_url_6: images['6'] || null,
      image_url_7: images['7'] || null,
      image_url_8: images['8'] || null,
      image_url_9: images['9'] || null,
      image_url_10: images['10'] || null,
      images_count: Object.keys(images).length,

      // Warianty
      has_variants: Object.keys(variants).length > 0,
      variants_count: Object.keys(variants).length,
      variants_json: Object.keys(variants).length > 0 ? JSON.stringify(variants) : null,

      // Cechy
      features_json: textFields.features ? JSON.stringify(textFields.features) : null
    };
  }
}

module.exports = ProductDetailsEnricher;
