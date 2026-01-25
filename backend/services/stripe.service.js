/**
 * Stripe Service
 *
 * Handles Stripe API interactions for billing.
 * Feature flag: billing.enabled
 *
 * Responsibilities:
 * - Customer creation/management
 * - Checkout session creation
 * - Customer portal sessions
 * - Subscription management helpers
 */

const logger = require('../utils/logger');
const { getPlan, getStripePriceId, TRIAL_CONFIG } = require('../config/plans');

// H3: Sanitization helpers for Stripe API

/**
 * Sanitizes a value for Stripe API.
 * - Converts to string
 * - Trims whitespace
 * - Truncates to maxLength
 * - Returns undefined for empty values
 *
 * @param {any} value - Value to sanitize
 * @param {number} maxLength - Maximum length (default 500, Stripe metadata limit)
 * @returns {string|undefined}
 */
function sanitizeForStripe(value, maxLength = 500) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const stringValue = String(value).trim();

  if (stringValue.length === 0) {
    return undefined;
  }

  return stringValue.slice(0, maxLength);
}

/**
 * Sanitizes an email address.
 * @param {string} email
 * @returns {string|undefined}
 */
function sanitizeEmail(email) {
  return sanitizeForStripe(email, 254); // RFC 5321 limit
}

/**
 * Sanitizes a NIP (Polish tax ID).
 * Removes non-digits and validates length.
 * @param {string} nip
 * @returns {string|undefined}
 */
function sanitizeNip(nip) {
  if (!nip) return undefined;
  const digitsOnly = String(nip).replace(/\D/g, '');
  return digitsOnly.length === 10 ? digitsOnly : undefined;
}

// Lazy load Stripe to avoid startup errors if not configured
let stripe = null;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    logger.info('Stripe client initialized');
  }
  return stripe;
}

// Lazy load Prisma
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Create or retrieve Stripe Customer for a company
 *
 * @param {object} company - Company record
 * @param {object} user - User creating the customer (for email)
 * @returns {Promise<string>} Stripe Customer ID
 */
