/**
 * Dataset: PRODUKTY - KATALOG (products_catalog)
 *
 * Lista produktów z katalogów BaseLinker.
 * Jeden wiersz = jeden produkt.
 *
 * API: getInventoryProductsList + getInventoryProductsData
 */

module.exports = {
  id: 'products_catalog',
  label: 'Produkty - Katalog',
  description: 'Lista produktów z katalogów BaseLinker',
  icon: 'package',

  primaryQuery: 'getInventoryProductsList',
  enrichments: ['prices', 'stock'],

  // Wymaga wyboru katalogu
  requiresInventory: true,

  fieldGroups: [
    // 5.1 IDENTYFIKATORY
    {
      id: 'identifiers',
      label: 'Identyfikatory',
      fields: [
        { key: 'product_id', label: 'ID produktu', type: 'text', description: 'Unikalny identyfikator w BaseLinker' },
        { key: 'sku', label: 'SKU', type: 'text', description: 'Kod magazynowy produktu' },
        { key: 'ean', label: 'EAN', type: 'text', description: 'Kod kreskowy' },
        { key: 'manufacturer_code', label: 'Kod producenta', type: 'text', description: 'Kod/symbol nadany przez producenta' }
      ]
    },

    // 5.2 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'name', label: 'Nazwa', type: 'text', description: 'Nazwa produktu' },
        { key: 'description', label: 'Opis', type: 'text', description: 'Pełny opis produktu' },
        { key: 'description_extra1', label: 'Opis dodatkowy 1', type: 'text', description: 'Dodatkowe pole opisowe' },
        { key: 'description_extra2', label: 'Opis dodatkowy 2', type: 'text', description: 'Dodatkowe pole opisowe' }
      ]
    },

    // 5.3 KLASYFIKACJA
    {
      id: 'classification',
      label: 'Klasyfikacja',
      fields: [
        { key: 'category_id', label: 'ID kategorii', type: 'number', description: 'Identyfikator kategorii' },
        { key: 'category_name', label: 'Kategoria', type: 'text', description: 'Nazwa kategorii produktu', computed: true },
        { key: 'manufacturer_id', label: 'ID producenta', type: 'number', description: 'Identyfikator producenta' },
        { key: 'manufacturer_name', label: 'Producent', type: 'text', description: 'Nazwa producenta/marki', computed: true },
        { key: 'tags', label: 'Tagi', type: 'text', description: 'Tagi produktu oddzielone przecinkami' }
      ]
    },

    // 5.4 CENY
    {
      id: 'prices',
      label: 'Ceny',
      fields: [
        { key: 'price_brutto', label: 'Cena brutto', type: 'number', description: 'Cena sprzedaży z VAT' },
        { key: 'price_netto', label: 'Cena netto', type: 'number', description: 'Cena sprzedaży bez VAT', computed: true },
        { key: 'tax_rate', label: 'Stawka VAT', type: 'number', description: 'Stawka VAT (23, 8, 5, 0)' },
        { key: 'purchase_price_brutto', label: 'Cena zakupu brutto', type: 'number', description: 'Koszt zakupu z VAT' },
        { key: 'purchase_price_netto', label: 'Cena zakupu netto', type: 'number', description: 'Koszt zakupu bez VAT' },
        { key: 'average_cost', label: 'Średni koszt', type: 'number', description: 'Średnia ważona kosztu zakupu' }
      ]
    },

    // 5.5 STANY MAGAZYNOWE
    {
      id: 'stock',
      label: 'Stany magazynowe',
      fields: [
        { key: 'stock_total', label: 'Stan całkowity', type: 'number', description: 'Łączna ilość na wszystkich magazynach' },
        { key: 'stock_available', label: 'Dostępny', type: 'number', description: 'Ilość dostępna do sprzedaży' },
        { key: 'stock_reserved', label: 'Zarezerwowany', type: 'number', description: 'Ilość w zamówieniach' },
        { key: 'stock_warehouse_1', label: 'Stan - magazyn 1', type: 'number', description: 'Stan na pierwszym magazynie', enrichment: 'stock' },
        { key: 'stock_warehouse_2', label: 'Stan - magazyn 2', type: 'number', description: 'Stan na drugim magazynie', enrichment: 'stock' },
        { key: 'stock_warehouse_3', label: 'Stan - magazyn 3', type: 'number', description: 'Stan na trzecim magazynie', enrichment: 'stock' }
      ]
    },

    // 5.6 WYMIARY I WAGA
    {
      id: 'dimensions',
      label: 'Wymiary i waga',
      fields: [
        { key: 'weight', label: 'Waga (kg)', type: 'number', description: 'Waga produktu w kilogramach' },
        { key: 'height', label: 'Wysokość (cm)', type: 'number', description: 'Wysokość w centymetrach' },
        { key: 'width', label: 'Szerokość (cm)', type: 'number', description: 'Szerokość w centymetrach' },
        { key: 'length', label: 'Długość (cm)', type: 'number', description: 'Długość w centymetrach' }
      ]
    },

    // 5.7 MEDIA
    {
      id: 'media',
      label: 'Media',
      fields: [
        { key: 'image_url', label: 'URL obrazka', type: 'text', description: 'Link do głównego zdjęcia' },
        { key: 'images_count', label: 'Liczba zdjęć', type: 'number', description: 'Ile zdjęć ma produkt', computed: true }
      ]
    },

    // 5.8 LOKALIZACJA
    {
      id: 'location',
      label: 'Lokalizacja',
      fields: [
        { key: 'location', label: 'Lokalizacja', type: 'text', description: 'Miejsce składowania (np. "Regał A, Półka 3")' }
      ]
    },

    // 5.9 WARIANTY
    {
      id: 'variants',
      label: 'Warianty',
      fields: [
        { key: 'has_variants', label: 'Ma warianty', type: 'boolean', description: 'Czy produkt ma warianty' },
        { key: 'variants_count', label: 'Liczba wariantów', type: 'number', description: 'Ile wariantów ma produkt', computed: true }
      ]
    },

    // 5.10 CENY GRUPOWE (DYNAMICZNE)
    {
      id: 'price_groups',
      label: 'Ceny grupowe',
      dynamic: true,
      source: 'getInventoryPriceGroups',
      enrichment: 'prices',
      fields: []
    },

    // 5.11 POLA TEKSTOWE (DYNAMICZNE)
    {
      id: 'text_fields',
      label: 'Pola tekstowe',
      dynamic: true,
      source: 'getInventoryAvailableTextFieldKeys',
      fields: []
    }
  ]
};
