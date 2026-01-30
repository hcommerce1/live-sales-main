/**
 * Documents Enricher
 *
 * Wzbogaca zamówienia o dokumenty sprzedaży (max 2 dokumenty na zamówienie).
 * Używa API: getOrderInvoices (lub getInvoices z filtrem order_id)
 *
 * Dodaje pola ds1_* i ds2_*.
 */

const BaseEnricher = require('./BaseEnricher');
const logger = require('../../../utils/logger');

class DocumentsEnricher extends BaseEnricher {
  constructor() {
    super('documents');
  }

  /**
   * Wzbogaca zamówienia o dokumenty sprzedaży
   * @param {Object[]} orders - Zamówienia do wzbogacenia
   * @param {string} token - Token BaseLinker
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async enrich(orders, token, options = {}) {
    this.logEnrichStart(orders.length);

    const client = this.getBaseLinkerClient(token);

    // Pobierz ID wszystkich zamówień
    const orderIds = this.getUniqueValues(orders, 'order_id');

    // Pobierz dokumenty dla wszystkich zamówień (batch)
    const documentsMap = await this.fetchDocumentsForOrders(client, orderIds);

    // Wzbogać każde zamówienie
    const enrichedOrders = orders.map(order => {
      const documents = documentsMap.get(order.order_id) || [];
      return this.enrichOrderWithDocuments(order, documents);
    });

    this.logEnrichComplete(enrichedOrders.length);

    return enrichedOrders;
  }

  /**
   * Pobiera dokumenty dla wielu zamówień
   * @param {Object} client - Klient BaseLinker
   * @param {number[]} orderIds - ID zamówień
   * @returns {Promise<Map<number, Object[]>>}
   */
  async fetchDocumentsForOrders(client, orderIds) {
    const documentsMap = new Map();

    // Inicjalizuj pustą mapę
    for (const orderId of orderIds) {
      documentsMap.set(orderId, []);
    }

    try {
      // Pobierz wszystkie faktury (limit 1000)
      const response = await client.makeRequest('getInvoices', {
        // Pobieramy dokumenty z ostatnich 90 dni dla optymalizacji
        date_from: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60),
        get_external: true
      });

      if (!response || !response.invoices) {
        return documentsMap;
      }

      const invoices = Array.isArray(response.invoices)
        ? response.invoices
        : Object.values(response.invoices);

      // Grupuj dokumenty po order_id
      for (const invoice of invoices) {
        const orderId = invoice.order_id;

        if (orderId && documentsMap.has(orderId)) {
          documentsMap.get(orderId).push(invoice);
        }
      }

    } catch (error) {
      logger.warn('Failed to fetch invoices', { error: error.message });
    }

    return documentsMap;
  }

  /**
   * Wzbogaca zamówienie o dokumenty sprzedaży
   * @param {Object} order - Zamówienie
   * @param {Object[]} documents - Lista dokumentów
   * @returns {Object}
   */
  enrichOrderWithDocuments(order, documents) {
    const enriched = { ...order };

    // Sortuj dokumenty po dacie (najnowsze najpierw)
    const sortedDocs = [...documents].sort((a, b) => {
      return (b.date_add || 0) - (a.date_add || 0);
    });

    // Najpierw szukaj faktury/paragonu (dokument główny)
    const mainDoc = sortedDocs.find(d => d.type !== 'correction') || sortedDocs[0];

    // Potem szukaj korekty
    const correctionDoc = sortedDocs.find(d => d.type === 'correction');

    // Przypisz: ds1 = główny dokument, ds2 = korekta (jeśli jest)
    const doc1 = mainDoc || null;
    const doc2 = correctionDoc || (sortedDocs[1] !== mainDoc ? sortedDocs[1] : null);

    // Mapuj dokument 1
    this.mapDocumentToFields(enriched, doc1, 'ds1_');

    // Mapuj dokument 2
    this.mapDocumentToFields(enriched, doc2, 'ds2_');

    return enriched;
  }

  /**
   * Mapuje dokument na pola z prefixem
   * @param {Object} record - Rekord do wzbogacenia
   * @param {Object|null} doc - Dokument
   * @param {string} prefix - Prefix pól (ds1_ lub ds2_)
   */
  mapDocumentToFields(record, doc, prefix) {
    if (doc) {
      record[`${prefix}id`] = doc.invoice_id || doc.id;
      record[`${prefix}type`] = this.mapDocumentType(doc.type);
      record[`${prefix}number`] = doc.number || doc.invoice_fullnumber || '';
      record[`${prefix}date`] = doc.date_add || doc.date_issue || null;
      record[`${prefix}date_sell`] = doc.date_sale || null;
      record[`${prefix}total_brutto`] = Number(doc.total_price_brutto) || 0;
      record[`${prefix}total_netto`] = Number(doc.total_price_netto) || 0;
      record[`${prefix}total_vat`] = (Number(doc.total_price_brutto) || 0) - (Number(doc.total_price_netto) || 0);
      record[`${prefix}currency`] = doc.currency || 'PLN';
      record[`${prefix}exchange_rate`] = Number(doc.exchange_rate) || null;
      record[`${prefix}buyer_name`] = doc.buyer_name || doc.invoice_company || doc.invoice_fullname || '';
      record[`${prefix}buyer_nip`] = doc.buyer_nip || doc.invoice_nip || '';
      record[`${prefix}external`] = doc.is_external === true || doc.is_external === 1 || doc.external_invoice === true;
    } else {
      // Puste pola
      record[`${prefix}id`] = null;
      record[`${prefix}type`] = '';
      record[`${prefix}number`] = '';
      record[`${prefix}date`] = null;
      record[`${prefix}date_sell`] = null;
      record[`${prefix}total_brutto`] = null;
      record[`${prefix}total_netto`] = null;
      record[`${prefix}total_vat`] = null;
      record[`${prefix}currency`] = '';
      record[`${prefix}exchange_rate`] = null;
      record[`${prefix}buyer_name`] = '';
      record[`${prefix}buyer_nip`] = '';
      record[`${prefix}external`] = null;
    }
  }

  /**
   * Mapuje typ dokumentu na czytelną nazwę
   * @param {string} type
   * @returns {string}
   */
  mapDocumentType(type) {
    const typeMap = {
      'vat': 'invoice',
      'invoice': 'invoice',
      'receipt': 'receipt',
      'paragon': 'receipt',
      'correction': 'correction',
      'korekta': 'correction',
      'proforma': 'proforma'
    };

    return typeMap[String(type).toLowerCase()] || type || '';
  }
}

module.exports = DocumentsEnricher;
