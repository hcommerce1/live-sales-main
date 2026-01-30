/**
 * Dataset: DOKUMENTY MAGAZYNOWE (warehouse_docs)
 *
 * WZ, PZ, RW, PW, BO - dokumenty magazynowe.
 * Jeden wiersz = jeden dokument.
 *
 * API: getInventoryDocuments
 */

module.exports = {
  id: 'warehouse_docs',
  label: 'Dokumenty magazynowe',
  description: 'WZ, PZ, RW, PW, BO - dokumenty magazynowe',
  icon: 'archive',

  primaryQuery: 'getInventoryDocuments',
  enrichments: [],

  fieldGroups: [
    // 4.1 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'document_id', label: 'ID dokumentu', type: 'number', description: 'Unikalny identyfikator dokumentu' },
        { key: 'type', label: 'Typ dokumentu', type: 'text', description: 'WZ (wydanie), PZ (przyjęcie), RW (rozchód), PW (przychód), BO (bilans)' },
        { key: 'series_id', label: 'ID serii', type: 'number', description: 'Seria numeracji dokumentu' },
        { key: 'number', label: 'Numer dokumentu', type: 'text', description: 'Pełny numer (np. WZ/2024/01/001)' },
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Kiedy utworzono dokument' },
        { key: 'date_document', label: 'Data dokumentu', type: 'date', description: 'Data operacji magazynowej' }
      ]
    },

    // 4.2 MAGAZYN
    {
      id: 'warehouse',
      label: 'Magazyn',
      fields: [
        { key: 'warehouse_id', label: 'ID magazynu', type: 'number', description: 'Identyfikator magazynu' },
        { key: 'warehouse_name', label: 'Nazwa magazynu', type: 'text', description: 'Nazwa magazynu', computed: true },
        { key: 'inventory_id', label: 'ID katalogu', type: 'number', description: 'Katalog produktów, którego dotyczy' }
      ]
    },

    // 4.3 KONTRAHENT
    {
      id: 'contractor',
      label: 'Kontrahent',
      fields: [
        { key: 'contractor_id', label: 'ID kontrahenta', type: 'number', description: 'Identyfikator dostawcy/odbiorcy' },
        { key: 'contractor_name', label: 'Nazwa kontrahenta', type: 'text', description: 'Nazwa firmy' },
        { key: 'contractor_nip', label: 'NIP kontrahenta', type: 'text', description: 'NIP kontrahenta' }
      ]
    },

    // 4.4 WARTOŚCI
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'total_value_brutto', label: 'Wartość brutto', type: 'number', description: 'Łączna wartość z VAT' },
        { key: 'total_value_netto', label: 'Wartość netto', type: 'number', description: 'Łączna wartość bez VAT' },
        { key: 'total_quantity', label: 'Łączna ilość', type: 'number', description: 'Suma sztuk na dokumencie' },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta dokumentu' }
      ]
    },

    // 4.5 POWIĄZANIA
    {
      id: 'relations',
      label: 'Powiązania',
      fields: [
        { key: 'order_id', label: 'Zamówienie', type: 'number', description: 'Powiązane zamówienie (jeśli WZ)' },
        { key: 'purchase_order_id', label: 'Zamówienie zakupu', type: 'number', description: 'Powiązane PO (jeśli PZ)' },
        { key: 'related_document_id', label: 'Dokument powiązany', type: 'number', description: 'Inny powiązany dokument' }
      ]
    },

    // 4.6 POZYCJE (AGREGOWANE)
    {
      id: 'items_summary',
      label: 'Pozycje',
      fields: [
        { key: 'items_count', label: 'Liczba pozycji', type: 'number', description: 'Ile różnych produktów', computed: true },
        { key: 'items_skus', label: 'SKU produktów', type: 'text', description: 'Lista SKU oddzielona przecinkiem', computed: true }
      ]
    },

    // 4.7 KOMENTARZE
    {
      id: 'comments',
      label: 'Komentarze',
      fields: [
        { key: 'comments', label: 'Komentarze', type: 'text', description: 'Uwagi do dokumentu' }
      ]
    }
  ]
};
