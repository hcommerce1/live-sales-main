/**
 * Data Transformer
 *
 * Transformuje surowe dane do formatu gotowego do eksportu:
 * - Mapuje pola według konfiguracji datasetu
 * - Obsługuje własne nagłówki (customHeaders)
 * - Obsługuje pola customowe (formuły z placeholderami)
 * - Obsługuje puste pola (_empty)
 * - Formatuje daty, boolean, liczby
 */

const logger = require('../../utils/logger');

class DataTransformer {
  /**
   * @param {Object} dataset - Konfiguracja datasetu
   * @param {string[]} selectedFields - Lista wybranych kluczy pól
   * @param {Object} options - Opcje transformacji
   * @param {Object} [options.customHeaders] - Mapowanie field_key -> custom_header
   * @param {Object[]} [options.customFields] - Pola customowe
   * @param {Object} [options.statusMap] - Mapa statusów
   * @param {Object} [options.courierMap] - Mapa kurierów
   * @param {Object} [options.warehouseMap] - Mapa magazynów
   * @param {Object} [options.extraFieldsMap] - Mapa pól dodatkowych
   */
  constructor(dataset, selectedFields, options = {}) {
    this.dataset = dataset;
    this.selectedFields = selectedFields;
    this.options = options;

    // Buduj mapę pól dla szybkiego dostępu
    this.fieldMap = this.buildFieldMap();

    // Buduj listę kolumn do eksportu
    this.columns = this.buildColumns();
  }

  /**
   * Buduje mapę wszystkich pól datasetu
   * @returns {Map<string, Object>}
   */
  buildFieldMap() {
    const map = new Map();

    for (const group of this.dataset.fieldGroups) {
      for (const field of group.fields) {
        map.set(field.key, {
          ...field,
          groupId: group.id,
          groupLabel: group.label
        });
      }
    }

    return map;
  }

  /**
   * Buduje listę kolumn do eksportu
   * @returns {Object[]}
   */
  buildColumns() {
    const columns = [];

    for (const fieldKey of this.selectedFields) {
      // Sprawdź czy to puste pole
      if (fieldKey === '_empty' || fieldKey.startsWith('_empty_')) {
        columns.push({
          key: fieldKey,
          label: '',
          type: 'empty',
          isEmpty: true
        });
        continue;
      }

      // Sprawdź czy to pole customowe
      if (fieldKey.startsWith('_custom_')) {
        const customField = this.options.customFields?.find(
          cf => cf.key === fieldKey
        );

        if (customField) {
          columns.push({
            key: fieldKey,
            label: customField.label || 'Custom',
            type: 'custom',
            template: customField.template,
            isCustom: true
          });
        }
        continue;
      }

      // Standardowe pole z datasetu
      const field = this.fieldMap.get(fieldKey);

      if (field) {
        // Użyj customowego nagłówka jeśli podano
        const customHeader = this.options.customHeaders?.[fieldKey];

        columns.push({
          key: fieldKey,
          label: customHeader || field.label,
          type: field.type,
          description: field.description,
          computed: field.computed,
          enrichment: field.enrichment
        });
      } else {
        // Pole dynamiczne (extra field) - może nie być w fieldMap
        // Extra fields mają format: extra_field_123
        if (fieldKey.startsWith('extra_field_')) {
          const extraLabel = this.options.extraFieldsMap?.[fieldKey] || fieldKey;
          const customHeader = this.options.customHeaders?.[fieldKey];

          columns.push({
            key: fieldKey,
            label: customHeader || extraLabel,
            type: 'text',
            isDynamic: true
          });
        } else {
          logger.warn(`Field not found in dataset: ${fieldKey}`);
        }
      }
    }

    return columns;
  }

  /**
   * Zwraca nagłówki kolumn
   * @returns {string[]}
   */
  getHeaders() {
    return this.columns.map(col => col.label);
  }

  /**
   * Transformuje tablicę rekordów do formatu wyjściowego
   * @param {Object[]} data - Surowe dane
   * @returns {Object} { headers: string[], rows: any[][] }
   */
  transform(data) {
    const headers = this.getHeaders();
    const rows = data.map(record => this.transformRecord(record));

    return { headers, rows };
  }

