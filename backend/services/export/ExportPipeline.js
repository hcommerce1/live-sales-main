/**
 * Export Pipeline
 *
 * Orkiestruje cały proces eksportu w 3 fazach:
 * 1. FETCH - Pobieranie danych głównych przez Fetcher
 * 2. ENRICH - Wzbogacanie o dane dodatkowe przez Enrichery
 * 3. TRANSFORM - Transformacja do formatu wyjścia
 *
 * Automatycznie wyznacza wymagane enrichmenty na podstawie wybranych pól.
 */

const logger = require('../../utils/logger');
const DataTransformer = require('./DataTransformer');
const { getDataset, getRequiredEnrichments } = require('../../config/datasets');
const FetcherRegistry = require('./fetchers');
const EnricherRegistry = require('./enrichers');

class ExportPipeline {
  /**
   * @param {object} config - Konfiguracja eksportu
   * @param {string} config.datasetId - ID datasetu
   * @param {Array<string>} config.selectedFields - Wybrane pola
   * @param {object} config.filters - Filtry (dateFrom, dateTo, statusId, etc.)
   * @param {object} config.customHeaders - Mapa: fieldKey -> customLabel
   * @param {Array} config.customFields - Custom fields z template'ami
   * @param {object} config.currencyConversion - Opcje konwersji walut
   * @param {number} config.inventoryId - ID katalogu (dla products_catalog)
   * @param {string} config.storageId - ID magazynu zewnętrznego (dla products_external)
   * @param {number} config.integrationId - ID integracji (dla base_connect)
   * @param {string} config.subCategory - Sub-kategoria (dla basic_data)
   *
   * @param {object} context - Kontekst wykonania
   * @param {string} context.token - Token API BaseLinker
   * @param {object} context.statusMap - Mapa statusów: id -> name
   * @param {object} context.courierMap - Mapa kurierów: code -> name
   * @param {object} context.extraFieldsMap - Mapa extra fields: key -> label
   */
  constructor(config, context) {
    this.config = {
      datasetId: config.datasetId,
      selectedFields: config.selectedFields || [],
      filters: config.filters || {},
      customHeaders: config.customHeaders || {},
      customFields: config.customFields || [],
      currencyConversion: config.currencyConversion || null,
      inventoryId: config.inventoryId || null,
      storageId: config.storageId || null,
      integrationId: config.integrationId || null,
      subCategory: config.subCategory || null,
      maxRecords: config.maxRecords || 10000
    };

    this.context = {
      token: context.token,
      statusMap: context.statusMap || {},
      courierMap: context.courierMap || {},
      extraFieldsMap: context.extraFieldsMap || {},
      ...context
    };

    // Pobierz definicję datasetu
    this.dataset = getDataset(this.config.datasetId);

    if (!this.dataset) {
      throw new Error(`Unknown dataset: ${this.config.datasetId}`);
    }

    // Wyznacz wymagane enrichmenty
    this.requiredEnrichments = this.determineRequiredEnrichments();

    // Statystyki
    this.stats = {
      startTime: null,
      endTime: null,
      primaryRecords: 0,
      enrichedRecords: 0,
      transformedRecords: 0,
      fetchStats: null,
      enrichStats: {},
      errors: []
    };
  }

  /**
   * Wyznacza wymagane enrichmenty na podstawie wybranych pól
   * @returns {Array<string>}
   */
  determineRequiredEnrichments() {
    const enrichments = new Set();

    // Pobierz enrichmenty z definicji pól
    const fieldEnrichments = getRequiredEnrichments(
      this.config.datasetId,
      this.config.selectedFields
    );

    for (const enrichment of fieldEnrichments) {
      enrichments.add(enrichment);
    }

    // Dodaj currency enricher jeśli jest konwersja walut
    if (this.config.currencyConversion?.targetCurrency) {
      enrichments.add('currency');
    }

    return Array.from(enrichments);
  }

