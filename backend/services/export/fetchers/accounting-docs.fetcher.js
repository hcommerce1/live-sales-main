/**
 * Accounting Documents Fetcher
 *
 * Pobiera faktury (getInvoices) i paragony (getReceipts) z BaseLinker.
 * Łączy oba typy dokumentów w jeden dataset.
 */

const BaseFetcher = require('./BaseFetcher');

class AccountingDocsFetcher extends BaseFetcher {
  constructor() {
    super('accounting_docs');
  }

  /**
   * Pobiera dokumenty księgowe z BaseLinker API
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {string} filters.dateFrom - Data od
   * @param {string} filters.dateTo - Data do
   * @param {number} filters.seriesId - ID serii numeracji
   * @param {string} filters.documentType - 'all', 'invoice', 'receipt'
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych dokumentów
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    try {
      const documentType = filters.documentType || 'all';
      const maxRecords = options.maxRecords || 10000;

      let allDocuments = [];

      // Pobierz faktury
      if (documentType === 'all' || documentType === 'invoice') {
        const invoices = await this.fetchInvoices(token, filters, maxRecords);
        allDocuments = allDocuments.concat(invoices);
      }

      // Pobierz paragony
      if (documentType === 'all' || documentType === 'receipt') {
        const receipts = await this.fetchReceipts(token, filters, maxRecords - allDocuments.length);
        allDocuments = allDocuments.concat(receipts);
      }

      // Sortuj po dacie malejąco
      allDocuments.sort((a, b) => {
        const dateA = new Date(a.date_add || 0).getTime();
        const dateB = new Date(b.date_add || 0).getTime();
        return dateB - dateA;
      });

      // Ogranicz do maxRecords
      const limitedDocuments = allDocuments.slice(0, maxRecords);

      this.logFetchComplete(limitedDocuments.length);

      return limitedDocuments;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  /**
   * Pobiera faktury z paginacją
   */
  async fetchInvoices(token, filters, maxRecords) {
    const apiFilters = this.convertInvoiceFilters(filters);
    const allInvoices = [];
    let lastId = 0;
    let hasMore = true;

    while (hasMore && allInvoices.length < maxRecords) {
      this.stats.apiCalls++;

      const params = {
        ...apiFilters,
        id_from: lastId || undefined,
        get_external_invoices: true
      };

      const response = await this.baselinkerService.makeRequest(token, 'getInvoices', params);
      const invoices = response.invoices || [];

      if (invoices.length === 0) {
        hasMore = false;
      } else {
        for (const invoice of invoices) {
          allInvoices.push(this.normalizeInvoice(invoice));
        }

        const lastInvoice = invoices[invoices.length - 1];
        lastId = lastInvoice.invoice_id + 1;
        hasMore = invoices.length === 100;
      }

      if (hasMore) {
        await this.rateLimit(100);
      }
    }

    return allInvoices;
  }

  /**
   * Pobiera paragony z paginacją
   */
  async fetchReceipts(token, filters, maxRecords) {
    const apiFilters = this.convertReceiptFilters(filters);
    const allReceipts = [];
    let lastId = 0;
    let hasMore = true;

    while (hasMore && allReceipts.length < maxRecords) {
      this.stats.apiCalls++;

      const params = {
        ...apiFilters,
        id_from: lastId || undefined
      };

      const response = await this.baselinkerService.makeRequest(token, 'getReceipts', params);
      const receipts = response.receipts || [];

      if (receipts.length === 0) {
        hasMore = false;
      } else {
        for (const receipt of receipts) {
          allReceipts.push(this.normalizeReceipt(receipt));
        }

        const lastReceipt = receipts[receipts.length - 1];
        lastId = lastReceipt.receipt_id + 1;
        hasMore = receipts.length === 100;
      }

      if (hasMore) {
        await this.rateLimit(100);
      }
    }

    return allReceipts;
  }

  /**
   * Konwertuje filtry dla faktur
   */
  convertInvoiceFilters(filters) {
    const converted = {};

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.seriesId) {
      converted.series_id = filters.seriesId;
    }

