/**
 * Fetcher Registry
 *
 * Rejestruje i zarządza fetcherami dla poszczególnych datasetów.
 * Każdy fetcher jest odpowiedzialny za pobieranie głównych danych
 * z BaseLinker API dla danego datasetu.
 */

const OrdersFetcher = require('./orders.fetcher');
const OrderItemsFetcher = require('./order-items.fetcher');
const ReturnsFetcher = require('./returns.fetcher');
const WarehouseDocsFetcher = require('./warehouse-docs.fetcher');
const ProductsCatalogFetcher = require('./products-catalog.fetcher');
const ProductsExternalFetcher = require('./products-external.fetcher');
const PurchaseOrdersFetcher = require('./purchase-orders.fetcher');
const ShipmentsFetcher = require('./shipments.fetcher');
const BaseConnectFetcher = require('./base-connect.fetcher');

/**
 * Mapa datasetId -> Fetcher instance
 */
const fetchers = {
  orders: new OrdersFetcher(),
  order_items: new OrderItemsFetcher(),
  returns: new ReturnsFetcher(),
  warehouse_docs: new WarehouseDocsFetcher(),
  products_catalog: new ProductsCatalogFetcher(),
  products_external: new ProductsExternalFetcher(),
  purchase_orders: new PurchaseOrdersFetcher(),
  shipments: new ShipmentsFetcher(),
  base_connect: new BaseConnectFetcher()
};

/**
 * Pobiera fetcher dla danego datasetu
 * @param {string} datasetId
 * @returns {Object|null}
 */
function get(datasetId) {
  return fetchers[datasetId] || null;
}

/**
 * Sprawdza czy fetcher istnieje
 * @param {string} datasetId
 * @returns {boolean}
 */
function has(datasetId) {
  return datasetId in fetchers;
}

/**
 * Zwraca listę wszystkich zarejestrowanych datasetów
 * @returns {string[]}
 */
function getRegisteredDatasets() {
  return Object.keys(fetchers);
}

module.exports = {
  get,
  has,
  getRegisteredDatasets
};
