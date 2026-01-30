/**
 * Field Definitions Service
 *
 * Serwis do pobierania definicji pól dla UI (ExportWizard).
 * Łączy statyczne definicje z datasetów z dynamicznymi polami z BaseLinker API.
 */

const logger = require('../../utils/logger');
const { getAllDatasets, getDataset } = require('../../config/datasets');
const { getClient } = require('../baselinker');

/**
 * Pobiera pełną konfigurację pól dla wszystkich datasetów
 * @param {string} token - Token BaseLinker (opcjonalny, do dynamicznych pól)
 * @param {Object} options - Opcje
 * @param {number} [options.inventoryId] - ID katalogu (dla pól tekstowych produktów)
 * @returns {Promise<Object>}
 */
async function getFieldDefinitions(token = null, options = {}) {
  const datasets = getAllDatasets();
  const result = {
    datasets: [],
    supportedCurrencies: ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK'],
    currencyRateSources: [
      { value: 'document_date', label: 'Data dokumentu sprzedaży' },
      { value: 'order_date', label: 'Data zamówienia' },
      { value: 'ship_date', label: 'Data wysyłki' },
      { value: 'today', label: 'Dzisiejsza data' }
    ]
  };

  for (const dataset of datasets) {
    const datasetDef = await buildDatasetDefinition(dataset, token, options);
    result.datasets.push(datasetDef);
  }

  return result;
}

/**
 * Buduje definicję pojedynczego datasetu
 * @param {Object} dataset - Konfiguracja datasetu
 * @param {string} token - Token BaseLinker
 * @param {Object} options - Opcje
 * @returns {Promise<Object>}
 */
async function buildDatasetDefinition(dataset, token, options) {
  const definition = {
    id: dataset.id,
    label: dataset.label,
    description: dataset.description,
    icon: dataset.icon,
    requiresInventory: dataset.requiresInventory || false,
    requiresExternalStorage: dataset.requiresExternalStorage || false,
    requiresIntegration: dataset.requiresIntegration || false,
    enrichments: dataset.enrichments || [],
    fieldGroups: []
  };

  // Przetwórz grupy pól
  for (const group of dataset.fieldGroups) {
    const groupDef = await buildFieldGroupDefinition(group, dataset.id, token, options);

    // Dodaj grupę tylko jeśli ma pola
    if (groupDef.fields.length > 0 || groupDef.dynamic) {
      definition.fieldGroups.push(groupDef);
    }
  }

  return definition;
}

/**
 * Buduje definicję grupy pól
 * @param {Object} group - Konfiguracja grupy
 * @param {string} datasetId - ID datasetu
 * @param {string} token - Token BaseLinker
 * @param {Object} options - Opcje
 * @returns {Promise<Object>}
 */
async function buildFieldGroupDefinition(group, datasetId, token, options) {
  const groupDef = {
    id: group.id,
    label: group.label,
    enrichment: group.enrichment || null,
    dynamic: group.dynamic || false,
    fields: []
  };

  // Jeśli grupa jest dynamiczna, pobierz pola z API
  if (group.dynamic && token && group.source) {
    const dynamicFields = await fetchDynamicFields(group.source, token, options);
    groupDef.fields = dynamicFields;
  } else {
    // Standardowe pola
    groupDef.fields = group.fields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type,
      description: field.description || '',
      computed: field.computed || false,
      enrichment: field.enrichment || null,
      plan: 'free' // Wszystkie pola w FREE na razie
    }));
  }

  return groupDef;
}

/**
 * Pobiera dynamiczne pola z BaseLinker API
 * @param {string} source - Nazwa metody API
 * @param {string} token - Token BaseLinker
 * @param {Object} options - Opcje
 * @returns {Promise<Object[]>}
 */
async function fetchDynamicFields(source, token, options) {
  try {
    const client = getClient(token);
    let fields = [];

    switch (source) {
      case 'getOrderExtraFields':
        fields = await fetchOrderExtraFields(client);
        break;

      case 'getOrderReturnExtraFields':
        fields = await fetchReturnExtraFields(client);
        break;

      case 'getInventoryAvailableTextFieldKeys':
        if (options.inventoryId) {
          fields = await fetchInventoryTextFields(client, options.inventoryId);
        }
        break;

      default:
        logger.warn(`Unknown dynamic fields source: ${source}`);
    }

    return fields;

  } catch (error) {
    logger.warn('Failed to fetch dynamic fields', {
      source,
      error: error.message
    });
    return [];
  }
}

/**
 * Pobiera pola dodatkowe zamówień
 * @param {Object} client - Klient BaseLinker
 * @returns {Promise<Object[]>}
 */
