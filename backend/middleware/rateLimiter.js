const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Rate limiting configuration
 *
 * SECURITY: Prevents brute force, DoS, and API abuse
 *
 * Strategy:
 * - Strict limits on auth endpoints (login, register)
 * - Moderate limits on API endpoints
 * - Lenient limits on public endpoints
 */

// Initialize Redis client (if available)
let redisClient = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for rate limiting');
    });
  } catch (error) {
    logger.warn('Redis not available, using in-memory rate limiting', {
      error: error.message
    });
  }
}

/**
 * Create rate limiter with Redis store (if available)
 */
const createLimiter = (options) => {
  const config = {
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100,
    message: {
      error: options.message || 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(options.windowMs / 1000),
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,  // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        limit: options.max,
      });

      res.status(429).json({
        error: options.message || 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
    // Skip successful requests (only count failures for auth endpoints)
    skip: options.skipSuccessfulRequests ? (req, res) => {
      return res.statusCode < 400;
    } : undefined,
  };

  // Use Redis store if available
  if (redisClient && options.useRedis !== false) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: `rate_limit:${options.prefix || 'general'}:`,
    });
  }

  return rateLimit(config);
};

/**
 * STRICT: Auth endpoints (login, register)
 * - 5 requests per 15 minutes per IP
 * - Only count failed attempts
 */
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
  prefix: 'auth',
  useRedis: true,
});

/**
 * MODERATE: API endpoints
 * - 100 requests per 15 minutes per IP
 */
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many API requests, please try again later',
  prefix: 'api',
  useRedis: true,
});

/**
 * LENIENT: Public endpoints
 * - 1000 requests per 15 minutes per IP
 */
const publicLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests, please slow down',
  prefix: 'public',
  useRedis: true,
});

/**
 * AGGRESSIVE: Export run endpoint
 * - 10 requests per hour per user
 * - Based on user ID (not IP)
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Export limit reached, please wait before running another export',
    code: 'EXPORT_LIMIT_EXCEEDED',
    retryAfter: 3600,
  },
  keyGenerator: (req) => {
    // Use user ID instead of IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Export rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Export limit reached',
      code: 'EXPORT_LIMIT_EXCEEDED',
      retryAfter: 3600,
    });
  },
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rate_limit:export:',
  }) : undefined,
});

/**
 * VERY STRICT: Password reset endpoint
 * - 3 requests per hour per IP
 */
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again later',
  prefix: 'password_reset',
  useRedis: true,
});

module.exports = {
  authLimiter,
  apiLimiter,
  publicLimiter,
  exportLimiter,
  passwordResetLimiter,
  createLimiter,
};
