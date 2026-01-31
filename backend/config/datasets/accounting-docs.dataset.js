/**
 * Dataset: DOKUMENTY KSIĘGOWE (Accounting Documents)
 *
 * Główne API: getInvoices + getReceipts
 * Enrichmenty: brak
 *
 * Faktury i paragony z BaseLinker.
 */

module.exports = {
  id: 'accounting_docs',
  label: 'Dokumenty księgowe',
  description: 'Eksport faktur i paragonów z BaseLinker',
  icon: 'file-text',

  // Źródło danych
  primaryQuery: 'getInvoices',
  secondaryQuery: 'getReceipts',
  enrichments: [],
  requiresInventory: false,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'seriesId', label: 'Seria numeracji', type: 'series' },
    { key: 'documentType', label: 'Typ dokumentu', type: 'select', options: [
      { value: 'all', label: 'Wszystkie' },
      { value: 'invoice', label: 'Tylko faktury' },
      { value: 'receipt', label: 'Tylko paragony' }
    ]}
  ],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // PODSTAWOWE
    // ========================================
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'document_id', label: 'ID dokumentu', type: 'number', description: 'ID faktury lub paragonu' },
        { key: 'document_type', label: 'Typ dokumentu', type: 'text', description: 'Faktura/Paragon' },
        { key: 'document_subtype', label: 'Podtyp', type: 'text', description: 'normal/pro_forma/correction/etc.' },
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Powiązane zamówienie' },
        { key: 'number', label: 'Numer', type: 'text', description: 'Numer dokumentu' },
        { key: 'full_number', label: 'Pełny numer', type: 'text', description: 'Pełny numer z serią' },
        { key: 'series_id', label: 'ID serii', type: 'number', description: 'ID serii numeracji' }
      ]
    },

    // ========================================
    // DATY
    // ========================================
    {
      id: 'dates',
      label: 'Daty',
      fields: [
        { key: 'date_add', label: 'Data wystawienia', type: 'datetime', description: 'Data wystawienia dokumentu' },
        { key: 'date_sell', label: 'Data sprzedaży', type: 'date', description: 'Data sprzedaży (faktury)' },
        { key: 'date_pay_to', label: 'Termin płatności', type: 'date', description: 'Termin płatności (faktury)' }
      ]
    },

    // ========================================
    // WARTOŚCI
    // ========================================
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'total_price_brutto', label: 'Wartość brutto', type: 'number' },
        { key: 'total_price_netto', label: 'Wartość netto', type: 'number' },
        { key: 'currency', label: 'Waluta', type: 'text' }
      ]
    },

    // ========================================
    // NABYWCA (Faktury)
    // ========================================
    {
      id: 'buyer',
      label: 'Nabywca',
      fields: [
        { key: 'invoice_fullname', label: 'Nazwa/Imię i nazwisko', type: 'text' },
        { key: 'invoice_company', label: 'Firma', type: 'text' },
        { key: 'invoice_nip', label: 'NIP', type: 'text' },
        { key: 'invoice_address', label: 'Adres', type: 'text' },
        { key: 'invoice_postcode', label: 'Kod pocztowy', type: 'text' },
        { key: 'invoice_city', label: 'Miasto', type: 'text' },
        { key: 'invoice_country', label: 'Kraj', type: 'text' },
        { key: 'invoice_country_code', label: 'Kod kraju', type: 'text' }
      ]
    },

    // ========================================
    // SPRZEDAWCA
    // ========================================
    {
      id: 'seller',
      label: 'Sprzedawca',
      fields: [
        { key: 'seller_name', label: 'Nazwa sprzedawcy', type: 'text' },
        { key: 'seller_nip', label: 'NIP sprzedawcy', type: 'text' },
        { key: 'seller_address', label: 'Adres sprzedawcy', type: 'text' },
        { key: 'issuer', label: 'Wystawca', type: 'text', description: 'Osoba wystawiająca' }
      ]
    },

    // ========================================
    // KOREKTA
    // ========================================
    {
      id: 'correction',
      label: 'Korekta',
      fields: [
        { key: 'correcting_to_invoice_id', label: 'Koryguje fakturę ID', type: 'number', description: 'ID faktury korygowanej' },
        { key: 'correcting_reason', label: 'Powód korekty', type: 'text' }
      ]
    },

    // ========================================
    // PŁATNOŚĆ (Paragony)
    // ========================================
    {
      id: 'payment',
      label: 'Płatność',
      fields: [
        { key: 'payment_method', label: 'Metoda płatności', type: 'text' },
        { key: 'receipt_nip', label: 'NIP na paragonie', type: 'text', description: 'NIP klienta (paragony)' }
      ]
    },

    // ========================================
    // POZYCJE
    // ========================================
    {
      id: 'items',
      label: 'Pozycje',
      fields: [
        { key: 'items_count', label: 'Liczba pozycji', type: 'number' },
        { key: 'items_summary', label: 'Podsumowanie pozycji', type: 'text' },
        { key: 'items_json', label: 'Pozycje (JSON)', type: 'text', description: 'Pełna lista pozycji jako JSON' }
      ]
    },

    // ========================================
    // ZEWNĘTRZNE
    // ========================================
    {
      id: 'external',
      label: 'Zewnętrzne',
      fields: [
        { key: 'external_invoice_number', label: 'Zewnętrzny numer', type: 'text', description: 'Numer faktury zewnętrznej' },
        { key: 'is_external', label: 'Jest zewnętrzna', type: 'boolean', description: 'Czy faktura zewnętrzna' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'document_id',

  // Sort options
  sortOptions: [
    { key: 'date_add', label: 'Data wystawienia', direction: 'desc' },
    { key: 'document_id', label: 'ID dokumentu', direction: 'desc' }
  ]
};
