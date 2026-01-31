/**
 * Purchase Orders Fetcher
 *
 * Pobiera zamówienia zakupu towaru (getInventoryPurchaseOrders).
 * Zamówienia od dostawców.
 */

const BaseFetcher = require('./BaseFetcher');

class PurchaseOrdersFetcher extends BaseFetcher {
  constructor() {
    super('purchase_orders');
  }

  /**
   * Pobiera zamówienia zakupu z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry (wszystkie opcjonalne)
   * @param {number} [filters.warehouseId] - ID magazynu
   * @param {number} [filters.supplierId] - ID dostawcy
   * @param {number} [filters.seriesId] - ID serii dokumentów
   * @param {string} [filters.dateFrom] - Data od
   * @param {string} [filters.dateTo] - Data do
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych zamówień
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    // Purchase orders są globalne per konto BaseLinker - nie wymagają inventoryId

    try {
      const apiFilters = this.convertFilters(filters);
      const maxRecords = options.maxRecords || 10000;

      this.logger.info('PurchaseOrdersFetcher: API filters', { apiFilters });

      const allOrders = await this.fetchAllPages(
        async (page) => {
          const params = {
            ...apiFilters,
            page: page || 1
          };

          this.logger.info('PurchaseOrdersFetcher: Request params', { params });

          const response = await this.baselinkerService.makeRequest(
            token,
            'getInventoryPurchaseOrders',
            params
          );

          const orders = response.purchase_orders || [];

          let nextPageToken = null;
          if (orders.length === 100) {
            nextPageToken = (page || 1) + 1;
          }

          return {
            data: orders,
            nextPageToken
          };
        },
        maxRecords
      );

      const normalizedOrders = allOrders.map(order => this.normalize(order));

      this.logFetchComplete(normalizedOrders.length);

      return normalizedOrders;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Konwertuje filtry UI na format API BaseLinker
   *
   * Dozwolone parametry getInventoryPurchaseOrders:
   * - warehouse_id, supplier_id, series_id
   * - date_from, date_to (Unix timestamp)
   * - filter_document_number, page
   */
  convertFilters(filters) {
    const converted = {};

    if (filters.warehouseId) {
      converted.warehouse_id = filters.warehouseId;
    }

    if (filters.supplierId) {
      converted.supplier_id = filters.supplierId;
    }

    if (filters.seriesId) {
      converted.series_id = filters.seriesId;
    }

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.dateTo) {
      converted.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    if (filters.documentNumber) {
      converted.filter_document_number = filters.documentNumber;
    }

    return converted;
  }

  /**
   * Normalizuje zamówienie zakupu
   */
  normalize(order) {
    return {
      // Podstawowe
      id: order.id,
      name: order.name || null,
      document_number: order.document_number || null,
      series_id: order.series_id || null,

      // Daty
      date_created: this.fromUnixTimestamp(order.date_created),
      date_sent: this.fromUnixTimestamp(order.date_sent),
      date_received: this.fromUnixTimestamp(order.date_received),
      date_completed: this.fromUnixTimestamp(order.date_completed),

      // Dostawca
      supplier_id: order.supplier_id || null,
      supplier_name: null, // Computed - wymaga enrichmentu
      payer_id: order.payer_id || null,

      // Magazyn
      warehouse_id: order.warehouse_id || null,

      // Wartości
      currency: order.currency || 'PLN',
      total_quantity: this.parseNumber(order.total_quantity),
      completed_total_quantity: this.parseNumber(order.completed_total_quantity),
      total_cost: this.parseNumber(order.total_cost),
      completed_total_cost: this.parseNumber(order.completed_total_cost),

      // Status
      status: order.status,
      status_name: this.mapStatus(order.status),

      // Notatki
      notes: order.notes || null,
      cost_invoice_no: order.cost_invoice_no || null,

      // Pozycje (placeholder)
      items_count: 0,
      items_summary: null,
      items_json: null
    };
  }

  /**
   * Mapuje status na nazwę
   */
  mapStatus(status) {
    const statusMap = {
      0: 'Szkic',
      1: 'Wysłane',
      2: 'Otrzymane',
      3: 'Zakończone',
      4: 'Częściowo zakończone',
      5: 'Anulowane'
    };

    return statusMap[status] || `Status ${status}`;
  }
}

module.exports = PurchaseOrdersFetcher;
