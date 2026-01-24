/**
 * NIP Services Index
 *
 * Export all NIP-related services and utilities.
 */

const { NipLookupService, getNipLookupService } = require('./nip-lookup.service');
const { validateNip, normalizeNip, formatNip, isTestNip } = require('./nip-validator');
const { INipProvider } = require('./nip-provider.interface');
const { GusBir1Provider } = require('./gus-bir1.provider');
const { ManualFallbackProvider } = require('./manual-fallback.provider');

module.exports = {
  // Main service
  NipLookupService,
  getNipLookupService,

  // Validators
  validateNip,
  normalizeNip,
  formatNip,
  isTestNip,

  // Providers
  INipProvider,
  GusBir1Provider,
  ManualFallbackProvider,
};
