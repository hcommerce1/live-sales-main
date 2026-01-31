/**
 * Dataset: ZWROTY (Returns)
 *
 * Główne API: getOrderReturns
 * Enrichmenty: payments, credit
 *
 * Dane zwrotów z BaseLinker Return Manager.
 */

module.exports = {
  id: 'returns',
  label: 'Zwroty',
  description: 'Eksport zwrotów zamówień z BaseLinker Return Manager',
  icon: 'undo',

  // Źródło danych
  primaryQuery: 'getOrderReturns',
  enrichments: ['payments', 'credit'],
  requiresInventory: false,

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'dateFrom', label: 'Data od', type: 'date' },
    { key: 'dateTo', label: 'Data do', type: 'date' },
    { key: 'statusId', label: 'Status zwrotu', type: 'returnStatus' },
    { key: 'orderReturnSource', label: 'Źródło zwrotu', type: 'source' }
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
        { key: 'return_id', label: 'ID zwrotu', type: 'number', description: 'Unikalny identyfikator zwrotu' },
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'ID powiązanego zamówienia' },
        { key: 'shop_order_id', label: 'ID zamówienia sklepu', type: 'number', description: 'ID zamówienia w sklepie' },
        { key: 'external_order_id', label: 'Zewnętrzny ID', type: 'text', description: 'Zewnętrzny identyfikator zamówienia' },
        { key: 'reference_number', label: 'Numer referencyjny', type: 'text', description: 'Numer referencyjny zwrotu' },
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Data utworzenia zwrotu' },
        { key: 'date_in_status', label: 'Data zmiany statusu', type: 'datetime', description: 'Data ostatniej zmiany statusu' }
      ]
    },

    // ========================================
    // ŹRÓDŁO
    // ========================================
    {
      id: 'source',
      label: 'Źródło',
      fields: [
        { key: 'order_return_source', label: 'Źródło zwrotu', type: 'text', description: 'Typ źródła (shop, personal, allegro, etc.)' },
        { key: 'order_return_source_id', label: 'ID źródła', type: 'number', description: 'ID źródła zwrotu' }
      ]
    },

    // ========================================
    // STATUS
    // ========================================
    {
      id: 'status',
      label: 'Status',
      fields: [
        { key: 'status_id', label: 'ID statusu', type: 'number', description: 'ID statusu zwrotu' },
        { key: 'status_name', label: 'Nazwa statusu', type: 'text', description: 'Nazwa statusu', computed: true },
        { key: 'fulfillment_status', label: 'Status realizacji', type: 'number', description: '0=aktywny, 5=zaakceptowany, 1=zakończony, 2=anulowany' },
        { key: 'fulfillment_status_name', label: 'Nazwa statusu realizacji', type: 'text', computed: true }
      ]
    },

    // ========================================
    // KLIENT
    // ========================================
    {
      id: 'customer',
      label: 'Klient',
      fields: [
        { key: 'email', label: 'Email', type: 'text', description: 'Adres email klienta' },
        { key: 'phone', label: 'Telefon', type: 'text', description: 'Numer telefonu' },
        { key: 'user_login', label: 'Login klienta', type: 'text', description: 'Login na marketplace' }
      ]
    },

    // ========================================
    // ADRES DOSTAWY
    // ========================================
    {
      id: 'delivery',
      label: 'Adres dostawy',
      fields: [
        { key: 'delivery_fullname', label: 'Imię i nazwisko', type: 'text' },
        { key: 'delivery_company', label: 'Firma', type: 'text' },
        { key: 'delivery_address', label: 'Adres', type: 'text' },
        { key: 'delivery_postcode', label: 'Kod pocztowy', type: 'text' },
        { key: 'delivery_city', label: 'Miasto', type: 'text' },
        { key: 'delivery_state', label: 'Województwo', type: 'text' },
        { key: 'delivery_country', label: 'Kraj', type: 'text' },
        { key: 'delivery_country_code', label: 'Kod kraju', type: 'text' }
      ]
    },

    // ========================================
    // WARTOŚCI
    // ========================================
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zwrotu' },
        { key: 'refunded', label: 'Kwota zwrotu', type: 'number', description: 'Kwota zwrócona' },
        { key: 'delivery_price', label: 'Koszt dostawy', type: 'number', description: 'Koszt dostawy zwrotu' },
        { key: 'products_value', label: 'Wartość produktów', type: 'number', description: 'Suma wartości produktów', computed: true },
        { key: 'products_count', label: 'Liczba produktów', type: 'number', description: 'Liczba pozycji', computed: true }
      ]
    },

    // ========================================
    // PRODUKTY
    // ========================================
    {
      id: 'products',
      label: 'Produkty',
      fields: [
        { key: 'products_summary', label: 'Lista produktów', type: 'text', description: 'Podsumowanie produktów w zwrocie' },
        { key: 'product1_name', label: 'Produkt 1 - nazwa', type: 'text' },
        { key: 'product1_sku', label: 'Produkt 1 - SKU', type: 'text' },
        { key: 'product1_quantity', label: 'Produkt 1 - ilość', type: 'number' },
        { key: 'product1_price', label: 'Produkt 1 - cena', type: 'number' },
        { key: 'product2_name', label: 'Produkt 2 - nazwa', type: 'text' },
        { key: 'product2_sku', label: 'Produkt 2 - SKU', type: 'text' },
        { key: 'product2_quantity', label: 'Produkt 2 - ilość', type: 'number' },
        { key: 'product2_price', label: 'Produkt 2 - cena', type: 'number' }
      ]
    },

    // ========================================
    // KONTO ZWROTU
    // ========================================
    {
      id: 'refund_account',
      label: 'Konto do zwrotu',
      fields: [
        { key: 'refund_account_number', label: 'Numer konta', type: 'text', description: 'Numer rachunku bankowego' },
        { key: 'refund_iban', label: 'IBAN', type: 'text', description: 'Numer IBAN' },
        { key: 'refund_swift', label: 'SWIFT', type: 'text', description: 'Kod SWIFT banku' }
      ]
    },

    // ========================================
    // PRZESYŁKA
    // ========================================
    {
      id: 'shipment',
      label: 'Przesyłka',
      fields: [
        { key: 'delivery_package_module', label: 'Kurier', type: 'text', description: 'Kod kuriera' },
        { key: 'delivery_package_nr', label: 'Nr przesyłki', type: 'text', description: 'Numer listu przewozowego' }
      ]
    },

    // ========================================
    // KOMENTARZE
    // ========================================
    {
      id: 'comments',
      label: 'Komentarze',
      fields: [
        { key: 'admin_comments', label: 'Komentarz sprzedawcy', type: 'text' }
      ]
    },

    // ========================================
    // DODATKOWE POLA
    // ========================================
    {
      id: 'extra_fields',
      label: 'Dodatkowe pola',
      fields: [
        { key: 'extra_field_1', label: 'Pole dodatkowe 1', type: 'text' },
        { key: 'extra_field_2', label: 'Pole dodatkowe 2', type: 'text' }
      ],
      dynamic: true,
      source: 'getOrderReturnExtraFields'
    },

    // ========================================
    // BASE CONNECT
    // ========================================
    {
      id: 'connect',
      label: 'Base Connect',
      fields: [
        { key: 'connect_integration_id', label: 'ID integracji', type: 'number', description: 'ID integracji Base Connect' },
        { key: 'connect_contractor_id', label: 'ID kontrahenta', type: 'number', description: 'ID kontrahenta Base Connect' }
      ]
    },

    // ========================================
    // HISTORIA PŁATNOŚCI (enrichment: payments)
    // ========================================
    {
      id: 'payments_history',
      label: 'Historia płatności',
      description: 'Historia zwrotów - wymaga enrichmentu',
      fields: [
        { key: 'last_payment_date', label: 'Data ostatniej płatności', type: 'datetime', enrichment: 'payments' },
        { key: 'last_payment_amount', label: 'Kwota ostatniej płatności', type: 'number', enrichment: 'payments' },
        { key: 'total_payments', label: 'Suma płatności', type: 'number', enrichment: 'payments' }
      ]
    }
  ],

  // Primary key
  primaryKey: 'return_id',

  // Sort options
  sortOptions: [
    { key: 'date_add', label: 'Data utworzenia', direction: 'desc' },
    { key: 'return_id', label: 'ID zwrotu', direction: 'desc' }
  ]
};
