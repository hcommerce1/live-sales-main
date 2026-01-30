/**
 * Index wszystkich datasetów
 *
 * Eksportuje wszystkie dostępne datasety w systemie.
 */

const orders = require('./orders.dataset');
const orderItems = require('./order-items.dataset');
const returns = require('./returns.dataset');
const warehouseDocs = require('./warehouse-docs.dataset');
const productsCatalog = require('./products-catalog.dataset');
const productsExternal = require('./products-external.dataset');
const purchaseOrders = require('./purchase-orders.dataset');
const shipments = require('./shipments.dataset');
const baseConnect = require('./base-connect.dataset');

// Wszystkie datasety jako mapa
const datasets = {
  orders,
  order_items: orderItems,
  returns,
  warehouse_docs: warehouseDocs,
  products_catalog: productsCatalog,
  products_external: productsExternal,
  purchase_orders: purchaseOrders,
  shipments,
  base_connect: baseConnect
};

// Lista datasetów w kolejności wyświetlania
const datasetOrder = [
  'orders',
  'order_items',
  'returns',
  'warehouse_docs',
  'products_catalog',
  'products_external',
  'purchase_orders',
  'shipments',
  'base_connect'
];

/**
 * Pobiera definicję datasetu po ID
 */
function getDataset(datasetId) {
  return datasets[datasetId] || null;
}

/**
 * Pobiera wszystkie datasety
 */
function getAllDatasets() {
  return datasetOrder.map(id => datasets[id]);
}

/**
 * Pobiera wszystkie pola dla datasetu (płaska lista)
 */
function getDatasetFields(datasetId) {
  const dataset = datasets[datasetId];
  if (!dataset) return [];

  return dataset.fieldGroups.flatMap(group => group.fields);
}

/**
 * Pobiera pole po kluczu
 */
function getField(datasetId, fieldKey) {
  const fields = getDatasetFields(datasetId);
  return fields.find(f => f.key === fieldKey) || null;
}

/**
 * Sprawdza czy pole wymaga wzbogacenia
 */
function fieldRequiresEnrichment(datasetId, fieldKey) {
  const field = getField(datasetId, fieldKey);
  return field?.enrichment || null;
}

/**
 * Pobiera wymagane wzbogacenia dla listy pól
 */
function getRequiredEnrichments(datasetId, selectedFieldKeys) {
  const enrichments = new Set();

  for (const fieldKey of selectedFieldKeys) {
    const enrichment = fieldRequiresEnrichment(datasetId, fieldKey);
    if (enrichment) {
      enrichments.add(enrichment);
    }
  }

  return Array.from(enrichments);
}

module.exports = {
  datasets,
  datasetOrder,
  getDataset,
  getAllDatasets,
  getDatasetFields,
  getField,
  fieldRequiresEnrichment,
  getRequiredEnrichments
};
