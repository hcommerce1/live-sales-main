/**
 * Dataset: ZAKUPY TOWARU (Purchase Orders)
 *
 * Główne API: getInventoryPurchaseOrders
 * Enrichmenty: purchase-items
 *
 * Zamówienia zakupu towaru od dostawców.
 */

module.exports = {
  id: 'purchase_orders',
  label: 'Zakupy towaru',
  description: 'Eksport zamówień zakupu towaru od dostawców',
  icon: 'truck',

  // Źródło danych
  primaryQuery: 'getInventoryPurchaseOrders',
  enrichments: ['purchase-items'],
  requiresInventory: true,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'inventoryId', label: 'Katalog', type: 'inventory', required: true },
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: '', label: 'Wszystkie' },
      { value: '0', label: 'Szkic' },
      { value: '1', label: 'Wysłane' },
      { value: '2', label: 'Otrzymane' },
      { value: '3', label: 'Zakończone' },
      { value: '4', label: 'Częściowo zakończone' },
      { value: '5', label: 'Anulowane' }
    ]},
    { key: 'supplierId', label: 'Dostawca', type: 'supplier' },
    { key: 'warehouseId', label: 'Magazyn', type: 'warehouse' }
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
        { key: 'id', label: 'ID zamówienia', type: 'number' },
        { key: 'name', label: 'Nazwa', type: 'text' },
        { key: 'document_number', label: 'Numer dokumentu', type: 'text' },
        { key: 'series_id', label: 'ID serii', type: 'number' }
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
        { key: 'date_sent', label: 'Data wysłania', type: 'datetime' },
        { key: 'date_received', label: 'Data otrzymania', type: 'datetime' },
        { key: 'date_completed', label: 'Data zakończenia', type: 'datetime' }
      ]
    },

    // ========================================
    // DOSTAWCA
    // ========================================
    {
      id: 'supplier',
      label: 'Dostawca',
      fields: [
        { key: 'supplier_id', label: 'ID dostawcy', type: 'number' },
        { key: 'supplier_name', label: 'Nazwa dostawcy', type: 'text', computed: true },
        { key: 'payer_id', label: 'ID płatnika', type: 'number' }
      ]
    },

    // ========================================
    // MAGAZYN
    // ========================================
    {
      id: 'warehouse',
      label: 'Magazyn',
      fields: [
        { key: 'warehouse_id', label: 'ID magazynu', type: 'text' }
      ]
    },

    // ========================================
    // WARTOŚCI
    // ========================================
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'currency', label: 'Waluta', type: 'text' },
        { key: 'total_quantity', label: 'Ilość zamówiona', type: 'number' },
        { key: 'completed_total_quantity', label: 'Ilość zrealizowana', type: 'number' },
        { key: 'total_cost', label: 'Koszt zamówienia', type: 'number' },
        { key: 'completed_total_cost', label: 'Koszt zrealizowany', type: 'number' }
      ]
    },

    // ========================================
    // STATUS
    // ========================================
    {
      id: 'status',
      label: 'Status',
      fields: [
        { key: 'status', label: 'Status', type: 'number', description: '0=szkic, 1=wysłane, 2=otrzymane, 3=zakończone, 4=częściowo, 5=anulowane' },
        { key: 'status_name', label: 'Nazwa statusu', type: 'text', computed: true }
      ]
    },

    // ========================================
    // NOTATKI
    // ========================================
    {
      id: 'notes',
      label: 'Notatki',
      fields: [
        { key: 'notes', label: 'Notatki', type: 'text' },
        { key: 'cost_invoice_no', label: 'Nr faktury kosztowej', type: 'text' }
      ]
    },

    // ========================================
    // POZYCJE (enrichment)
    // ========================================
    {
      id: 'items',
      label: 'Pozycje',
      description: 'Pozycje zamówienia - wymaga enrichmentu',
      fields: [
        { key: 'items_count', label: 'Liczba pozycji', type: 'number' },
        { key: 'items_summary', label: 'Podsumowanie', type: 'text' },
        { key: 'items_json', label: 'Pozycje (JSON)', type: 'text', enrichment: 'purchase-items' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'id',

  // Sort options
  sortOptions: [
    { key: 'date_created', label: 'Data utworzenia', direction: 'desc' },
    { key: 'id', label: 'ID zamówienia', direction: 'desc' }
  ]
};
