/**
 * Field Definitions Service
 *
 * Serwis do pobierania definicji pól dla UI (ExportWizard).
 * Zwraca strukturę datasetów, grup pól i pojedynczych pól
 * do wyświetlenia w interfejsie wyboru eksportu.
 */

const logger = require('../../utils/logger');
const { getAllDatasets, getDataset, getDatasetFields } = require('../../config/datasets');
const baselinkerService = require('../baselinkerService');

/**
 * Pobiera pełne definicje pól dla wszystkich datasetów
 *
 * @param {string} token - Token API BaseLinker (opcjonalnie, do pobrania dynamicznych pól)
 * @param {object} options - Opcje
 * @returns {Promise<object>} - Definicje pól
 */
async function getFieldDefinitions(token = null, options = {}) {
  try {
    // Pobierz wszystkie datasety
    const allDatasets = getAllDatasets();

    // Mapuj datasety do formatu dla UI
    const datasets = allDatasets.map(dataset => ({
      id: dataset.id,
      label: dataset.label || dataset.name,
      description: dataset.description,
      icon: dataset.icon,
      requiresInventory: dataset.requiresInventory || false,
      requiresStorage: dataset.requiresStorage || false,
      requiresIntegration: dataset.requiresIntegration || false,
      availableFilters: dataset.availableFilters || dataset.filters || [],
      fieldGroups: dataset.fieldGroups.map(group => ({
        id: group.id,
        label: group.label,
        description: group.description,
        dynamic: group.dynamic || false,
        fields: group.fields.map(field => ({
          key: field.key,
          label: field.label,
          type: field.type,
          description: field.description,
          enrichment: field.enrichment || null,
          computed: field.computed || false
        }))
      }))
    }));

    // Pobierz dynamiczne pola jeśli jest token
    let dynamicFields = {};
    if (token) {
      try {
        dynamicFields = await fetchAllDynamicFields(token);
      } catch (err) {
        logger.warn('Failed to fetch dynamic fields', { error: err.message });
      }
    }

    return {
      datasets,
      dynamicFields,
      supportedCurrencies: ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK'],
      currencyRateSources: [
        { value: 'document_date', label: 'Data dokumentu sprzedaży' },
        { value: 'order_date', label: 'Data zamówienia' },
        { value: 'ship_date', label: 'Data wysyłki' },
        { value: 'today', label: 'Dzisiejsza data' }
      ]
    };

  } catch (error) {
    logger.error('Failed to get field definitions', { error: error.message });
    throw error;
  }
}

/**
 * Pobiera definicje pól dla konkretnego datasetu
 *
 * @param {string} datasetId - ID datasetu
 * @param {string} token - Token API BaseLinker
 * @param {object} options - Opcje
 * @returns {Promise<object|null>} - Definicja datasetu lub null
 */
