/**
 * Shipments Fetcher
 *
 * Pobiera przesyłki kurierskie poprzez:
 * 1. Pobieranie zamówień (getOrders)
 * 2. Dla każdego zamówienia - getOrderPackages
 *
 * Zwraca tylko zamówienia które mają przesyłki.
 */

const BaseFetcher = require('./BaseFetcher');

class ShipmentsFetcher extends BaseFetcher {
  constructor() {
    super('shipments');
  }

  /**
   * Pobiera przesyłki z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych przesyłek
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const maxRecords = options.maxRecords || 10000;

      // 1. Pobierz zamówienia
      const orders = await this.fetchOrders(token, filters, maxRecords);

      // 2. Dla każdego zamówienia pobierz przesyłki
      const allShipments = [];

      const batchSize = 20; // Przetwarzaj 20 zamówień naraz

      for (let i = 0; i < orders.length && allShipments.length < maxRecords; i += batchSize) {
        const batch = orders.slice(i, i + batchSize);

        const promises = batch.map(async (order) => {
          try {
            this.stats.apiCalls++;
            const packages = await this.baselinkerService.getOrderPackages(token, order.order_id);

            return packages.map(pkg => ({
              ...pkg,
              _order: order
            }));
          } catch (error) {
            this.logError(`Failed to get packages for order ${order.order_id}`, error);
            return [];
          }
        });

        const results = await Promise.all(promises);

        for (const packages of results) {
          for (const pkg of packages) {
            if (allShipments.length < maxRecords) {
              allShipments.push(this.normalize(pkg, pkg._order, filters));
            }
          }
        }

        // Rate limiting
        if (i + batchSize < orders.length) {
          await this.rateLimit(200);
        }
      }

      // Filtruj po statusie śledzenia jeśli podano
      let filteredShipments = allShipments;
      if (filters.trackingStatus) {
        const statusFilter = parseInt(filters.trackingStatus, 10);
        filteredShipments = allShipments.filter(s => s.tracking_status === statusFilter);
      }

      // Filtruj po kurierze jeśli podano
      if (filters.courierCode) {
        filteredShipments = filteredShipments.filter(
          s => s.courier_code === filters.courierCode
        );
      }

      this.logFetchComplete(filteredShipments.length);

      return filteredShipments;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Pobiera zamówienia z filtracją
   */
  async fetchOrders(token, filters, maxRecords) {
    const apiFilters = this.convertOrderFilters(filters);
    const allOrders = [];
    let lastDateConfirmed = apiFilters.date_from || 0;
    let hasMore = true;

    while (hasMore && allOrders.length < maxRecords) {
      this.stats.apiCalls++;

      const params = {
        ...apiFilters,
        date_confirmed_from: lastDateConfirmed
      };

      delete params.date_from;

      const response = await this.baselinkerService.makeRequest(token, 'getOrders', params);
      const orders = response.orders || [];

      if (orders.length === 0) {
        hasMore = false;
      } else {
        allOrders.push(...orders);

        const lastOrder = orders[orders.length - 1];
        lastDateConfirmed = lastOrder.date_confirmed + 1;
        hasMore = orders.length === 100;
      }

      if (hasMore) {
        await this.rateLimit(100);
      }
    }

    return allOrders;
  }

  /**
   * Konwertuje filtry dla zamówień
   */
  convertOrderFilters(filters) {
    const converted = {};

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.dateTo) {
      converted.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    return converted;
  }

  /**
   * Normalizuje przesyłkę
   */
  normalize(pkg, order, filters) {
    return {
      // Podstawowe
      package_id: pkg.package_id,
      order_id: order.order_id,
      courier_code: pkg.courier_code || null,
      courier_package_nr: pkg.courier_package_nr || null,

      // Kurier
      courier_other_name: pkg.courier_other_name || null,
      courier_inner_number: pkg.courier_inner_number || null,
      account_id: pkg.account_id || null,

      // Śledzenie
      tracking_status: pkg.tracking_status,
      tracking_status_name: this.mapTrackingStatus(pkg.tracking_status),
      tracking_status_date: this.fromUnixTimestamp(pkg.tracking_status_date),
      tracking_delivery_days: pkg.tracking_delivery_days || null,
      tracking_url: pkg.tracking_url || null,

      // Typ
      package_type: pkg.package_type || null,
      is_return: pkg.is_return || false,

      // Placeholder dla enrichmentu
      weight: null,
      width: null,
      height: null,
      length: null,
      cod_value: null,
      insurance_value: null,
      tracking_history_json: null,

      // Dane zamówienia
      order_date: this.fromUnixTimestamp(order.date_add),
      order_status_id: order.order_status_id,
      delivery_fullname: order.delivery_fullname || null,
      delivery_city: order.delivery_city || null,
      delivery_country: order.delivery_country || null
    };
  }

  /**
   * Mapuje status śledzenia na nazwę
   */
  mapTrackingStatus(status) {
    const statusMap = {
      0: 'Nieznany',
      1: 'Etykieta utworzona',
      2: 'Wysłana',
      3: 'Niedoręczona',
      4: 'W doręczeniu',
      5: 'Doręczona',
      6: 'Zwrot',
      7: 'Awizo',
      8: 'Czeka w punkcie',
      9: 'Zagubiona',
      10: 'Anulowana',
      11: 'W drodze'
    };

    return statusMap[status] || `Status ${status}`;
  }
}

module.exports = ShipmentsFetcher;
