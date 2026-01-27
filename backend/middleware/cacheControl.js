/**
 * Cache-Control middleware for sensitive API endpoints
 *
 * SECURITY: Prevents browsers and proxies from caching sensitive data
 * (tokens, exports, billing info, team data, company secrets)
 */

const noCacheHeaders = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

module.exports = { noCacheHeaders };
