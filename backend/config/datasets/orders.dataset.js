/**
 * Dataset: ZAMÓWIENIA (Orders)
 *
 * Główne API: getOrders
 * Enrichmenty: packages, documents, payments, tracking
 */

module.exports = {
  id: 'orders',
  label: 'Zamówienia',
  description: 'Eksport zamówień z BaseLinker wraz z danymi klientów, płatności i przesyłek',
  icon: 'shopping-cart',

  // Źródło danych
  primaryQuery: 'getOrders',
  enrichments: ['packages', 'documents', 'payments', 'tracking'],
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
    // PODSTAWOWE
    // ========================================
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Unikalny identyfikator zamówienia w BaseLinker' },
        { key: 'shop_order_id', label: 'ID zamówienia sklepu', type: 'number', description: 'ID zamówienia w oryginalnym sklepie' },
        { key: 'external_order_id', label: 'Zewnętrzny ID', type: 'text', description: 'Zewnętrzny identyfikator zamówienia' },
        { key: 'order_source', label: 'Źródło zamówienia', type: 'text', description: 'Typ źródła (allegro, amazon, shop, etc.)' },
        { key: 'order_source_id', label: 'ID źródła', type: 'number', description: 'ID konkretnego źródła zamówienia' },
        { key: 'order_source_name', label: 'Nazwa źródła', type: 'text', description: 'Nazwa źródła zamówienia', computed: true },
        { key: 'order_page', label: 'Link do zamówienia', type: 'text', description: 'URL do strony zamówienia dla klienta' },
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Data dodania zamówienia' },
        { key: 'date_confirmed', label: 'Data potwierdzenia', type: 'datetime', description: 'Data potwierdzenia zamówienia' },
        { key: 'date_in_status', label: 'Data zmiany statusu', type: 'datetime', description: 'Data ostatniej zmiany statusu' }
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
        { key: 'phone', label: 'Telefon', type: 'text', description: 'Numer telefonu klienta' },
        { key: 'user_login', label: 'Login klienta', type: 'text', description: 'Login użytkownika w serwisie źródłowym' }
      ]
    },

    // ========================================
    // ADRES DOSTAWY
    // ========================================
    {
      id: 'delivery_address',
      label: 'Adres dostawy',
      fields: [
        { key: 'delivery_fullname', label: 'Imię i nazwisko', type: 'text', description: 'Pełne imię i nazwisko odbiorcy' },
        { key: 'delivery_company', label: 'Firma', type: 'text', description: 'Nazwa firmy odbiorcy' },
        { key: 'delivery_address', label: 'Adres', type: 'text', description: 'Ulica i numer' },
        { key: 'delivery_postcode', label: 'Kod pocztowy', type: 'text', description: 'Kod pocztowy' },
        { key: 'delivery_city', label: 'Miasto', type: 'text', description: 'Miasto dostawy' },
        { key: 'delivery_state', label: 'Województwo/Stan', type: 'text', description: 'Województwo lub stan' },
        { key: 'delivery_country', label: 'Kraj', type: 'text', description: 'Nazwa kraju' },
        { key: 'delivery_country_code', label: 'Kod kraju', type: 'text', description: 'Kod ISO kraju (np. PL, DE)' }
      ]
    },

    // ========================================
    // PUNKT ODBIORU
    // ========================================
    {
      id: 'pickup_point',
      label: 'Punkt odbioru',
      fields: [
        { key: 'delivery_point_id', label: 'ID punktu', type: 'text', description: 'ID punktu odbioru (paczkomat, punkt)' },
        { key: 'delivery_point_name', label: 'Nazwa punktu', type: 'text', description: 'Nazwa punktu odbioru' },
        { key: 'delivery_point_address', label: 'Adres punktu', type: 'text', description: 'Adres punktu odbioru' },
        { key: 'delivery_point_postcode', label: 'Kod pocztowy punktu', type: 'text', description: 'Kod pocztowy punktu' },
        { key: 'delivery_point_city', label: 'Miasto punktu', type: 'text', description: 'Miasto punktu odbioru' }
      ]
    },

    // ========================================
    // DANE DO FAKTURY
    // ========================================
    {
      id: 'invoice_data',
      label: 'Dane do faktury',
      fields: [
        { key: 'invoice_fullname', label: 'Imię i nazwisko', type: 'text', description: 'Imię i nazwisko na fakturze' },
        { key: 'invoice_company', label: 'Firma', type: 'text', description: 'Nazwa firmy na fakturze' },
        { key: 'invoice_nip', label: 'NIP', type: 'text', description: 'Numer NIP' },
        { key: 'invoice_address', label: 'Adres', type: 'text', description: 'Adres na fakturze' },
        { key: 'invoice_postcode', label: 'Kod pocztowy', type: 'text', description: 'Kod pocztowy' },
        { key: 'invoice_city', label: 'Miasto', type: 'text', description: 'Miasto' },
        { key: 'invoice_state', label: 'Województwo/Stan', type: 'text', description: 'Województwo lub stan' },
        { key: 'invoice_country', label: 'Kraj', type: 'text', description: 'Nazwa kraju' },
        { key: 'invoice_country_code', label: 'Kod kraju', type: 'text', description: 'Kod ISO kraju' },
        { key: 'want_invoice', label: 'Chce fakturę', type: 'boolean', description: 'Czy klient chce fakturę' }
      ]
    },

    // ========================================
    // PŁATNOŚĆ
    // ========================================
    {
      id: 'payment',
      label: 'Płatność',
      fields: [
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zamówienia (PLN, EUR, etc.)' },
        { key: 'payment_method', label: 'Metoda płatności', type: 'text', description: 'Nazwa metody płatności' },
        { key: 'payment_method_cod', label: 'Pobranie', type: 'boolean', description: 'Czy płatność przy odbiorze' },
        { key: 'payment_done', label: 'Zapłacono', type: 'number', description: 'Kwota zapłacona' }
      ]
    },

    // ========================================
    // DOSTAWA
    // ========================================
    {
      id: 'delivery',
      label: 'Dostawa',
      fields: [
        { key: 'delivery_method', label: 'Metoda dostawy', type: 'text', description: 'Nazwa metody dostawy' },
        { key: 'delivery_method_id', label: 'ID metody dostawy', type: 'number', description: 'ID metody dostawy' },
        { key: 'delivery_price', label: 'Koszt dostawy', type: 'number', description: 'Cena dostawy' },
        { key: 'delivery_package_module', label: 'Moduł kuriera', type: 'text', description: 'Kod modułu kurierskiego' },
        { key: 'delivery_package_nr', label: 'Nr przesyłki', type: 'text', description: 'Numer listu przewozowego' }
      ]
    },

    // ========================================
    // WARTOŚCI
    // ========================================
    {
      id: 'totals',
      label: 'Wartości',
      fields: [
        { key: 'total_products_price', label: 'Wartość produktów', type: 'number', description: 'Suma cen produktów', computed: true },
        { key: 'total_price', label: 'Wartość całkowita', type: 'number', description: 'Całkowita wartość zamówienia', computed: true },
        { key: 'products_count', label: 'Liczba produktów', type: 'number', description: 'Liczba pozycji produktowych', computed: true },
        { key: 'products_quantity', label: 'Suma ilości', type: 'number', description: 'Suma ilości wszystkich produktów', computed: true }
      ]
    },

    // ========================================
    // STATUS
    // ========================================
    {
      id: 'status',
      label: 'Status',
      fields: [
        { key: 'order_status_id', label: 'ID statusu', type: 'number', description: 'ID statusu zamówienia' },
        { key: 'order_status_name', label: 'Nazwa statusu', type: 'text', description: 'Nazwa statusu', computed: true },
        { key: 'confirmed', label: 'Potwierdzone', type: 'boolean', description: 'Czy zamówienie potwierdzone' },
        { key: 'pick_status', label: 'Status pickingu', type: 'text', description: 'Status kompletacji (0/1)' },
        { key: 'pack_status', label: 'Status pakowania', type: 'text', description: 'Status pakowania (0/1)' }
      ]
    },

    // ========================================
    // KOMENTARZE
    // ========================================
    {
      id: 'comments',
      label: 'Komentarze',
      fields: [
        { key: 'user_comments', label: 'Komentarz klienta', type: 'text', description: 'Komentarz od klienta' },
        { key: 'admin_comments', label: 'Komentarz sprzedawcy', type: 'text', description: 'Komentarz wewnętrzny' }
      ]
    },

    // ========================================
    // DODATKOWE POLA
    // ========================================
    {
      id: 'extra_fields',
      label: 'Dodatkowe pola',
      fields: [
        { key: 'extra_field_1', label: 'Pole dodatkowe 1', type: 'text', description: 'Standardowe pole dodatkowe 1' },
        { key: 'extra_field_2', label: 'Pole dodatkowe 2', type: 'text', description: 'Standardowe pole dodatkowe 2' }
      ],
      dynamic: true,
      source: 'getOrderExtraFields'
    },

    // ========================================
    // PRZESYŁKI (enrichment: packages)
    // ========================================
    {
      id: 'packages',
      label: 'Przesyłki',
      description: 'Dane przesyłek - wymaga enrichmentu',
      fields: [
        { key: 'pkg1_package_id', label: 'ID przesyłki 1', type: 'number', enrichment: 'packages' },
        { key: 'pkg1_courier_code', label: 'Kurier 1', type: 'text', enrichment: 'packages' },
        { key: 'pkg1_courier_package_nr', label: 'Nr listu 1', type: 'text', enrichment: 'packages' },
        { key: 'pkg1_tracking_status', label: 'Status śledzenia 1', type: 'text', enrichment: 'packages' },
        { key: 'pkg1_tracking_url', label: 'URL śledzenia 1', type: 'text', enrichment: 'packages' },
        { key: 'pkg2_package_id', label: 'ID przesyłki 2', type: 'number', enrichment: 'packages' },
        { key: 'pkg2_courier_code', label: 'Kurier 2', type: 'text', enrichment: 'packages' },
        { key: 'pkg2_courier_package_nr', label: 'Nr listu 2', type: 'text', enrichment: 'packages' },
        { key: 'pkg2_tracking_status', label: 'Status śledzenia 2', type: 'text', enrichment: 'packages' },
        { key: 'pkg2_tracking_url', label: 'URL śledzenia 2', type: 'text', enrichment: 'packages' },
        { key: 'pkg3_package_id', label: 'ID przesyłki 3', type: 'number', enrichment: 'packages' },
        { key: 'pkg3_courier_code', label: 'Kurier 3', type: 'text', enrichment: 'packages' },
        { key: 'pkg3_courier_package_nr', label: 'Nr listu 3', type: 'text', enrichment: 'packages' }
      ]
    },

    // ========================================
    // DOKUMENTY SPRZEDAŻY (enrichment: documents)
    // ========================================
    {
      id: 'documents',
      label: 'Dokumenty sprzedaży',
      description: 'Faktury i paragony - wymaga enrichmentu',
      fields: [
        { key: 'ds_type', label: 'Typ dokumentu', type: 'text', enrichment: 'documents', description: 'Faktura/Paragon' },
        { key: 'ds_number', label: 'Numer dokumentu', type: 'text', enrichment: 'documents' },
        { key: 'ds_date_add', label: 'Data wystawienia', type: 'datetime', enrichment: 'documents' },
        { key: 'ds_total_brutto', label: 'Wartość brutto', type: 'number', enrichment: 'documents' },
        { key: 'ds_total_netto', label: 'Wartość netto', type: 'number', enrichment: 'documents' },
        { key: 'ds2_type', label: 'Typ dokumentu 2', type: 'text', enrichment: 'documents' },
        { key: 'ds2_number', label: 'Numer dokumentu 2', type: 'text', enrichment: 'documents' },
        { key: 'ds2_date_add', label: 'Data wystawienia 2', type: 'datetime', enrichment: 'documents' }
      ]
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
    // PROWIZJE
    // ========================================
    {
      id: 'commission',
      label: 'Prowizje',
      fields: [
        { key: 'commission_net', label: 'Prowizja netto', type: 'number', description: 'Prowizja marketplace netto' },
        { key: 'commission_gross', label: 'Prowizja brutto', type: 'number', description: 'Prowizja marketplace brutto' },
        { key: 'commission_currency', label: 'Waluta prowizji', type: 'text', description: 'Waluta prowizji' }
      ]
    }
  ]
};
