/**
 * Export Pipeline
 *
 * Orkiestruje cały proces eksportu:
 * 1. Pobiera główne dane (primary query)
 * 2. Wzbogaca dane (enrichments) - tylko te wymagane przez wybrane pola
 * 3. Transformuje do formatu wyjściowego
 * 4. Zapisuje do Google Sheets
 *
 * Wykorzystuje wzorzec Strategy dla różnych datasetów i enricherów.
 */

const logger = require('../../utils/logger');
const { getDataset, getRequiredEnrichments } = require('../../config/datasets');

// Fetchers
const FetcherRegistry = require('./fetchers');

// Enrichers
const EnricherRegistry = require('./enrichers');

// Transformer
const DataTransformer = require('./DataTransformer');

/**
 * Konfiguracja eksportu
 * @typedef {Object} ExportConfig
 * @property {string} datasetId - ID datasetu (np. 'orders', 'order_items')
 * @property {string[]} selectedFields - Lista wybranych kluczy pól
 * @property {Object} filters - Filtry do zastosowania
 * @property {Object} [currencyConversion] - Opcjonalna konfiguracja przewalutowania
 * @property {string} currencyConversion.targetCurrency - Waluta docelowa (np. 'PLN')
 * @property {string} currencyConversion.rateSource - Źródło daty kursu: 'document_date', 'order_date', 'ship_date', 'today'
 * @property {Object} [customHeaders] - Mapowanie field_key -> custom_header
 * @property {Object[]} [customFields] - Pola customowe (formuły)
 * @property {number} [inventoryId] - ID katalogu (dla products_catalog)
 * @property {string} [externalStorageId] - ID zewnętrznego magazynu (dla products_external)
 * @property {number} [integrationId] - ID integracji (dla base_connect)
 */

/**
 * Kontekst wykonania eksportu
 * @typedef {Object} ExportContext
 * @property {string} token - Token BaseLinker
 * @property {Object} statusMap - Mapa statusów { id -> name }
 * @property {Object} courierMap - Mapa kurierów { code -> name }
 * @property {Object} warehouseMap - Mapa magazynów { id -> name }
 * @property {Object} [extraFieldsMap] - Mapa pól dodatkowych { key -> label }
 */

class ExportPipeline {
  /**
   * @param {ExportConfig} config - Konfiguracja eksportu
   * @param {ExportContext} context - Kontekst z tokenem i mapami referencyjnymi
   */
  constructor(config, context) {
    this.config = config;
    this.context = context;
    this.dataset = getDataset(config.datasetId);

    if (!this.dataset) {
      throw new Error(`Unknown dataset: ${config.datasetId}`);
    }

    // Określ wymagane enrichmenty na podstawie wybranych pól
    this.requiredEnrichments = getRequiredEnrichments(
      config.datasetId,
      config.selectedFields
    );

    // Dodaj currency enrichment jeśli włączone przewalutowanie
    if (config.currencyConversion?.targetCurrency) {
      if (!this.requiredEnrichments.includes('currency')) {
        this.requiredEnrichments.push('currency');
      }
    }

    // Statystyki wykonania
    this.stats = {
      startTime: null,
      endTime: null,
      primaryRecords: 0,
      enrichedRecords: 0,
      transformedRecords: 0,
      errors: []
    };

    logger.info('ExportPipeline initialized', {
      datasetId: config.datasetId,
      selectedFieldsCount: config.selectedFields.length,
      requiredEnrichments: this.requiredEnrichments,
      hasCurrencyConversion: !!config.currencyConversion?.targetCurrency
    });
  }

