/**
 * Warehouse Documents Fetcher
 *
 * Pobiera dokumenty magazynowe z API BaseLinker (getInventoryDocuments).
 * Typy: PZ, PW, WZ, RW, MM, BO.
 */

const BaseFetcher = require('./BaseFetcher');

class WarehouseDocsFetcher extends BaseFetcher {
  constructor() {
    super('warehouse_docs');
  }

  /**
   * Pobiera dokumenty magazynowe z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {number} filters.inventoryId - ID katalogu (wymagany)
   * @param {string} filters.dateFrom - Data od
   * @param {string} filters.dateTo - Data do
   * @param {number} filters.documentType - Typ dokumentu (0-5)
   * @param {string} filters.warehouseId - ID magazynu
   * @param {number} filters.seriesId - ID serii
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych dokumentów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    const inventoryId = filters.inventoryId || options.inventoryId;
    if (!inventoryId) {
      throw new Error('inventoryId is required for warehouse_docs dataset');
    }

    try {
      const apiFilters = this.convertFilters(filters, inventoryId);
      const maxRecords = options.maxRecords || 10000;

      const allDocuments = await this.fetchAllPages(
        async (lastId) => {
          const params = { ...apiFilters };

          if (lastId) {
            params.id_from = lastId;
          }

          const response = await this.baselinkerService.makeRequest(
            token,
            'getInventoryDocuments',
            params
          );

          const documents = response.documents || [];

          let nextPageToken = null;
          if (documents.length === 100) {
            const lastDoc = documents[documents.length - 1];
            nextPageToken = lastDoc.document_id + 1;
          }

          return {
            data: documents,
            nextPageToken
          };
        },
        maxRecords
      );

      const normalizedDocuments = allDocuments.map(doc => this.normalize(doc));

      this.logFetchComplete(normalizedDocuments.length);

      return normalizedDocuments;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API
   */
  convertFilters(filters, inventoryId) {
    const converted = {
      inventory_id: inventoryId
    };

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.dateTo) {
      converted.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    if (filters.documentType !== undefined && filters.documentType !== '') {
      converted.document_type = parseInt(filters.documentType, 10);
    }

    if (filters.warehouseId) {
      converted.warehouse_id = filters.warehouseId;
    }

    if (filters.seriesId) {
      converted.series_id = filters.seriesId;
    }

    return converted;
  }

  /**
   * Normalizuje dokument magazynowy
   */
  normalize(doc) {
    return {
      // Podstawowe
      document_id: doc.document_id,
      document_type: doc.document_type,
      document_type_name: this.mapDocumentType(doc.document_type),
      document_status: doc.document_status,
      document_status_name: this.mapDocumentStatus(doc.document_status),
      full_number: doc.full_number || null,
      description: doc.description || null,

      // Daty
      date_created: this.fromUnixTimestamp(doc.date_created),
      date_confirmed: this.fromUnixTimestamp(doc.date_confirmed),

      // Magazyn
      warehouse_id: doc.warehouse_id || null,
      warehouse_id2: doc.warehouse_id2 || null,

      // Kierunek
      direction: doc.direction,
      direction_name: this.mapDirection(doc.direction),

      // Wartości
      items_count: doc.items_count || 0,
      total_quantity: this.parseNumber(doc.total_quantity),
      total_price: this.parseNumber(doc.total_price),

      // Seria
      document_series_id: doc.document_series_id || null,

      // Pozycje (placeholder dla enrichmentu)
      items_summary: null,
      items_json: null
    };
  }

  /**
   * Mapuje typ dokumentu na nazwę
   */
  mapDocumentType(type) {
    const typeMap = {
      0: 'PZ - Przyjęcie zewnętrzne',
      1: 'PW - Przyjęcie wewnętrzne',
      2: 'WZ - Wydanie zewnętrzne',
      3: 'RW - Rozchód wewnętrzny',
      4: 'MM - Przesunięcie międzymagazynowe',
      5: 'BO - Bilans otwarcia'
    };

    return typeMap[type] || `Typ ${type}`;
  }

  /**
   * Mapuje status dokumentu na nazwę
   */
  mapDocumentStatus(status) {
    const statusMap = {
      0: 'Szkic',
      1: 'Zatwierdzony'
    };

    return statusMap[status] || `Status ${status}`;
  }

  /**
   * Mapuje kierunek na nazwę
   */
  mapDirection(direction) {
    const directionMap = {
      0: 'Przyjęcie',
      1: 'Wydanie'
    };

    return directionMap[direction] || null;
  }
}

module.exports = WarehouseDocsFetcher;
