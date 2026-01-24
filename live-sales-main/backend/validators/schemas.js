const { z } = require('zod');

/**
 * Input validation schemas using Zod
 *
 * SECURITY: All user input must be validated before processing
 */

// Authentication schemas
const registerSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .transform(email => email.toLowerCase().trim()),

  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .regex(/[a-z]/, 'Password must contain lowercase letters')
    .regex(/[A-Z]/, 'Password must contain uppercase letters')
    .regex(/[0-9]/, 'Password must contain numbers')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain special characters'),
});

const loginSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .transform(email => email.toLowerCase().trim()),

  password: z.string()
    .min(1, 'Password required')
    .max(128, 'Password too long'),

  twoFactorCode: z.string()
    .length(6, 'Two-factor code must be 6 digits')
    .regex(/^\d{6}$/, 'Two-factor code must be numeric')
    .optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string()
    .min(1, 'Refresh token required'),
});

// Export configuration schemas
const exportFiltersSchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  status: z.number().int().optional(),
  inventory_id: z.number().int().optional(),
}).optional();

const createExportSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(100, 'Name too long')
    .trim(),

  dataset: z.enum(['orders', 'products'], {
    errorMap: () => ({ message: 'Dataset must be "orders" or "products"' })
  }),

  filters: exportFiltersSchema,

  selectedFields: z.array(z.string())
    .min(1, 'At least one field must be selected')
    .max(50, 'Too many fields selected'),

  baselinkerToken: z.string()
    .min(1, 'BaseLinker token required')
    .max(500, 'Token too long')
    .trim(),

  sheetsUrl: z.string()
    .url('Invalid Google Sheets URL')
    .regex(
      /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+(\/edit)?(\?.*)?(\#.*)?$/,
      'Must be a valid Google Sheets URL'
    ),

  sheetsWriteMode: z.enum(['append', 'replace'], {
    errorMap: () => ({ message: 'Write mode must be "append" or "replace"' })
  }).default('append'),

  scheduleMinutes: z.number()
    .int('Schedule must be an integer')
    .min(5, 'Minimum schedule is 5 minutes')
    .max(10080, 'Maximum schedule is 7 days')
    .optional(),
});

const updateExportSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(100, 'Name too long')
    .trim()
    .optional(),

  filters: exportFiltersSchema,

  selectedFields: z.array(z.string())
    .min(1, 'At least one field must be selected')
    .max(50, 'Too many fields selected')
    .optional(),

  baselinkerToken: z.string()
    .min(1, 'BaseLinker token required')
    .max(500, 'Token too long')
    .trim()
    .optional(),

  sheetsUrl: z.string()
    .url('Invalid Google Sheets URL')
    .regex(
      /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+(\/edit)?(\?.*)?(\#.*)?$/,
      'Must be a valid Google Sheets URL'
    )
    .optional(),

  sheetsWriteMode: z.enum(['append', 'replace'])
    .optional(),

  scheduleMinutes: z.number()
    .int('Schedule must be an integer')
    .min(5, 'Minimum schedule is 5 minutes')
    .max(10080, 'Maximum schedule is 7 days')
    .optional(),

  status: z.enum(['active', 'paused', 'error'])
    .optional(),
});

// UUID validation
const uuidSchema = z.string().uuid('Invalid ID format');

// Pagination schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Validation middleware factory
 * @param {object} schema - Zod schema
 * @param {string} source - Request source (body, query, params)
 */
const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const data = req[source];

      // Validate and parse data
      const validated = await schema.parseAsync(data);

      // Replace request data with validated data
      req[source] = validated;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
        });
      }

      next(error);
    }
  };
};

/**
 * Sanitize HTML input (prevent XSS)
 * @param {string} input - User input
 * @returns {string} - Sanitized input
 */
const sanitizeHtml = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

module.exports = {
  // Schemas
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  createExportSchema,
  updateExportSchema,
  uuidSchema,
  paginationSchema,

  // Middleware
  validate,

  // Utilities
  sanitizeHtml,
};
