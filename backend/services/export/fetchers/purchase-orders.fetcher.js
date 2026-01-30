/**
 * Purchase Orders Fetcher
 *
 * Pobiera zamówienia zakupowe z BaseLinker API (getInventoryPurchaseOrders).
 * Dataset: purchase_orders
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class PurchaseOrdersFetcher extends BaseFetcher {
  constructor() {
    super('purchase_orders');
  }

  /**
   * Pobiera zamówienia zakupowe z BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje (inventoryId opcjonalny)
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

    // Pobierz zamówienia z paginacją
    const purchaseOrders = await this.fetchAllPages(async (lastPurchaseOrderId) => {
      const params = { ...apiFilters };

      if (lastPurchaseOrderId) {
        params.purchase_order_id = lastPurchaseOrderId;
      }

      // BaseLinker API: getInventoryPurchaseOrders
      const response = await client.makeRequest('getInventoryPurchaseOrders', params);

      if (!response || !response.purchase_orders) {
        return { data: [], nextPageToken: null };
      }

      const ordersArray = Object.values(response.purchase_orders);

      const nextPageToken = ordersArray.length === 100
        ? ordersArray[ordersArray.length - 1].purchase_order_id
        : null;

      return {
        data: ordersArray,
        nextPageToken
      };
    });

    // Normalizuj dane zamówień
    const normalizedOrders = purchaseOrders.map(order => this.normalizePurchaseOrder(order));

    this.logFetchComplete(normalizedOrders.length);

    return normalizedOrders;
  }

  /**
   * Normalizuje strukturę zamówienia zakupowego
   * @param {Object} order - Surowe zamówienie z API
   * @returns {Object}
   */
  normalizePurchaseOrder(order) {
    // Agreguj pozycje
    const items = order.items || [];
    const itemsCount = items.length;
    const itemsQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const receivedQuantity = items.reduce((sum, item) => sum + (Number(item.received_quantity) || 0), 0);

    // Oblicz procent realizacji
    const completionPercent = itemsQuantity > 0
      ? Math.round((receivedQuantity / itemsQuantity) * 100)
      : 0;

    return {
      // Podstawowe
      purchase_order_id: order.purchase_order_id,
      series_id: order.series_id,
      number: order.number || '',
      status: this.mapStatus(order.status),

      // Daty
      date_add: order.date_add,
      date_expected: order.date_expected,
      date_confirmed: order.date_confirmed,
      date_received: order.date_received,

      // Dostawca
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name || '',
      supplier_nip: order.supplier_nip || '',
      supplier_address: order.supplier_address || '',
      supplier_email: order.supplier_email || '',
      supplier_phone: order.supplier_phone || '',

      // Magazyn docelowy
      warehouse_id: order.warehouse_id,
      warehouse_name: '', // Wypełni transformer
      inventory_id: order.inventory_id,

      // Wartości
      total_value_brutto: Number(order.total_value_brutto) || 0,
      total_value_netto: Number(order.total_value_netto) || 0,
      items_count: itemsCount,
      items_quantity: itemsQuantity,
      currency: order.currency || 'PLN',

      // Realizacja
      received_value: Number(order.received_value) || 0,
      received_quantity: receivedQuantity,
      completion_percent: completionPercent,

      // Komentarze
      comments: order.comments || '',

      // Oryginalne pozycje (do ewentualnego enrichment)
      _items: items
    };
  }

  /**
   * Mapuje status na czytelną nazwę
   * @param {string|number} status
   * @returns {string}
   */
  mapStatus(status) {
    const statusMap = {
      '0': 'Szkic',
      '1': 'Wysłane',
      '2': 'Potwierdzone',
      '3': 'W realizacji',
      '4': 'Zrealizowane',
      '5': 'Anulowane',
      'draft': 'Szkic',
      'sent': 'Wysłane',
      'confirmed': 'Potwierdzone',
      'in_progress': 'W realizacji',
      'completed': 'Zrealizowane',
      'cancelled': 'Anulowane'
    };

    return statusMap[String(status)] || String(status);
  }

  /**
   * Konwertuje filtry specyficzne dla zamówień zakupowych
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = super.convertFilters(filters);

    // Filtr po statusie
    if (filters.status) {
      apiFilters.status = filters.status;
    }

    // Filtr po dostawcy
    if (filters.supplierId) {
      apiFilters.supplier_id = filters.supplierId;
    }

    // Filtr po magazynie
    if (filters.warehouseId) {
      apiFilters.warehouse_id = filters.warehouseId;
    }

    return apiFilters;
  }
}

module.exports = PurchaseOrdersFetcher;
