/**
 * Basic Data Fetcher
 *
 * Pobiera dane słownikowe z BaseLinker API.
 * Obsługuje wiele typów danych konfiguracyjnych.
 */

const BaseFetcher = require('./BaseFetcher');

class BasicDataFetcher extends BaseFetcher {
  constructor() {
    super('basic_data');

    // Mapowanie typów na metody API i sposób ekstrakcji danych
    this.dataTypeConfig = {
      order_statuses: {
        method: 'getOrderStatusList',
        extract: (r) => Object.entries(r.statuses || {}).map(([id, data]) => ({ id: parseInt(id), ...data })),
        normalize: this.normalizeStatus.bind(this)
      },
      order_sources: {
        method: 'getOrderSources',
        extract: (r) => Object.entries(r.sources || {}).map(([id, data]) => ({ id: parseInt(id), ...data })),
        normalize: this.normalizeSource.bind(this)
      },
      order_extra_fields: {
        method: 'getOrderExtraFields',
        extract: (r) => r.extra_fields || [],
        normalize: this.normalizeExtraField.bind(this)
      },
      inventories: {
        method: 'getInventories',
        extract: (r) => r.inventories || [],
        normalize: this.normalizeInventory.bind(this)
      },
      categories: {
        method: 'getInventoryCategories',
        requiresInventory: true,
        extract: (r) => Object.entries(r.categories || {}).map(([id, data]) => ({ id: parseInt(id), ...data })),
        normalize: this.normalizeCategory.bind(this)
      },
      manufacturers: {
        method: 'getInventoryManufacturers',
        extract: (r) => Object.entries(r.manufacturers || {}).map(([id, name]) => ({ id: parseInt(id), name })),
        normalize: this.normalizeManufacturer.bind(this)
      },
      tags: {
        method: 'getInventoryTags',
        extract: (r) => Object.entries(r.tags || {}).map(([id, name]) => ({ id: parseInt(id), name })),
        normalize: this.normalizeTag.bind(this)
      },
      price_groups: {
        method: 'getInventoryPriceGroups',
        extract: (r) => r.price_groups || [],
        normalize: this.normalizePriceGroup.bind(this)
      },
      warehouses: {
        method: 'getInventoryWarehouses',
        extract: (r) => r.warehouses || [],
        normalize: this.normalizeWarehouse.bind(this)
      },
      product_extra_fields: {
        method: 'getInventoryExtraFields',
        extract: (r) => r.extra_fields || [],
        normalize: this.normalizeProductExtraField.bind(this)
      },
      integrations: {
        method: 'getInventoryIntegrations',
        extract: (r) => r.integrations || [],
        normalize: this.normalizeIntegration.bind(this)
      },
      couriers: {
        method: 'getCouriersList',
        extract: (r) => r.couriers || [],
        normalize: this.normalizeCourier.bind(this)
      },
      courier_accounts: {
        method: 'getCourierAccounts',
        extract: (r) => r.accounts || [],
        normalize: this.normalizeCourierAccount.bind(this)
      },
      external_storages: {
        method: 'getExternalStoragesList',
        extract: (r) => r.storages || [],
        normalize: this.normalizeExternalStorage.bind(this)
      },
      return_statuses: {
        method: 'getOrderReturnStatusList',
        extract: (r) => Object.entries(r.statuses || {}).map(([id, data]) => ({ id: parseInt(id), ...data })),
        normalize: this.normalizeReturnStatus.bind(this)
      },
      return_reasons: {
        method: 'getOrderReturnReasonsList',
        extract: (r) => Object.entries(r.reasons || {}).map(([id, name]) => ({ id: parseInt(id), name })),
        normalize: this.normalizeReturnReason.bind(this)
      },
      return_product_statuses: {
        method: 'getOrderReturnProductStatuses',
        extract: (r) => Object.entries(r.statuses || {}).map(([id, name]) => ({ id: parseInt(id), name })),
        normalize: this.normalizeReturnProductStatus.bind(this)
      },
      return_extra_fields: {
        method: 'getOrderReturnExtraFields',
        extract: (r) => r.extra_fields || [],
        normalize: this.normalizeReturnExtraField.bind(this)
      },
      document_series: {
        method: 'getInventoryDocumentSeries',
        extract: (r) => r.series || [],
        normalize: this.normalizeDocumentSeries.bind(this)
      },
      po_series: {
        method: 'getInventoryPurchaseOrderSeries',
        extract: (r) => r.series || [],
        normalize: this.normalizePOSeries.bind(this)
      },
      suppliers: {
        method: 'getInventorySuppliers',
        extract: (r) => r.suppliers || [],
        normalize: this.normalizeSupplier.bind(this)
      },
      payers: {
        method: 'getInventoryPayers',
        extract: (r) => r.payers || [],
        normalize: this.normalizePayer.bind(this)
      },
      invoice_series: {
        method: 'getSeries',
        extract: (r) => r.series || [],
        normalize: this.normalizeInvoiceSeries.bind(this)
      },
      order_printouts: {
        method: 'getOrderPrintoutTemplates',
        extract: (r) => r.printouts || [],
        normalize: this.normalizePrintout.bind(this)
      },
      inventory_printouts: {
        method: 'getInventoryPrintoutTemplates',
        extract: (r) => r.printouts || [],
        normalize: this.normalizePrintout.bind(this)
      }
    };
  }

