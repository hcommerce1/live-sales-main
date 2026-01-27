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

  dataset: z.enum(['orders', 'products', 'order_products', 'invoices'], {
    errorMap: () => ({ message: 'Dataset must be "orders", "products", "order_products" or "invoices"' })
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

  settings: z.object({
    inventoryPriceFormat: z.enum(['netto', 'brutto']).default('brutto'),
    deliveryTaxRate: z.number().min(0).max(100).default(23),
  }).optional(),
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

  settings: z.object({
    inventoryPriceFormat: z.enum(['netto', 'brutto']).default('brutto'),
    deliveryTaxRate: z.number().min(0).max(100).default(23),
  }).optional(),
});

// ============================================
// BaseLinker Query Schemas
// ============================================

const orderIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Order ID must be a positive integer'),
});

const packageIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Package ID must be a positive integer'),
});

const courierCodeParamSchema = z.object({
  code: z.string().min(1, 'Courier code is required').max(20),
});

const journalQuerySchema = z.object({
  last_log_id: z.string().regex(/^\d+$/).optional(),
  logs_types: z.string().regex(/^(\d+,)*\d+$/, 'logs_types must be comma-separated integers').optional(),
  order_id: z.string().regex(/^\d+$/).optional(),
});

const ordersByEmailQuerySchema = z.object({
  email: z.string().email('Valid email address is required').max(50),
});

const ordersByPhoneQuerySchema = z.object({
  phone: z.string().min(3, 'Phone number is required').max(50),
});

const transactionQuerySchema = z.object({
  include_complex_taxes: z.enum(['true', 'false']).optional(),
  include_amazon_data: z.enum(['true', 'false']).optional(),
});

const paymentsHistoryQuerySchema = z.object({
  show_full_history: z.enum(['true', 'false']).optional(),
});

const pickPackQuerySchema = z.object({
  action_type: z.string().regex(/^\d+$/).optional(),
});

const statusHistoryQuerySchema = z.object({
  ids: z.string()
    .min(1, 'At least one package ID is required')
    .regex(/^(\d+,)*\d+$/, 'ids must be comma-separated integers'),
});

const receiptsQuerySchema = z.object({
  series_id: z.string().regex(/^\d+$/).optional(),
  id_from: z.string().regex(/^\d+$/).optional(),
  date_from: z.string().regex(/^\d+$/, 'date_from must be unix timestamp').optional(),
  date_to: z.string().regex(/^\d+$/, 'date_to must be unix timestamp').optional(),
});

const newReceiptsQuerySchema = z.object({
  series_id: z.string().regex(/^\d+$/).optional(),
  id_from: z.string().regex(/^\d+$/).optional(),
});

const courierServicesQuerySchema = z.object({
  order_id: z.string().regex(/^\d+$/, 'order_id is required'),
  account_id: z.string().regex(/^\d+$/).optional(),
  fields: z.string().min(1, 'fields JSON is required'),
  packages: z.string().min(1, 'packages JSON is required'),
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

  // BaseLinker schemas
  orderIdParamSchema,
  packageIdParamSchema,
  courierCodeParamSchema,
  journalQuerySchema,
  ordersByEmailQuerySchema,
  ordersByPhoneQuerySchema,
  transactionQuerySchema,
  paymentsHistoryQuerySchema,
  pickPackQuerySchema,
  statusHistoryQuerySchema,
  receiptsQuerySchema,
  newReceiptsQuerySchema,
  courierServicesQuerySchema,

  // Middleware
  validate,

  // Utilities
  sanitizeHtml,
};