async function fetchOrderExtraFields(client) {
  try {
    const response = await client.makeRequest('getOrderExtraFields', {});

    if (!response || !response.extra_fields) {
      return [];
    }

    // Response format: { extra_field_id: "Nazwa pola", ... }
    const extraFields = response.extra_fields;
    const fields = [];

    for (const [id, name] of Object.entries(extraFields)) {
      fields.push({
        key: `extra_field_${id}`,
        label: name || `Pole dodatkowe ${id}`,
        type: 'text',
        description: `Pole dodatkowe: ${name}`,
        dynamic: true,
        plan: 'free'
      });
    }

    return fields;

  } catch (error) {
    logger.warn('Failed to fetch order extra fields', { error: error.message });
    return [];
  }
}

/**
 * Pobiera pola dodatkowe zwrotów
 * @param {Object} client - Klient BaseLinker
 * @returns {Promise<Object[]>}
 */
async function fetchReturnExtraFields(client) {
  try {
    const response = await client.makeRequest('getOrderReturnExtraFields', {});

    if (!response || !response.extra_fields) {
      return [];
    }

    const extraFields = response.extra_fields;
    const fields = [];

    for (const [id, name] of Object.entries(extraFields)) {
      fields.push({
        key: `extra_field_${id}`,
        label: name || `Pole dodatkowe ${id}`,
        type: 'text',
        description: `Pole dodatkowe zwrotu: ${name}`,
        dynamic: true,
        plan: 'free'
      });
    }

    return fields;

  } catch (error) {
    logger.warn('Failed to fetch return extra fields', { error: error.message });
    return [];
  }
}

/**
 * Pobiera pola tekstowe z katalogu produktów
 * @param {Object} client - Klient BaseLinker
 * @param {number} inventoryId - ID katalogu
 * @returns {Promise<Object[]>}
 */
async function fetchInventoryTextFields(client, inventoryId) {
  try {
    // Najpierw pobierz dostępne klucze
    const keysResponse = await client.makeRequest('getInventoryAvailableTextFieldKeys', {
      inventory_id: inventoryId
    });

    if (!keysResponse || !keysResponse.text_field_keys) {
      return [];
    }

    // Potem pobierz nazwy pól (jeśli dostępne)
    let fieldNames = {};

    try {
      const extraFieldsResponse = await client.makeRequest('getInventoryExtraFields', {
        inventory_id: inventoryId
      });

      if (extraFieldsResponse && extraFieldsResponse.extra_fields) {
        fieldNames = extraFieldsResponse.extra_fields;
      }
    } catch (e) {
      // Ignoruj błąd, użyjemy kluczy jako nazw
    }

    const fields = [];

    for (const key of keysResponse.text_field_keys) {
      const name = fieldNames[key] || key;

      fields.push({
        key: `text_field_${key}`,
        label: name,
        type: 'text',
        description: `Pole tekstowe: ${name}`,
        dynamic: true,
        plan: 'free'
      });
    }

    return fields;

  } catch (error) {
    logger.warn('Failed to fetch inventory text fields', {
      inventoryId,
      error: error.message
    });
    return [];
  }
}

/**
 * Pobiera definicje pól dla konkretnego datasetu
 * @param {string} datasetId - ID datasetu
 * @param {string} token - Token BaseLinker
 * @param {Object} options - Opcje
 * @returns {Promise<Object|null>}
 */
async function getDatasetFieldDefinitions(datasetId, token = null, options = {}) {
  const dataset = getDataset(datasetId);

  if (!dataset) {
    return null;
  }

  return buildDatasetDefinition(dataset, token, options);
}

/**
 * Pobiera mapę extra fields dla zamówień (do enrichmentu)
 * @param {string} token - Token BaseLinker
 * @returns {Promise<Object>}
 */
async function getOrderExtraFieldsMap(token) {
  try {
    const client = getClient(token);
    const response = await client.makeRequest('getOrderExtraFields', {});

    if (!response || !response.extra_fields) {
      return {};
    }

    // Buduj mapę: extra_field_123 -> "Nazwa pola"
    const map = {};

    for (const [id, name] of Object.entries(response.extra_fields)) {
      map[`extra_field_${id}`] = name;
    }

    return map;

  } catch (error) {
    logger.warn('Failed to fetch order extra fields map', { error: error.message });
    return {};
  }
}

module.exports = {
  getFieldDefinitions,
  getDatasetFieldDefinitions,
  getOrderExtraFieldsMap,
  fetchDynamicFields
};
