/**
 * Documents Enricher
 *
 * Wzbogaca zamówienia o dane dokumentów sprzedaży (faktury, paragony).
 * Używa API getInvoices i getReceipts.
 * Dodaje pola ds_* dla pierwszego dokumentu, ds2_* dla drugiego.
 */

const BaseEnricher = require('./BaseEnricher');

class DocumentsEnricher extends BaseEnricher {
  constructor() {
    super('documents');
  }

  /**
   * Wzbogaca zamówienia o dane dokumentów sprzedaży
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

      // Pobierz faktury i paragony
      const [invoicesMap, receiptsMap] = await Promise.all([
        this.fetchInvoicesForOrders(orderIds, token),
        this.fetchReceiptsForOrders(orderIds, token)
      ]);

      // Wzbogać rekordy
      const enrichedRecords = records.map(record => {
        const orderId = record.order_id;
        const invoices = invoicesMap.get(orderId) || [];
        const receipts = receiptsMap.get(orderId) || [];

        // Połącz dokumenty (faktury mają priorytet)
        const documents = [
          ...invoices.map(inv => ({ ...inv, docType: 'invoice' })),
          ...receipts.map(rec => ({ ...rec, docType: 'receipt' }))
        ];

        // Spłaszcz dokumenty do pól ds_*, ds2_*
        const documentFields = this.flattenDocumentsToFields(documents);

        return {
          ...record,
          ...documentFields
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
   * Pobiera faktury dla zamówień
   *
   * @param {Array<number>} orderIds - Lista ID zamówień
   * @param {string} token - Token API BaseLinker
   * @returns {Promise<Map>} - Mapa: order_id -> Array<invoice>
   */
  async fetchInvoicesForOrders(orderIds, token) {
    const invoicesMap = new Map();

    try {
      this.stats.apiCalls++;

      // Pobierz wszystkie faktury z ostatnich 90 dni (typowy zakres)
      // W przyszłości można optymalizować przez date range z zamówień
      const allInvoices = await this.baselinkerService.getInvoicesWithPagination(
        token,
        {},
        10000
      );

      // Grupuj faktury po order_id
      for (const invoice of allInvoices) {
        const orderId = invoice.order_id;
        if (orderId && orderIds.includes(orderId)) {
          if (!invoicesMap.has(orderId)) {
            invoicesMap.set(orderId, []);
          }
          invoicesMap.get(orderId).push(invoice);
        }
      }

    } catch (error) {
      this.logError('Failed to fetch invoices', error);
    }

    return invoicesMap;
  }

  /**
   * Pobiera paragony dla zamówień
   *
   * @param {Array<number>} orderIds - Lista ID zamówień
   * @param {string} token - Token API BaseLinker
   * @returns {Promise<Map>} - Mapa: order_id -> Array<receipt>
   */
  async fetchReceiptsForOrders(orderIds, token) {
    const receiptsMap = new Map();

    try {
      this.stats.apiCalls++;

      // Pobierz paragony
      const allReceipts = await this.baselinkerService.getReceipts(token, {});

      // Grupuj paragony po order_id
      for (const receipt of allReceipts) {
        const orderId = receipt.order_id;
        if (orderId && orderIds.includes(orderId)) {
          if (!receiptsMap.has(orderId)) {
            receiptsMap.set(orderId, []);
          }
          receiptsMap.get(orderId).push(receipt);
        }
      }

    } catch (error) {
      this.logError('Failed to fetch receipts', error);
    }

    return receiptsMap;
  }

  /**
   * Spłaszcza tablicę dokumentów do pól ds_*, ds2_*
   *
   * @param {Array} documents - Tablica dokumentów (faktury + paragony)
   * @returns {object} - Obiekt z polami ds_*, ds2_*
   */
  flattenDocumentsToFields(documents) {
    const result = {
      // Dokument 1
      ds_type: null,
      ds_number: null,
      ds_date_add: null,
      ds_total_brutto: null,
      ds_total_netto: null,
      // Dokument 2
      ds2_type: null,
      ds2_number: null,
      ds2_date_add: null
    };

    if (!documents || documents.length === 0) {
      return result;
    }

    // Dokument 1
    const doc1 = documents[0];
    if (doc1) {
      result.ds_type = this.getDocumentType(doc1);
      result.ds_number = this.getDocumentNumber(doc1);
      result.ds_date_add = this.fromUnixTimestamp(doc1.date_add);
      result.ds_total_brutto = this.parseNumber(doc1.total_price_brutto);
      result.ds_total_netto = this.parseNumber(doc1.total_price_netto);
    }

    // Dokument 2
    const doc2 = documents[1];
    if (doc2) {
      result.ds2_type = this.getDocumentType(doc2);
      result.ds2_number = this.getDocumentNumber(doc2);
      result.ds2_date_add = this.fromUnixTimestamp(doc2.date_add);
    }

    return result;
  }

  /**
   * Pobiera typ dokumentu
   *
   * @param {object} document - Dokument
   * @returns {string} - Typ dokumentu
   */
  getDocumentType(document) {
    if (document.docType === 'receipt') {
      return 'Paragon';
    }

    // Faktury
    const typeMap = {
      'normal': 'Faktura VAT',
      'pro_forma': 'Faktura pro forma',
      'receipt': 'Paragon',
      'correction': 'Faktura korygująca',
      'margin': 'Faktura marża',
      'advance': 'Faktura zaliczkowa'
    };

    return typeMap[document.type] || 'Faktura';
  }

  /**
   * Pobiera numer dokumentu
   *
   * @param {object} document - Dokument
   * @returns {string|null} - Numer dokumentu
   */
  getDocumentNumber(document) {
    if (document.docType === 'receipt') {
      return document.receipt_full_nr || document.receipt_nr || null;
    }

    return document.full_number || document.number || null;
  }
}

module.exports = DocumentsEnricher;
