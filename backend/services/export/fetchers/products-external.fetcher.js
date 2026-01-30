/**
 * Products External Fetcher
 *
 * Pobiera produkty z zewnętrznych magazynów (getExternalStorageProductsList).
 * Dataset: products_external
 *
 * Wymaga podania storage_id (ID zewnętrznego magazynu).
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class ProductsExternalFetcher extends BaseFetcher {
  constructor() {
    super('products_external');
  }

  /**
   * Pobiera produkty z zewnętrznego magazynu
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje (externalStorageId wymagany)
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    if (!options.externalStorageId) {
      throw new Error('externalStorageId is required for products_external dataset');
    }

    this.logFetchStart({ filters, externalStorageId: options.externalStorageId });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz produkty z paginacją
    const products = await this.fetchAllPages(async (page) => {
      const params = {
        storage_id: options.externalStorageId,
        ...apiFilters,
        page: page || 1
      };

      // BaseLinker API: getExternalStorageProductsList
      const response = await client.makeRequest('getExternalStorageProductsList', params);

      if (!response || !response.products) {
        return { data: [], nextPageToken: null };
      }

      const productsArray = Array.isArray(response.products)
        ? response.products
        : Object.entries(response.products).map(([id, product]) => ({
            product_id: id,
            ...product
          }));

      const nextPageToken = productsArray.length === 1000
        ? (page || 1) + 1
        : null;

      return {
        data: productsArray,
        nextPageToken
      };
    });

    // Normalizuj dane produktów
    const normalizedProducts = products.map(product =>
      this.normalizeProduct(product, options.externalStorageId)
    );

    this.logFetchComplete(normalizedProducts.length);

    return normalizedProducts;
  }

  /**
   * Normalizuje strukturę produktu zewnętrznego
   * @param {Object} product - Surowy produkt z API
   * @param {string} storageId - ID zewnętrznego magazynu
   * @returns {Object}
   */
  normalizeProduct(product, storageId) {
    return {
      // Identyfikatory
      product_id: product.product_id || product.id || '',
      storage_id: storageId,
      storage_name: '', // Wypełni context
      sku: product.sku || '',
      ean: product.ean || '',

      // Podstawowe
      name: product.name || '',
      description: product.description || '',
      category: product.category || '',
      manufacturer: product.manufacturer || product.brand || '',

      // Ceny
      price_brutto: Number(product.price_brutto) || Number(product.price) || 0,
      price_netto: Number(product.price_netto) || 0,
      price_retail: Number(product.price_retail) || Number(product.retail_price) || 0,

      // Dostępność
      quantity: Number(product.quantity) || Number(product.stock) || 0,
      available: (Number(product.quantity) || Number(product.stock) || 0) > 0,
      delivery_time: product.delivery_time || product.shipping_time || '',

      // Wymiary
      weight: Number(product.weight) || 0,
      height: Number(product.height) || 0,
      width: Number(product.width) || 0,
      length: Number(product.length) || 0,

      // Metadata
      _storageId: storageId
    };
  }

  /**
   * Konwertuje filtry specyficzne dla produktów zewnętrznych
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = {};

    // Filtr po kategorii
    if (filters.category) {
      apiFilters.filter_category = filters.category;
    }

    // Filtr po SKU
    if (filters.sku) {
      apiFilters.filter_sku = filters.sku;
    }

    // Filtr po dostępności
    if (filters.availableOnly) {
      apiFilters.filter_available = true;
    }

    return apiFilters;
  }
}

module.exports = ProductsExternalFetcher;
