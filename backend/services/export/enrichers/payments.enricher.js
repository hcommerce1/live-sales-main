/**
 * Payments Enricher
 *
 * Wzbogaca zamówienia/zwroty o historię płatności.
 * Używa getOrderPaymentsHistory lub getOrderReturnPaymentsHistory.
 */

const BaseEnricher = require('./BaseEnricher');

class PaymentsEnricher extends BaseEnricher {
  constructor() {
    super('payments');
  }

  /**
   * Wzbogaca rekordy o historię płatności
   *
   * @param {Array} records - Tablica zamówień lub zwrotów
   * @param {string} token - Token API BaseLinker
   * @param {object} options - Opcje
   * @param {string} options.recordType - 'order' lub 'return'
   * @returns {Promise<Array>} - Wzbogacone rekordy
   */
  async enrich(records, token, options = {}) {
    this.resetStats();
    this.logEnrichStart(records.length);

    const recordType = options.recordType || this.detectRecordType(records);

    try {
      // Pobierz unikalne ID
      const idField = recordType === 'return' ? 'return_id' : 'order_id';
      const ids = this.getUniqueValues(records, idField);

      if (ids.length === 0) {
        this.logEnrichComplete(0);
        return records;
      }

      // Pobierz historię płatności
      const paymentsMap = await this.fetchPaymentsHistory(ids, token, recordType);

      // Wzbogać rekordy
      const enrichedRecords = records.map(record => {
        const id = record[idField];
        const payments = paymentsMap.get(id) || [];

        return {
          ...record,
          ...this.summarizePayments(payments)
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
   * Wykrywa typ rekordu na podstawie obecnych pól
   */
  detectRecordType(records) {
    if (records.length === 0) return 'order';
    const firstRecord = records[0];
    return 'return_id' in firstRecord ? 'return' : 'order';
  }

  /**
   * Pobiera historię płatności dla listy ID
   *
   * @param {Array} ids - Lista ID zamówień/zwrotów
   * @param {string} token - Token API
   * @param {string} recordType - 'order' lub 'return'
   * @returns {Promise<Map>} - Mapa: id -> payments[]
   */
  async fetchPaymentsHistory(ids, token, recordType) {
    const paymentsMap = new Map();
    const method = recordType === 'return'
      ? 'getOrderReturnPaymentsHistory'
      : 'getOrderPaymentsHistory';

    // Przetwarzaj pojedynczo (API nie obsługuje batch)
    const batchSize = 10;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      const promises = batch.map(async (id) => {
        try {
          this.stats.apiCalls++;

          const params = recordType === 'return'
            ? { return_id: id }
            : { order_id: id, show_full_history: true };

          const response = await this.baselinkerService.makeRequest(token, method, params);
          const payments = response.payments || [];

          return { id, payments };

        } catch (error) {
          this.logError(`Failed to fetch payments for ${recordType} ${id}`, error);
          return { id, payments: [] };
        }
      });

      const results = await Promise.all(promises);

      for (const { id, payments } of results) {
        paymentsMap.set(id, payments);
      }

      // Rate limiting
      if (i + batchSize < ids.length) {
        await this.rateLimit(200);
      }
    }

    return paymentsMap;
  }

  /**
   * Podsumowuje płatności do pól
   *
   * @param {Array} payments - Historia płatności
   * @returns {object} - Podsumowanie
   */
  summarizePayments(payments) {
    if (!payments || payments.length === 0) {
      return {
        last_payment_date: null,
        last_payment_amount: null,
        total_payments: null,
        payments_count: 0
      };
    }

    // Sortuj po dacie (najnowsze na końcu)
    const sorted = [...payments].sort((a, b) => {
      const dateA = a.date || a.payment_date || 0;
      const dateB = b.date || b.payment_date || 0;
      return dateA - dateB;
    });

    const lastPayment = sorted[sorted.length - 1];
    const totalPayments = payments.reduce((sum, p) => {
      return sum + this.parseNumber(p.amount || p.value || 0);
    }, 0);

    return {
      last_payment_date: this.fromUnixTimestamp(lastPayment.date || lastPayment.payment_date),
      last_payment_amount: this.parseNumber(lastPayment.amount || lastPayment.value),
      total_payments: totalPayments,
      payments_count: payments.length
    };
  }
}

module.exports = PaymentsEnricher;
