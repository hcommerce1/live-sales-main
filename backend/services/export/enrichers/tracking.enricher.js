/**
 * Tracking Enricher
 *
 * Wzbogaca przesyłki o szczegółowe dane śledzenia.
 * Używa API: getCourierPackagesStatusHistory
 *
 * Dodaje pola tracking_last_*, tracking_events_count.
 * Używane dla datasetu: shipments
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class TrackingEnricher extends BaseEnricher {
  constructor() {
    super('tracking');
  }

  /**
   * Wzbogaca przesyłki o dane śledzenia
   * @param {Object[]} shipments - Przesyłki do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async enrich(shipments, token, options = {}) {
    this.logEnrichStart(shipments.length);

    const client = this.getBaseLinkerClient(token);

    // Pobierz historię śledzenia dla każdej przesyłki
    const enrichedShipments = await Promise.all(
      shipments.map(async (shipment) => {
        if (!shipment.package_id || !shipment.courier_code) {
          return this.enrichWithEmptyTracking(shipment);
        }

        try {
          const trackingData = await this.fetchTrackingData(
            client,
            shipment.package_id,
            shipment.courier_code
          );
          return this.enrichShipmentWithTracking(shipment, trackingData);
        } catch (error) {
          logger.warn(`Failed to fetch tracking for package ${shipment.package_id}`, {
            error: error.message
          });
          return this.enrichWithEmptyTracking(shipment);
        }
      })
    );

    this.logEnrichComplete(enrichedShipments.length);

    return enrichedShipments;
  }

  /**
   * Pobiera dane śledzenia dla przesyłki
   * @param {Object} client - Klient BaseLinker
   * @param {number} packageId - ID przesyłki
   * @param {string} courierCode - Kod kuriera
   * @returns {Promise<Object|null>}
   */
  async fetchTrackingData(client, packageId, courierCode) {
    const response = await client.makeRequest('getCourierPackagesStatusHistory', {
      package_id: packageId,
      courier_code: courierCode
    });

    if (!response || !response.status_history) {
      return null;
    }

    return response;
  }

  /**
   * Wzbogaca przesyłkę o dane śledzenia
   * @param {Object} shipment - Przesyłka
   * @param {Object|null} trackingData - Dane śledzenia
   * @returns {Object}
   */
  enrichShipmentWithTracking(shipment, trackingData) {
    const enriched = { ...shipment };

    if (!trackingData || !trackingData.status_history) {
      return this.enrichWithEmptyTracking(enriched);
    }

    const history = Array.isArray(trackingData.status_history)
      ? trackingData.status_history
      : Object.values(trackingData.status_history);

    // Sortuj po dacie (najnowsze najpierw)
    const sortedHistory = [...history].sort((a, b) => {
      return (b.date || 0) - (a.date || 0);
    });

    const lastEvent = sortedHistory[0];

    if (lastEvent) {
      enriched.tracking_last_status = lastEvent.status || lastEvent.status_name || '';
      enriched.tracking_last_date = lastEvent.date || lastEvent.timestamp || null;
      enriched.tracking_last_location = lastEvent.location || lastEvent.city || '';
    } else {
      enriched.tracking_last_status = '';
      enriched.tracking_last_date = null;
      enriched.tracking_last_location = '';
    }

    enriched.tracking_events_count = history.length;

    return enriched;
  }

  /**
   * Wzbogaca przesyłkę o puste dane śledzenia
   * @param {Object} shipment
   * @returns {Object}
   */
  enrichWithEmptyTracking(shipment) {
    return {
      ...shipment,
      tracking_last_status: '',
      tracking_last_date: null,
      tracking_last_location: '',
      tracking_events_count: 0
    };
  }
}

module.exports = TrackingEnricher;