  /**
   * Wykonuje cały pipeline eksportu
   * @returns {Promise<Object>} Wynik eksportu { rows, headers, stats }
   */
  async execute() {
    this.stats.startTime = Date.now();

    try {
      // 1. Pobierz główne dane
      logger.info('Step 1: Fetching primary data', {
        dataset: this.config.datasetId,
        primaryQuery: this.dataset.primaryQuery
      });

      const rawData = await this.fetchPrimaryData();
      this.stats.primaryRecords = rawData.length;

      if (rawData.length === 0) {
        logger.info('No records found, returning empty result');
        return this.buildEmptyResult();
      }

      logger.info(`Fetched ${rawData.length} primary records`);

      // 2. Wzbogać dane (jeśli potrzebne)
      let enrichedData = rawData;

      if (this.requiredEnrichments.length > 0) {
        logger.info('Step 2: Applying enrichments', {
          enrichments: this.requiredEnrichments
        });

        enrichedData = await this.applyEnrichments(rawData);
        this.stats.enrichedRecords = enrichedData.length;
      } else {
        logger.info('Step 2: Skipped (no enrichments required)');
        this.stats.enrichedRecords = rawData.length;
      }

      // 3. Transformuj do formatu wyjściowego
      logger.info('Step 3: Transforming data');

      const transformer = new DataTransformer(
        this.dataset,
        this.config.selectedFields,
        {
          customHeaders: this.config.customHeaders,
          customFields: this.config.customFields,
          statusMap: this.context.statusMap,
          courierMap: this.context.courierMap,
          warehouseMap: this.context.warehouseMap,
          extraFieldsMap: this.context.extraFieldsMap
        }
      );

      const result = transformer.transform(enrichedData);
      this.stats.transformedRecords = result.rows.length;

      this.stats.endTime = Date.now();

      logger.info('Export pipeline completed', {
        duration: this.stats.endTime - this.stats.startTime,
        primaryRecords: this.stats.primaryRecords,
        outputRows: this.stats.transformedRecords
      });

      return {
        headers: result.headers,
        rows: result.rows,
        stats: this.getStats()
      };

    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.errors.push(error.message);

      logger.error('Export pipeline failed', {
        error: error.message,
        dataset: this.config.datasetId,
        duration: this.stats.endTime - this.stats.startTime
      });

      throw error;
    }
  }

  /**
   * Pobiera główne dane za pomocą odpowiedniego fetchera
   * @returns {Promise<Object[]>}
   */
  async fetchPrimaryData() {
    const fetcher = FetcherRegistry.get(this.config.datasetId);

    if (!fetcher) {
      throw new Error(`No fetcher registered for dataset: ${this.config.datasetId}`);
    }

    return fetcher.fetch(this.context.token, this.config.filters, {
      inventoryId: this.config.inventoryId,
      externalStorageId: this.config.externalStorageId,
      integrationId: this.config.integrationId
    });
  }

  /**
   * Aplikuje enrichmenty do danych
   * @param {Object[]} data - Surowe dane
   * @returns {Promise<Object[]>}
   */
  async applyEnrichments(data) {
    let enrichedData = [...data];

    for (const enrichmentName of this.requiredEnrichments) {
      const enricher = EnricherRegistry.get(enrichmentName);

      if (!enricher) {
        logger.warn(`Enricher not found: ${enrichmentName}, skipping`);
        continue;
      }

      logger.debug(`Applying enricher: ${enrichmentName}`);

      enrichedData = await enricher.enrich(
        enrichedData,
        this.context.token,
        {
          currencyConfig: this.config.currencyConversion,
          inventoryId: this.config.inventoryId,
          statusMap: this.context.statusMap,
          courierMap: this.context.courierMap,
          warehouseMap: this.context.warehouseMap
        }
      );
    }

    return enrichedData;
  }

  /**
   * Buduje pusty wynik (gdy brak danych)
   * @returns {Object}
   */
  buildEmptyResult() {
    const transformer = new DataTransformer(
      this.dataset,
      this.config.selectedFields,
      {
        customHeaders: this.config.customHeaders,
        statusMap: this.context.statusMap
      }
    );

    return {
      headers: transformer.getHeaders(),
      rows: [],
      stats: this.getStats()
    };
  }

  /**
   * Zwraca statystyki wykonania
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      durationMs: this.stats.endTime
        ? this.stats.endTime - this.stats.startTime
        : null
    };
  }
}

module.exports = ExportPipeline;
