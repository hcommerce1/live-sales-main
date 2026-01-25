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
    errors.push('STRIPE_SECRET_KEY is a test key - production requires live key (sk_live_...)');
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

/**
 * Validates that price IDs exist in Stripe and have correct configuration.
 * Called at server startup in production.
 */
async function validatePriceIdsWithStripe() {
  // Skip in development/test
  if (process.env.NODE_ENV !== 'production') {
    return { valid: true, skipped: true };
  }

  const Stripe = require('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });

  const priceEnvVars = {
    STRIPE_PRICE_BASIC_MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    STRIPE_PRICE_BASIC_YEARLY: process.env.STRIPE_PRICE_BASIC_YEARLY,
    STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    STRIPE_PRICE_PRO_YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY,
  };

  const errors = [];

  for (const [envVar, priceId] of Object.entries(priceEnvVars)) {
    if (!priceId) {
      errors.push(`${envVar} is not set`);
      continue;
    }

    try {
      const price = await stripe.prices.retrieve(priceId);

      // Validate live mode
      if (!price.livemode) {
        errors.push(`${envVar} (${priceId}) is in test mode - production requires live prices`);
      }

      // Validate currency
      if (price.currency !== 'pln') {
        errors.push(`${envVar} (${priceId}) uses ${price.currency.toUpperCase()}, expected PLN`);
      }

      // Validate recurring
      if (price.type !== 'recurring') {
        errors.push(`${envVar} (${priceId}) is not a recurring price`);
      }

      // Validate interval matches env var name
      const expectedInterval = envVar.includes('MONTHLY') ? 'month' : 'year';
      if (price.recurring?.interval !== expectedInterval) {
        errors.push(
          `${envVar} (${priceId}) has interval '${price.recurring?.interval}', expected '${expectedInterval}'`
        );
      }

      // Validate product is active
      if (!price.active) {
        errors.push(`${envVar} (${priceId}) is not active`);
      }
    } catch (error) {
      if (error.type === 'StripeInvalidRequestError') {
        errors.push(`${envVar} (${priceId}) does not exist in Stripe`);
      } else {
        errors.push(`${envVar} (${priceId}) validation failed: ${error.message}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Stripe price validation failed:\n- ${errors.join('\n- ')}`);
  }

  return { valid: true };
}

module.exports = {
  validateStripeConfiguration,
  validatePriceIdsWithStripe,
  isBillingConfigured,
  STRIPE_PRICE_VARS,
};
