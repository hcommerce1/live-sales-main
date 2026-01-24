const winston = require('winston');

/**
 * Secret masking patterns
 * These patterns identify sensitive data that should never appear in logs
 */
const SECRET_PATTERNS = [
  // Stripe keys (sk_live_xxx, sk_test_xxx, whsec_xxx, pk_live_xxx, pk_test_xxx)
  { pattern: /(sk_(?:live|test)_[a-zA-Z0-9]{20,})/g, replacement: 'sk_***MASKED***' },
  { pattern: /(whsec_[a-zA-Z0-9]{20,})/g, replacement: 'whsec_***MASKED***' },
  { pattern: /(pk_(?:live|test)_[a-zA-Z0-9]{20,})/g, replacement: 'pk_***MASKED***' },

  // BaseLinker tokens (typically 32+ char alphanumeric)
  // Match common token field names with their values
  { pattern: /(baselinker[_-]?token["']?\s*[:=]\s*["']?)([a-zA-Z0-9-]{20,})/gi, replacement: '$1***MASKED***' },
  { pattern: /(api[_-]?token["']?\s*[:=]\s*["']?)([a-zA-Z0-9-]{20,})/gi, replacement: '$1***MASKED***' },

  // Authorization headers
  { pattern: /(Authorization["']?\s*[:=]\s*["']?Bearer\s+)([a-zA-Z0-9._-]{20,})/gi, replacement: '$1***MASKED***' },

  // Generic long tokens in common field names (token, secret, key, password, apiKey)
  { pattern: /(["']?(?:token|secret|password|apiKey|api_key|accessToken|refreshToken)["']?\s*[:=]\s*["']?)([a-zA-Z0-9._-]{16,})/gi, replacement: '$1***MASKED***' },

  // Encrypted values (AES-GCM typically produces base64 with specific length)
  { pattern: /(encrypted[_-]?value["']?\s*[:=]\s*["']?)([a-zA-Z0-9+/=]{32,})/gi, replacement: '$1***MASKED***' },
];

/**
 * Mask sensitive data in a string
 */
function maskSecrets(str) {
  if (typeof str !== 'string') return str;

  let masked = str;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, replacement);
  }
  return masked;
}

/**
 * Recursively mask secrets in objects
 */
function maskSecretsDeep(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return maskSecrets(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(maskSecretsDeep);
  }

  if (typeof obj === 'object') {
    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
      // Directly mask known sensitive field names
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey === 'authorization'
      ) {
        masked[key] = typeof value === 'string' && value.length > 8
          ? '***MASKED***'
          : value;
      } else {
        masked[key] = maskSecretsDeep(value);
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Winston format that masks secrets in log messages and metadata
 */
const secretMaskingFormat = winston.format((info) => {
  // Mask the message
  if (info.message) {
    info.message = maskSecrets(String(info.message));
  }

  // Mask all other properties (metadata)
  for (const key of Object.keys(info)) {
    if (key !== 'level' && key !== 'message' && key !== 'timestamp' && key !== 'service') {
      info[key] = maskSecretsDeep(info[key]);
    }
  }

  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    secretMaskingFormat(), // Apply secret masking before JSON serialization
    winston.format.json()
  ),
  defaultMeta: { service: 'live-sales' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && meta.service !== 'live-sales') {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      )
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;
