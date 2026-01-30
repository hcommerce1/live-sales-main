/**
 * Warehouse Documents Fetcher
 *
 * Pobiera dokumenty magazynowe z BaseLinker API (getInventoryDocuments).
 * Dataset: warehouse_docs
 *
 * Typy dokumentów: WZ, PZ, RW, PW, BO
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class WarehouseDocsFetcher extends BaseFetcher {
  constructor() {
    super('warehouse_docs');
  }

  /**
   * Pobiera dokumenty magazynowe z BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje (inventoryId)
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    this.logFetchStart({ filters, inventoryId: options.inventoryId });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Dodaj inventory_id jeśli podano
    if (options.inventoryId) {
      apiFilters.inventory_id = options.inventoryId;
    }

    // Pobierz dokumenty z paginacją
    const documents = await this.fetchAllPages(async (lastDocumentId) => {
      const params = { ...apiFilters };

      if (lastDocumentId) {
        params.document_id = lastDocumentId;
      }

      // BaseLinker API: getInventoryDocuments
      const response = await client.makeRequest('getInventoryDocuments', params);

      if (!response || !response.documents) {
        return { data: [], nextPageToken: null };
      }

      const documentsArray = Object.values(response.documents);

      const nextPageToken = documentsArray.length === 100
        ? documentsArray[documentsArray.length - 1].document_id
        : null;

      return {
        data: documentsArray,
        nextPageToken
      };
    });

    // Normalizuj dane dokumentów
    const normalizedDocs = documents.map(doc => this.normalizeDocument(doc));

    this.logFetchComplete(normalizedDocs.length);

    return normalizedDocs;
  }

  /**
   * Normalizuje strukturę dokumentu
   * @param {Object} doc - Surowy dokument z API
   * @returns {Object}
   */
  normalizeDocument(doc) {
    // Agreguj pozycje dokumentu
    const items = doc.items || [];
    const itemsCount = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const itemsSkus = items.map(item => item.sku).filter(Boolean).join(', ');

    return {
      // Podstawowe
      document_id: doc.document_id,
      type: this.mapDocumentType(doc.type),
      series_id: doc.series_id,
      number: doc.number || '',
      date_add: doc.date_add,
      date_document: doc.date_document,

      // Magazyn
      warehouse_id: doc.warehouse_id,
      warehouse_name: '', // Wypełni transformer/enricher
      inventory_id: doc.inventory_id,

      // Kontrahent
      contractor_id: doc.contractor_id,
      contractor_name: doc.contractor_name || '',
      contractor_nip: doc.contractor_nip || '',

      // Wartości
      total_value_brutto: Number(doc.total_value_brutto) || 0,
      total_value_netto: Number(doc.total_value_netto) || 0,
      total_quantity: totalQuantity,
      currency: doc.currency || 'PLN',

      // Powiązania
      order_id: doc.order_id || null,
      purchase_order_id: doc.purchase_order_id || null,
      related_document_id: doc.related_document_id || null,

      // Pozycje (agregowane)
      items_count: itemsCount,
      items_skus: itemsSkus,

      // Komentarze
      comments: doc.comments || '',

      // Oryginalne pozycje (do ewentualnego enrichment)
      _items: items
    };
  }

  /**
   * Mapuje typ dokumentu na czytelną nazwę
   * @param {string|number} type
   * @returns {string}
   */
  mapDocumentType(type) {
    const typeMap = {
      'wz': 'WZ',
      'pz': 'PZ',
      'rw': 'RW',
      'pw': 'PW',
      'bo': 'BO',
      '1': 'WZ',
      '2': 'PZ',
      '3': 'RW',
      '4': 'PW',
      '5': 'BO'
    };

    return typeMap[String(type).toLowerCase()] || String(type);
  }

  /**
   * Konwertuje filtry specyficzne dla dokumentów
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = super.convertFilters(filters);

    // Filtr po typie dokumentu
    if (filters.documentType) {
      apiFilters.type = filters.documentType;
    }

    // Filtr po magazynie
    if (filters.warehouseId) {
      apiFilters.warehouse_id = filters.warehouseId;
    }

    // Filtr po serii
    if (filters.seriesId) {
      apiFilters.series_id = filters.seriesId;
    }

    return apiFilters;
  }
}

module.exports = WarehouseDocsFetcher;
