/**
 * Dataset: ZAKUPY TOWARU (purchase_orders)
 *
 * Zamówienia zakupowe do dostawców.
 * Jeden wiersz = jedno zamówienie zakupu.
 *
 * API: getInventoryPurchaseOrders
 */

module.exports = {
  id: 'purchase_orders',
  label: 'Zakupy towaru',
  description: 'Zamówienia zakupowe do dostawców',
  icon: 'truck',

  primaryQuery: 'getInventoryPurchaseOrders',
  enrichments: [],

  fieldGroups: [
    // 7.1 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'purchase_order_id', label: 'ID zamówienia', type: 'number', description: 'Unikalny identyfikator PO' },
        { key: 'series_id', label: 'ID serii', type: 'number', description: 'Seria numeracji' },
        { key: 'number', label: 'Numer', type: 'text', description: 'Numer zamówienia zakupu' },
        { key: 'status', label: 'Status', type: 'text', description: 'Aktualny status (np. "Wysłane", "Zrealizowane")' }
      ]
    },

    // 7.2 DATY
    {
      id: 'dates',
      label: 'Daty',
      fields: [
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Kiedy utworzono PO' },
        { key: 'date_expected', label: 'Planowana dostawa', type: 'date', description: 'Oczekiwana data dostawy' },
        { key: 'date_confirmed', label: 'Data potwierdzenia', type: 'datetime', description: 'Kiedy dostawca potwierdził' },
        { key: 'date_received', label: 'Data realizacji', type: 'datetime', description: 'Kiedy otrzymano towar' }
      ]
    },

    // 7.3 DOSTAWCA
    {
      id: 'supplier',
      label: 'Dostawca',
      fields: [
        { key: 'supplier_id', label: 'ID dostawcy', type: 'number', description: 'Identyfikator dostawcy' },
        { key: 'supplier_name', label: 'Nazwa dostawcy', type: 'text', description: 'Nazwa firmy dostawcy' },
        { key: 'supplier_nip', label: 'NIP dostawcy', type: 'text', description: 'NIP dostawcy' },
        { key: 'supplier_address', label: 'Adres dostawcy', type: 'text', description: 'Pełny adres' },
        { key: 'supplier_email', label: 'Email dostawcy', type: 'text', description: 'Email kontaktowy' },
        { key: 'supplier_phone', label: 'Telefon dostawcy', type: 'text', description: 'Telefon kontaktowy' }
      ]
    },

    // 7.4 MAGAZYN DOCELOWY
    {
      id: 'warehouse',
      label: 'Magazyn docelowy',
      fields: [
        { key: 'warehouse_id', label: 'ID magazynu', type: 'number', description: 'Magazyn docelowy' },
        { key: 'warehouse_name', label: 'Nazwa magazynu', type: 'text', description: 'Nazwa magazynu', computed: true },
        { key: 'inventory_id', label: 'ID katalogu', type: 'number', description: 'Katalog produktów' }
      ]
    },

    // 7.5 WARTOŚCI
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'total_value_brutto', label: 'Wartość brutto', type: 'number', description: 'Łączna wartość zamówienia z VAT' },
        { key: 'total_value_netto', label: 'Wartość netto', type: 'number', description: 'Łączna wartość bez VAT' },
        { key: 'items_count', label: 'Liczba pozycji', type: 'number', description: 'Ile różnych produktów zamówiono' },
        { key: 'items_quantity', label: 'Łączna ilość', type: 'number', description: 'Suma sztuk' },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zamówienia' }
      ]
    },

    // 7.6 REALIZACJA
    {
      id: 'fulfillment',
      label: 'Realizacja',
      fields: [
        { key: 'received_value', label: 'Wartość otrzymana', type: 'number', description: 'Wartość już dostarczonego towaru' },
        { key: 'received_quantity', label: 'Ilość otrzymana', type: 'number', description: 'Ile sztuk już dostarczono' },
        { key: 'completion_percent', label: 'Realizacja %', type: 'number', description: 'Procent zrealizowania zamówienia', computed: true }
      ]
    },

    // 7.7 KOMENTARZE
    {
      id: 'comments',
      label: 'Komentarze',
      fields: [
        { key: 'comments', label: 'Komentarze', type: 'text', description: 'Uwagi do zamówienia' }
      ]
    }
  ]
};