  /**
   * Pobiera dane słownikowe
   *
   * @param {string} token - Token API BaseLinker
   * @param {object} filters - Filtry
   * @param {string} filters.dataType - Typ danych do pobrania (wymagany)
   * @param {number} filters.inventoryId - ID katalogu (dla niektórych typów)
   * @param {object} options - Opcje
   * @returns {Promise<Array>} - Tablica znormalizowanych danych
   */
  async fetch(token, filters = {}, options = {}) {
    this.resetStats();
    this.logFetchStart({ filters, options });

    const dataType = filters.dataType || options.dataType;

    if (!dataType) {
      throw new Error('dataType is required for basic_data dataset');
    }

    const config = this.dataTypeConfig[dataType];
    if (!config) {
      throw new Error(`Unknown dataType: ${dataType}. Available: ${Object.keys(this.dataTypeConfig).join(', ')}`);
    }

    try {
      // Przygotuj parametry
      const params = {};

      if (config.requiresInventory) {
        const inventoryId = filters.inventoryId || options.inventoryId;
        if (!inventoryId) {
          throw new Error(`inventoryId is required for ${dataType}`);
        }
        params.inventory_id = inventoryId;
      }

      // Wywołaj API
      this.stats.apiCalls++;
      const response = await this.baselinkerService.makeRequest(token, config.method, params);

      // Wyekstrahuj i znormalizuj dane
      const rawData = config.extract(response);
      const normalizedData = rawData.map(item => config.normalize(item, dataType));

      this.logFetchComplete(normalizedData.length);

      return normalizedData;

    } catch (error) {
      this.logError('Fetch failed', error);
      throw error;
    }
  }

  // === NORMALIZATORY ===

  normalizeStatus(status, dataType) {
    return {
      id: status.id,
      name: status.name || null,
      data_type: dataType,
      code: null,
      color: status.color || null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(status)
    };
  }

  normalizeSource(source, dataType) {
    return {
      id: source.id,
      name: source.name || null,
      data_type: dataType,
      code: source.source || null,
      color: null,
      type: source.source_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(source)
    };
  }

  normalizeExtraField(field, dataType) {
    return {
      id: field.extra_field_id,
      name: field.name || null,
      data_type: dataType,
      code: field.kind || null,
      color: null,
      type: field.editor_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(field)
    };
  }

  normalizeInventory(inventory, dataType) {
    return {
      id: inventory.inventory_id,
      name: inventory.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: inventory.is_default ? 'default' : 'standard',
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(inventory)
    };
  }

  normalizeCategory(category, dataType) {
    return {
      id: category.id,
      name: category.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: category.parent_id || null,
      level: null,
      raw_json: JSON.stringify(category)
    };
  }

