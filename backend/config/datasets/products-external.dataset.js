/**
 * Dataset: PRODUKTY - ZEWNĘTRZNY (External Storage Products)
 *
 * Główne API: getExternalStorageProductsList
 * Enrichmenty: external-details, external-prices, external-quantity
 *
 * Produkty z zewnętrznych magazynów (sklepy, hurtownie).
 * Wymaga wyboru magazynu zewnętrznego (storageId).
 */

module.exports = {
  id: 'products_external',
  label: 'Produkty - Zewnętrzny',
  description: 'Eksport produktów z zewnętrznych magazynów (sklepy, hurtownie)',
  icon: 'external-link',

  // Źródło danych
  primaryQuery: 'getExternalStorageProductsList',
  enrichments: ['external-details', 'external-prices', 'external-quantity'],
  requiresInventory: false,
  requiresStorage: true, // Wymaga wyboru magazynu zewnętrznego

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'storageId', label: 'Magazyn zewnętrzny', type: 'externalStorage', required: true },
    { key: 'categoryId', label: 'Kategoria', type: 'externalCategory' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'ean', label: 'EAN', type: 'text' },
    { key: 'name', label: 'Nazwa (zawiera)', type: 'text' },
    { key: 'priceFrom', label: 'Cena od', type: 'number' },
    { key: 'priceTo', label: 'Cena do', type: 'number' },
    { key: 'stockFrom', label: 'Stan od', type: 'number' },
    { key: 'stockTo', label: 'Stan do', type: 'number' }
  ],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // IDENTYFIKATORY
    // ========================================
    {
      id: 'identifiers',
      label: 'Identyfikatory',
      fields: [
        { key: 'product_id', label: 'ID produktu', type: 'text', description: 'ID produktu w zewnętrznym magazynie' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'ean', label: 'EAN', type: 'text' },
        { key: 'asin', label: 'ASIN', type: 'text' }
      ]
    },

    // ========================================
    // PODSTAWOWE
    // ========================================
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'name', label: 'Nazwa', type: 'text' },
        { key: 'category_id', label: 'ID kategorii', type: 'text' }
      ]
    },

    // ========================================
    // CENY
    // ========================================
    {
      id: 'pricing',
      label: 'Ceny',
      fields: [
        { key: 'price_brutto', label: 'Cena brutto', type: 'number' },
        { key: 'price_netto', label: 'Cena netto', type: 'number' },
        { key: 'tax_rate', label: 'Stawka VAT', type: 'number' }
      ]
    },

    // ========================================
    // STANY
    // ========================================
    {
      id: 'stock',
      label: 'Stany',
      fields: [
        { key: 'quantity', label: 'Ilość', type: 'number' }
      ]
    },

    // ========================================
    // WARIANTY
    // ========================================
    {
      id: 'variants',
      label: 'Warianty',
      fields: [
        { key: 'has_variants', label: 'Ma warianty', type: 'boolean' },
        { key: 'variants_count', label: 'Liczba wariantów', type: 'number' },
        { key: 'variants_json', label: 'Warianty (JSON)', type: 'text' }
      ]
    },

    // ========================================
    // SZCZEGÓŁY (enrichment)
    // ========================================
    {
      id: 'details',
      label: 'Szczegóły',
      description: 'Dodatkowe dane - wymaga enrichmentu',
      fields: [
        { key: 'description', label: 'Opis', type: 'text', enrichment: 'external-details' },
        { key: 'weight', label: 'Waga', type: 'number', enrichment: 'external-details' },
        { key: 'image_url', label: 'URL obrazu', type: 'text', enrichment: 'external-details' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'product_id',

  // Sort options
  sortOptions: [
    { key: 'product_id', label: 'ID produktu', direction: 'asc' },
    { key: 'name', label: 'Nazwa', direction: 'asc' }
  ]
};
