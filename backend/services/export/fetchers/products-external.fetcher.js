/**
 * Products External Fetcher
 *
 * Pobiera produkty z zewnętrznych magazynów (getExternalStorageProductsList).
 * Wymaga storageId. Obsługuje paginację przez page number.
 */

const BaseFetcher = require('./BaseFetcher');

class ProductsExternalFetcher extends BaseFetcher {
  constructor() {
    super('products_external');
  }

  /**
   * Pobiera produkty z zewnętrznego magazynu
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {string} filters.storageId - ID magazynu zewnętrznego (wymagany)
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych produktów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    const storageId = filters.storageId || options.storageId;
    if (!storageId) {
      throw new Error('storageId is required for products_external dataset');
    }

    try {
      const apiFilters = this.convertFilters(filters, storageId);
      const maxRecords = options.maxRecords || 10000;

      const allProducts = await this.fetchAllPages(
        async (page) => {
          const params = {
            ...apiFilters,
            page: page || 1
          };

          const response = await this.baselinkerService.makeRequest(
            token,
            'getExternalStorageProductsList',
            params
          );

          // API może zwracać obiekt lub tablicę
          let products = response.products || [];
          if (!Array.isArray(products)) {
            products = this.objectToArray(products);
          }

          let nextPageToken = null;
          if (products.length >= 100) {
            nextPageToken = (page || 1) + 1;
          }

          return {
            data: products,
            nextPageToken
          };
        },
        maxRecords
      );

      const normalizedProducts = allProducts.map(product => this.normalize(product));

      this.logFetchComplete(normalizedProducts.length);

      return normalizedProducts;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API
   */
  convertFilters(filters, storageId) {
    const converted = {
      storage_id: storageId
    };

    if (filters.categoryId) {
      converted.filter_category_id = filters.categoryId;
    }

    if (filters.sku) {
      converted.filter_sku = filters.sku;
    }

    if (filters.ean) {
      converted.filter_ean = filters.ean;
    }

    if (filters.name) {
      converted.filter_name = filters.name;
    }

    if (filters.priceFrom !== undefined && filters.priceFrom !== null) {
      converted.filter_price_from = filters.priceFrom;
    }

    if (filters.priceTo !== undefined && filters.priceTo !== null) {
      converted.filter_price_to = filters.priceTo;
    }

    if (filters.stockFrom !== undefined && filters.stockFrom !== null) {
      converted.filter_stock_from = filters.stockFrom;
    }

    if (filters.stockTo !== undefined && filters.stockTo !== null) {
      converted.filter_stock_to = filters.stockTo;
    }

    return converted;
  }

  /**
   * Normalizuje produkt z zewnętrznego magazynu
   */
  normalize(product) {
    const variants = product.variants || [];

    return {
      // Identyfikatory
      product_id: product.product_id || product._key || null,
      sku: product.sku || null,
      ean: product.ean || null,
      asin: product.asin || null,

      // Podstawowe
      name: product.name || null,
      category_id: product.category_id || null,

      // Ceny
      price_brutto: this.parseNumber(product.price_brutto),
      price_netto: this.parseNumber(product.price_netto),
      tax_rate: this.parseNumber(product.tax_rate),

      // Stany
      quantity: this.parseNumber(product.quantity),

      // Warianty
      has_variants: variants.length > 0,
      variants_count: variants.length,
      variants_json: variants.length > 0 ? JSON.stringify(variants) : null,

      // Placeholder dla enrichmentu
      description: null,
      weight: null,
      image_url: null,

      // Raw data
      _variants: variants
    };
  }
}

module.exports = ProductsExternalFetcher;
