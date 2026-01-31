/**
 * Enricher Registry
 *
 * Rejestruje i zarządza enricherami.
 * Enrichery wzbogacają dane pobrane przez fetchery o dodatkowe informacje
 * z innych endpointów API BaseLinker.
 */

const PackagesEnricher = require('./packages.enricher');
const DocumentsEnricher = require('./documents.enricher');
const ProductDetailsEnricher = require('./product-details.enricher');
const StockEnricher = require('./stock.enricher');
const PaymentsEnricher = require('./payments.enricher');

// Instancje enricherów - lazy initialization
const enrichers = {
  packages: new PackagesEnricher(),
  documents: new DocumentsEnricher(),
  'product-details': new ProductDetailsEnricher(),
  stock: new StockEnricher(),
  payments: new PaymentsEnricher()
};

function get(enrichmentName) {
  return enrichers[enrichmentName] || null;
}

function has(enrichmentName) {
  return enrichmentName in enrichers;
}

function getRegisteredEnrichers() {
  return Object.keys(enrichers);
}

module.exports = {
  get,
  has,
  getRegisteredEnrichers
};
