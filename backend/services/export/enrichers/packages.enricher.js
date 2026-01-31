/**
 * Packages Enricher
 *
 * Wzbogaca zamówienia o dane przesyłek z API getOrderPackages.
 * Dodaje pola pkg1_*, pkg2_*, pkg3_* dla max 3 przesyłek na zamówienie.
 */

const BaseEnricher = require('./BaseEnricher');

class PackagesEnricher extends BaseEnricher {
  constructor() {
    super('packages');
  }

  /**
   * Wzbogaca zamówienia o dane przesyłek
   *
   * @param {Array} records - Tablica zamówień
   * @param {string} token - Token API BaseLinker
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Wzbogacone zamówienia
   */
  async enrich(records, token, options = {}) {
    this.resetStats();
    this.logEnrichStart(records.length);

    try {
      // Pobierz unikalne order_id
      const orderIds = this.getUniqueValues(records, 'order_id');

      if (orderIds.length === 0) {
        this.logEnrichComplete(0);
        return records;
      }

      // Pobierz przesyłki dla wszystkich zamówień
      const packagesMap = await this.fetchPackagesForOrders(orderIds, token);

      // Wzbogać rekordy
      const enrichedRecords = records.map(record => {
        const orderId = record.order_id;
        const packages = packagesMap.get(orderId) || [];

        // Spłaszcz przesyłki do pól pkg1_*, pkg2_*, pkg3_*
        const packageFields = this.flattenPackagesToFields(packages);

        return {
          ...record,
          ...packageFields
        };
      });

      this.logEnrichComplete(enrichedRecords.length);

      return enrichedRecords;

    } catch (error) {
      this.logError('Enrichment failed', error);
      throw error;
    }
  }

  /**
   * Pobiera przesyłki dla listy zamówień
   *
   * @param {Array<number>} orderIds - Lista ID zamówień
   * @param {string} token - Token API BaseLinker
   * @returns {Promise<Map>} - Mapa: order_id -> Array<package>
   */
  async fetchPackagesForOrders(orderIds, token) {
    const packagesMap = new Map();

    // Przetwarzaj w batchach po 10 zamówień
    // (każde wywołanie getOrderPackages to osobny request)
    const batchSize = 10;

    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);

      // Pobierz przesyłki równolegle dla batcha
      const promises = batch.map(async (orderId) => {
        try {
          this.stats.apiCalls++;
          const packages = await this.baselinkerService.getOrderPackages(token, orderId);
          return { orderId, packages };
        } catch (error) {
          this.logError(`Failed to get packages for order ${orderId}`, error);
          return { orderId, packages: [] };
        }
      });

      const results = await Promise.all(promises);

      for (const { orderId, packages } of results) {
        packagesMap.set(orderId, packages);
      }

      // Rate limiting między batchami
      if (i + batchSize < orderIds.length) {
        await this.rateLimit(200); // 200ms między batchami
      }
    }

    return packagesMap;
  }

  /**
   * Spłaszcza tablicę przesyłek do pól pkg1_*, pkg2_*, pkg3_*
   *
   * @param {Array} packages - Tablica przesyłek
   * @returns {object} - Obiekt z polami pkg1_*, pkg2_*, pkg3_*
   */
  flattenPackagesToFields(packages) {
    const maxPackages = 3;
    const fields = [
      'package_id',
      'courier_code',
      'courier_package_nr',
      'tracking_status',
      'tracking_url'
    ];

    const result = {};

    // Inicjalizuj wszystkie pola jako null
    for (let i = 1; i <= maxPackages; i++) {
      for (const field of fields) {
        result[`pkg${i}_${field}`] = null;
      }
    }

    // Wypełnij danymi z przesyłek
    const packagesToProcess = (packages || []).slice(0, maxPackages);

    for (let i = 0; i < packagesToProcess.length; i++) {
      const pkg = packagesToProcess[i];
      const num = i + 1;

      result[`pkg${num}_package_id`] = pkg.package_id || null;
      result[`pkg${num}_courier_code`] = pkg.courier_code || null;
      result[`pkg${num}_courier_package_nr`] = pkg.courier_package_nr || null;
      result[`pkg${num}_tracking_status`] = this.mapTrackingStatus(pkg.tracking_status);
      result[`pkg${num}_tracking_url`] = pkg.tracking_url || null;
    }

    return result;
  }

  /**
   * Mapuje kod statusu śledzenia na czytelną nazwę
   *
   * @param {number} statusCode - Kod statusu
   * @returns {string|null} - Nazwa statusu
   */
  mapTrackingStatus(statusCode) {
    if (statusCode === null || statusCode === undefined) {
      return null;
    }

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

    return statusMap[statusCode] || `Status ${statusCode}`;
  }
}

module.exports = PackagesEnricher;
