/**
 * Data Transformer
 *
 * Transformuje surowe dane do formatu gotowego do eksportu (Google Sheets).
 *
 * Odpowiedzialności:
 * - Mapowanie pól na kolumny
 * - Formatowanie wartości (daty, liczby, boolean)
 * - Obsługa custom headers
 * - Obsługa custom fields (formuły z placeholderami)
 * - Obsługa pustych kolumn (_empty_)
 */

const logger = require('../../utils/logger');
const { getDataset, getField } = require('../../config/datasets');

class DataTransformer {
  /**
   * @param {object} dataset - Definicja datasetu
   * @param {Array<string>} selectedFields - Lista kluczy wybranych pól
   * @param {object} options - Opcje transformacji
   * @param {object} options.customHeaders - Mapa: fieldKey -> customLabel
   * @param {Array} options.customFields - Custom fields z template'ami
   * @param {object} options.formatOptions - Opcje formatowania
   */
  constructor(dataset, selectedFields, options = {}) {
    this.dataset = dataset;
    this.selectedFields = selectedFields || [];
    this.options = {
      customHeaders: options.customHeaders || {},
      customFields: options.customFields || [],
      formatOptions: {
        dateFormat: options.formatOptions?.dateFormat || 'ISO',
        decimalPlaces: options.formatOptions?.decimalPlaces || 2,
        booleanTrue: options.formatOptions?.booleanTrue || 'TAK',
        booleanFalse: options.formatOptions?.booleanFalse || 'NIE',
        nullValue: options.formatOptions?.nullValue || '',
        ...options.formatOptions
      }
    };

    // Zbuduj mapę pól i kolumn
    this.fieldMap = this.buildFieldMap();
    this.columns = this.buildColumns();
  }

  /**
   * Buduje mapę pól: fieldKey -> fieldDefinition
   * @returns {Map}
   */
  buildFieldMap() {
    const map = new Map();

    if (!this.dataset || !this.dataset.fieldGroups) {
      return map;
    }

    for (const group of this.dataset.fieldGroups) {
      for (const field of group.fields || []) {
        map.set(field.key, {
          ...field,
          groupId: group.id,
          groupLabel: group.label
        });
      }
    }

    // Dodaj custom fields do mapy
    for (const customField of this.options.customFields) {
      map.set(customField.key, {
        key: customField.key,
        label: customField.label,
        type: 'custom',
        template: customField.template,
        computed: true
      });
    }

    return map;
  }

  /**
   * Buduje listę kolumn do eksportu
   * @returns {Array}
   */
  buildColumns() {
    return this.selectedFields.map((fieldKey, index) => {
      // Spacer/pusta kolumna
      if (fieldKey.startsWith('_empty_') || fieldKey === '_empty_') {
        return {
          key: fieldKey,
          label: '',
          type: 'empty',
          index
        };
      }

      // Custom field
      if (fieldKey.startsWith('_custom_')) {
        const customField = this.options.customFields.find(f => f.key === fieldKey);
        return {
          key: fieldKey,
          label: customField?.label || fieldKey,
          type: 'custom',
          template: customField?.template || '',
          index
        };
      }

      // Standardowe pole
      const fieldDef = this.fieldMap.get(fieldKey);

      if (!fieldDef) {
        logger.warn(`DataTransformer: Unknown field '${fieldKey}'`);
        return {
          key: fieldKey,
          label: fieldKey,
          type: 'text',
          index
        };
      }

      return {
        key: fieldKey,
        label: this.options.customHeaders[fieldKey] || fieldDef.label,
        type: fieldDef.type || 'text',
        index,
        fieldDef
      };
    });
  }

  /**
   * Zwraca nagłówki kolumn
   * @returns {Array<string>}
   */
  getHeaders() {
    return this.columns.map(col => col.label);
  }

  /**
   * Transformuje dane do formatu eksportu
   *
   * @param {Array} data - Tablica rekordów
   * @returns {object} - { headers: [], rows: [] }
   */
  transform(data) {
    const headers = this.getHeaders();
    const rows = [];

    for (const record of data) {
      const row = this.transformRecord(record);
      rows.push(row);
    }

    logger.info(`DataTransformer: Transformed ${rows.length} records`, {
      datasetId: this.dataset?.id,
      columnsCount: this.columns.length
    });

    return { headers, rows };
  }

  /**
   * Transformuje pojedynczy rekord do wiersza
   *
   * @param {object} record - Rekord danych
   * @returns {Array} - Wartości wiersza
   */
  transformRecord(record) {
    return this.columns.map(column => {
      // Pusta kolumna
      if (column.type === 'empty') {
        return '';
      }

      // Custom field z template
      if (column.type === 'custom' && column.template) {
        return this.evaluateTemplate(column.template, record);
      }

      // Standardowe pole
      const rawValue = this.getFieldValue(record, column.key);
      return this.formatValue(rawValue, column.type);
    });
  }

  /**
   * Pobiera wartość pola z rekordu
   * Obsługuje zagnieżdżone ścieżki (np. 'address.city')
   *
   * @param {object} record - Rekord
   * @param {string} fieldKey - Klucz pola
   * @returns {*} - Wartość
   */
  getFieldValue(record, fieldKey) {
    if (!record || !fieldKey) {
      return null;
    }

    // Prosta wartość
    if (fieldKey in record) {
      return record[fieldKey];
    }

    // Zagnieżdżona ścieżka
    if (fieldKey.includes('.')) {
      const parts = fieldKey.split('.');
      let value = record;

      for (const part of parts) {
        if (value === null || value === undefined) {
          return null;
        }
        value = value[part];
      }

      return value;
    }

    return null;
  }

