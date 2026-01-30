/**
 * Products Catalog Fetcher
 *
 * Pobiera produkty z katalogu BaseLinker (getInventoryProductsList).
 * Dataset: products_catalog
 *
 * Wymaga podania inventory_id (ID katalogu).
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class ProductsCatalogFetcher extends BaseFetcher {
  constructor() {
    super('products_catalog');
  }

  /**
   * Pobiera produkty z katalogu BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje (inventoryId wymagany)
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    if (!options.inventoryId) {
      throw new Error('inventoryId is required for products_catalog dataset');
    }

    this.logFetchStart({ filters, inventoryId: options.inventoryId });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz produkty z paginacją
    const products = await this.fetchAllPages(async (page) => {
      const params = {
        inventory_id: options.inventoryId,
        ...apiFilters,
        page: page || 1
      };

      // BaseLinker API: getInventoryProductsList
      const response = await client.makeRequest('getInventoryProductsList', params);

      if (!response || !response.products) {
        return { data: [], nextPageToken: null };
      }

      const productsArray = Object.entries(response.products).map(([id, product]) => ({
        product_id: id,
        ...product
      }));

      // Następna strona jeśli jest 1000 rekordów (limit API)
      const nextPageToken = productsArray.length === 1000
        ? (page || 1) + 1
        : null;

      return {
        data: productsArray,
        nextPageToken
      };
    });

    // Normalizuj dane produktów
    const normalizedProducts = products.map(product => this.normalizeProduct(product, options.inventoryId));

    this.logFetchComplete(normalizedProducts.length);

    return normalizedProducts;
  }

  /**
   * Normalizuje strukturę produktu
   * @param {Object} product - Surowy produkt z API
   * @param {number} inventoryId - ID katalogu
   * @returns {Object}
   */
  normalizeProduct(product, inventoryId) {
    // Oblicz stany magazynowe
    const stocks = product.stock || {};
    const stockTotal = Object.values(stocks).reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    const reservedTotal = Object.values(stocks).reduce((sum, s) => sum + (Number(s.reserved) || 0), 0);
    const availableTotal = stockTotal - reservedTotal;

    // Stany per magazyn (max 3)
    const warehouseIds = Object.keys(stocks).slice(0, 3);
    const stockWarehouse1 = stocks[warehouseIds[0]]?.stock || 0;
    const stockWarehouse2 = stocks[warehouseIds[1]]?.stock || 0;
    const stockWarehouse3 = stocks[warehouseIds[2]]?.stock || 0;

    // Ceny
    const prices = product.prices || {};
    const defaultPrice = prices[Object.keys(prices)[0]] || {};

    // Ceny grupowe
    const priceGroups = {};
    Object.entries(prices).forEach(([groupId, priceData], index) => {
      if (index < 3) {
        priceGroups[`price_group_${index + 1}`] = Number(priceData.price_brutto) || 0;
      }
    });

    return {
      // Identyfikatory
      product_id: product.product_id,
      sku: product.sku || '',
      ean: product.ean || '',
      manufacturer_code: product.manufacturer_code || '',

      // Podstawowe
      name: product.name || '',
      description: product.description || '',
      description_extra1: product.description_extra1 || '',
      description_extra2: product.description_extra2 || '',

      // Klasyfikacja
      category_id: product.category_id,
      category_name: '', // Wypełni enricher jeśli potrzebne
      manufacturer_id: product.manufacturer_id,
      manufacturer_name: product.manufacturer || '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),

      // Ceny
      price_brutto: Number(defaultPrice.price_brutto) || 0,
      price_netto: Number(defaultPrice.price_netto) || 0,
      tax_rate: Number(product.tax_rate) || 23,
      purchase_price_brutto: Number(product.price_brutto_purchase) || 0,
      purchase_price_netto: Number(product.price_netto_purchase) || 0,
      average_cost: Number(product.average_cost) || 0,

      // Stany magazynowe
      stock_total: stockTotal,
      stock_available: availableTotal,
      stock_reserved: reservedTotal,
      stock_warehouse_1: stockWarehouse1,
      stock_warehouse_2: stockWarehouse2,
      stock_warehouse_3: stockWarehouse3,

      // Wymiary i waga
      weight: Number(product.weight) || 0,
      height: Number(product.height) || 0,
      width: Number(product.width) || 0,
      length: Number(product.length) || 0,

      // Media
      image_url: product.images?.[0] || '',
      images_count: product.images?.length || 0,

      // Lokalizacja
      location: product.locations?.[Object.keys(product.locations || {})[0]] || '',

      // Warianty
      has_variants: product.is_bundle === false && (product.variants?.length > 0 || false),
      variants_count: product.variants?.length || 0,

      // Ceny grupowe
      ...priceGroups,

      // Pola tekstowe (dynamiczne)
      ...this.extractTextFields(product),

      // Metadata
      _inventoryId: inventoryId,
      _stocks: stocks
    };
  }

  /**
   * Wyciąga pola tekstowe (text_field_*)
   * @param {Object} product
   * @returns {Object}
   */
  extractTextFields(product) {
    const textFields = {};

    for (const key of Object.keys(product)) {
      if (key.startsWith('text_field_')) {
        textFields[key] = product[key] || '';
      }
    }

    // Obsłuż również zagnieżdżone text_fields
    if (product.text_fields && typeof product.text_fields === 'object') {
      for (const [key, value] of Object.entries(product.text_fields)) {
        textFields[`text_field_${key}`] = value || '';
      }
    }

    return textFields;
  }

  /**
   * Konwertuje filtry specyficzne dla produktów
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = {};

    // Filtr po kategorii
    if (filters.categoryId) {
      apiFilters.filter_category_id = filters.categoryId;
    }

    // Filtr po SKU
    if (filters.sku) {
      apiFilters.filter_sku = filters.sku;
    }

    // Filtr po EAN
    if (filters.ean) {
      apiFilters.filter_ean = filters.ean;
    }

    // Filtr po nazwie
    if (filters.name) {
      apiFilters.filter_name = filters.name;
    }

    // Filtr po producencie
    if (filters.manufacturerId) {
      apiFilters.filter_manufacturer_id = filters.manufacturerId;
    }

    return apiFilters;
  }
}

module.exports = ProductsCatalogFetcher;
