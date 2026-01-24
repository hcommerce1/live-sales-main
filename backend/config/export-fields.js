/**
 * Export Fields Configuration
 *
 * Centralny plik z definicjami pól dla wszystkich datasetów eksportów.
 * Łatwa konfiguracja planów przez `plan: 'free' | 'basic' | 'pro'`.
 *
 * Struktura:
 * - operators: Dostępne operatory filtrów z wymaganym planem
 * - datasets: Definicje datasetów z polami
 * - Funkcje pomocnicze do filtrowania po planie
 */

const planHierarchy = { free: 0, basic: 1, pro: 2 };

module.exports = {
  // ============================================
  // OPERATORY FILTRÓW
  // ============================================
  operators: {
    is_empty:         { label: 'Jest pusta',          plan: 'free',  types: ['text', 'number'] },
    is_not_empty:     { label: 'Nie jest pusta',      plan: 'free',  types: ['text', 'number'] },
    equals:           { label: 'Równa',               plan: 'free',  types: ['text', 'number', 'select'] },
    not_equals:       { label: 'Różna',               plan: 'free',  types: ['text', 'number', 'select'] },
    contains:         { label: 'Zawiera',             plan: 'basic', types: ['text'] },
    not_contains:     { label: 'Nie zawiera',         plan: 'basic', types: ['text'] },
    greater_than:     { label: 'Większa niż',         plan: 'basic', types: ['number', 'date'] },
    less_than:        { label: 'Mniejsza niż',        plan: 'basic', types: ['number', 'date'] },
    greater_or_equal: { label: 'Większa lub równa',   plan: 'pro',   types: ['number', 'date'] },
    less_or_equal:    { label: 'Mniejsza lub równa',  plan: 'pro',   types: ['number', 'date'] },
  },

  // ============================================
  // DATASETY
  // ============================================
  datasets: {
    // ----------------------------------------
    // ZAMÓWIENIA (orders)
    // ----------------------------------------
    orders: {
      label: 'Zamówienia',
      plan: 'free',
      apiMethod: 'getOrders',
      fields: [
        // Podstawowe
        { key: 'order_id',         label: 'ID zamówienia',        group: 'Podstawowe',   plan: 'free',  type: 'number' },
        { key: 'shop_order_id',    label: 'ID zamówienia w sklepie', group: 'Podstawowe', plan: 'free', type: 'number' },
        { key: 'external_order_id', label: 'Zewnętrzny ID',        group: 'Podstawowe',   plan: 'basic', type: 'text' },
        { key: 'date_add',         label: 'Data dodania',          group: 'Podstawowe',   plan: 'free',  type: 'date' },
        { key: 'date_confirmed',   label: 'Data potwierdzenia',    group: 'Podstawowe',   plan: 'free',  type: 'date' },
        { key: 'order_status_id',  label: 'Status',                group: 'Podstawowe',   plan: 'free',  type: 'select', source: 'order-statuses' },
        { key: 'order_source',     label: 'Źródło zamówienia',     group: 'Podstawowe',   plan: 'basic', type: 'select', source: 'order-sources' },
        { key: 'order_source_id',  label: 'ID źródła',             group: 'Podstawowe',   plan: 'basic', type: 'number' },
        { key: 'confirmed',        label: 'Potwierdzone',          group: 'Podstawowe',   plan: 'free',  type: 'boolean' },

        // Dane klienta
        { key: 'email',              label: 'Email',                      group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'phone',              label: 'Telefon',                    group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'user_login',         label: 'Login użytkownika',          group: 'Dane klienta', plan: 'basic', type: 'text' },
        { key: 'delivery_fullname',  label: 'Imię i nazwisko (dostawa)',  group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_company',   label: 'Firma (dostawa)',            group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_address',   label: 'Adres (dostawa)',            group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_city',      label: 'Miasto (dostawa)',           group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_postcode',  label: 'Kod pocztowy (dostawa)',     group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_state',     label: 'Województwo (dostawa)',      group: 'Dane klienta', plan: 'basic', type: 'text' },
        { key: 'delivery_country',   label: 'Kraj (dostawa)',             group: 'Dane klienta', plan: 'free',  type: 'text' },
        { key: 'delivery_country_code', label: 'Kod kraju (dostawa)',     group: 'Dane klienta', plan: 'basic', type: 'text' },

        // Punkt odbioru
        { key: 'delivery_point_id',       label: 'ID punktu odbioru',      group: 'Punkt odbioru', plan: 'basic', type: 'text' },
        { key: 'delivery_point_name',     label: 'Nazwa punktu odbioru',   group: 'Punkt odbioru', plan: 'basic', type: 'text' },
        { key: 'delivery_point_address',  label: 'Adres punktu odbioru',   group: 'Punkt odbioru', plan: 'basic', type: 'text' },
        { key: 'delivery_point_postcode', label: 'Kod poczt. punktu',      group: 'Punkt odbioru', plan: 'basic', type: 'text' },
        { key: 'delivery_point_city',     label: 'Miasto punktu odbioru',  group: 'Punkt odbioru', plan: 'basic', type: 'text' },

        // Płatność i dostawa
        { key: 'currency',           label: 'Waluta',              group: 'Płatność', plan: 'free',  type: 'text' },
        { key: 'payment_method',     label: 'Metoda płatności',    group: 'Płatność', plan: 'free',  type: 'text' },
        { key: 'payment_method_cod', label: 'Za pobraniem',        group: 'Płatność', plan: 'free',  type: 'boolean' },
        { key: 'payment_done',       label: 'Zapłacono',           group: 'Płatność', plan: 'free',  type: 'number' },
        { key: 'delivery_method',    label: 'Metoda dostawy',      group: 'Płatność', plan: 'free',  type: 'text' },
        { key: 'delivery_method_id', label: 'ID metody dostawy',   group: 'Płatność', plan: 'basic', type: 'number' },
        { key: 'delivery_price',     label: 'Cena dostawy',        group: 'Płatność', plan: 'pro',   type: 'number' },

        // Wysyłka
        { key: 'delivery_package_module', label: 'Moduł kuriera',    group: 'Wysyłka', plan: 'basic', type: 'text' },
        { key: 'delivery_package_nr',     label: 'Numer przesyłki',  group: 'Wysyłka', plan: 'basic', type: 'text' },

        // Dane do faktury (PRO)
        { key: 'invoice_fullname',  label: 'Dane do faktury - Nazwa',    group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_company',   label: 'Dane do faktury - Firma',    group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_nip',       label: 'NIP',                        group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_address',   label: 'Adres (faktura)',            group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_postcode',  label: 'Kod pocztowy (faktura)',     group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_city',      label: 'Miasto (faktura)',           group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_state',     label: 'Województwo (faktura)',      group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_country',   label: 'Kraj (faktura)',             group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'invoice_country_code', label: 'Kod kraju (faktura)',     group: 'Faktura', plan: 'pro', type: 'text' },
        { key: 'want_invoice',      label: 'Chce fakturę',               group: 'Faktura', plan: 'pro', type: 'boolean' },

        // Komentarze i inne
        { key: 'user_comments',  label: 'Komentarz klienta',     group: 'Komentarze', plan: 'basic', type: 'text' },
        { key: 'admin_comments', label: 'Komentarz wewnętrzny',  group: 'Komentarze', plan: 'pro',   type: 'text' },
        { key: 'extra_field_1',  label: 'Pole dodatkowe 1',      group: 'Komentarze', plan: 'pro',   type: 'text' },
        { key: 'extra_field_2',  label: 'Pole dodatkowe 2',      group: 'Komentarze', plan: 'pro',   type: 'text' },

        // Status zamówienia
        { key: 'order_page',   label: 'Strona zamówienia',   group: 'Status', plan: 'basic', type: 'text' },
        { key: 'pick_state',   label: 'Status kompletacji',  group: 'Status', plan: 'basic', type: 'number' },
        { key: 'pack_state',   label: 'Status pakowania',    group: 'Status', plan: 'basic', type: 'number' },
      ]
    },

    // ----------------------------------------
    // PRODUKTY (products)
    // ----------------------------------------
    products: {
      label: 'Produkty',
      plan: 'basic',
      apiMethod: 'getInventoryProductsList',
      fields: [
        // Podstawowe
        { key: 'product_id',     label: 'ID produktu',      group: 'Podstawowe', plan: 'basic', type: 'number' },
        { key: 'name',           label: 'Nazwa produktu',   group: 'Podstawowe', plan: 'basic', type: 'text' },
        { key: 'ean',            label: 'EAN',              group: 'Podstawowe', plan: 'basic', type: 'text' },
        { key: 'sku',            label: 'SKU',              group: 'Podstawowe', plan: 'basic', type: 'text' },
        { key: 'price_brutto',   label: 'Cena brutto',      group: 'Podstawowe', plan: 'basic', type: 'number' },

        // Magazyn
        { key: 'quantity',       label: 'Ilość',            group: 'Magazyn', plan: 'basic', type: 'number' },
        { key: 'stock',          label: 'Stan magazynowy',  group: 'Magazyn', plan: 'basic', type: 'number' },
        { key: 'location',       label: 'Lokalizacja',      group: 'Magazyn', plan: 'basic', type: 'text' },
        { key: 'weight',         label: 'Waga (kg)',        group: 'Magazyn', plan: 'basic', type: 'number' },

        // Szczegóły
        { key: 'manufacturer',   label: 'Producent',        group: 'Szczegóły', plan: 'pro', type: 'text' },
        { key: 'category',       label: 'Kategoria',        group: 'Szczegóły', plan: 'pro', type: 'text' },
        { key: 'description',    label: 'Opis',             group: 'Szczegóły', plan: 'pro', type: 'text' },

        // Finansowe
        { key: 'tax_rate',       label: 'Stawka VAT',       group: 'Finansowe', plan: 'pro', type: 'number' },
        { key: 'purchase_price', label: 'Cena zakupu',      group: 'Finansowe', plan: 'pro', type: 'number' },
        { key: 'profit_margin',  label: 'Marża (%)',        group: 'Finansowe', plan: 'pro', type: 'number' },
      ]
    },

    // ----------------------------------------
    // FAKTURY (invoices) - NOWY
    // ----------------------------------------
    invoices: {
      label: 'Faktury',
      plan: 'pro',
      apiMethod: 'getInvoices',
      fields: [
        // Podstawowe
        { key: 'invoice_id',         label: 'ID faktury',         group: 'Podstawowe', plan: 'pro', type: 'number' },
        { key: 'order_id',           label: 'ID zamówienia',      group: 'Podstawowe', plan: 'pro', type: 'number' },
        { key: 'series_id',          label: 'ID serii',           group: 'Podstawowe', plan: 'pro', type: 'number' },
        { key: 'number',             label: 'Numer faktury',      group: 'Podstawowe', plan: 'pro', type: 'text' },
        { key: 'type',               label: 'Typ',                group: 'Podstawowe', plan: 'pro', type: 'select',
          options: [
            { value: 'normal', label: 'Zwykła' },
            { value: 'correcting', label: 'Korygująca' }
          ]
        },

        // Numeracja
        { key: 'sub_id',   label: 'Numer w miesiącu/roku', group: 'Numeracja', plan: 'pro', type: 'number' },
        { key: 'month',    label: 'Miesiąc',               group: 'Numeracja', plan: 'pro', type: 'number' },
        { key: 'year',     label: 'Rok',                   group: 'Numeracja', plan: 'pro', type: 'number' },
        { key: 'postfix',  label: 'Sufiks',                group: 'Numeracja', plan: 'pro', type: 'text' },

        // Daty
        { key: 'date_add',     label: 'Data wystawienia',   group: 'Daty', plan: 'pro', type: 'date' },
        { key: 'date_sell',    label: 'Data sprzedaży',     group: 'Daty', plan: 'pro', type: 'date' },
        { key: 'date_pay_to',  label: 'Termin płatności',   group: 'Daty', plan: 'pro', type: 'date' },

        // Finansowe
        { key: 'currency',           label: 'Waluta',             group: 'Finansowe', plan: 'pro', type: 'text' },
        { key: 'total_price_brutto', label: 'Suma brutto',        group: 'Finansowe', plan: 'pro', type: 'number' },
        { key: 'total_price_netto',  label: 'Suma netto',         group: 'Finansowe', plan: 'pro', type: 'number' },
        { key: 'payment',            label: 'Metoda płatności',   group: 'Finansowe', plan: 'pro', type: 'text' },
        { key: 'additional_info',    label: 'Dodatkowe info',     group: 'Finansowe', plan: 'pro', type: 'text' },

        // Przewalutowanie
        { key: 'exchange_currency',  label: 'Waluta przewalutowania', group: 'Przewalutowanie', plan: 'pro', type: 'text' },
        { key: 'exchange_rate',      label: 'Kurs wymiany',           group: 'Przewalutowanie', plan: 'pro', type: 'number' },
        { key: 'exchange_date',      label: 'Data kursu',             group: 'Przewalutowanie', plan: 'pro', type: 'text' },
        { key: 'exchange_info',      label: 'Info o kursie',          group: 'Przewalutowanie', plan: 'pro', type: 'text' },

        // Nabywca
        { key: 'invoice_fullname',     label: 'Nabywca - Nazwa',         group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_company',      label: 'Nabywca - Firma',         group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_nip',          label: 'Nabywca - NIP',           group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_address',      label: 'Nabywca - Adres',         group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_postcode',     label: 'Nabywca - Kod pocztowy',  group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_city',         label: 'Nabywca - Miasto',        group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_country',      label: 'Nabywca - Kraj',          group: 'Nabywca', plan: 'pro', type: 'text' },
        { key: 'invoice_country_code', label: 'Nabywca - Kod kraju',     group: 'Nabywca', plan: 'pro', type: 'text' },

        // Sprzedawca
        { key: 'seller',  label: 'Sprzedawca',      group: 'Sprzedawca', plan: 'pro', type: 'text' },
        { key: 'issuer',  label: 'Wystawca',        group: 'Sprzedawca', plan: 'pro', type: 'text' },

        // Korekta
        { key: 'correcting_to_invoice_id', label: 'ID korygowanej faktury',  group: 'Korekta', plan: 'pro', type: 'number' },
        { key: 'correcting_reason',        label: 'Powód korekty',           group: 'Korekta', plan: 'pro', type: 'text' },
        { key: 'correcting_items',         label: 'Korekta pozycji',         group: 'Korekta', plan: 'pro', type: 'boolean' },
        { key: 'correcting_data',          label: 'Korekta danych nabywcy',  group: 'Korekta', plan: 'pro', type: 'boolean' },

        // Zewnętrzne
        { key: 'external_invoice_number', label: 'Zewnętrzny numer faktury', group: 'Zewnętrzne', plan: 'pro', type: 'text' },
        { key: 'external_id',             label: 'Zewnętrzne ID',            group: 'Zewnętrzne', plan: 'pro', type: 'number' },
      ]
    },

    // ----------------------------------------
    // PRODUKTY W ZAMÓWIENIU (order_products) - NOWY
    // ----------------------------------------
    order_products: {
      label: 'Produkty w zamówieniu',
      plan: 'basic',
      apiMethod: 'getOrders', // Pobieramy z getOrders i rozwijamy tablicę products
      expandFrom: 'products', // Wskazuje, że dane są zagnieżdżone
      fields: [
        // Kontekst zamówienia
        { key: 'order_id',         label: 'ID zamówienia',       group: 'Zamówienie', plan: 'basic', type: 'number' },
        { key: 'date_add',         label: 'Data zamówienia',     group: 'Zamówienie', plan: 'basic', type: 'date' },
        { key: 'date_confirmed',   label: 'Data potwierdzenia',  group: 'Zamówienie', plan: 'basic', type: 'date' },
        { key: 'order_status_id',  label: 'Status zamówienia',   group: 'Zamówienie', plan: 'basic', type: 'select', source: 'order-statuses' },
        { key: 'order_source',     label: 'Źródło zamówienia',   group: 'Zamówienie', plan: 'basic', type: 'select', source: 'order-sources' },
        { key: 'email',            label: 'Email klienta',       group: 'Zamówienie', plan: 'basic', type: 'text' },
        { key: 'delivery_fullname', label: 'Klient',             group: 'Zamówienie', plan: 'basic', type: 'text' },

        // Produkt
        { key: 'order_product_id', label: 'ID pozycji',          group: 'Produkt', plan: 'basic', type: 'number' },
        { key: 'product_id',       label: 'ID produktu',         group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'variant_id',       label: 'ID wariantu',         group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'name',             label: 'Nazwa produktu',      group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'sku',              label: 'SKU',                 group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'ean',              label: 'EAN',                 group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'attributes',       label: 'Atrybuty/Wariant',    group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'location',         label: 'Lokalizacja',         group: 'Produkt', plan: 'basic', type: 'text' },
        { key: 'auction_id',       label: 'ID aukcji',           group: 'Produkt', plan: 'basic', type: 'text' },

        // Ilość i cena
        { key: 'quantity',     label: 'Ilość',        group: 'Wartość', plan: 'basic', type: 'number' },
        { key: 'price_brutto', label: 'Cena brutto',  group: 'Wartość', plan: 'basic', type: 'number' },
        { key: 'tax_rate',     label: 'Stawka VAT',   group: 'Wartość', plan: 'pro',   type: 'number' },
        { key: 'weight',       label: 'Waga',         group: 'Wartość', plan: 'pro',   type: 'number' },

        // Magazyn
        { key: 'storage',       label: 'Typ magazynu',   group: 'Magazyn', plan: 'pro', type: 'text' },
        { key: 'storage_id',    label: 'ID magazynu',    group: 'Magazyn', plan: 'pro', type: 'number' },
        { key: 'warehouse_id',  label: 'ID hurtowni',    group: 'Magazyn', plan: 'pro', type: 'number' },
        { key: 'bundle_id',     label: 'ID zestawu',     group: 'Magazyn', plan: 'pro', type: 'number' },
      ]
    }
  },

  // ============================================
  // FUNKCJE POMOCNICZE
  // ============================================

  /**
   * Pobiera pola dostępne dla danego planu
   * @param {string} dataset - Nazwa datasetu
   * @param {string} userPlan - Plan użytkownika (free/basic/pro)
   * @returns {Array} Pola dostępne dla planu
   */
  getFieldsForPlan(dataset, userPlan) {
    const datasetConfig = this.datasets[dataset];
    if (!datasetConfig) return [];

    const userLevel = planHierarchy[userPlan] || 0;

    return datasetConfig.fields.filter(field => {
      const fieldLevel = planHierarchy[field.plan] || 0;
      return fieldLevel <= userLevel;
    });
  },

  /**
   * Pobiera operatory dostępne dla danego planu
   * @param {string} userPlan - Plan użytkownika
   * @returns {Array} Operatory z kluczami
   */
  getOperatorsForPlan(userPlan) {
    const userLevel = planHierarchy[userPlan] || 0;

    return Object.entries(this.operators)
      .filter(([key, op]) => {
        const opLevel = planHierarchy[op.plan] || 0;
        return opLevel <= userLevel;
      })
      .map(([key, op]) => ({ key, ...op }));
  },

  /**
   * Pobiera operatory dla danego typu pola
   * @param {string} fieldType - Typ pola (text, number, date, select, boolean)
   * @param {string} userPlan - Plan użytkownika
   * @returns {Array} Operatory dostępne dla typu pola i planu
   */
  getOperatorsForFieldType(fieldType, userPlan) {
    const userLevel = planHierarchy[userPlan] || 0;

    return Object.entries(this.operators)
      .filter(([key, op]) => {
        const opLevel = planHierarchy[op.plan] || 0;
        return opLevel <= userLevel && op.types.includes(fieldType);
      })
      .map(([key, op]) => ({ key, ...op }));
  },

  /**
   * Sprawdza czy dataset jest dostępny dla planu
   * @param {string} dataset - Nazwa datasetu
   * @param {string} userPlan - Plan użytkownika
   * @returns {boolean}
   */
  isDatasetAvailable(dataset, userPlan) {
    const datasetConfig = this.datasets[dataset];
    if (!datasetConfig) return false;

    const datasetLevel = planHierarchy[datasetConfig.plan] || 0;
    const userLevel = planHierarchy[userPlan] || 0;

    return datasetLevel <= userLevel;
  },

  /**
   * Pobiera pełną konfigurację dla endpointu field-definitions
   * @param {string} userPlan - Plan użytkownika
   * @returns {object} Konfiguracja z operatorami i datasetami
   */
  getFullConfig(userPlan) {
    const userLevel = planHierarchy[userPlan] || 0;

    const result = {
      operators: this.getOperatorsForPlan(userPlan),
      datasets: {}
    };

    for (const [key, dataset] of Object.entries(this.datasets)) {
      const datasetLevel = planHierarchy[dataset.plan] || 0;
      const isAvailable = datasetLevel <= userLevel;

      result.datasets[key] = {
        label: dataset.label,
        available: isAvailable,
        requiredPlan: dataset.plan,
        fields: this.getFieldsForPlan(key, userPlan).map(f => ({
          ...f,
          available: true
        })),
        // Pola niedostępne (do pokazania z lockiem)
        lockedFields: isAvailable ? dataset.fields
          .filter(f => {
            const fLevel = planHierarchy[f.plan] || 0;
            return fLevel > userLevel;
          })
          .map(f => ({ ...f, available: false })) : []
      };
    }

    return result;
  },

  /**
   * Waliduje wybrane pola przeciwko planowi użytkownika
   * @param {string} dataset - Nazwa datasetu
   * @param {Array<string>} selectedFields - Lista kluczy wybranych pól
   * @param {string} userPlan - Plan użytkownika
   * @returns {object} { valid: boolean, blockedFields: Array, requiredPlan: string }
   */
  validateFieldsForPlan(dataset, selectedFields, userPlan) {
    const datasetConfig = this.datasets[dataset];
    if (!datasetConfig) {
      return { valid: false, error: 'Unknown dataset', blockedFields: [] };
    }

    const userLevel = planHierarchy[userPlan] || 0;
    const blockedFields = [];
    let requiredPlan = userPlan;

    for (const fieldKey of selectedFields) {
      const field = datasetConfig.fields.find(f => f.key === fieldKey);
      if (field) {
        const fieldLevel = planHierarchy[field.plan] || 0;
        if (fieldLevel > userLevel) {
          blockedFields.push({
            key: field.key,
            label: field.label,
            requiredPlan: field.plan
          });
          // Track highest required plan
          if (planHierarchy[field.plan] > planHierarchy[requiredPlan]) {
            requiredPlan = field.plan;
          }
        }
      }
    }

    return {
      valid: blockedFields.length === 0,
      blockedFields,
      requiredPlan: blockedFields.length > 0 ? requiredPlan : userPlan
    };
  },

  /**
   * Waliduje filtry przeciwko planowi użytkownika
   * @param {object} filterConfig - Konfiguracja filtrów
   * @param {string} userPlan - Plan użytkownika
   * @returns {object} { valid: boolean, blockedOperators: Array }
   */
  validateFiltersForPlan(filterConfig, userPlan) {
    if (!filterConfig || !filterConfig.groups) {
      return { valid: true, blockedOperators: [] };
    }

    const userLevel = planHierarchy[userPlan] || 0;
    const blockedOperators = [];

    for (const group of filterConfig.groups) {
      for (const condition of group.conditions || []) {
        const operator = this.operators[condition.operator];
        if (operator) {
          const opLevel = planHierarchy[operator.plan] || 0;
          if (opLevel > userLevel) {
            blockedOperators.push({
              operator: condition.operator,
              label: operator.label,
              requiredPlan: operator.plan
            });
          }
        }
      }
    }

    return {
      valid: blockedOperators.length === 0,
      blockedOperators
    };
  }
};
