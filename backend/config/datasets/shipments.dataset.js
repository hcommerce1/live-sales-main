/**
 * Dataset: PRZESYŁKI (Shipments)
 *
 * Główne API: getOrders → getOrderPackages dla każdego zamówienia
 * Enrichmenty: tracking-history
 *
 * Przesyłki kurierskie powiązane z zamówieniami.
 */

module.exports = {
  id: 'shipments',
  label: 'Przesyłki',
  description: 'Eksport przesyłek kurierskich z zamówień',
  icon: 'package',

  // Źródło danych
  primaryQuery: 'getOrderPackages',
  enrichments: ['tracking-history'],
  requiresInventory: false,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'courierCode', label: 'Kurier', type: 'courier' },
    { key: 'trackingStatus', label: 'Status śledzenia', type: 'select', options: [
      { value: '', label: 'Wszystkie' },
      { value: '1', label: 'Etykieta utworzona' },
      { value: '2', label: 'Wysłana' },
      { value: '4', label: 'W doręczeniu' },
      { value: '5', label: 'Doręczona' },
      { value: '6', label: 'Zwrot' },
      { value: '8', label: 'Czeka w punkcie' }
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
        { key: 'package_id', label: 'ID przesyłki', type: 'number' },
        { key: 'order_id', label: 'ID zamówienia', type: 'number' },
        { key: 'courier_code', label: 'Kod kuriera', type: 'text' },
        { key: 'courier_package_nr', label: 'Nr listu przewozowego', type: 'text' }
      ]
    },

    // ========================================
    // KURIER
    // ========================================
    {
      id: 'courier',
      label: 'Kurier',
      fields: [
        { key: 'courier_other_name', label: 'Inna nazwa kuriera', type: 'text' },
        { key: 'courier_inner_number', label: 'Wewnętrzny numer', type: 'text' },
        { key: 'account_id', label: 'ID konta kuriera', type: 'number' }
      ]
    },

    // ========================================
    // ŚLEDZENIE
    // ========================================
    {
      id: 'tracking',
      label: 'Śledzenie',
      fields: [
        { key: 'tracking_status', label: 'Status', type: 'number' },
        { key: 'tracking_status_name', label: 'Nazwa statusu', type: 'text', computed: true },
        { key: 'tracking_status_date', label: 'Data statusu', type: 'datetime' },
        { key: 'tracking_delivery_days', label: 'Dni dostawy', type: 'number' },
        { key: 'tracking_url', label: 'URL śledzenia', type: 'text' }
      ]
    },

    // ========================================
    // TYP
    // ========================================
    {
      id: 'type',
      label: 'Typ przesyłki',
      fields: [
        { key: 'package_type', label: 'Typ', type: 'text' },
        { key: 'is_return', label: 'Jest zwrotem', type: 'boolean' }
      ]
    },

    // ========================================
    // SZCZEGÓŁY (enrichment)
    // ========================================
    {
      id: 'details',
      label: 'Szczegóły',
      description: 'Szczegóły przesyłki - wymaga enrichmentu',
      fields: [
        { key: 'weight', label: 'Waga', type: 'number', enrichment: 'package-details' },
        { key: 'width', label: 'Szerokość', type: 'number', enrichment: 'package-details' },
        { key: 'height', label: 'Wysokość', type: 'number', enrichment: 'package-details' },
        { key: 'length', label: 'Długość', type: 'number', enrichment: 'package-details' },
        { key: 'cod_value', label: 'Wartość COD', type: 'number', enrichment: 'package-details' },
        { key: 'insurance_value', label: 'Ubezpieczenie', type: 'number', enrichment: 'package-details' }
      ]
    },

    // ========================================
    // HISTORIA (enrichment)
    // ========================================
    {
      id: 'history',
      label: 'Historia statusów',
      description: 'Historia śledzenia - wymaga enrichmentu',
      fields: [
        { key: 'tracking_history_json', label: 'Historia (JSON)', type: 'text', enrichment: 'tracking-history' }
      ]
    },

    // ========================================
    // DANE ZAMÓWIENIA
    // ========================================
    {
      id: 'order_data',
      label: 'Dane zamówienia',
      fields: [
        { key: 'order_date', label: 'Data zamówienia', type: 'datetime' },
        { key: 'order_status_id', label: 'Status zamówienia', type: 'number' },
        { key: 'delivery_fullname', label: 'Odbiorca', type: 'text' },
        { key: 'delivery_city', label: 'Miasto', type: 'text' },
        { key: 'delivery_country', label: 'Kraj', type: 'text' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'package_id',

  // Sort options
  sortOptions: [
    { key: 'tracking_status_date', label: 'Data statusu', direction: 'desc' },
    { key: 'package_id', label: 'ID przesyłki', direction: 'desc' }
  ]
};
