/**
 * Dataset: PRODUKTY - KATALOG (Products Catalog)
 *
 * Główne API: getInventoryProductsList + getInventoryProductsData
 * Enrichmenty: prices, stock
 *
 * Produkty z katalogu BaseLinker (magazyn wewnętrzny).
 * Wymaga wyboru katalogu (inventoryId).
 */

module.exports = {
  id: 'products_catalog',
  label: 'Produkty - Katalog',
  description: 'Eksport produktów z katalogu BaseLinker (magazyn wewnętrzny)',
  icon: 'box',

  // Źródło danych
  primaryQuery: 'getInventoryProductsList',
  enrichments: ['product-details', 'prices', 'stock'],
  requiresInventory: true, // Wymaga wyboru katalogu

  // Filtry dostępne dla tego datasetu
  availableFilters: [
    { key: 'inventoryId', label: 'Katalog', type: 'inventory', required: true },
    { key: 'categoryId', label: 'Kategoria', type: 'category' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'ean', label: 'EAN', type: 'text' },
    { key: 'name', label: 'Nazwa (zawiera)', type: 'text' },
    { key: 'priceFrom', label: 'Cena od', type: 'number' },
    { key: 'priceTo', label: 'Cena do', type: 'number' },
    { key: 'stockFrom', label: 'Stan od', type: 'number' },
    { key: 'stockTo', label: 'Stan do', type: 'number' }
  ],

  // Grupy pól
  fieldGroups: [
    // ========================================
    // IDENTYFIKATORY
    // ========================================
    {
      id: 'identifiers',
      label: 'Identyfikatory',
      fields: [
        { key: 'id', label: 'ID produktu', type: 'number', description: 'Unikalny ID produktu w BaseLinker' },
        { key: 'sku', label: 'SKU', type: 'text', description: 'Numer magazynowy' },
        { key: 'ean', label: 'EAN', type: 'text', description: 'Kod EAN' },
        { key: 'asin', label: 'ASIN', type: 'text', description: 'Kod ASIN (Amazon)' }
      ]
    },

    // ========================================
    // PODSTAWOWE
    // ========================================
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'name', label: 'Nazwa', type: 'text', description: 'Nazwa produktu' },
        { key: 'description', label: 'Opis', type: 'text', description: 'Opis produktu', enrichment: 'product-details' },
        { key: 'description_extra1', label: 'Opis dodatkowy 1', type: 'text', enrichment: 'product-details' },
        { key: 'description_extra2', label: 'Opis dodatkowy 2', type: 'text', enrichment: 'product-details' },
        { key: 'is_bundle', label: 'Jest zestawem', type: 'boolean', description: 'Czy produkt jest zestawem', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // KLASYFIKACJA
    // ========================================
    {
      id: 'classification',
      label: 'Klasyfikacja',
      fields: [
        { key: 'category_id', label: 'ID kategorii', type: 'number', enrichment: 'product-details' },
        { key: 'category_name', label: 'Nazwa kategorii', type: 'text', computed: true },
        { key: 'manufacturer_id', label: 'ID producenta', type: 'number', enrichment: 'product-details' },
        { key: 'manufacturer_name', label: 'Nazwa producenta', type: 'text', computed: true },
        { key: 'tags', label: 'Tagi', type: 'text', description: 'Tagi produktu (rozdzielone przecinkami)', enrichment: 'product-details' },
        { key: 'star', label: 'Gwiazdka', type: 'number', description: 'Oznaczenie gwiazdką (0-5)', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // WYMIARY
    // ========================================
    {
      id: 'dimensions',
      label: 'Wymiary',
      fields: [
        { key: 'weight', label: 'Waga (kg)', type: 'number', description: 'Waga w kilogramach', enrichment: 'product-details' },
        { key: 'height', label: 'Wysokość (cm)', type: 'number', description: 'Wysokość w centymetrach', enrichment: 'product-details' },
        { key: 'width', label: 'Szerokość (cm)', type: 'number', description: 'Szerokość w centymetrach', enrichment: 'product-details' },
        { key: 'length', label: 'Długość (cm)', type: 'number', description: 'Długość w centymetrach', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // PODATKI
    // ========================================
    {
      id: 'tax',
      label: 'Podatki',
      fields: [
        { key: 'tax_rate', label: 'Stawka VAT', type: 'number', description: 'Stawka VAT w %', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // KOSZTY
    // ========================================
    {
      id: 'costs',
      label: 'Koszty',
      fields: [
        { key: 'average_cost', label: 'Średni koszt', type: 'number', description: 'Średni koszt zakupu', enrichment: 'product-details' },
        { key: 'average_landed_cost', label: 'Średni koszt całkowity', type: 'number', description: 'Średni koszt z kosztami dodatkowymi', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // CENY (z getInventoryProductsList)
    // ========================================
    {
      id: 'prices_basic',
      label: 'Ceny podstawowe',
      fields: [
        { key: 'price_default', label: 'Cena domyślna', type: 'number', description: 'Cena z domyślnej grupy cenowej' },
        { key: 'prices_json', label: 'Ceny (JSON)', type: 'text', description: 'Wszystkie ceny jako JSON' }
      ]
    },

    // ========================================
    // CENY WG GRUP (enrichment: prices)
    // ========================================
    {
      id: 'prices_groups',
      label: 'Ceny wg grup cenowych',
      description: 'Dynamiczne kolumny cen - nazwy pobierane z BaseLinker',
      fields: [],
      dynamic: true,
      source: 'priceGroups',
      enrichment: 'prices'
    },

    // ========================================
    // STANY MAGAZYNOWE (z getInventoryProductsList)
    // ========================================
    {
      id: 'stock_basic',
      label: 'Stany magazynowe',
      fields: [
        { key: 'stock_total', label: 'Stan łączny', type: 'number', description: 'Suma stanów ze wszystkich magazynów' },
        { key: 'stock_json', label: 'Stany (JSON)', type: 'text', description: 'Wszystkie stany jako JSON' }
      ]
    },

    // ========================================
    // STANY WG MAGAZYNÓW (enrichment: stock)
    // ========================================
    {
      id: 'stock_warehouses',
      label: 'Stany wg magazynów',
      description: 'Dynamiczne kolumny stanów - nazwy pobierane z BaseLinker',
      fields: [],
      dynamic: true,
      source: 'warehouses',
      enrichment: 'stock'
    },

    // ========================================
    // LOKALIZACJE
    // ========================================
    {
      id: 'locations',
      label: 'Lokalizacje',
      fields: [
        { key: 'locations_json', label: 'Lokalizacje (JSON)', type: 'text', description: 'Lokalizacje w magazynach', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // OBRAZY
    // ========================================
    {
      id: 'images',
      label: 'Obrazy',
      fields: [
        { key: 'image_url_1', label: 'Obraz 1', type: 'text', description: 'URL pierwszego obrazu', enrichment: 'product-details' },
        { key: 'image_url_2', label: 'Obraz 2', type: 'text', enrichment: 'product-details' },
        { key: 'image_url_3', label: 'Obraz 3', type: 'text', enrichment: 'product-details' },
        { key: 'images_count', label: 'Liczba obrazów', type: 'number', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // WARIANTY
    // ========================================
    {
      id: 'variants',
      label: 'Warianty',
      fields: [
        { key: 'has_variants', label: 'Ma warianty', type: 'boolean', enrichment: 'product-details' },
        { key: 'variants_count', label: 'Liczba wariantów', type: 'number', enrichment: 'product-details' },
        { key: 'variants_json', label: 'Warianty (JSON)', type: 'text', description: 'Lista wariantów jako JSON', enrichment: 'product-details' }
      ]
    },

    // ========================================
    // CECHY
    // ========================================
    {
      id: 'features',
      label: 'Cechy',
      fields: [
        { key: 'features_json', label: 'Cechy (JSON)', type: 'text', description: 'Cechy produktu jako JSON', enrichment: 'product-details' }
      ],
      dynamic: true,
      source: 'productFeatures'
    }
  ],

  // Primary key
  primaryKey: 'id',

  // Sort options
  sortOptions: [
    { key: 'id', label: 'ID produktu', direction: 'asc' },
    { key: 'name', label: 'Nazwa', direction: 'asc' },
    { key: 'sku', label: 'SKU', direction: 'asc' }
  ]
};
