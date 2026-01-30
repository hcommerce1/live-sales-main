/**
 * Labels Enricher
 *
 * Wzbogaca przesyłki o informacje o etykietach i protokołach.
 * Używa API: getLabel, getProtocol
 *
 * Dodaje pola has_label, label_url, has_protocol, protocol_url.
 * Używane dla datasetu: shipments
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class LabelsEnricher extends BaseEnricher {
  constructor() {
    super('labels');
  }

  /**
   * Wzbogaca przesyłki o informacje o dokumentach
   * @param {Object[]} shipments - Przesyłki do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async enrich(shipments, token, options = {}) {
    this.logEnrichStart(shipments.length);

    const client = this.getBaseLinkerClient(token);

    // Sprawdź dostępność etykiet i protokołów dla każdej przesyłki
    const enrichedShipments = await Promise.all(
      shipments.map(async (shipment) => {
        if (!shipment.package_id || !shipment.courier_code) {
          return this.enrichWithEmptyLabels(shipment);
        }

        try {
          const labelsData = await this.fetchLabelsData(
            client,
            shipment.package_id,
            shipment.courier_code
          );
          return this.enrichShipmentWithLabels(shipment, labelsData);
        } catch (error) {
          logger.debug(`Failed to fetch labels for package ${shipment.package_id}`, {
            error: error.message
          });
          return this.enrichWithEmptyLabels(shipment);
        }
      })
    );

    this.logEnrichComplete(enrichedShipments.length);

    return enrichedShipments;
  }

  /**
   * Pobiera dane o etykietach dla przesyłki
   * @param {Object} client - Klient BaseLinker
   * @param {number} packageId - ID przesyłki
   * @param {string} courierCode - Kod kuriera
   * @returns {Promise<Object>}
   */
  async fetchLabelsData(client, packageId, courierCode) {
    const result = {
      hasLabel: false,
      labelUrl: null,
      hasProtocol: false,
      protocolUrl: null
    };

    // Spróbuj pobrać etykietę
    try {
      const labelResponse = await client.makeRequest('getLabel', {
        package_id: packageId,
        courier_code: courierCode
      });

      if (labelResponse && (labelResponse.label || labelResponse.file_url)) {
        result.hasLabel = true;
        result.labelUrl = labelResponse.file_url || null;

        // Jeśli zwrócono base64, nie podajemy URL
        if (labelResponse.label && !labelResponse.file_url) {
          result.labelUrl = '[base64]';
        }
      }
    } catch (error) {
      // Brak etykiety to nie błąd
    }

    // Spróbuj pobrać protokół
    try {
      const protocolResponse = await client.makeRequest('getProtocol', {
        package_ids: [packageId],
        courier_code: courierCode
      });

      if (protocolResponse && (protocolResponse.protocol || protocolResponse.file_url)) {
        result.hasProtocol = true;
        result.protocolUrl = protocolResponse.file_url || null;

        if (protocolResponse.protocol && !protocolResponse.file_url) {
          result.protocolUrl = '[base64]';
        }
      }
    } catch (error) {
      // Brak protokołu to nie błąd
    }

    return result;
  }

  /**
   * Wzbogaca przesyłkę o dane etykiet
   * @param {Object} shipment - Przesyłka
   * @param {Object} labelsData - Dane etykiet
   * @returns {Object}
   */
  enrichShipmentWithLabels(shipment, labelsData) {
    return {
      ...shipment,
      has_label: labelsData.hasLabel,
      label_url: labelsData.labelUrl || '',
      has_protocol: labelsData.hasProtocol,
      protocol_url: labelsData.protocolUrl || ''
    };
  }

  /**
   * Wzbogaca przesyłkę o puste dane etykiet
   * @param {Object} shipment
   * @returns {Object}
   */
  enrichWithEmptyLabels(shipment) {
    return {
      ...shipment,
      has_label: false,
      label_url: '',
      has_protocol: false,
      protocol_url: ''
    };
  }
}

module.exports = LabelsEnricher;