  /**
   * Transformuje pojedynczy rekord
   * @param {Object} record - Rekord danych
   * @returns {any[]} Tablica wartości kolumn
   */
  transformRecord(record) {
    return this.columns.map(column => {
      // Puste pole
      if (column.isEmpty) {
        return '';
      }

      // Pole customowe (formuła)
      if (column.isCustom) {
        return this.evaluateCustomField(column.template, record);
      }

      // Standardowe pole
      const rawValue = this.getNestedValue(record, column.key);

      // Computed fields
      if (column.computed) {
        return this.computeField(column.key, rawValue, record);
      }

      // Format value based on type
      return this.formatValue(rawValue, column.type);
    });
  }

  /**
   * Pobiera wartość z obiektu (obsługuje zagnieżdżone klucze)
   * @param {Object} obj - Obiekt źródłowy
   * @param {string} key - Klucz (może być zagnieżdżony: 'a.b.c')
   * @returns {any}
   */
  getNestedValue(obj, key) {
    // Najpierw sprawdź bezpośredni klucz
    if (obj.hasOwnProperty(key)) {
      return obj[key];
    }

    // Sprawdź zagnieżdżone klucze
    const parts = key.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Formatuje wartość na podstawie typu
   * @param {any} value - Wartość do sformatowania
   * @param {string} type - Typ pola
   * @returns {any}
   */
  formatValue(value, type) {
    if (value === null || value === undefined) {
      return '';
    }

    switch (type) {
      case 'datetime':
        return this.formatDatetime(value);

      case 'date':
        return this.formatDate(value);

      case 'boolean':
        return this.formatBoolean(value);

      case 'number':
        return this.formatNumber(value);

      case 'text':
      default:
        return String(value);
    }
  }

  /**
   * Formatuje datetime (Unix timestamp lub string)
   * @param {number|string} value
   * @returns {string}
   */
  formatDatetime(value) {
    if (!value || value === 0) return '';

    let date;

    // Unix timestamp (seconds)
    if (typeof value === 'number') {
      date = new Date(value * 1000);
    } else {
      date = new Date(value);
    }

    if (isNaN(date.getTime())) {
      return String(value);
    }

    // Format: YYYY-MM-DD HH:mm:ss
    return date.toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
  }

  /**
   * Formatuje date (bez czasu)
   * @param {number|string} value
   * @returns {string}
   */
  formatDate(value) {
    if (!value || value === 0) return '';

    let date;

    if (typeof value === 'number') {
      date = new Date(value * 1000);
    } else {
      date = new Date(value);
    }

    if (isNaN(date.getTime())) {
      return String(value);
    }

    // Format: YYYY-MM-DD
    return date.toISOString().split('T')[0];
  }

  /**
   * Formatuje boolean
   * @param {any} value
   * @returns {string}
   */
  formatBoolean(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') {
      return 'Tak';
    }
    if (value === false || value === 0 || value === '0' || value === 'false') {
      return 'Nie';
    }
    return '';
  }

  /**
   * Formatuje liczbę
   * @param {any} value
   * @returns {number|string}
   */
  formatNumber(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const num = Number(value);

    if (isNaN(num)) {
      return value;
    }

    // Zaokrąglij do 2 miejsc po przecinku dla wartości finansowych
    return Math.round(num * 100) / 100;
  }