    return converted;
  }

  /**
   * Konwertuje filtry dla paragonów
   */
  convertReceiptFilters(filters) {
    const converted = {};

    if (filters.dateFrom) {
      converted.date_from = this.toUnixTimestamp(filters.dateFrom);
    }

    if (filters.dateTo) {
      converted.date_to = this.toUnixTimestamp(filters.dateTo);
    }

    if (filters.seriesId) {
      converted.series_id = filters.seriesId;
    }

    return converted;
  }

  /**
   * Normalizuje fakturę
   */
  normalizeInvoice(invoice) {
    const items = invoice.items || [];

    return {
      // Podstawowe
      document_id: invoice.invoice_id,
      document_type: 'Faktura',
      document_subtype: this.mapInvoiceType(invoice.type),
      order_id: invoice.order_id || null,
      number: invoice.number || null,
      full_number: invoice.full_number || null,
      series_id: invoice.series_id || null,

      // Daty
      date_add: this.fromUnixTimestamp(invoice.date_add),
      date_sell: invoice.date_sell || null,
      date_pay_to: invoice.date_pay_to || null,

      // Wartości
      total_price_brutto: this.parseNumber(invoice.total_price_brutto),
      total_price_netto: this.parseNumber(invoice.total_price_netto),
      currency: invoice.currency || 'PLN',

      // Nabywca
      invoice_fullname: invoice.invoice_fullname || null,
      invoice_company: invoice.invoice_company || null,
      invoice_nip: invoice.invoice_nip || null,
      invoice_address: invoice.invoice_address || null,
      invoice_postcode: invoice.invoice_postcode || null,
      invoice_city: invoice.invoice_city || null,
      invoice_country: invoice.invoice_country || null,
      invoice_country_code: invoice.invoice_country_code || null,

      // Sprzedawca
      seller_name: invoice.seller || null,
      seller_nip: invoice.seller_nip || null,
      seller_address: invoice.seller_address || null,
      issuer: invoice.issuer || null,

      // Korekta
      correcting_to_invoice_id: invoice.correcting_to_invoice_id || null,
      correcting_reason: invoice.correcting_reason || null,

      // Płatność
      payment_method: invoice.payment_method || null,
      receipt_nip: null,

      // Pozycje
      items_count: items.length,
      items_summary: this.summarizeItems(items),
      items_json: items.length > 0 ? JSON.stringify(items) : null,

      // Zewnętrzne
      external_invoice_number: invoice.external_invoice_number || null,
      is_external: Boolean(invoice.external_invoice_number)
    };
  }

  /**
   * Normalizuje paragon
   */
  normalizeReceipt(receipt) {
    const items = receipt.items || [];

    return {
      // Podstawowe
      document_id: receipt.receipt_id,
      document_type: 'Paragon',
      document_subtype: 'receipt',
      order_id: receipt.order_id || null,
      number: receipt.receipt_nr || null,
      full_number: receipt.receipt_full_nr || null,
      series_id: receipt.series_id || null,

      // Daty
      date_add: this.fromUnixTimestamp(receipt.date_add),
      date_sell: null,
      date_pay_to: null,

      // Wartości
      total_price_brutto: this.parseNumber(receipt.total_price_brutto),
      total_price_netto: null,
      currency: receipt.currency || 'PLN',

      // Nabywca (paragony nie mają pełnych danych)
      invoice_fullname: null,
      invoice_company: null,
      invoice_nip: null,
      invoice_address: null,
      invoice_postcode: null,
      invoice_city: null,
      invoice_country: null,
      invoice_country_code: null,

      // Sprzedawca
      seller_name: null,
      seller_nip: null,
      seller_address: null,
      issuer: null,

      // Korekta
      correcting_to_invoice_id: null,
      correcting_reason: null,

      // Płatność
      payment_method: receipt.payment_method || null,
      receipt_nip: receipt.nip || null,

      // Pozycje
      items_count: items.length,
      items_summary: this.summarizeItems(items),
      items_json: items.length > 0 ? JSON.stringify(items) : null,

      // Zewnętrzne
      external_invoice_number: null,
      is_external: false
    };
  }

  /**
   * Mapuje typ faktury na nazwę
   */
  mapInvoiceType(type) {
    const typeMap = {
      'normal': 'VAT',
      'pro_forma': 'Pro forma',
      'correction': 'Korekta',
      'margin': 'Marża',
      'advance': 'Zaliczkowa',
      'receipt': 'Paragon'
    };

    return typeMap[type] || type || 'VAT';
  }

  /**
   * Podsumowuje pozycje dokumentu
   */
  summarizeItems(items) {
    if (!items || items.length === 0) {
      return null;
    }

    return items
      .slice(0, 3)
      .map(item => `${item.name || 'Pozycja'} (${item.quantity || 1}x)`)
      .join(', ') + (items.length > 3 ? ` (+${items.length - 3} więcej)` : '');
  }
}

module.exports = AccountingDocsFetcher;