async function getOrCreateCustomer(company, user) {
  const db = getPrisma();

  // Return existing customer if present
  if (company.stripeCustomerId) {
    logger.debug('Using existing Stripe customer', {
      companyId: company.id,
      stripeCustomerId: company.stripeCustomerId,
    });
    return company.stripeCustomerId;
  }

  // Create new customer with sanitized data (H3)
  const stripeClient = getStripe();

  const customer = await stripeClient.customers.create({
    email: sanitizeEmail(user.email),
    name: sanitizeForStripe(company.name, 256), // Stripe name limit
    metadata: {
      companyId: company.id,
      nip: sanitizeNip(company.nip),
    },
    // Only include address if we have city (required field)
    ...(company.addressCity && {
      address: {
        line1: sanitizeForStripe(company.addressStreet, 200) || '',
        city: sanitizeForStripe(company.addressCity, 100),
        postal_code: sanitizeForStripe(company.addressPostalCode, 20) || '',
        country: company.addressCountry || 'PL',
      },
    }),
  });

  // Save customer ID to company
  await db.company.update({
    where: { id: company.id },
    data: { stripeCustomerId: customer.id },
  });

  logger.info('Created Stripe customer', {
    companyId: company.id,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

/**
 * Create Checkout Session for subscription
 *
 * @param {object} options
 * @param {object} options.company - Company record
 * @param {object} options.user - User initiating checkout
 * @param {string} options.planId - Plan ID ('basic' or 'pro')
 * @param {'monthly'|'yearly'} options.interval - Billing interval
 * @param {boolean} options.trialEligible - Whether to add trial period
 * @returns {Promise<{url: string, sessionId: string}>}
 */
async function createCheckoutSession({ company, user, planId, interval, trialEligible }) {
  const stripeClient = getStripe();

  // Validate plan
  const plan = getPlan(planId);
  if (!plan || planId === 'free') {
    throw new Error(`Invalid plan for checkout: ${planId}`);
  }

  const priceId = getStripePriceId(planId, interval);
  if (!priceId || priceId.includes('placeholder')) {
    throw new Error(`Stripe Price ID not configured for ${planId}/${interval}`);
  }

  // Get or create customer
  const customerId = await getOrCreateCustomer(company, user);

  // H2: Generate idempotency key
  // Format: checkout-{companyId}-{priceId}-{minuteTimestamp}
  // Valid for ~1 minute (same minute = same key)
  const idempotencyKey = `checkout-${company.id}-${priceId}-${Math.floor(Date.now() / 60000)}`;

  // Build checkout session config with sanitized metadata (H3)
  const sessionConfig = {
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        companyId: company.id, // UUID - safe
        planId: sanitizeForStripe(planId, 50),
        createdBy: user.id, // UUID - safe
      },
    },
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/canceled`,
    metadata: {
      companyId: company.id,
      planId: sanitizeForStripe(planId, 50),
    },
    // Polish locale
    locale: 'pl',
    // Allow promotion codes
    allow_promotion_codes: true,
  };

  // Add trial if eligible
  if (trialEligible) {
    sessionConfig.subscription_data.trial_period_days = TRIAL_CONFIG.DURATION_DAYS;

    logger.info('Adding trial to checkout', {
      companyId: company.id,
      trialDays: TRIAL_CONFIG.DURATION_DAYS,
    });
  }

  // H2: Use idempotency key to prevent duplicates on retry
  const session = await stripeClient.checkout.sessions.create(
    sessionConfig,
    {
      idempotencyKey,
    }
  );

  logger.info('Created checkout session', {
    companyId: company.id,
    sessionId: session.id,
    planId,
    interval,
    trialEligible,
    idempotencyKey, // H2: Log idempotency key for debugging
  });

  return {
    url: session.url,
    sessionId: session.id,
  };
}

/**
 * Create Customer Portal session for subscription management
 *
 * @param {object} company - Company record
 * @returns {Promise<{url: string}>}
 */
async function createPortalSession(company) {
  if (!company.stripeCustomerId) {
    throw new Error('Company has no Stripe customer');
  }

  const stripeClient = getStripe();

  const session = await stripeClient.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing`,
  });

  logger.info('Created portal session', {
    companyId: company.id,
    stripeCustomerId: company.stripeCustomerId,
  });

  return { url: session.url };
}

/**
 * Cancel subscription at period end
 *
 * @param {string} stripeSubscriptionId
 * @returns {Promise<object>} Updated subscription
 */
async function cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
  const stripeClient = getStripe();

  const subscription = await stripeClient.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  logger.info('Subscription set to cancel at period end', {
    stripeSubscriptionId,
    cancelAt: subscription.cancel_at,
  });

  return subscription;
}

/**
 * Reactivate canceled subscription
 *
 * @param {string} stripeSubscriptionId
 * @returns {Promise<object>} Updated subscription
 */
async function reactivateSubscription(stripeSubscriptionId) {
  const stripeClient = getStripe();

  const subscription = await stripeClient.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  logger.info('Subscription reactivated', {
    stripeSubscriptionId,
  });

  return subscription;
}

/**
 * Get subscription from Stripe
 *
 * @param {string} stripeSubscriptionId
 * @returns {Promise<object>}
 */
async function getSubscription(stripeSubscriptionId) {
  const stripeClient = getStripe();
  return await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
}

/**
 * Construct webhook event from raw body and signature
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {object} Verified Stripe event
 */
function constructWebhookEvent(rawBody, signature) {
  const stripeClient = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Check if Stripe is configured
 * @returns {boolean}
 */
function isStripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  getSubscription,
  constructWebhookEvent,
  isStripeConfigured,
  getStripe, // Export for use in other services (e.g., webhook.service.js for SCA)
};
