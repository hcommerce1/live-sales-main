/**
 * Dataset: PRODUKTY - ZEWNĘTRZNE (products_external)
 *
 * Lista produktów z zewnętrznych magazynów (hurtownie).
 * Jeden wiersz = jeden produkt.
 *
 * API: getExternalStorageProductsList
 */

module.exports = {
  id: 'products_external',
  label: 'Produkty - Zewnętrzne',
  description: 'Lista produktów z zewnętrznych magazynów (hurtownie)',
  icon: 'external-link',

  primaryQuery: 'getExternalStorageProductsList',
  enrichments: [],

  // Wymaga wyboru zewnętrznego magazynu
  requiresExternalStorage: true,

  fieldGroups: [
    // 6.1 IDENTYFIKATORY
    {
      id: 'identifiers',
      label: 'Identyfikatory',
      fields: [
        { key: 'product_id', label: 'ID produktu', type: 'text', description: 'Identyfikator w zewnętrznym magazynie' },
        { key: 'storage_id', label: 'ID magazynu', type: 'text', description: 'Identyfikator zewnętrznego magazynu' },
        { key: 'storage_name', label: 'Nazwa magazynu', type: 'text', description: 'Nazwa hurtowni/dostawcy', computed: true },
        { key: 'sku', label: 'SKU', type: 'text', description: 'Kod SKU' },
        { key: 'ean', label: 'EAN', type: 'text', description: 'Kod kreskowy' }
      ]
    },

    // 6.2 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'name', label: 'Nazwa', type: 'text', description: 'Nazwa produktu' },
        { key: 'description', label: 'Opis', type: 'text', description: 'Opis produktu' },
        { key: 'category', label: 'Kategoria', type: 'text', description: 'Kategoria w zewnętrznym magazynie' },
        { key: 'manufacturer', label: 'Producent', type: 'text', description: 'Producent/marka' }
      ]
    },

    // 6.3 CENY
    {
      id: 'prices',
      label: 'Ceny',
      fields: [
        { key: 'price_brutto', label: 'Cena brutto', type: 'number', description: 'Cena zakupu brutto' },
        { key: 'price_netto', label: 'Cena netto', type: 'number', description: 'Cena zakupu netto' },
        { key: 'price_retail', label: 'Cena detaliczna', type: 'number', description: 'Sugerowana cena sprzedaży' }
      ]
    },

    // 6.4 DOSTĘPNOŚĆ
    {
      id: 'availability',
      label: 'Dostępność',
      fields: [
        { key: 'quantity', label: 'Ilość', type: 'number', description: 'Dostępna ilość u dostawcy' },
        { key: 'available', label: 'Dostępny', type: 'boolean', description: 'Czy produkt jest dostępny' },
        { key: 'delivery_time', label: 'Czas dostawy', type: 'text', description: 'Przewidywany czas dostawy' }
      ]
    },

    // 6.5 WYMIARY
    {
      id: 'dimensions',
      label: 'Wymiary',
      fields: [
        { key: 'weight', label: 'Waga', type: 'number', description: 'Waga w kg' },
        { key: 'height', label: 'Wysokość', type: 'number', description: 'Wysokość w cm' },
        { key: 'width', label: 'Szerokość', type: 'number', description: 'Szerokość w cm' },
        { key: 'length', label: 'Długość', type: 'number', description: 'Długość w cm' }
      ]
    }
  ]
};
