/**
 * Basic Data Dataset
 *
 * Dane słownikowe i konfiguracyjne z BaseLinker.
 * Obsługuje wiele typów danych słownikowych.
 */

module.exports = {
  id: 'basic_data',
  name: 'Dane słownikowe',
  description: 'Statusy, źródła, magazyny, kategorie i inne dane konfiguracyjne',
  icon: 'book',
  category: 'config',

  // Wymaga wyboru typu danych
  requiresDataType: true,

  // Typy danych słownikowych
  dataTypes: [
    { id: 'order_statuses', label: 'Statusy zamówień', method: 'getOrderStatusList' },
    { id: 'order_sources', label: 'Źródła zamówień', method: 'getOrderSources' },
    { id: 'order_extra_fields', label: 'Dodatkowe pola zamówień', method: 'getOrderExtraFields' },
    { id: 'inventories', label: 'Katalogi produktów', method: 'getInventories' },
    { id: 'categories', label: 'Kategorie produktów', method: 'getInventoryCategories', requiresInventory: true },
    { id: 'manufacturers', label: 'Producenci', method: 'getInventoryManufacturers' },
    { id: 'tags', label: 'Tagi produktów', method: 'getInventoryTags' },
    { id: 'price_groups', label: 'Grupy cenowe', method: 'getInventoryPriceGroups' },
    { id: 'warehouses', label: 'Magazyny', method: 'getInventoryWarehouses' },
    { id: 'product_extra_fields', label: 'Dodatkowe pola produktów', method: 'getInventoryExtraFields' },
    { id: 'integrations', label: 'Integracje sprzedażowe', method: 'getInventoryIntegrations' },
    { id: 'couriers', label: 'Kurierzy', method: 'getCouriersList' },
    { id: 'courier_accounts', label: 'Konta kurierskie', method: 'getCourierAccounts' },
    { id: 'external_storages', label: 'Zewnętrzne magazyny', method: 'getExternalStoragesList' },
    { id: 'return_statuses', label: 'Statusy zwrotów', method: 'getOrderReturnStatusList' },
    { id: 'return_reasons', label: 'Powody zwrotów', method: 'getOrderReturnReasonsList' },
    { id: 'return_product_statuses', label: 'Statusy produktów zwrotów', method: 'getOrderReturnProductStatuses' },
    { id: 'return_extra_fields', label: 'Dodatkowe pola zwrotów', method: 'getOrderReturnExtraFields' },
    { id: 'document_series', label: 'Serie dokumentów magazynowych', method: 'getInventoryDocumentSeries' },
    { id: 'po_series', label: 'Serie zamówień zakupu', method: 'getInventoryPurchaseOrderSeries' },
    { id: 'suppliers', label: 'Dostawcy', method: 'getInventorySuppliers' },
    { id: 'payers', label: 'Płatnicy', method: 'getInventoryPayers' },
    { id: 'invoice_series', label: 'Serie faktur/paragonów', method: 'getSeries' },
    { id: 'order_printouts', label: 'Szablony wydruków zamówień', method: 'getOrderPrintoutTemplates' },
    { id: 'inventory_printouts', label: 'Szablony wydruków produktów', method: 'getInventoryPrintoutTemplates' }
  ],

  // Brak standardowych filtrów - zależy od typu danych
  filters: [],

  // Pola są dynamiczne w zależności od typu danych
  fieldGroups: [
    {
      id: 'common',
      label: 'Pola wspólne',
      fields: [
        { key: 'id', label: 'ID', type: 'number', description: 'Identyfikator rekordu' },
        { key: 'name', label: 'Nazwa', type: 'string', description: 'Nazwa elementu' },
        { key: 'data_type', label: 'Typ danych', type: 'string', description: 'Typ danych słownikowych' }
      ]
    },
    {
      id: 'details',
      label: 'Szczegóły',
      fields: [
        { key: 'code', label: 'Kod', type: 'string', description: 'Kod (np. kuriera, źródła)' },
        { key: 'color', label: 'Kolor', type: 'string', description: 'Kolor (dla statusów)' },
        { key: 'type', label: 'Typ', type: 'string', description: 'Typ elementu' },
        { key: 'is_active', label: 'Aktywny', type: 'boolean', description: 'Czy element jest aktywny' }
      ]
    },
    {
      id: 'hierarchy',
      label: 'Hierarchia',
      fields: [
        { key: 'parent_id', label: 'ID nadrzędnego', type: 'number', description: 'ID elementu nadrzędnego' },
        { key: 'level', label: 'Poziom', type: 'number', description: 'Poziom w hierarchii' }
      ]
    },
    {
      id: 'raw',
      label: 'Dane surowe',
      fields: [
        { key: 'raw_json', label: 'Dane JSON', type: 'json', description: 'Pełne dane w formacie JSON' }
      ]
    }
  ],

  // Domyślne pola
  defaultFields: ['id', 'name', 'data_type', 'code', 'type']
};