  /**
   * Oblicza wartość pola computed
   * @param {string} fieldKey - Klucz pola
   * @param {any} rawValue - Surowa wartość (jeśli istnieje)
   * @param {Object} record - Cały rekord
   * @returns {any}
   */
  computeField(fieldKey, rawValue, record) {
    // Jeśli wartość już istnieje (obliczona przez enricher), użyj jej
    if (rawValue !== null && rawValue !== undefined) {
      return this.formatValue(rawValue, this.fieldMap.get(fieldKey)?.type || 'text');
    }

    // Obliczenia specyficzne dla datasetu orders
    switch (fieldKey) {
      // Nazwa statusu
      case 'order_status_name':
        return this.options.statusMap?.[record.order_status_id] || '';

      // Status płatności
      case 'payment_status': {
        const total = this.calculateOrderTotal(record);
        const paid = Number(record.payment_done) || 0;

        if (paid >= total && total > 0) return 'Opłacone';
        if (paid > 0) return 'Częściowo opłacone';
        return 'Nieopłacone';
      }

      // Wartości produktów
      case 'products_value_brutto':
        return this.calculateProductsValueBrutto(record);

      case 'products_value_netto':
        return this.calculateProductsValueNetto(record);

      // Wartość zamówienia
      case 'order_value_brutto':
        return this.calculateOrderValueBrutto(record);

      case 'order_value_netto':
        return this.calculateOrderValueNetto(record);

      // Koszt dostawy netto
      case 'delivery_price_netto': {
        const brutto = Number(record.delivery_price) || Number(record.delivery_price_brutto) || 0;
        const vatRate = Number(record.delivery_vat_rate) || 23;
        return Math.round((brutto / (1 + vatRate / 100)) * 100) / 100;
      }

      // Liczba pozycji
      case 'products_count':
        return record.products?.length || 0;

      // Łączna ilość
      case 'products_quantity':
        return record.products?.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0) || 0;

      // Nazwa magazynu
      case 'warehouse_name':
        return this.options.warehouseMap?.[record.warehouse_id] || '';

      // Nazwa kuriera
      case 'courier_name':
        return this.options.courierMap?.[record.courier_code] || record.courier_code || '';

      default:
        return '';
    }
  }

  /**
   * Oblicza wartość produktów brutto
   * @param {Object} record
   * @returns {number}
   */
  calculateProductsValueBrutto(record) {
    if (!record.products || !Array.isArray(record.products)) {
      return 0;
    }

    return record.products.reduce((sum, product) => {
      const price = Number(product.price_brutto) || 0;
      const qty = Number(product.quantity) || 0;
      return sum + price * qty;
    }, 0);
  }

  /**
   * Oblicza wartość produktów netto
   * @param {Object} record
   * @returns {number}
   */
  calculateProductsValueNetto(record) {
    if (!record.products || !Array.isArray(record.products)) {
      return 0;
    }

    return record.products.reduce((sum, product) => {
      const priceBrutto = Number(product.price_brutto) || 0;
      const taxRate = Number(product.tax_rate) || 23;
      const qty = Number(product.quantity) || 0;
      const priceNetto = priceBrutto / (1 + taxRate / 100);
      return sum + priceNetto * qty;
    }, 0);
  }

  /**
   * Oblicza całkowitą wartość zamówienia brutto
   * @param {Object} record
   * @returns {number}
   */
  calculateOrderValueBrutto(record) {
    const productsValue = this.calculateProductsValueBrutto(record);
    const deliveryPrice = Number(record.delivery_price) || Number(record.delivery_price_brutto) || 0;
    return Math.round((productsValue + deliveryPrice) * 100) / 100;
  }

  /**
   * Oblicza całkowitą wartość zamówienia netto
   * @param {Object} record
   * @returns {number}
   */
  calculateOrderValueNetto(record) {
    const productsNetto = this.calculateProductsValueNetto(record);
    const deliveryBrutto = Number(record.delivery_price) || Number(record.delivery_price_brutto) || 0;
    const deliveryVat = Number(record.delivery_vat_rate) || 23;
    const deliveryNetto = deliveryBrutto / (1 + deliveryVat / 100);
    return Math.round((productsNetto + deliveryNetto) * 100) / 100;
  }

  /**
   * Oblicza całkowitą wartość zamówienia (dla statusu płatności)
   * @param {Object} record
   * @returns {number}
   */
  calculateOrderTotal(record) {
    return this.calculateOrderValueBrutto(record);
  }

  /**
   * Ewaluuje pole customowe (formuła z placeholderami)
   * @param {string} template - Szablon np. "https://shop.com/order/{order_id}"
   * @param {Object} record - Rekord danych
   * @returns {string}
   */
  evaluateCustomField(template, record) {
    if (!template) return '';

    // Zamień placeholdery {field_key} na wartości z rekordu
    return template.replace(/\{(\w+)\}/g, (match, fieldKey) => {
      const value = this.getNestedValue(record, fieldKey);

      if (value === null || value === undefined) {
        return '';
      }

      return String(value);
    });
  }
}

module.exports = DataTransformer;
