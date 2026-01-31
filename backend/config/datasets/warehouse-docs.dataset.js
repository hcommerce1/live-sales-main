/**
 * Dataset: DOKUMENTY MAGAZYNOWE (Warehouse Documents)
 *
 * Główne API: getInventoryDocuments
 * Enrichmenty: document-items
 *
 * Dokumenty magazynowe: PZ, PW, WZ, RW, MM, BO.
 */

module.exports = {
  id: 'warehouse_docs',
  label: 'Dokumenty magazynowe',
  description: 'Eksport dokumentów magazynowych (PZ, PW, WZ, RW, MM, BO)',
  icon: 'clipboard',

  // Źródło danych
  primaryQuery: 'getInventoryDocuments',
  enrichments: ['document-items'],
  requiresInventory: true,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'inventoryId', label: 'Katalog', type: 'inventory', required: true },
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'documentType', label: 'Typ dokumentu', type: 'select', options: [
      { value: '', label: 'Wszystkie' },
      { value: '0', label: 'PZ - Przyjęcie zewnętrzne' },
      { value: '1', label: 'PW - Przyjęcie wewnętrzne' },
      { value: '2', label: 'WZ - Wydanie zewnętrzne' },
      { value: '3', label: 'RW - Rozchód wewnętrzny' },
      { value: '4', label: 'MM - Przesunięcie międzymagazynowe' },
      { value: '5', label: 'BO - Bilans otwarcia' }
    ]},
    { key: 'warehouseId', label: 'Magazyn', type: 'warehouse' },
    { key: 'seriesId', label: 'Seria numeracji', type: 'documentSeries' }
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
        { key: 'document_id', label: 'ID dokumentu', type: 'number' },
        { key: 'document_type', label: 'Typ dokumentu', type: 'number', description: '0=PZ, 1=PW, 2=WZ, 3=RW, 4=MM, 5=BO' },
        { key: 'document_type_name', label: 'Nazwa typu', type: 'text', computed: true },
        { key: 'document_status', label: 'Status', type: 'number', description: '0=szkic, 1=zatwierdzony' },
        { key: 'document_status_name', label: 'Nazwa statusu', type: 'text', computed: true },
        { key: 'full_number', label: 'Pełny numer', type: 'text' },
        { key: 'description', label: 'Opis', type: 'text' }
      ]
    },

    // ========================================
    // DATY
    // ========================================
    {
      id: 'dates',
      label: 'Daty',
      fields: [
        { key: 'date_created', label: 'Data utworzenia', type: 'datetime' },
        { key: 'date_confirmed', label: 'Data zatwierdzenia', type: 'datetime' }
      ]
    },

    // ========================================
    // MAGAZYN
    // ========================================
    {
      id: 'warehouse',
      label: 'Magazyn',
      fields: [
        { key: 'warehouse_id', label: 'ID magazynu', type: 'text', description: 'Magazyn źródłowy' },
        { key: 'warehouse_id2', label: 'ID magazynu docelowego', type: 'text', description: 'Dla przesunięć MM' }
      ]
    },

    // ========================================
    // KIERUNEK
    // ========================================
    {
      id: 'direction',
      label: 'Kierunek',
      fields: [
        { key: 'direction', label: 'Kierunek', type: 'number', description: '0=przyjęcie, 1=wydanie' },
        { key: 'direction_name', label: 'Nazwa kierunku', type: 'text', computed: true }
      ]
    },

    // ========================================
    // WARTOŚCI
    // ========================================
    {
      id: 'totals',
      label: 'Wartości',
      fields: [
        { key: 'items_count', label: 'Liczba pozycji', type: 'number' },
        { key: 'total_quantity', label: 'Łączna ilość', type: 'number' },
        { key: 'total_price', label: 'Łączna wartość', type: 'number' }
      ]
    },

    // ========================================
    // SERIA
    // ========================================
    {
      id: 'series',
      label: 'Seria',
      fields: [
        { key: 'document_series_id', label: 'ID serii', type: 'number' }
      ]
    },

    // ========================================
    // POZYCJE (enrichment: document-items)
    // ========================================
    {
      id: 'items',
      label: 'Pozycje dokumentu',
      description: 'Szczegółowe pozycje - wymaga enrichmentu',
      fields: [
        { key: 'items_summary', label: 'Podsumowanie pozycji', type: 'text' },
        { key: 'items_json', label: 'Pozycje (JSON)', type: 'text', enrichment: 'document-items' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'document_id',

  // Sort options
  sortOptions: [
    { key: 'date_created', label: 'Data utworzenia', direction: 'desc' },
    { key: 'document_id', label: 'ID dokumentu', direction: 'desc' }
  ]
};
