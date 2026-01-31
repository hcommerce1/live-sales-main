/**
 * Dataset Registry
 *
 * Centralny rejestr wszystkich datasetów eksportu.
 * Każdy dataset definiuje strukturę pól i konfigurację eksportu.
 */

// Import dataset definitions
const ordersDataset = require('./orders.dataset');
const orderItemsDataset = require('./order-items.dataset');
const returnsDataset = require('./returns.dataset');
const productsCatalogDataset = require('./products-catalog.dataset');
const accountingDocsDataset = require('./accounting-docs.dataset');
const warehouseDocsDataset = require('./warehouse-docs.dataset');
const productsExternalDataset = require('./products-external.dataset');
const purchaseOrdersDataset = require('./purchase-orders.dataset');
const shipmentsDataset = require('./shipments.dataset');
const baseConnectDataset = require('./base-connect.dataset');
const basicDataDataset = require('./basic-data.dataset');

// Registry of all datasets
const datasets = {
  orders: ordersDataset,
  order_items: orderItemsDataset,
  returns: returnsDataset,
  products_catalog: productsCatalogDataset,
  accounting_docs: accountingDocsDataset,
  warehouse_docs: warehouseDocsDataset,
  products_external: productsExternalDataset,
  purchase_orders: purchaseOrdersDataset,
  shipments: shipmentsDataset,
  base_connect: baseConnectDataset,
  basic_data: basicDataDataset
};

// Order for UI display
const datasetOrder = [
  'orders',
  'order_items',
  'returns',
  'products_catalog',
  'accounting_docs',
  'warehouse_docs',
  'products_external',
  'purchase_orders',
  'shipments',
  'base_connect',
  'basic_data'
];

function getDataset(datasetId) {
  return datasets[datasetId] || null;
}

function getAllDatasets() {
  return datasetOrder.map(id => datasets[id]).filter(Boolean);
}

function getDatasetFields(datasetId) {
  const dataset = datasets[datasetId];
  if (!dataset || !dataset.fieldGroups) return [];
  return dataset.fieldGroups.flatMap(group => group.fields || []);
}

function getField(datasetId, fieldKey) {
  const fields = getDatasetFields(datasetId);
  return fields.find(f => f.key === fieldKey) || null;
}

function fieldRequiresEnrichment(datasetId, fieldKey) {
  const field = getField(datasetId, fieldKey);
  return field?.enrichment || null;
}

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
