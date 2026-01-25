/**
 * Stripe Configuration Validation
 *
 * Validates Stripe configuration at server startup.
 * In production mode, fails fast if configuration is invalid.
 * In development mode, logs warnings only.
 *
 * @module config/stripe.validation
 */

const logger = require('../utils/logger');

/**
 * Required Stripe price ID environment variables
 */
const STRIPE_PRICE_VARS = [
  'STRIPE_PRICE_BASIC_MONTHLY',
  'STRIPE_PRICE_BASIC_YEARLY',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_YEARLY',
];

/**
 * Validates that a Stripe price ID is properly configured
 * @param {string} value - The price ID value
 * @returns {boolean} True if valid
 */
function isValidPriceId(value) {
  if (!value) return false;
  if (value.includes('placeholder')) return false;
  // Stripe price IDs start with 'price_'
  if (!value.startsWith('price_')) return false;
  return true;
}

/**
 * Validates Stripe configuration
 *
 * Checks:
 * 1. STRIPE_SECRET_KEY is set
 * 2. STRIPE_WEBHOOK_SECRET is set
 * 3. All price IDs are properly configured (not placeholders)
 *
 * @param {Object} options
 * @param {boolean} options.throwOnError - Throw error if validation fails (default: production mode)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateStripeConfiguration(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const throwOnError = options.throwOnError ?? isProduction;

  const errors = [];
  const warnings = [];

  // Check required secrets
  if (!process.env.STRIPE_SECRET_KEY) {
    errors.push('STRIPE_SECRET_KEY is not configured');
  } else if (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') && isProduction) {
    warnings.push('STRIPE_SECRET_KEY appears to be a test key in production');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    errors.push('STRIPE_WEBHOOK_SECRET is not configured');
  }

  // Check price IDs
  for (const envVar of STRIPE_PRICE_VARS) {
    const value = process.env[envVar];

    if (!value) {
      errors.push(`${envVar} is not configured`);
    } else if (value.includes('placeholder')) {
      errors.push(`${envVar} contains placeholder value: ${value}`);
    } else if (!value.startsWith('price_')) {
      warnings.push(`${envVar} does not look like a valid Stripe price ID: ${value}`);
    }
  }

  // Log results
  if (errors.length > 0) {
    logger.error('Stripe configuration validation failed', {
      errors,
      warnings,
      environment: process.env.NODE_ENV,
    });
  } else if (warnings.length > 0) {
    logger.warn('Stripe configuration has warnings', {
      warnings,
      environment: process.env.NODE_ENV,
    });
  } else {
    logger.info('Stripe configuration validated successfully');
  }

  // Throw in production if errors exist
  if (throwOnError && errors.length > 0) {
    throw new Error(
      `Stripe configuration invalid (${errors.length} errors):\n` +
        errors.map((e) => `  - ${e}`).join('\n')
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if billing feature should be enabled
 * Returns false if Stripe is not properly configured
 *
 * @returns {boolean}
 */
function isBillingConfigured() {
  const hasSecretKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const hasPriceIds = STRIPE_PRICE_VARS.every((v) => {
    const value = process.env[v];
    return value && !value.includes('placeholder');
  });

  return hasSecretKey && hasWebhookSecret && hasPriceIds;
}

module.exports = {
  validateStripeConfiguration,
  isBillingConfigured,
  STRIPE_PRICE_VARS,
};
