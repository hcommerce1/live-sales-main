/**
 * Enricher Registry
 *
 * Rejestruje i zarządza enricherami.
 * Każdy enricher wzbogaca dane o dodatkowe informacje
 * z osobnych zapytań API.
 */

const PackagesEnricher = require('./packages.enricher');
const DocumentsEnricher = require('./documents.enricher');
const InventoryEnricher = require('./inventory.enricher');
const CurrencyEnricher = require('./currency.enricher');
const TrackingEnricher = require('./tracking.enricher');
const LabelsEnricher = require('./labels.enricher');
const CreditEnricher = require('./credit.enricher');

/**
 * Mapa enrichmentName -> Enricher instance
 */
const enrichers = {
  packages: new PackagesEnricher(),
  documents: new DocumentsEnricher(),
  inventory: new InventoryEnricher(),
  currency: new CurrencyEnricher(),
  tracking: new TrackingEnricher(),
  labels: new LabelsEnricher(),
  credit: new CreditEnricher()
};

/**
 * Pobiera enricher po nazwie
 * @param {string} enrichmentName
 * @returns {Object|null}
 */
function get(enrichmentName) {
  return enrichers[enrichmentName] || null;
}

/**
 * Sprawdza czy enricher istnieje
 * @param {string} enrichmentName
 * @returns {boolean}
 */
function has(enrichmentName) {
  return enrichmentName in enrichers;
}

/**
 * Zwraca listę wszystkich zarejestrowanych enricherów
 * @returns {string[]}
 */
function getRegisteredEnrichers() {
  return Object.keys(enrichers);
}

module.exports = {
  get,
  has,
  getRegisteredEnrichers
};