  /**
   * Wykonuje pełny pipeline eksportu
   * @returns {Promise<object>} - { headers, rows, stats }
   */
  async execute() {
    this.stats.startTime = Date.now();

    try {
      logger.info('ExportPipeline: Starting export', {
        datasetId: this.config.datasetId,
        selectedFieldsCount: this.config.selectedFields.length,
        requiredEnrichments: this.requiredEnrichments
      });

      // ========================================
      // FAZA 1: FETCH
      // ========================================
      const rawData = await this.executeFetch();
      this.stats.primaryRecords = rawData.length;

      if (rawData.length === 0) {
        logger.info('ExportPipeline: No data to export');
        return this.buildEmptyResult();
      }

      // ========================================
      // FAZA 2: ENRICH
      // ========================================
      const enrichedData = await this.executeEnrich(rawData);
      this.stats.enrichedRecords = enrichedData.length;

      // ========================================
      // FAZA 3: TRANSFORM
      // ========================================
      const { headers, rows } = await this.executeTransform(enrichedData);
      this.stats.transformedRecords = rows.length;

      this.stats.endTime = Date.now();

      logger.info('ExportPipeline: Export complete', {
        datasetId: this.config.datasetId,
        primaryRecords: this.stats.primaryRecords,
        transformedRecords: this.stats.transformedRecords,
        durationMs: this.stats.endTime - this.stats.startTime
      });

      return {
        headers,
        rows,
        stats: this.getStats()
      };

    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.errors.push({
        phase: 'execute',
        message: error.message,
        stack: error.stack
      });

      logger.error('ExportPipeline: Export failed', {
        datasetId: this.config.datasetId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * FAZA 1: Pobieranie danych głównych
   * @returns {Promise<Array>}
   */
  async executeFetch() {
    const fetcher = FetcherRegistry.get(this.config.datasetId);

    if (!fetcher) {
      throw new Error(`No fetcher registered for dataset: ${this.config.datasetId}`);
    }

    logger.info('ExportPipeline: Phase 1 - FETCH', {
      datasetId: this.config.datasetId,
      fetcherClass: fetcher.constructor.name
    });

    try {
      const options = {
        inventoryId: this.config.inventoryId,
        storageId: this.config.storageId,
        integrationId: this.config.integrationId,
        subCategory: this.config.subCategory,
        maxRecords: this.config.maxRecords
      };

      const data = await fetcher.fetch(
        this.context.token,
        this.config.filters,
        options
      );

      this.stats.fetchStats = fetcher.getStats();

      return data;

    } catch (error) {
      this.stats.errors.push({
        phase: 'fetch',
        message: error.message
      });
      throw error;
    }
  }

  /**
   * FAZA 2: Wzbogacanie danych
   * @param {Array} data - Dane z fazy FETCH
   * @returns {Promise<Array>}
   */
  async executeEnrich(data) {
    if (this.requiredEnrichments.length === 0) {
      logger.info('ExportPipeline: Phase 2 - ENRICH (skipped, no enrichments required)');
      return data;
    }

    logger.info('ExportPipeline: Phase 2 - ENRICH', {
      enrichments: this.requiredEnrichments
    });

    let enrichedData = data;

    for (const enrichmentName of this.requiredEnrichments) {
      const enricher = EnricherRegistry.get(enrichmentName);

      if (!enricher) {
        logger.warn(`ExportPipeline: Enricher not found: ${enrichmentName}`);
        continue;
      }

      try {
        logger.info(`ExportPipeline: Applying enricher: ${enrichmentName}`);

        enrichedData = await enricher.enrich(
          enrichedData,
          this.context.token,
          {
            inventoryId: this.config.inventoryId,
            storageId: this.config.storageId,
            statusMap: this.context.statusMap,
            courierMap: this.context.courierMap,
            extraFieldsMap: this.context.extraFieldsMap,
            currencyConfig: this.config.currencyConversion
          }
        );

        this.stats.enrichStats[enrichmentName] = enricher.getStats();

      } catch (error) {
        logger.error(`ExportPipeline: Enricher failed: ${enrichmentName}`, {
          error: error.message
        });

        this.stats.errors.push({
          phase: 'enrich',
          enricher: enrichmentName,
          message: error.message
        });

        // Kontynuuj z pozostałymi enricherami
      }
    }

    return enrichedData;
  }

  /**
   * FAZA 3: Transformacja do formatu wyjścia
   * @param {Array} data - Wzbogacone dane
   * @returns {Promise<object>} - { headers, rows }
   */
  async executeTransform(data) {
    logger.info('ExportPipeline: Phase 3 - TRANSFORM', {
      recordCount: data.length,
      selectedFieldsCount: this.config.selectedFields.length
    });

    try {
      const transformer = new DataTransformer(
        this.dataset,
        this.config.selectedFields,
        {
          customHeaders: this.config.customHeaders,
          customFields: this.config.customFields
        }
      );

      const result = transformer.transform(data);

      return result;

    } catch (error) {
      this.stats.errors.push({
        phase: 'transform',
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Buduje pusty wynik (gdy brak danych)
   * @returns {object}
   */
  buildEmptyResult() {
    const transformer = new DataTransformer(
      this.dataset,
      this.config.selectedFields,
      {
        customHeaders: this.config.customHeaders,
        customFields: this.config.customFields
      }
    );

    this.stats.endTime = Date.now();

    return {
      headers: transformer.getHeaders(),
      rows: [],
      stats: this.getStats()
    };
  }

  /**
   * Pobiera statystyki wykonania
   * @returns {object}
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
