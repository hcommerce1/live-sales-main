/**
 * Dataset: POZYCJE ZAMÓWIEŃ (order_items)
 *
 * Pozycje produktów z zamówień - jeden wiersz na każdy produkt.
 * Zamówienie z 3 produktami = 3 wiersze.
 *
 * API: getOrders → expand products
 */

module.exports = {
  id: 'order_items',
  label: 'Pozycje zamówień',
  description: 'Pozycje produktów z zamówień - jeden wiersz na każdy produkt',
  icon: 'list',

  // Główne zapytanie API
  primaryQuery: 'getOrders',

  // Ekspansja - zamienia 1 zamówienie na N wierszy (jeden per produkt)
  expandFrom: 'products',

  // Dostępne wzbogacenia
  enrichments: ['inventory', 'currency'],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // 2.1 KONTEKST ZAMÓWIENIA
    // ========================================
    {
      id: 'order_context',
      label: 'Kontekst zamówienia',
      fields: [
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Identyfikator zamówienia, do którego należy pozycja' },
        { key: 'order_source', label: 'Źródło', type: 'text', description: 'Platforma sprzedażowa zamówienia' },
        { key: 'order_status_id', label: 'Status', type: 'number', description: 'Aktualny status zamówienia' },
        { key: 'order_status_name', label: 'Nazwa statusu', type: 'text', description: 'Nazwa statusu zamówienia', computed: true },
        { key: 'date_confirmed', label: 'Data zamówienia', type: 'datetime', description: 'Data potwierdzenia zamówienia' },
        { key: 'email', label: 'Email klienta', type: 'text', description: 'Email klienta' },
        { key: 'delivery_country_code', label: 'Kraj dostawy', type: 'text', description: 'Kod kraju dostawy (dla analiz geograficznych)' },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zamówienia' }
      ]
    },

    // ========================================
    // 2.2 DANE PRODUKTU
    // ========================================
    {
      id: 'product_data',
      label: 'Dane produktu',
      fields: [
        { key: 'product_id', label: 'ID produktu', type: 'text', description: 'Identyfikator produktu w BaseLinker' },
        { key: 'variant_id', label: 'ID wariantu', type: 'text', description: 'Identyfikator konkretnego wariantu (rozmiar, kolor)' },
        { key: 'name', label: 'Nazwa produktu', type: 'text', description: 'Nazwa produktu widoczna w zamówieniu' },
        { key: 'sku', label: 'SKU', type: 'text', description: 'Kod SKU produktu' },
        { key: 'ean', label: 'EAN', type: 'text', description: 'Kod kreskowy EAN' },
        { key: 'location', label: 'Lokalizacja', type: 'text', description: 'Miejsce składowania w magazynie' },
        { key: 'auction_id', label: 'ID aukcji', type: 'text', description: 'Identyfikator aukcji/oferty na marketplace' },
        { key: 'attributes', label: 'Atrybuty', type: 'text', description: 'Cechy wariantu (np. "Rozmiar: M, Kolor: Czerwony")' }
      ]
    },

    // ========================================
    // 2.3 ILOŚĆ I CENY
    // ========================================
    {
      id: 'quantity_price',
      label: 'Ilość i ceny',
      fields: [
        { key: 'quantity', label: 'Ilość', type: 'number', description: 'Liczba sztuk tego produktu w zamówieniu' },
        { key: 'price_brutto', label: 'Cena jednostkowa brutto', type: 'number', description: 'Cena za sztukę z VAT' },
        { key: 'price_netto', label: 'Cena jednostkowa netto', type: 'number', description: 'Cena za sztukę bez VAT', computed: true },
        { key: 'tax_rate', label: 'Stawka VAT', type: 'number', description: 'Stawka VAT na produkcie (23, 8, 5, 0)' },
        { key: 'weight', label: 'Waga jednostkowa', type: 'number', description: 'Waga jednej sztuki w kg' }
      ]
    },

    // ========================================
    // 2.4 WARTOŚCI POZYCJI
    // ========================================
    {
      id: 'line_values',
      label: 'Wartości pozycji',
      fields: [
        { key: 'line_total_brutto', label: 'Wartość pozycji brutto', type: 'number', description: 'Ilość × cena brutto', computed: true },
        { key: 'line_total_netto', label: 'Wartość pozycji netto', type: 'number', description: 'Ilość × cena netto', computed: true },
        { key: 'line_tax_value', label: 'Wartość VAT pozycji', type: 'number', description: 'Kwota VAT na tej pozycji', computed: true },
        { key: 'line_weight', label: 'Waga pozycji', type: 'number', description: 'Łączna waga (ilość × waga jednostkowa)', computed: true }
      ]
    },

    // ========================================
    // 2.5 DANE Z MAGAZYNU (inv_)
    // ========================================
    {
      id: 'inventory_data',
      label: 'Dane z magazynu',
      enrichment: 'inventory',
      fields: [
        { key: 'inv_name', label: 'Nazwa magazynowa', type: 'text', description: 'Nazwa produktu w katalogu BaseLinker', enrichment: 'inventory' },
        { key: 'inv_sku', label: 'SKU magazynowe', type: 'text', description: 'SKU z katalogu (może się różnić od SKU w zamówieniu)', enrichment: 'inventory' },
        { key: 'inv_ean', label: 'EAN magazynowy', type: 'text', description: 'EAN z katalogu', enrichment: 'inventory' },
        { key: 'inv_manufacturer', label: 'Producent', type: 'text', description: 'Nazwa producenta z katalogu', enrichment: 'inventory' },
        { key: 'inv_category', label: 'Kategoria', type: 'text', description: 'Kategoria produktu w katalogu', enrichment: 'inventory' },
        { key: 'inv_purchase_price_brutto', label: 'Cena zakupu brutto', type: 'number', description: 'Koszt zakupu z VAT', enrichment: 'inventory' },
        { key: 'inv_purchase_price_netto', label: 'Cena zakupu netto', type: 'number', description: 'Koszt zakupu bez VAT', enrichment: 'inventory' },
        { key: 'inv_tax_rate', label: 'VAT magazynowy', type: 'number', description: 'Stawka VAT w katalogu', enrichment: 'inventory' },
        { key: 'inv_weight', label: 'Waga magazynowa', type: 'number', description: 'Waga z katalogu', enrichment: 'inventory' },
        { key: 'inv_stock', label: 'Stan magazynowy', type: 'number', description: 'Aktualny stan na magazynie', enrichment: 'inventory' },
        { key: 'inv_reserved', label: 'Zarezerwowane', type: 'number', description: 'Ilość zarezerwowana w zamówieniach', enrichment: 'inventory' },
        { key: 'inv_available', label: 'Dostępne', type: 'number', description: 'Ilość dostępna do sprzedaży', enrichment: 'inventory' },
        { key: 'inv_average_cost', label: 'Średni koszt', type: 'number', description: 'Średnia ważona kosztu zakupu', enrichment: 'inventory' }
      ]
    },

    // ========================================
    // 2.6 KALKULACJE MARŻY
    // ========================================
    {
      id: 'margin',
      label: 'Kalkulacje marży',
      enrichment: 'inventory',
      fields: [
        { key: 'margin_per_unit', label: 'Marża jednostkowa', type: 'number', description: 'Zysk na jednej sztuce (cena - koszt zakupu)', computed: true, enrichment: 'inventory' },
        { key: 'margin_total', label: 'Marża pozycji', type: 'number', description: 'Łączna marża na pozycji', computed: true, enrichment: 'inventory' },
        { key: 'margin_percent', label: 'Marża %', type: 'number', description: 'Procentowa marża na produkcie', computed: true, enrichment: 'inventory' }
      ]
    },

    // ========================================
    // 2.7 PRZEWALUTOWANIE
    // ========================================
    {
      id: 'currency_conversion',
      label: 'Przewalutowanie',
      enrichment: 'currency',
      fields: [
        { key: 'converted_price_brutto', label: 'Cena brutto (przewal.)', type: 'number', description: 'Cena jednostkowa po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_price_netto', label: 'Cena netto (przewal.)', type: 'number', description: 'Cena netto po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_line_total_brutto', label: 'Wartość brutto (przewal.)', type: 'number', description: 'Wartość pozycji po przeliczeniu', enrichment: 'currency' },
        { key: 'converted_line_total_netto', label: 'Wartość netto (przewal.)', type: 'number', description: 'Wartość netto po przeliczeniu', enrichment: 'currency' }
      ]
    }
  ],

  // ========================================
  // MAPOWANIE PÓL Z API
  // ========================================
  apiMapping: {
    // Z zamówienia (parent)
    order_id: 'order_id',
    order_source: 'order_source',
    order_status_id: 'order_status_id',
    date_confirmed: 'date_confirmed',
    email: 'email',
    delivery_country_code: 'delivery_country_code',
    currency: 'currency',

    // Z produktu (child - z tablicy products)
    product_id: 'product_id',
    variant_id: 'variant_id',
    name: 'name',
    sku: 'sku',
    ean: 'ean',
    location: 'location',
    auction_id: 'auction_id',
    attributes: 'attributes',
    quantity: 'quantity',
    price_brutto: 'price_brutto',
    tax_rate: 'tax_rate',
    weight: 'weight'
  }
};
