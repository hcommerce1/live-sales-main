/**
 * BaseLinker Services Index
 *
 * Export all BaseLinker-related services and utilities.
 */

const {
  BaseLinkerClient,
  createForCompany,
  getClient,
  invalidateCache,
  baseLinkerMiddleware,
} = require('./BaseLinkerClientFactory');

module.exports = {
  // Client factory
  BaseLinkerClient,
  createForCompany,
  getClient,
  invalidateCache,

  // Middleware
  baseLinkerMiddleware,
};
