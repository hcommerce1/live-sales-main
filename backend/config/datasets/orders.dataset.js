/**
 * Dataset: ZAMÓWIENIA (orders)
 *
 * Lista zamówień z danymi o konkretnym zamówieniu.
 * Jeden wiersz = jedno zamówienie.
 *
 * API: getOrders
 */

module.exports = {
  id: 'orders',
  label: 'Zamówienia',
  description: 'Lista zamówień z danymi o konkretnym zamówieniu',
  icon: 'shopping-cart',

  // Główne zapytanie API
  primaryQuery: 'getOrders',

  // Dostępne wzbogacenia
  enrichments: ['packages', 'documents', 'currency'],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // 1.1 PODSTAWOWE
    // ========================================
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Unikalny identyfikator zamówienia w BaseLinker' },
        { key: 'shop_order_id', label: 'ID zamówienia w sklepie', type: 'text', description: 'Numer zamówienia nadany przez sklep/marketplace' },
        { key: 'external_order_id', label: 'Zewnętrzne ID', type: 'text', description: 'Identyfikator z zewnętrznego systemu (np. ERP)' },
        { key: 'order_source', label: 'Źródło zamówienia', type: 'text', description: 'Nazwa platformy sprzedażowej (Allegro, sklep własny, etc.)' },
        { key: 'order_source_id', label: 'ID źródła', type: 'number', description: 'Wewnętrzny identyfikator źródła w BaseLinker' },
        { key: 'order_source_info', label: 'Dodatkowe info o źródle', type: 'text', description: 'Szczegółowe informacje o źródle (np. nazwa konta Allegro)' },
        { key: 'order_status_id', label: 'ID statusu', type: 'number', description: 'Identyfikator aktualnego statusu zamówienia' },
        { key: 'order_status_name', label: 'Nazwa statusu', type: 'text', description: 'Nazwa statusu (np. "Nowe", "W realizacji", "Wysłane")', computed: true },
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Data i godzina utworzenia zamówienia' },
        { key: 'date_confirmed', label: 'Data potwierdzenia', type: 'datetime', description: 'Data i godzina potwierdzenia zamówienia' },
        { key: 'date_in_status', label: 'Data zmiany statusu', type: 'datetime', description: 'Data ostatniej zmiany statusu' },
        { key: 'confirmed', label: 'Potwierdzone', type: 'boolean', description: 'Czy zamówienie jest potwierdzone (tak/nie)' },
        { key: 'want_invoice', label: 'Chce fakturę', type: 'boolean', description: 'Czy klient zaznaczył chęć otrzymania faktury' },
        { key: 'admin_comments', label: 'Komentarz wewnętrzny', type: 'text', description: 'Notatki widoczne tylko dla obsługi' },
        { key: 'user_comments', label: 'Komentarz klienta', type: 'text', description: 'Uwagi dodane przez klienta przy zamówieniu' },
        { key: 'user_login', label: 'Login klienta', type: 'text', description: 'Nazwa użytkownika klienta na platformie' }
      ]
    },

    // ========================================
    // 1.2 DANE KLIENTA
    // ========================================
    {
      id: 'customer',
      label: 'Dane klienta',
      fields: [
        { key: 'email', label: 'Email klienta', type: 'text', description: 'Adres email do kontaktu z klientem' },
        { key: 'phone', label: 'Telefon klienta', type: 'text', description: 'Numer telefonu klienta' }
      ]
    },

    // ========================================
    // 1.3 ADRES DOSTAWY
    // ========================================
    {
      id: 'delivery_address',
      label: 'Adres dostawy',
      fields: [
        { key: 'delivery_fullname', label: 'Odbiorca - imię i nazwisko', type: 'text', description: 'Pełne imię i nazwisko osoby odbierającej przesyłkę' },
        { key: 'delivery_company', label: 'Odbiorca - firma', type: 'text', description: 'Nazwa firmy odbiorcy (jeśli dostawa na firmę)' },
        { key: 'delivery_address', label: 'Odbiorca - adres', type: 'text', description: 'Ulica i numer domu/mieszkania' },
        { key: 'delivery_city', label: 'Odbiorca - miasto', type: 'text', description: 'Miasto dostawy' },
        { key: 'delivery_postcode', label: 'Odbiorca - kod pocztowy', type: 'text', description: 'Kod pocztowy adresu dostawy' },
        { key: 'delivery_state_code', label: 'Odbiorca - województwo', type: 'text', description: 'Kod województwa/stanu' },
        { key: 'delivery_country', label: 'Odbiorca - kraj', type: 'text', description: 'Pełna nazwa kraju dostawy' },
        { key: 'delivery_country_code', label: 'Odbiorca - kod kraju', type: 'text', description: 'Dwuliterowy kod kraju (PL, DE, CZ, etc.)' }
      ]
    },

    // ========================================
    // 1.4 PUNKT ODBIORU
    // ========================================
    {
      id: 'pickup_point',
      label: 'Punkt odbioru',
      fields: [
        { key: 'delivery_point_id', label: 'Punkt odbioru - ID', type: 'text', description: 'Identyfikator punktu (np. kod paczkomatu)' },
        { key: 'delivery_point_name', label: 'Punkt odbioru - nazwa', type: 'text', description: 'Nazwa punktu odbioru' },
        { key: 'delivery_point_address', label: 'Punkt odbioru - adres', type: 'text', description: 'Pełny adres punktu odbioru' },
        { key: 'delivery_point_postcode', label: 'Punkt odbioru - kod', type: 'text', description: 'Kod pocztowy punktu' },
        { key: 'delivery_point_city', label: 'Punkt odbioru - miasto', type: 'text', description: 'Miasto punktu odbioru' }
      ]
    },

    // ========================================
    // 1.5 DANE DO FAKTURY
    // ========================================
    {
      id: 'invoice_data',
      label: 'Dane do faktury',
      fields: [
        { key: 'invoice_fullname', label: 'Faktura - imię i nazwisko', type: 'text', description: 'Dane do faktury: imię i nazwisko' },
        { key: 'invoice_company', label: 'Faktura - firma', type: 'text', description: 'Dane do faktury: nazwa firmy' },
        { key: 'invoice_nip', label: 'Faktura - NIP', type: 'text', description: 'Numer NIP do faktury' },
        { key: 'invoice_address', label: 'Faktura - adres', type: 'text', description: 'Adres do faktury' },
        { key: 'invoice_city', label: 'Faktura - miasto', type: 'text', description: 'Miasto do faktury' },
        { key: 'invoice_postcode', label: 'Faktura - kod pocztowy', type: 'text', description: 'Kod pocztowy do faktury' },
        { key: 'invoice_state_code', label: 'Faktura - województwo', type: 'text', description: 'Województwo do faktury' },
        { key: 'invoice_country', label: 'Faktura - kraj', type: 'text', description: 'Kraj do faktury' },
        { key: 'invoice_country_code', label: 'Faktura - kod kraju', type: 'text', description: 'Kod kraju do faktury' }
      ]
    },

    // ========================================
    // 1.6 PŁATNOŚĆ
    // ========================================
    {
      id: 'payment',
      label: 'Płatność',
      fields: [
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Kod waluty zamówienia (PLN, EUR, USD, etc.)' },
        { key: 'payment_method', label: 'Metoda płatności', type: 'text', description: 'Sposób płatności (przelew, karta, pobranie, etc.)' },
        { key: 'payment_method_cod', label: 'Pobranie', type: 'boolean', description: 'Czy zamówienie jest za pobraniem' },
        { key: 'payment_done', label: 'Zapłacono', type: 'number', description: 'Kwota już zapłacona przez klienta' },
        { key: 'payment_status', label: 'Status płatności', type: 'text', description: 'Opłacone / Nieopłacone / Częściowo opłacone', computed: true },
        { key: 'payment_date', label: 'Data płatności', type: 'datetime', description: 'Data otrzymania płatności' }
      ]
    },

    // ========================================
    // 1.7 DOSTAWA
    // ========================================
    {
      id: 'delivery',
      label: 'Dostawa',
      fields: [
        { key: 'delivery_method', label: 'Metoda dostawy', type: 'text', description: 'Nazwa wybranej metody dostawy' },
        { key: 'delivery_price_brutto', label: 'Koszt dostawy brutto', type: 'number', description: 'Cena dostawy z VAT' },
        { key: 'delivery_price_netto', label: 'Koszt dostawy netto', type: 'number', description: 'Cena dostawy bez VAT', computed: true },
        { key: 'delivery_vat_rate', label: 'VAT dostawy', type: 'number', description: 'Stawka VAT na dostawę (23, 8, 0, etc.)' },
        { key: 'delivery_package_module', label: 'Moduł kuriera', type: 'text', description: 'Kod integracji kurierskiej (inpost, dpd, etc.)' }
      ]
    },

    // ========================================
    // 1.8 WARTOŚCI ZAMÓWIENIA
    // ========================================
    {
      id: 'order_values',
      label: 'Wartości zamówienia',
      fields: [
        { key: 'products_value_brutto', label: 'Wartość produktów brutto', type: 'number', description: 'Suma wartości produktów z VAT', computed: true },
        { key: 'products_value_netto', label: 'Wartość produktów netto', type: 'number', description: 'Suma wartości produktów bez VAT', computed: true },
        { key: 'order_value_brutto', label: 'Wartość zamówienia brutto', type: 'number', description: 'Całkowita wartość zamówienia z VAT (produkty + dostawa)', computed: true },
        { key: 'order_value_netto', label: 'Wartość zamówienia netto', type: 'number', description: 'Całkowita wartość zamówienia bez VAT', computed: true },
        { key: 'products_count', label: 'Liczba pozycji', type: 'number', description: 'Ile różnych produktów w zamówieniu', computed: true },
        { key: 'products_quantity', label: 'Łączna ilość sztuk', type: 'number', description: 'Suma ilości wszystkich produktów', computed: true }
      ]
    },

    // ========================================
    // 1.9 PODSUMOWANIE PRODUKTÓW (AGREGOWANE)
    // ========================================
    {
      id: 'products_summary',
      label: 'Podsumowanie produktów',
      fields: [
        { key: 'products_weight', label: 'Łączna waga', type: 'number', description: 'Suma wag wszystkich produktów w kg', computed: true, enrichment: 'inventory' },
        { key: 'products_purchase_value', label: 'Wartość zakupu', type: 'number', description: 'Suma kosztów zakupu produktów (jeśli uzupełnione w magazynie)', computed: true, enrichment: 'inventory' },
        { key: 'products_margin', label: 'Marża', type: 'number', description: 'Różnica między ceną sprzedaży a kosztem zakupu', computed: true, enrichment: 'inventory' },
        { key: 'products_margin_percent', label: 'Marża %', type: 'number', description: 'Procentowa marża na zamówieniu', computed: true, enrichment: 'inventory' }
      ]
    },

    // ========================================
    // 1.10 PRZESYŁKI (MAX 5 PACZEK)
    // ========================================
    {
      id: 'packages',
      label: 'Przesyłki',
      enrichment: 'packages',
      fields: [
        // Podsumowanie
        { key: 'packages_count', label: 'Liczba przesyłek', type: 'number', description: 'Ile paczek utworzono (0-5)', enrichment: 'packages' },

        // PRZESYŁKA 1
        { key: 'pkg1_id', label: 'Przesyłka 1 - ID', type: 'number', description: 'Identyfikator pierwszej przesyłki', enrichment: 'packages' },
        { key: 'pkg1_courier_code', label: 'Przesyłka 1 - kod kuriera', type: 'text', description: 'Kod integracji (inpost, dpd, dhl)', enrichment: 'packages' },
        { key: 'pkg1_courier_name', label: 'Przesyłka 1 - kurier', type: 'text', description: 'Nazwa firmy kurierskiej', enrichment: 'packages' },
        { key: 'pkg1_tracking_number', label: 'Przesyłka 1 - numer śledzenia', type: 'text', description: 'Numer do trackingu', enrichment: 'packages' },
        { key: 'pkg1_tracking_url', label: 'Przesyłka 1 - link śledzenia', type: 'text', description: 'URL do śledzenia', enrichment: 'packages' },
        { key: 'pkg1_status', label: 'Przesyłka 1 - status', type: 'text', description: 'Aktualny status', enrichment: 'packages' },
        { key: 'pkg1_date_add', label: 'Przesyłka 1 - data utworzenia', type: 'datetime', description: 'Kiedy utworzono', enrichment: 'packages' },
        { key: 'pkg1_date_sent', label: 'Przesyłka 1 - data nadania', type: 'datetime', description: 'Kiedy nadano', enrichment: 'packages' },
        { key: 'pkg1_date_delivered', label: 'Przesyłka 1 - data doręczenia', type: 'datetime', description: 'Kiedy doręczono', enrichment: 'packages' },
        { key: 'pkg1_weight', label: 'Przesyłka 1 - waga', type: 'number', description: 'Waga w kg', enrichment: 'packages' },
        { key: 'pkg1_cod_value', label: 'Przesyłka 1 - pobranie', type: 'number', description: 'Kwota COD', enrichment: 'packages' },
        { key: 'pkg1_is_delivered', label: 'Przesyłka 1 - doręczona', type: 'boolean', description: 'Czy doręczono', enrichment: 'packages' },

        // PRZESYŁKA 2
        { key: 'pkg2_id', label: 'Przesyłka 2 - ID', type: 'number', description: 'Identyfikator drugiej przesyłki', enrichment: 'packages' },
        { key: 'pkg2_courier_code', label: 'Przesyłka 2 - kod kuriera', type: 'text', description: 'Kod integracji', enrichment: 'packages' },
        { key: 'pkg2_courier_name', label: 'Przesyłka 2 - kurier', type: 'text', description: 'Nazwa kuriera', enrichment: 'packages' },
        { key: 'pkg2_tracking_number', label: 'Przesyłka 2 - numer śledzenia', type: 'text', description: 'Numer trackingu', enrichment: 'packages' },
        { key: 'pkg2_tracking_url', label: 'Przesyłka 2 - link śledzenia', type: 'text', description: 'URL śledzenia', enrichment: 'packages' },
        { key: 'pkg2_status', label: 'Przesyłka 2 - status', type: 'text', description: 'Status', enrichment: 'packages' },
        { key: 'pkg2_date_add', label: 'Przesyłka 2 - data utworzenia', type: 'datetime', description: 'Data utworzenia', enrichment: 'packages' },
        { key: 'pkg2_date_sent', label: 'Przesyłka 2 - data nadania', type: 'datetime', description: 'Data nadania', enrichment: 'packages' },
        { key: 'pkg2_date_delivered', label: 'Przesyłka 2 - data doręczenia', type: 'datetime', description: 'Data doręczenia', enrichment: 'packages' },
        { key: 'pkg2_weight', label: 'Przesyłka 2 - waga', type: 'number', description: 'Waga', enrichment: 'packages' },
        { key: 'pkg2_cod_value', label: 'Przesyłka 2 - pobranie', type: 'number', description: 'COD', enrichment: 'packages' },
        { key: 'pkg2_is_delivered', label: 'Przesyłka 2 - doręczona', type: 'boolean', description: 'Doręczona', enrichment: 'packages' },

        // PRZESYŁKA 3
        { key: 'pkg3_id', label: 'Przesyłka 3 - ID', type: 'number', description: 'Identyfikator trzeciej przesyłki', enrichment: 'packages' },
        { key: 'pkg3_courier_code', label: 'Przesyłka 3 - kod kuriera', type: 'text', description: 'Kod integracji', enrichment: 'packages' },
        { key: 'pkg3_courier_name', label: 'Przesyłka 3 - kurier', type: 'text', description: 'Nazwa kuriera', enrichment: 'packages' },
        { key: 'pkg3_tracking_number', label: 'Przesyłka 3 - numer śledzenia', type: 'text', description: 'Numer trackingu', enrichment: 'packages' },
        { key: 'pkg3_tracking_url', label: 'Przesyłka 3 - link śledzenia', type: 'text', description: 'URL śledzenia', enrichment: 'packages' },
        { key: 'pkg3_status', label: 'Przesyłka 3 - status', type: 'text', description: 'Status', enrichment: 'packages' },
        { key: 'pkg3_date_add', label: 'Przesyłka 3 - data utworzenia', type: 'datetime', description: 'Data utworzenia', enrichment: 'packages' },
        { key: 'pkg3_date_sent', label: 'Przesyłka 3 - data nadania', type: 'datetime', description: 'Data nadania', enrichment: 'packages' },
        { key: 'pkg3_date_delivered', label: 'Przesyłka 3 - data doręczenia', type: 'datetime', description: 'Data doręczenia', enrichment: 'packages' },
        { key: 'pkg3_weight', label: 'Przesyłka 3 - waga', type: 'number', description: 'Waga', enrichment: 'packages' },
        { key: 'pkg3_cod_value', label: 'Przesyłka 3 - pobranie', type: 'number', description: 'COD', enrichment: 'packages' },
        { key: 'pkg3_is_delivered', label: 'Przesyłka 3 - doręczona', type: 'boolean', description: 'Doręczona', enrichment: 'packages' },

        // PRZESYŁKA 4
        { key: 'pkg4_id', label: 'Przesyłka 4 - ID', type: 'number', description: 'Identyfikator czwartej przesyłki', enrichment: 'packages' },
        { key: 'pkg4_courier_code', label: 'Przesyłka 4 - kod kuriera', type: 'text', description: 'Kod integracji', enrichment: 'packages' },
        { key: 'pkg4_courier_name', label: 'Przesyłka 4 - kurier', type: 'text', description: 'Nazwa kuriera', enrichment: 'packages' },
        { key: 'pkg4_tracking_number', label: 'Przesyłka 4 - numer śledzenia', type: 'text', description: 'Numer trackingu', enrichment: 'packages' },
        { key: 'pkg4_tracking_url', label: 'Przesyłka 4 - link śledzenia', type: 'text', description: 'URL śledzenia', enrichment: 'packages' },
        { key: 'pkg4_status', label: 'Przesyłka 4 - status', type: 'text', description: 'Status', enrichment: 'packages' },
        { key: 'pkg4_date_add', label: 'Przesyłka 4 - data utworzenia', type: 'datetime', description: 'Data utworzenia', enrichment: 'packages' },
        { key: 'pkg4_date_sent', label: 'Przesyłka 4 - data nadania', type: 'datetime', description: 'Data nadania', enrichment: 'packages' },
        { key: 'pkg4_date_delivered', label: 'Przesyłka 4 - data doręczenia', type: 'datetime', description: 'Data doręczenia', enrichment: 'packages' },
        { key: 'pkg4_weight', label: 'Przesyłka 4 - waga', type: 'number', description: 'Waga', enrichment: 'packages' },
        { key: 'pkg4_cod_value', label: 'Przesyłka 4 - pobranie', type: 'number', description: 'COD', enrichment: 'packages' },
        { key: 'pkg4_is_delivered', label: 'Przesyłka 4 - doręczona', type: 'boolean', description: 'Doręczona', enrichment: 'packages' },

        // PRZESYŁKA 5
        { key: 'pkg5_id', label: 'Przesyłka 5 - ID', type: 'number', description: 'Identyfikator piątej przesyłki', enrichment: 'packages' },
        { key: 'pkg5_courier_code', label: 'Przesyłka 5 - kod kuriera', type: 'text', description: 'Kod integracji', enrichment: 'packages' },
        { key: 'pkg5_courier_name', label: 'Przesyłka 5 - kurier', type: 'text', description: 'Nazwa kuriera', enrichment: 'packages' },
        { key: 'pkg5_tracking_number', label: 'Przesyłka 5 - numer śledzenia', type: 'text', description: 'Numer trackingu', enrichment: 'packages' },
        { key: 'pkg5_tracking_url', label: 'Przesyłka 5 - link śledzenia', type: 'text', description: 'URL śledzenia', enrichment: 'packages' },
        { key: 'pkg5_status', label: 'Przesyłka 5 - status', type: 'text', description: 'Status', enrichment: 'packages' },
        { key: 'pkg5_date_add', label: 'Przesyłka 5 - data utworzenia', type: 'datetime', description: 'Data utworzenia', enrichment: 'packages' },
        { key: 'pkg5_date_sent', label: 'Przesyłka 5 - data nadania', type: 'datetime', description: 'Data nadania', enrichment: 'packages' },
        { key: 'pkg5_date_delivered', label: 'Przesyłka 5 - data doręczenia', type: 'datetime', description: 'Data doręczenia', enrichment: 'packages' },
        { key: 'pkg5_weight', label: 'Przesyłka 5 - waga', type: 'number', description: 'Waga', enrichment: 'packages' },
        { key: 'pkg5_cod_value', label: 'Przesyłka 5 - pobranie', type: 'number', description: 'COD', enrichment: 'packages' },
        { key: 'pkg5_is_delivered', label: 'Przesyłka 5 - doręczona', type: 'boolean', description: 'Doręczona', enrichment: 'packages' }
      ]
    },

    // ========================================
    // 1.11 DOKUMENT SPRZEDAŻY 1 (ds1_)
    // ========================================
    {
      id: 'document_1',
      label: 'Dokument sprzedaży 1',
      enrichment: 'documents',
      fields: [
        { key: 'ds1_id', label: 'Dokument 1 - ID', type: 'number', description: 'Identyfikator pierwszego dokumentu sprzedaży', enrichment: 'documents' },
        { key: 'ds1_type', label: 'Dokument 1 - typ', type: 'text', description: 'Typ: invoice (faktura), receipt (paragon), correction (korekta)', enrichment: 'documents' },
        { key: 'ds1_number', label: 'Dokument 1 - numer', type: 'text', description: 'Pełny numer dokumentu (np. FV/2024/01/001)', enrichment: 'documents' },
        { key: 'ds1_date', label: 'Dokument 1 - data wystawienia', type: 'date', description: 'Data wystawienia dokumentu', enrichment: 'documents' },
        { key: 'ds1_date_sell', label: 'Dokument 1 - data sprzedaży', type: 'date', description: 'Data sprzedaży/dostawy na dokumencie', enrichment: 'documents' },
        { key: 'ds1_total_brutto', label: 'Dokument 1 - wartość brutto', type: 'number', description: 'Kwota brutto na dokumencie', enrichment: 'documents' },
        { key: 'ds1_total_netto', label: 'Dokument 1 - wartość netto', type: 'number', description: 'Kwota netto na dokumencie', enrichment: 'documents' },
        { key: 'ds1_total_vat', label: 'Dokument 1 - VAT', type: 'number', description: 'Suma VAT na dokumencie', enrichment: 'documents' },
        { key: 'ds1_currency', label: 'Dokument 1 - waluta', type: 'text', description: 'Waluta dokumentu', enrichment: 'documents' },
        { key: 'ds1_exchange_rate', label: 'Dokument 1 - kurs', type: 'number', description: 'Kurs przeliczeniowy (jeśli waluta obca)', enrichment: 'documents' },
        { key: 'ds1_buyer_name', label: 'Dokument 1 - nabywca', type: 'text', description: 'Nazwa nabywcy na dokumencie', enrichment: 'documents' },
        { key: 'ds1_buyer_nip', label: 'Dokument 1 - NIP nabywcy', type: 'text', description: 'NIP nabywcy', enrichment: 'documents' },
        { key: 'ds1_external', label: 'Dokument 1 - zewnętrzny', type: 'boolean', description: 'Czy dokument wystawiony zewnętrznie (marketplace)', enrichment: 'documents' }
      ]
    },

    // ========================================
    // 1.12 DOKUMENT SPRZEDAŻY 2 (ds2_)
    // ========================================
    {
      id: 'document_2',
      label: 'Dokument sprzedaży 2',
      enrichment: 'documents',
      fields: [
        { key: 'ds2_id', label: 'Dokument 2 - ID', type: 'number', description: 'Identyfikator drugiego dokumentu (np. korekta)', enrichment: 'documents' },
        { key: 'ds2_type', label: 'Dokument 2 - typ', type: 'text', description: 'Typ: invoice, receipt, correction', enrichment: 'documents' },
        { key: 'ds2_number', label: 'Dokument 2 - numer', type: 'text', description: 'Numer drugiego dokumentu', enrichment: 'documents' },
        { key: 'ds2_date', label: 'Dokument 2 - data wystawienia', type: 'date', description: 'Data wystawienia', enrichment: 'documents' },
        { key: 'ds2_date_sell', label: 'Dokument 2 - data sprzedaży', type: 'date', description: 'Data sprzedaży', enrichment: 'documents' },
        { key: 'ds2_total_brutto', label: 'Dokument 2 - wartość brutto', type: 'number', description: 'Kwota brutto', enrichment: 'documents' },
        { key: 'ds2_total_netto', label: 'Dokument 2 - wartość netto', type: 'number', description: 'Kwota netto', enrichment: 'documents' },
        { key: 'ds2_total_vat', label: 'Dokument 2 - VAT', type: 'number', description: 'Suma VAT', enrichment: 'documents' },
        { key: 'ds2_currency', label: 'Dokument 2 - waluta', type: 'text', description: 'Waluta', enrichment: 'documents' },
        { key: 'ds2_exchange_rate', label: 'Dokument 2 - kurs', type: 'number', description: 'Kurs przeliczeniowy', enrichment: 'documents' },
        { key: 'ds2_buyer_name', label: 'Dokument 2 - nabywca', type: 'text', description: 'Nazwa nabywcy', enrichment: 'documents' },
        { key: 'ds2_buyer_nip', label: 'Dokument 2 - NIP nabywcy', type: 'text', description: 'NIP nabywcy', enrichment: 'documents' },
        { key: 'ds2_external', label: 'Dokument 2 - zewnętrzny', type: 'boolean', description: 'Czy zewnętrzny', enrichment: 'documents' }
      ]
    },

    // ========================================
    // 1.13 PRZEWALUTOWANIE
    // ========================================
    {
      id: 'currency_conversion',
      label: 'Przewalutowanie',
      enrichment: 'currency',
      fields: [
        { key: 'converted_currency', label: 'Waluta docelowa', type: 'text', description: 'Na jaką walutę przeliczono (PLN, EUR, etc.)', enrichment: 'currency' },
        { key: 'converted_rate', label: 'Użyty kurs', type: 'number', description: 'Kurs NBP użyty do przeliczenia', enrichment: 'currency' },
        { key: 'converted_rate_date', label: 'Data kursu', type: 'date', description: 'Z jakiego dnia pochodzi kurs', enrichment: 'currency' },
        { key: 'converted_products_brutto', label: 'Produkty brutto (przewal.)', type: 'number', description: 'Wartość produktów po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_products_netto', label: 'Produkty netto (przewal.)', type: 'number', description: 'Wartość produktów netto po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_delivery_brutto', label: 'Dostawa brutto (przewal.)', type: 'number', description: 'Koszt dostawy po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_delivery_netto', label: 'Dostawa netto (przewal.)', type: 'number', description: 'Koszt dostawy netto po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_order_brutto', label: 'Zamówienie brutto (przewal.)', type: 'number', description: 'Całkowita wartość po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_order_netto', label: 'Zamówienie netto (przewal.)', type: 'number', description: 'Całkowita wartość netto po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_payment_done', label: 'Zapłacono (przewal.)', type: 'number', description: 'Kwota zapłacona po przeliczeniu', enrichment: 'currency' }
      ]
    },

    // ========================================
    // 1.14 POLA DODATKOWE (DYNAMICZNE)
    // ========================================
    {
      id: 'extra_fields',
      label: 'Pola dodatkowe',
      dynamic: true,
      source: 'getOrderExtraFields',
      fields: [] // Wypełniane dynamicznie z API
    }
  ],

  // ========================================
  // MAPOWANIE PÓL Z API
  // ========================================
  apiMapping: {
    // Mapowanie kluczy z API BaseLinker na klucze datasetu
    order_id: 'order_id',
    shop_order_id: 'shop_order_id',
    external_order_id: 'external_order_id',
    order_source: 'order_source',
    order_source_id: 'order_source_id',
    order_source_info: 'order_source_info',
    order_status_id: 'order_status_id',
    date_add: 'date_add',
    date_confirmed: 'date_confirmed',
    date_in_status: 'date_in_status',
    confirmed: 'confirmed',
    want_invoice: 'want_invoice',
    admin_comments: 'admin_comments',
    user_comments: 'user_comments',
    user_login: 'user_login',
    email: 'email',
    phone: 'phone',
    delivery_fullname: 'delivery_fullname',
    delivery_company: 'delivery_company',
    delivery_address: 'delivery_address',
    delivery_city: 'delivery_city',
    delivery_postcode: 'delivery_postcode',
    delivery_state_code: 'delivery_state_code',
    delivery_country: 'delivery_country',
    delivery_country_code: 'delivery_country_code',
    delivery_point_id: 'delivery_point_id',
    delivery_point_name: 'delivery_point_name',
    delivery_point_address: 'delivery_point_address',
    delivery_point_postcode: 'delivery_point_postcode',
    delivery_point_city: 'delivery_point_city',
    invoice_fullname: 'invoice_fullname',
    invoice_company: 'invoice_company',
    invoice_nip: 'invoice_nip',
    invoice_address: 'invoice_address',
    invoice_city: 'invoice_city',
    invoice_postcode: 'invoice_postcode',
    invoice_state_code: 'invoice_state_code',
    invoice_country: 'invoice_country',
    invoice_country_code: 'invoice_country_code',
    currency: 'currency',
    payment_method: 'payment_method',
    payment_method_cod: 'payment_method_cod',
    payment_done: 'payment_done',
    delivery_method: 'delivery_method',
    delivery_price: 'delivery_price_brutto',
    delivery_package_module: 'delivery_package_module'
  }
};
