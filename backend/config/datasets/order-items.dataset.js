/**
 * Dataset: POZYCJE ZAMÓWIEŃ (Order Items)
 *
 * Główne API: getOrders (rozbicie products[] na osobne wiersze)
 * Enrichmenty: product-details
 *
 * Każdy produkt z zamówienia to osobny wiersz.
 */

module.exports = {
  id: 'order_items',
  label: 'Pozycje zamówień',
  description: 'Eksport pozycji produktowych z zamówień - każdy produkt jako osobny wiersz',
  icon: 'list',

  // Źródło danych
  primaryQuery: 'getOrders',
  enrichments: ['product-details'],
  requiresInventory: false,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'statusId', label: 'Status zamówienia', type: 'status' },
    { key: 'orderSourceId', label: 'Źródło zamówienia', type: 'source' },
    { key: 'confirmedOnly', label: 'Tylko potwierdzone', type: 'boolean', default: true }
  ],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // DANE ZAMÓWIENIA
    // ========================================
    {
      id: 'order_basic',
      label: 'Dane zamówienia',
      fields: [
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'ID zamówienia w BaseLinker' },
        { key: 'shop_order_id', label: 'ID zamówienia sklepu', type: 'number', description: 'ID zamówienia w oryginalnym sklepie' },
        { key: 'external_order_id', label: 'Zewnętrzny ID', type: 'text', description: 'Zewnętrzny identyfikator zamówienia' },
        { key: 'order_source', label: 'Źródło zamówienia', type: 'text', description: 'Typ źródła (allegro, amazon, etc.)' },
        { key: 'date_add', label: 'Data zamówienia', type: 'datetime', description: 'Data utworzenia zamówienia' },
        { key: 'date_confirmed', label: 'Data potwierdzenia', type: 'datetime', description: 'Data potwierdzenia zamówienia' },
        { key: 'order_status_id', label: 'ID statusu', type: 'number', description: 'ID statusu zamówienia' },
        { key: 'order_status_name', label: 'Nazwa statusu', type: 'text', description: 'Nazwa statusu', computed: true },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zamówienia' }
      ]
    },

    // ========================================
    // DANE KLIENTA
    // ========================================
    {
      id: 'customer',
      label: 'Klient',
      fields: [
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Telefon', type: 'text' },
        { key: 'delivery_fullname', label: 'Imię i nazwisko', type: 'text' },
        { key: 'delivery_company', label: 'Firma', type: 'text' },
        { key: 'delivery_city', label: 'Miasto', type: 'text' },
        { key: 'delivery_country', label: 'Kraj', type: 'text' }
      ]
    },

    // ========================================
    // PODSTAWOWE DANE POZYCJI
    // ========================================
    {
      id: 'item_basic',
      label: 'Podstawowe dane pozycji',
      fields: [
        { key: 'order_product_id', label: 'ID pozycji', type: 'number', description: 'Unikalny ID pozycji w zamówieniu' },
        { key: 'product_id', label: 'ID produktu', type: 'text', description: 'ID produktu w magazynie' },
        { key: 'variant_id', label: 'ID wariantu', type: 'text', description: 'ID wariantu produktu' },
        { key: 'name', label: 'Nazwa produktu', type: 'text', description: 'Nazwa produktu' },
        { key: 'sku', label: 'SKU', type: 'text', description: 'Kod SKU produktu' },
        { key: 'ean', label: 'EAN', type: 'text', description: 'Kod EAN produktu' }
      ]
    },

    // ========================================
    // SZCZEGÓŁY POZYCJI
    // ========================================
    {
      id: 'item_details',
      label: 'Szczegóły pozycji',
      fields: [
        { key: 'attributes', label: 'Atrybuty', type: 'text', description: 'Atrybuty wariantu (kolor, rozmiar, etc.)' },
        { key: 'location', label: 'Lokalizacja', type: 'text', description: 'Lokalizacja produktu w magazynie' },
        { key: 'warehouse_id', label: 'ID magazynu', type: 'number', description: 'ID magazynu źródłowego' }
      ]
    },

    // ========================================
    // CENY I ILOŚCI
    // ========================================
    {
      id: 'pricing',
      label: 'Ceny i ilości',
      fields: [
        { key: 'price_brutto', label: 'Cena brutto', type: 'number', description: 'Cena jednostkowa brutto' },
        { key: 'tax_rate', label: 'Stawka VAT', type: 'number', description: 'Stawka podatku VAT w %' },
        { key: 'quantity', label: 'Ilość', type: 'number', description: 'Zamówiona ilość' },
        { key: 'weight', label: 'Waga', type: 'number', description: 'Waga jednostkowa produktu' },
        { key: 'line_total', label: 'Wartość pozycji', type: 'number', description: 'Cena * ilość', computed: true }
      ]
    },

    // ========================================
    // FLAGI
    // ========================================
    {
      id: 'flags',
      label: 'Flagi',
      fields: [
        { key: 'bundle_id', label: 'ID zestawu', type: 'number', description: 'ID zestawu produktowego (jeśli dotyczy)' },
        { key: 'auction_id', label: 'ID aukcji', type: 'text', description: 'ID aukcji źródłowej' }
      ]
    },

    // ========================================
    // MAGAZYN
    // ========================================
    {
      id: 'storage',
      label: 'Magazyn',
      fields: [
        { key: 'storage', label: 'Magazyn', type: 'text', description: 'Nazwa magazynu' },
        { key: 'storage_id', label: 'ID magazynu', type: 'number', description: 'ID magazynu w BaseLinker' }
      ]
    },

    // ========================================
    // DANE PRODUKTU (enrichment: product-details)
    // ========================================
    {
      id: 'product_data',
      label: 'Dane z katalogu',
      description: 'Dodatkowe dane produktu z katalogu - wymaga enrichmentu',
      fields: [
        { key: 'catalog_name', label: 'Nazwa z katalogu', type: 'text', enrichment: 'product-details' },
        { key: 'catalog_sku', label: 'SKU z katalogu', type: 'text', enrichment: 'product-details' },
        { key: 'catalog_ean', label: 'EAN z katalogu', type: 'text', enrichment: 'product-details' },
        { key: 'category_id', label: 'ID kategorii', type: 'number', enrichment: 'product-details' },
        { key: 'manufacturer_id', label: 'ID producenta', type: 'number', enrichment: 'product-details' },
        { key: 'description', label: 'Opis', type: 'text', enrichment: 'product-details' }
      ]
    }
  ],

  // Primary key - każda pozycja ma unikalny order_product_id
  primaryKey: 'order_product_id',

  // Sort options
  sortOptions: [
    { key: 'date_add', label: 'Data zamówienia', direction: 'desc' },
    { key: 'order_id', label: 'ID zamówienia', direction: 'desc' }
  ]
};
