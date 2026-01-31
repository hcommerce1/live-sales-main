/**
 * Products Catalog Fetcher
 *
 * Pobiera produkty z katalogu BaseLinker (getInventoryProductsList).
 * Wymaga inventoryId. Obsługuje paginację przez page number (1000/page).
 */

const BaseFetcher = require('./BaseFetcher');

class ProductsCatalogFetcher extends BaseFetcher {
  constructor() {
    super('products_catalog');
  }

  /**
   * Pobiera produkty z katalogu BaseLinker
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {number} filters.inventoryId - ID katalogu (wymagany)
   * @param {number} filters.categoryId - ID kategorii
   * @param {string} filters.sku - Filtr SKU
   * @param {string} filters.ean - Filtr EAN
   * @param {string} filters.name - Filtr nazwy
   * @param {number} filters.priceFrom - Cena od
   * @param {number} filters.priceTo - Cena do
   * @param {number} filters.stockFrom - Stan od
   * @param {number} filters.stockTo - Stan do
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych produktów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    // Walidacja wymaganego inventoryId
    const inventoryId = filters.inventoryId || options.inventoryId;
    if (!inventoryId) {
      throw new Error('inventoryId is required for products_catalog dataset');
    }

    try {
      const apiFilters = this.convertFilters(filters, inventoryId);
      const maxRecords = options.maxRecords || 10000;

      // Pobierz produkty z paginacją przez page number
      const allProducts = await this.fetchAllPages(
        async (page) => {
          const params = {
            ...apiFilters,
            page: page || 1
          };

          const response = await this.baselinkerService.makeRequest(
            token,
            'getInventoryProductsList',
            params
          );

          // API zwraca obiekt products: { id: {...}, id2: {...} }
          const productsObj = response.products || {};
          const products = this.objectToArray(productsObj);

          // Oblicz nextPageToken
          // BaseLinker zwraca 1000 produktów na stronę
          let nextPageToken = null;
          if (products.length === 1000) {
            nextPageToken = (page || 1) + 1;
          }

          return {
            data: products,
            nextPageToken
          };
        },
        maxRecords
      );

      // Normalizuj wszystkie produkty
      const normalizedProducts = allProducts.map(product => this.normalize(product));

      this.logFetchComplete(normalizedProducts.length);

      return normalizedProducts;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API BaseLinker
   */
  convertFilters(filters, inventoryId) {
    const converted = {
      inventory_id: inventoryId
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
   * Normalizuje produkt z API do standardowego formatu
   *
   * @param {object} product - Surowy produkt z API
   * @returns {object} - Znormalizowany produkt
   */
  normalize(product) {
    // Oblicz cenę domyślną (pierwsza cena z listy)
    const prices = product.prices || {};
    const priceValues = Object.values(prices);
    const priceDefault = priceValues.length > 0 ? priceValues[0] : null;

    // Oblicz łączny stan
    const stock = product.stock || {};
    const stockTotal = Object.values(stock).reduce((sum, qty) => sum + this.parseNumber(qty), 0);

    return {
      // Identyfikatory
      id: product.id || product._key,
      sku: product.sku || null,
      ean: product.ean || null,
      asin: product.asin || null,

      // Podstawowe (nazwa z getInventoryProductsList)
      name: product.name || null,

      // Placeholder dla danych z getInventoryProductsData (enrichment)
      description: null,
      description_extra1: null,
      description_extra2: null,
      is_bundle: null,

      // Klasyfikacja (enrichment)
      category_id: null,
      category_name: null,
      manufacturer_id: null,
      manufacturer_name: null,
      tags: null,
      star: null,

      // Wymiary (enrichment)
      weight: null,
      height: null,
      width: null,
      length: null,

      // Podatki (enrichment)
      tax_rate: null,

      // Koszty (enrichment)
      average_cost: null,
      average_landed_cost: null,

      // Ceny podstawowe (z getInventoryProductsList)
      price_default: priceDefault,
      prices_json: Object.keys(prices).length > 0 ? JSON.stringify(prices) : null,

      // Ceny wg grup - dynamicznie dodawane przez PricesEnricher

      // Stany podstawowe (z getInventoryProductsList)
      stock_total: stockTotal,
      stock_json: Object.keys(stock).length > 0 ? JSON.stringify(stock) : null,

      // Stany wg magazynów - dynamicznie dodawane przez StockEnricher

      // Lokalizacje (enrichment)
      locations_json: null,

      // Obrazy (enrichment)
      image_url_1: null,
      image_url_2: null,
      image_url_3: null,
      images_count: null,

      // Warianty (enrichment)
      has_variants: null,
      variants_count: null,
      variants_json: null,

      // Cechy (enrichment)
      features_json: null,

      // Raw data for enrichment
      _prices: prices,
      _stock: stock
    };
  }
}

module.exports = ProductsCatalogFetcher;