  normalizeManufacturer(manufacturer, dataType) {
    return {
      id: manufacturer.id,
      name: manufacturer.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(manufacturer)
    };
  }

  normalizeTag(tag, dataType) {
    return {
      id: tag.id,
      name: tag.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(tag)
    };
  }

  normalizePriceGroup(group, dataType) {
    return {
      id: group.price_group_id,
      name: group.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: group.is_default ? 'default' : 'standard',
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(group)
    };
  }

  normalizeWarehouse(warehouse, dataType) {
    return {
      id: warehouse.warehouse_id,
      name: warehouse.name || null,
      data_type: dataType,
      code: warehouse.warehouse_type || null,
      color: null,
      type: warehouse.warehouse_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(warehouse)
    };
  }

  normalizeProductExtraField(field, dataType) {
    return {
      id: field.extra_field_id,
      name: field.name || null,
      data_type: dataType,
      code: field.kind || null,
      color: null,
      type: field.editor_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(field)
    };
  }

  normalizeIntegration(integration, dataType) {
    return {
      id: integration.integration_id,
      name: integration.name || null,
      data_type: dataType,
      code: integration.handler || null,
      color: null,
      type: integration.handler || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(integration)
    };
  }

  normalizeCourier(courier, dataType) {
    return {
      id: null,
      name: courier.name || null,
      data_type: dataType,
      code: courier.code || null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(courier)
    };
  }

  normalizeCourierAccount(account, dataType) {
    return {
      id: account.account_id,
      name: account.name || null,
      data_type: dataType,
      code: account.courier_code || null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(account)
    };
  }

  normalizeExternalStorage(storage, dataType) {
    return {
      id: storage.storage_id,
      name: storage.name || null,
      data_type: dataType,
      code: storage.type || null,
      color: null,
      type: storage.type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(storage)
    };
  }

  normalizeReturnStatus(status, dataType) {
    return {
      id: status.id,
      name: status.name || null,
      data_type: dataType,
      code: null,
      color: status.color || null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(status)
    };
  }

  normalizeReturnReason(reason, dataType) {
    return {
      id: reason.id,
      name: reason.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(reason)
    };
  }

  normalizeReturnProductStatus(status, dataType) {
    return {
      id: status.id,
      name: status.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(status)
    };
  }

  normalizeReturnExtraField(field, dataType) {
    return {
      id: field.extra_field_id,
      name: field.name || null,
      data_type: dataType,
      code: field.kind || null,
      color: null,
      type: field.editor_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(field)
    };
  }

  normalizeDocumentSeries(series, dataType) {
    return {
      id: series.series_id,
      name: series.name || null,
      data_type: dataType,
      code: series.prefix || null,
      color: null,
      type: series.document_type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(series)
    };
  }

  normalizePOSeries(series, dataType) {
    return {
      id: series.series_id,
      name: series.name || null,
      data_type: dataType,
      code: series.prefix || null,
      color: null,
      type: 'purchase_order',
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(series)
    };
  }

  normalizeSupplier(supplier, dataType) {
    return {
      id: supplier.supplier_id,
      name: supplier.name || null,
      data_type: dataType,
      code: supplier.code || null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(supplier)
    };
  }

  normalizePayer(payer, dataType) {
    return {
      id: payer.payer_id,
      name: payer.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(payer)
    };
  }

  normalizeInvoiceSeries(series, dataType) {
    return {
      id: series.series_id,
      name: series.name || null,
      data_type: dataType,
      code: series.prefix || null,
      color: null,
      type: series.type || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(series)
    };
  }

  normalizePrintout(printout, dataType) {
    return {
      id: printout.printout_id,
      name: printout.name || null,
      data_type: dataType,
      code: null,
      color: null,
      type: printout.file_format || null,
      is_active: true,
      parent_id: null,
      level: null,
      raw_json: JSON.stringify(printout)
    };
  }
}

module.exports = BasicDataFetcher;