  /**
   * Formatuje wartość według typu
   *
   * @param {*} value - Wartość do formatowania
   * @param {string} type - Typ pola
   * @returns {*} - Sformatowana wartość
   */
  formatValue(value, type) {
    const { formatOptions } = this.options;

    // Null/undefined
    if (value === null || value === undefined) {
      return formatOptions.nullValue;
    }

    switch (type) {
      case 'datetime':
        return this.formatDateTime(value);

      case 'date':
        return this.formatDate(value);

      case 'number':
        return this.formatNumber(value);

      case 'currency':
        return this.formatCurrency(value);

      case 'boolean':
        return this.formatBoolean(value);

      case 'array':
        return this.formatArray(value);

      case 'object':
        return this.formatObject(value);

      case 'text':
      default:
        return this.formatText(value);
    }
  }

  /**
   * Formatuje datę i czas
   * @param {*} value - Wartość (timestamp, Date, string)
   * @returns {string}
   */
  formatDateTime(value) {
    if (!value) return this.options.formatOptions.nullValue;

    try {
      let date;

      // Unix timestamp (sekundy)
      if (typeof value === 'number') {
        date = new Date(value > 9999999999 ? value : value * 1000);
      } else if (typeof value === 'string') {
        date = new Date(value);
      } else if (value instanceof Date) {
        date = value;
      } else {
        return String(value);
      }

      if (isNaN(date.getTime())) {
        return String(value);
      }

      // Format: YYYY-MM-DD HH:mm:ss
      const pad = n => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch {
      return String(value);
    }
  }

  /**
   * Formatuje datę (bez czasu)
   * @param {*} value - Wartość
   * @returns {string}
   */
  formatDate(value) {
    if (!value) return this.options.formatOptions.nullValue;

    try {
      let date;

      if (typeof value === 'number') {
        date = new Date(value > 9999999999 ? value : value * 1000);
      } else if (typeof value === 'string') {
        date = new Date(value);
      } else if (value instanceof Date) {
        date = value;
      } else {
        return String(value);
      }

      if (isNaN(date.getTime())) {
        return String(value);
      }

      // Format: YYYY-MM-DD
      const pad = n => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    } catch {
      return String(value);
    }
  }

  /**
   * Formatuje liczbę
   * @param {*} value - Wartość
   * @returns {number|string}
   */
  formatNumber(value) {
    if (value === null || value === undefined || value === '') {
      return this.options.formatOptions.nullValue;
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
      return String(value);
    }

    return Number(num.toFixed(this.options.formatOptions.decimalPlaces));
  }

  /**
   * Formatuje walutę
   * @param {*} value - Wartość
   * @returns {string}
   */
  formatCurrency(value) {
    const num = this.formatNumber(value);
    if (typeof num === 'number') {
      return num.toFixed(2);
    }
    return num;
  }

  /**
   * Formatuje boolean
   * @param {*} value - Wartość
   * @returns {string}
   */
  formatBoolean(value) {
    if (value === null || value === undefined) {
      return this.options.formatOptions.nullValue;
    }

    // Konwertuj różne reprezentacje
    let boolValue;

    if (typeof value === 'boolean') {
      boolValue = value;
    } else if (typeof value === 'number') {
      boolValue = value !== 0;
    } else if (typeof value === 'string') {
      boolValue = value.toLowerCase() === 'true' || value === '1';
    } else {
      boolValue = Boolean(value);
    }

    return boolValue
      ? this.options.formatOptions.booleanTrue
      : this.options.formatOptions.booleanFalse;
  }

  /**
   * Formatuje tablicę
   * @param {Array} value - Tablica
   * @returns {string}
   */
  formatArray(value) {
    if (!Array.isArray(value)) {
      return this.formatText(value);
    }

    return value
      .map(item => {
        if (typeof item === 'object') {
          return JSON.stringify(item);
        }
        return String(item);
      })
      .join(', ');
  }

  /**
   * Formatuje obiekt
   * @param {object} value - Obiekt
   * @returns {string}
   */
  formatObject(value) {
    if (typeof value !== 'object' || value === null) {
      return this.formatText(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Formatuje tekst
   * @param {*} value - Wartość
   * @returns {string}
   */
  formatText(value) {
    if (value === null || value === undefined) {
      return this.options.formatOptions.nullValue;
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  /**
   * Ewaluuje template z placeholderami
   * Placeholder: {field_name}
   *
   * @param {string} template - Template z placeholderami
   * @param {object} record - Rekord danych
   * @returns {string}
   */
  evaluateTemplate(template, record) {
    if (!template) return '';

    return template.replace(/\{(\w+)\}/g, (match, fieldKey) => {
      const value = this.getFieldValue(record, fieldKey);

      if (value === null || value === undefined) {
        return '';
      }

      return String(value);
    });
  }

  /**
   * Zwraca informacje o kolumnach
   * @returns {Array}
   */
  getColumnInfo() {
    return this.columns.map(col => ({
      key: col.key,
      label: col.label,
      type: col.type,
      index: col.index
    }));
  }
}

module.exports = DataTransformer;
