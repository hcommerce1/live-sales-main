/**
 * Shipments Fetcher
 *
 * Pobiera przesyłki z BaseLinker API (getOrderPackages).
 * Dataset: shipments
 *
 * Może pobierać przesyłki dla wszystkich zamówień lub konkretnych.
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class ShipmentsFetcher extends BaseFetcher {
  constructor() {
    super('shipments');
  }

  /**
   * Pobiera przesyłki z BaseLinker
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    this.logFetchStart({ filters });

    const client = this.getBaseLinkerClient(token);

    // Najpierw pobieramy zamówienia, potem przesyłki dla każdego
    // BaseLinker nie ma endpointu do pobierania wszystkich przesyłek na raz

    const apiFilters = this.convertFilters(filters);

    // Pobierz zamówienia z paginacją
    const orders = await this.fetchAllPages(async (lastOrderId) => {
      const params = {
        ...apiFilters,
        get_unconfirmed_orders: false
      };

      if (lastOrderId) {
        params.order_id = lastOrderId;
      }

      const response = await client.getOrders(params);

      if (!response || !response.orders) {
        return { data: [], nextPageToken: null };
      }

      const ordersArray = Object.values(response.orders);

      const nextPageToken = ordersArray.length === 100
        ? ordersArray[ordersArray.length - 1].order_id
        : null;

      return {
        data: ordersArray,
        nextPageToken
      };
    });

    // Zbierz wszystkie przesyłki ze wszystkich zamówień
    const allShipments = [];

    for (const order of orders) {
      // Pobierz szczegóły przesyłek dla zamówienia
      try {
        const packagesResponse = await client.getOrderPackages(order.order_id);

        if (packagesResponse && packagesResponse.packages) {
          const packages = Array.isArray(packagesResponse.packages)
            ? packagesResponse.packages
            : Object.values(packagesResponse.packages);

          for (const pkg of packages) {
            allShipments.push(this.normalizeShipment(pkg, order));
          }
        }
      } catch (error) {
        logger.warn(`Failed to fetch packages for order ${order.order_id}`, {
          error: error.message
        });
      }
    }

    this.logFetchComplete(allShipments.length);

    return allShipments;
  }

  /**
   * Normalizuje strukturę przesyłki
   * @param {Object} pkg - Surowa przesyłka z API
   * @param {Object} order - Zamówienie (dla kontekstu)
   * @returns {Object}
   */
  normalizeShipment(pkg, order) {
    return {
      // Podstawowe
      package_id: pkg.package_id,
      order_id: order.order_id,
      courier_code: pkg.courier_code || '',
      courier_name: '', // Wypełni transformer/context
      tracking_number: pkg.tracking_number || pkg.courier_package_nr || '',
      tracking_url: this.buildTrackingUrl(pkg.courier_code, pkg.tracking_number || pkg.courier_package_nr),

      // Daty
      date_add: pkg.date_add,
      date_sent: pkg.date_sent,
      date_delivered: pkg.date_delivered,

      // Status
      status: pkg.status || '',
      status_code: pkg.status_code || '',
      is_delivered: pkg.is_delivered === true || pkg.is_delivered === 1,
      is_return: pkg.is_return === true || pkg.is_return === 1,

      // Parametry przesyłki
      weight: Number(pkg.weight) || 0,
      size_x: Number(pkg.size_x) || 0,
      size_y: Number(pkg.size_y) || 0,
      size_z: Number(pkg.size_z) || 0,
      cod_value: Number(pkg.cod_value) || 0,
      insurance_value: Number(pkg.insurance_value) || 0,

      // Adres doręczenia (z zamówienia)
      receiver_name: order.delivery_fullname || '',
      receiver_address: order.delivery_address || '',
      receiver_city: order.delivery_city || '',
      receiver_postcode: order.delivery_postcode || '',
      receiver_country: order.delivery_country || '',
      receiver_phone: order.phone || '',
      receiver_email: order.email || '',

      // Punkt odbioru
      pickup_point_id: order.delivery_point_id || '',
      pickup_point_name: order.delivery_point_name || '',
      pickup_point_address: order.delivery_point_address || '',

      // Tracking (placeholder - wypełni enricher)
      tracking_last_status: null,
      tracking_last_date: null,
      tracking_last_location: null,
      tracking_events_count: null,

      // Dokumenty (placeholder - wypełni enricher)
      has_label: null,
      label_url: null,
      has_protocol: null,
      protocol_url: null,

      // Metadata
      _originalPackage: pkg,
      _order: {
        order_id: order.order_id,
        currency: order.currency
      }
    };
  }

  /**
   * Buduje URL do śledzenia przesyłki
   * @param {string} courierCode
   * @param {string} trackingNumber
   * @returns {string}
   */
  buildTrackingUrl(courierCode, trackingNumber) {
    if (!trackingNumber) return '';

    const trackingUrls = {
      'inpost': `https://inpost.pl/sledzenie-przesylek?number=${trackingNumber}`,
      'dpd': `https://www.dpd.com.pl/tracking?number=${trackingNumber}`,
      'dhl': `https://www.dhl.com/pl-pl/home/tracking.html?tracking-id=${trackingNumber}`,
      'ups': `https://www.ups.com/track?tracknum=${trackingNumber}`,
      'fedex': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      'gls': `https://gls-group.eu/PL/pl/sledzenie-paczek?match=${trackingNumber}`,
      'pocztex': `https://www.pocztex.pl/sledzenie-przesylki/?numer=${trackingNumber}`,
      'orlen_paczka': `https://nadaj.orlenpaczka.pl/sledzenie?number=${trackingNumber}`
    };

    const code = String(courierCode).toLowerCase();
    return trackingUrls[code] || '';
  }

  /**
   * Konwertuje filtry specyficzne dla przesyłek
   * @param {Object} filters
   * @returns {Object}
   */
  convertFilters(filters) {
    const apiFilters = super.convertFilters(filters);

    // Filtr po kurierze
    if (filters.courierCode) {
      apiFilters.delivery_package_module = filters.courierCode;
    }

    return apiFilters;
  }
}

module.exports = ShipmentsFetcher;
