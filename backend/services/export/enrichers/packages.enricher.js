/**
 * Packages Enricher
 *
 * Wzbogaca zamówienia o dane przesyłek (max 5 paczek na zamówienie).
 * Używa API: getOrderPackages
 *
 * Dodaje pola pkg1_* do pkg5_* oraz packages_count.
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class PackagesEnricher extends BaseEnricher {
  constructor() {
    super('packages');
  }

  /**
   * Wzbogaca zamówienia o dane przesyłek
   * @param {Object[]} orders - Zamówienia do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje (courierMap)
   * @returns {Promise<Object[]>}
   */
  async enrich(orders, token, options = {}) {
    this.logEnrichStart(orders.length);

    const client = this.getBaseLinkerClient(token);
    const courierMap = options.courierMap || {};

    // Pobierz przesyłki dla każdego zamówienia
    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          const packages = await this.fetchPackagesForOrder(client, order.order_id);
          return this.enrichOrderWithPackages(order, packages, courierMap);
        } catch (error) {
          logger.warn(`Failed to fetch packages for order ${order.order_id}`, {
            error: error.message
          });
          return this.enrichOrderWithEmptyPackages(order);
        }
      })
    );

    this.logEnrichComplete(enrichedOrders.length);

    return enrichedOrders;
  }

  /**
   * Pobiera przesyłki dla zamówienia
   * @param {Object} client - Klient BaseLinker
   * @param {number} orderId - ID zamówienia
   * @returns {Promise<Object[]>}
   */
  async fetchPackagesForOrder(client, orderId) {
    const response = await client.getOrderPackages(orderId);

    if (!response || !response.packages) {
      return [];
    }

    return Array.isArray(response.packages)
      ? response.packages
      : Object.values(response.packages);
  }

  /**
   * Wzbogaca zamówienie o dane przesyłek
   * @param {Object} order - Zamówienie
   * @param {Object[]} packages - Lista przesyłek
   * @param {Object} courierMap - Mapa kurierów
   * @returns {Object}
   */
  enrichOrderWithPackages(order, packages, courierMap) {
    const enriched = { ...order };

    // Liczba przesyłek
    enriched.packages_count = Math.min(packages.length, 5);

    // Mapuj max 5 przesyłek do pól pkg1_* - pkg5_*
    for (let i = 0; i < 5; i++) {
      const prefix = `pkg${i + 1}_`;
      const pkg = packages[i] || null;

      if (pkg) {
        const courierCode = pkg.courier_code || '';
        const trackingNumber = pkg.tracking_number || pkg.courier_package_nr || '';

        enriched[`${prefix}id`] = pkg.package_id;
        enriched[`${prefix}courier_code`] = courierCode;
        enriched[`${prefix}courier_name`] = courierMap[courierCode] || courierCode;
        enriched[`${prefix}tracking_number`] = trackingNumber;
        enriched[`${prefix}tracking_url`] = this.buildTrackingUrl(courierCode, trackingNumber);
        enriched[`${prefix}status`] = pkg.status || '';
        enriched[`${prefix}date_add`] = pkg.date_add || null;
        enriched[`${prefix}date_sent`] = pkg.date_sent || null;
        enriched[`${prefix}date_delivered`] = pkg.date_delivered || null;
        enriched[`${prefix}weight`] = Number(pkg.weight) || 0;
        enriched[`${prefix}cod_value`] = Number(pkg.cod_value) || 0;
        enriched[`${prefix}is_delivered`] = pkg.is_delivered === true || pkg.is_delivered === 1;
      } else {
        // Puste pola dla brakującej przesyłki
        enriched[`${prefix}id`] = null;
        enriched[`${prefix}courier_code`] = '';
        enriched[`${prefix}courier_name`] = '';
        enriched[`${prefix}tracking_number`] = '';
        enriched[`${prefix}tracking_url`] = '';
        enriched[`${prefix}status`] = '';
        enriched[`${prefix}date_add`] = null;
        enriched[`${prefix}date_sent`] = null;
        enriched[`${prefix}date_delivered`] = null;
        enriched[`${prefix}weight`] = null;
        enriched[`${prefix}cod_value`] = null;
        enriched[`${prefix}is_delivered`] = null;
      }
    }

    return enriched;
  }

  /**
   * Wzbogaca zamówienie o puste pola przesyłek (w przypadku błędu)
   * @param {Object} order
   * @returns {Object}
   */
  enrichOrderWithEmptyPackages(order) {
    return this.enrichOrderWithPackages(order, [], {});
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
      'orlen_paczka': `https://nadaj.orlenpaczka.pl/sledzenie?number=${trackingNumber}`,
      'poczta_polska': `https://emonitoring.poczta-polska.pl/?numer=${trackingNumber}`,
      'raben': `https://www.rfraben.com/pl/sledzenie-przesylki/?track=${trackingNumber}`
    };

    const code = String(courierCode).toLowerCase();
    return trackingUrls[code] || '';
  }
}

module.exports = PackagesEnricher;