async function getDatasetFieldDefinitions(datasetId, token = null, options = {}) {
  try {
    const dataset = getDataset(datasetId);

    if (!dataset) {
      return null;
    }

    // Pobierz dynamiczne pola dla tego datasetu
    let dynamicFields = [];
    if (token && dataset.fieldGroups) {
      for (const group of dataset.fieldGroups) {
        if (group.dynamic && group.source) {
          try {
            const fields = await fetchDynamicFields(group.source, token, options);
            dynamicFields = dynamicFields.concat(fields);
          } catch (err) {
            logger.warn(`Failed to fetch dynamic fields for ${group.source}`, {
              error: err.message
            });
          }
        }
      }
    }

    return {
      id: dataset.id,
      label: dataset.label || dataset.name,
      description: dataset.description,
      icon: dataset.icon,
      requiresInventory: dataset.requiresInventory || false,
      availableFilters: dataset.availableFilters || dataset.filters || [],
      fieldGroups: dataset.fieldGroups,
      dynamicFields,
      defaultFields: dataset.defaultFields || [],
      primaryKey: dataset.primaryKey
    };

  } catch (error) {
    logger.error('Failed to get dataset field definitions', {
      datasetId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Pobiera mapę dodatkowych pól zamówień
 *
 * @param {string} token - Token API BaseLinker
 * @returns {Promise<object>} - Mapa: field_key -> label
 */
async function getOrderExtraFieldsMap(token) {
  try {
    const extraFields = await baselinkerService.getOrderExtraFields(token);

    const map = {};

    // extraFields jest obiektem: { field_id: { name, editor_type, ... } }
    if (extraFields && typeof extraFields === 'object') {
      for (const [fieldId, fieldData] of Object.entries(extraFields)) {
        map[`ef_${fieldId}`] = fieldData.name || `Pole ${fieldId}`;
      }
    }

    return map;

  } catch (error) {
    logger.warn('Failed to get order extra fields', { error: error.message });
    return {};
  }
}

/**
 * Pobiera dynamiczne pola z określonego źródła
 *
 * @param {string} source - Źródło pól (np. 'getOrderExtraFields')
 * @param {string} token - Token API BaseLinker
 * @param {object} options - Opcje
 * @returns {Promise<Array>} - Tablica definicji pól
 */
async function fetchDynamicFields(source, token, options = {}) {
  try {
    switch (source) {
      case 'getOrderExtraFields':
      case 'orderExtraFields': {
        const extraFields = await baselinkerService.getOrderExtraFields(token);
        return Object.entries(extraFields || {}).map(([fieldId, fieldData]) => ({
          key: `ef_${fieldId}`,
          label: fieldData.name || `Pole ${fieldId}`,
          type: mapEditorTypeToFieldType(fieldData.editor_type),
          dynamic: true,
          source: 'orderExtraFields'
        }));
      }

      case 'getInventoryExtraFields':
      case 'inventoryExtraFields': {
        // TODO: Implement when needed
        return [];
      }

      case 'getOrderReturnExtraFields':
      case 'returnExtraFields': {
        // TODO: Implement when needed
        return [];
      }

      case 'priceGroups': {
        const priceGroups = await baselinkerService.getInventoryPriceGroups(token);
        logger.info('Fetched price groups from BaseLinker', {
          count: priceGroups.length,
          groups: priceGroups.map(g => ({ id: g.price_group_id, name: g.name, currency: g.currency }))
        });
        return priceGroups.map(group => ({
          key: `price_group_${group.price_group_id}`,
          label: `Cena: ${group.name || `Grupa ${group.price_group_id}`}`,
          type: 'number',
          dynamic: true,
          source: 'priceGroups',
          sourceId: group.price_group_id,
          enrichment: 'prices',
          metadata: {
            priceGroupId: group.price_group_id,
            currency: group.currency,
            isDefault: group.is_default
          }
        }));
      }

      case 'warehouses': {
        const warehouses = await baselinkerService.getInventoryWarehouses(token);
        return warehouses.map(warehouse => ({
          key: `stock_warehouse_${warehouse.warehouse_id}`,
          label: `Stan: ${warehouse.name || `Magazyn ${warehouse.warehouse_id}`}`,
          type: 'number',
          dynamic: true,
          source: 'warehouses',
          sourceId: warehouse.warehouse_id,
          enrichment: 'stock',
          metadata: {
            warehouseId: warehouse.warehouse_id,
            warehouseType: warehouse.warehouse_type,
            isDefault: warehouse.is_default
          }
        }));
      }

      case 'productFeatures': {
        // TODO: Implement when needed - requires inventoryId
        return [];
      }

      default:
        logger.warn(`Unknown dynamic field source: ${source}`);
        return [];
    }

  } catch (error) {
    logger.error(`Failed to fetch dynamic fields from ${source}`, {
      error: error.message,
      stack: error.stack
    });
    return [];
  }
}

/**
 * Pobiera wszystkie dynamiczne pola
 *
 * @param {string} token - Token API BaseLinker
 * @returns {Promise<object>} - Obiekt z dynamicznymi polami dla każdego źródła
 */
async function fetchAllDynamicFields(token) {
  const result = {
    orderExtraFields: [],
    inventoryExtraFields: [],
    returnExtraFields: [],
    priceGroups: [],
    warehouses: []
  };

  try {
    result.orderExtraFields = await fetchDynamicFields('orderExtraFields', token);
  } catch (err) {
    logger.warn('Failed to fetch order extra fields', { error: err.message });
  }

  try {
    result.priceGroups = await fetchDynamicFields('priceGroups', token);
    logger.info('Price groups loaded for field definitions', { count: result.priceGroups.length });
  } catch (err) {
    logger.error('Failed to fetch price groups', { error: err.message, stack: err.stack });
  }

  try {
    result.warehouses = await fetchDynamicFields('warehouses', token);
  } catch (err) {
    logger.warn('Failed to fetch warehouses', { error: err.message });
  }

  return result;
}

/**
 * Pobiera mapy grup cenowych i magazynow
 *
 * @param {string} token - Token API BaseLinker
 * @returns {Promise<object>} - { priceGroupsMap, warehousesMap }
 */
async function getPriceAndStockMaps(token) {
  const priceGroupsMap = {};
  const warehousesMap = {};

  try {
    const priceGroups = await baselinkerService.getInventoryPriceGroups(token);
    for (const group of priceGroups) {
      priceGroupsMap[group.price_group_id] = {
        name: group.name,
        currency: group.currency,
        isDefault: group.is_default
      };
    }
  } catch (err) {
    logger.warn('Failed to get price groups map', { error: err.message });
  }

  try {
    const warehouses = await baselinkerService.getInventoryWarehouses(token);
    for (const warehouse of warehouses) {
      warehousesMap[warehouse.warehouse_id] = {
        name: warehouse.name,
        type: warehouse.warehouse_type,
        isDefault: warehouse.is_default
      };
    }
  } catch (err) {
    logger.warn('Failed to get warehouses map', { error: err.message });
  }

  return { priceGroupsMap, warehousesMap };
}

/**
 * Mapuje typ edytora BaseLinker na typ pola
 *
 * @param {string} editorType - Typ edytora z BaseLinker
 * @returns {string} - Typ pola
 */
function mapEditorTypeToFieldType(editorType) {
  const mapping = {
    text: 'text',
    textarea: 'text',
    select: 'text',
    checkbox: 'boolean',
    date: 'date',
    datetime: 'datetime',
    number: 'number'
  };

  return mapping[editorType] || 'text';
}

/**
 * Pobiera mapę statusów zamówień
 *
 * @param {string} token - Token API BaseLinker
 * @returns {Promise<object>} - Mapa: status_id -> status_name
 */
async function getOrderStatusMap(token) {
  try {
    const statuses = await baselinkerService.getOrderStatusList(token);

    const map = {};
    for (const status of statuses) {
      map[status.id] = status.name;
    }

    return map;

  } catch (error) {
    logger.warn('Failed to get order status map', { error: error.message });
    return {};
  }
}

/**
 * Pobiera mapę źródeł zamówień
 *
 * @param {string} token - Token API BaseLinker
 * @returns {Promise<object>} - Mapa źródeł
 */
async function getOrderSourcesMap(token) {
  try {
    const sources = await baselinkerService.getOrderSources(token);

    const map = {};

    // sources jest obiektem: { type: { source_id: name, ... }, ... }
    for (const [type, sourcesOfType] of Object.entries(sources || {})) {
      for (const [sourceId, name] of Object.entries(sourcesOfType || {})) {
        map[sourceId] = { type, name };
      }
    }

    return map;

  } catch (error) {
    logger.warn('Failed to get order sources map', { error: error.message });
    return {};
  }
}

module.exports = {
  getFieldDefinitions,
  getDatasetFieldDefinitions,
  getOrderExtraFieldsMap,
  fetchDynamicFields,
  fetchAllDynamicFields,
  getOrderStatusMap,
  getOrderSourcesMap,
  getPriceAndStockMaps
};
