/**
 * Fetcher Registry
 *
 * Rejestruje i zarządza fetcherami dla poszczególnych datasetów.
 * Każdy fetcher odpowiada za pobieranie danych z API BaseLinker
 * dla określonego typu datasetu.
 */

const OrdersFetcher = require('./orders.fetcher');
const OrderItemsFetcher = require('./order-items.fetcher');
const ReturnsFetcher = require('./returns.fetcher');
const ProductsCatalogFetcher = require('./products-catalog.fetcher');
const AccountingDocsFetcher = require('./accounting-docs.fetcher');
const WarehouseDocsFetcher = require('./warehouse-docs.fetcher');
const ProductsExternalFetcher = require('./products-external.fetcher');
const PurchaseOrdersFetcher = require('./purchase-orders.fetcher');
const ShipmentsFetcher = require('./shipments.fetcher');
const BaseConnectFetcher = require('./base-connect.fetcher');
const BasicDataFetcher = require('./basic-data.fetcher');

// Instancje fetcherów - lazy initialization
const fetchers = {
  orders: new OrdersFetcher(),
  order_items: new OrderItemsFetcher(),
  returns: new ReturnsFetcher(),
  products_catalog: new ProductsCatalogFetcher(),
  accounting_docs: new AccountingDocsFetcher(),
  warehouse_docs: new WarehouseDocsFetcher(),
  products_external: new ProductsExternalFetcher(),
  purchase_orders: new PurchaseOrdersFetcher(),
  shipments: new ShipmentsFetcher(),
  base_connect: new BaseConnectFetcher(),
  basic_data: new BasicDataFetcher()
};

function get(datasetId) {
  return fetchers[datasetId] || null;
}

function has(datasetId) {
  return datasetId in fetchers;
}

function getRegisteredDatasets() {
  return Object.keys(fetchers);
}

module.exports = {
  get,
  has,
  getRegisteredDatasets
};
