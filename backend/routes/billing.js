/**
 * Billing Routes
 *
 * Handles subscription, checkout, and webhook endpoints.
 * Feature flag: billing.enabled
 *
 * Endpoints:
 * - GET  /api/billing/plans        - List available plans
 * - GET  /api/billing/subscription - Get current subscription
 * - POST /api/billing/checkout     - Create checkout session
 * - POST /api/billing/portal       - Create customer portal session
 * - POST /api/billing/webhook      - Stripe webhook (public, signature verified)
 * - GET  /api/billing/trial-status - Get trial status
 * - POST /api/billing/start-trial  - Start trial (if eligible)
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const { featureFlagMiddleware } = require('../middleware/featureFlag');
const authMiddleware = require('../middleware/auth');
const { companyContextMiddleware, requireCompany, requireCompanyRole } = require('../middleware/companyContext');

const stripeService = require('../services/stripe.service');
const trialService = require('../services/trial.service');
const webhookService = require('../services/webhook.service');
const { PLANS, getAllPlanIds, getPlan, isValidPlan, formatPrice } = require('../config/plans');

// Lazy load Prisma
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

// ============================================
// Public Routes (no auth required)
// ============================================

/**
 * GET /api/billing/plans
 * List available subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const billingEnabled = await featureFlags.isEnabled('billing.enabled');

    const plans = getAllPlanIds().map((planId) => {
      const plan = getPlan(planId);
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: {
          monthly: formatPrice(plan.price.monthly),
          yearly: formatPrice(plan.price.yearly),
          monthlyRaw: plan.price.monthly,
          yearlyRaw: plan.price.yearly,
        },
        features: plan.features,
        available: billingEnabled || planId === 'free',
      };
    });

    res.json({
      success: true,
      plans,
      billingEnabled,
    });
  } catch (error) {
    logger.error('Failed to get plans', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve plans',
      code: 'PLANS_ERROR',
    });
  }
});

/**
 * POST /api/billing/webhook
 * Stripe webhook endpoint - must use raw body for signature verification
 *
 * IMPORTANT: This route must be registered BEFORE body-parser middleware
 * See server.js configuration
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        logger.warn('Webhook received without signature');
        return res.status(400).json({ error: 'Missing signature' });
      }

      const result = await webhookService.handleWebhook(req.body, signature);

      res.json(result);
    } catch (error) {
      if (error.message === 'INVALID_SIGNATURE') {
        logger.warn('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      logger.error('Webhook error', { error: error.message });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// ============================================
// Protected Routes (auth + company required)
// ============================================

// Apply auth and company context to all following routes
router.use(authMiddleware.authenticate());
router.use(companyContextMiddleware);

/**
 * GET /api/billing/subscription
 * Get current company subscription
 */
router.get(
  '/subscription',
  requireCompany,
  featureFlagMiddleware('billing.enabled'),
  async (req, res) => {
    try {
      const db = getPrisma();

      const subscription = await db.subscription.findUnique({
        where: { companyId: req.company.id },
      });

      if (!subscription) {
        return res.json({
          success: true,
          subscription: null,
          plan: getPlan('free'),
          hasStripeCustomer: !!req.company.stripeCustomerId,
        });
      }

      const plan = getPlan(subscription.planId);

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          trialEnd: subscription.trialEnd,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
        plan,
        hasStripeCustomer: !!req.company.stripeCustomerId,
      });
    } catch (error) {
      logger.error('Failed to get subscription', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to retrieve subscription',
        code: 'SUBSCRIPTION_ERROR',
      });
    }
  }
);

/**
 * GET /api/billing/trial-status
 * Get trial status for company
 */
router.get(
  '/trial-status',
  requireCompany,
  async (req, res) => {
    try {
      const trialEnabled = await featureFlags.isEnabled('billing.trial.enabled');

      if (!trialEnabled) {
        return res.json({
          success: true,
          trialEnabled: false,
          trialStatus: null,
        });
      }

      const trialStatus = await trialService.getTrialStatus(req.company.id);
      const eligibility = await trialService.isTrialEligible(req.company.nip);

      res.json({
        success: true,
        trialEnabled: true,
        trialStatus,
        eligibleForTrial: eligibility.eligible,
        eligibilityReason: eligibility.reason,
      });
    } catch (error) {
      logger.error('Failed to get trial status', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to retrieve trial status',
        code: 'TRIAL_STATUS_ERROR',
      });
    }
  }
);

/**
 * POST /api/billing/start-trial
 * Start trial for company (if eligible)
 * Requires owner/admin role
 */
router.post(
  '/start-trial',
  requireCompany,
  requireCompanyRole('owner', 'admin'),
  featureFlagMiddleware('billing.trial.enabled'),
  async (req, res) => {
    try {
      // Check eligibility
      const eligibility = await trialService.isTrialEligible(req.company.nip);

      if (!eligibility.eligible) {
        return res.status(400).json({
          error: eligibility.reason,
          code: 'TRIAL_NOT_ELIGIBLE',
        });
      }

      // Start trial
      const subscription = await trialService.startTrial(req.company.id);

      // Audit log
      logger.info('Trial started via API', {
        level: 'SECURITY',
        action: 'TRIAL_STARTED',
        userId: req.user.id,
        companyId: req.company.id,
        nip: req.company.nip,
        subscriptionId: subscription.id,
        ip: req.ip,
      });

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          trialEnd: subscription.trialEnd,
        },
      });
    } catch (error) {
      if (error.message === 'TRIAL_ALREADY_USED') {
        return res.status(400).json({
          error: 'Trial już został wykorzystany dla tego NIP',
          code: 'TRIAL_ALREADY_USED',
        });
      }

      logger.error('Failed to start trial', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to start trial',
        code: 'TRIAL_START_ERROR',
      });
    }
  }
);

/**
 * POST /api/billing/checkout
 * Create Stripe checkout session
 * Requires owner/admin role
 */
router.post(
  '/checkout',
  requireCompany,
  requireCompanyRole('owner', 'admin'),
  featureFlagMiddleware('billing.enabled'),
  async (req, res) => {
    try {
      const { planId, interval = 'monthly' } = req.body;

      // Validate input
      if (!planId || !isValidPlan(planId)) {
        return res.status(400).json({
          error: 'Invalid plan',
          code: 'INVALID_PLAN',
        });
      }

      if (planId === 'free') {
        return res.status(400).json({
          error: 'Cannot checkout free plan',
          code: 'FREE_PLAN_NO_CHECKOUT',
        });
      }

      if (!['monthly', 'yearly'].includes(interval)) {
        return res.status(400).json({
          error: 'Invalid billing interval',
          code: 'INVALID_INTERVAL',
        });
      }

      // Check if Stripe is configured
      if (!stripeService.isStripeConfigured()) {
        return res.status(503).json({
          error: 'Billing is not configured',
          code: 'BILLING_NOT_CONFIGURED',
        });
      }

      // Check trial eligibility
      const trialEnabled = await featureFlags.isEnabled('billing.trial.enabled');
      let trialEligible = false;

      if (trialEnabled) {
        const eligibility = await trialService.isTrialEligible(req.company.nip);
        trialEligible = eligibility.eligible;
      }

      // Create checkout session
      const session = await stripeService.createCheckoutSession({
        company: req.company,
        user: req.user,
        planId,
        interval,
        trialEligible,
      });

      // Audit log
      logger.info('Checkout session created', {
        level: 'SECURITY',
        action: 'CHECKOUT_CREATED',
        userId: req.user.id,
        companyId: req.company.id,
        planId,
        interval,
        trialEligible,
        sessionId: session.sessionId,
        ip: req.ip,
      });

      res.json({
        success: true,
        url: session.url,
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error('Failed to create checkout', {
        error: error.message,
        stripeCode: error.code,
        stripeType: error.type,
        companyId: req.company?.id,
        planId: req.body.planId,
        interval: req.body.interval,
      });
      res.status(500).json({
        error: 'Failed to create checkout session',
        code: 'CHECKOUT_ERROR',
      });
    }
  }
);

/**
 * POST /api/billing/portal
 * Create Stripe customer portal session
 * Requires owner/admin role
 */
router.post(
  '/portal',
  requireCompany,
  requireCompanyRole('owner', 'admin'),
  featureFlagMiddleware('billing.enabled'),
  async (req, res) => {
    try {
      if (!req.company.stripeCustomerId) {
        return res.status(400).json({
          error: 'No billing account found',
          code: 'NO_BILLING_ACCOUNT',
        });
      }

      const session = await stripeService.createPortalSession(req.company);

      logger.info('Portal session created', {
        userId: req.user.id,
        companyId: req.company.id,
      });

      res.json({
        success: true,
        url: session.url,
      });
    } catch (error) {
      logger.error('Failed to create portal session', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to create billing portal',
        code: 'PORTAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 * Requires owner role only
 */
router.post(
  '/cancel',
  requireCompany,
  requireCompanyRole('owner'),
  featureFlagMiddleware('billing.enabled'),
  async (req, res) => {
    try {
      const db = getPrisma();

      const subscription = await db.subscription.findUnique({
        where: { companyId: req.company.id },
      });

      if (!subscription || !subscription.stripeSubscriptionId) {
        return res.status(400).json({
          error: 'No active subscription found',
          code: 'NO_SUBSCRIPTION',
        });
      }

      await stripeService.cancelSubscriptionAtPeriodEnd(subscription.stripeSubscriptionId);

      // Update local record
      await db.subscription.update({
        where: { companyId: req.company.id },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
        },
      });

      logger.info('Subscription canceled at period end', {
        level: 'SECURITY',
        action: 'SUBSCRIPTION_CANCELED',
        userId: req.user.id,
        companyId: req.company.id,
        subscriptionId: subscription.id,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'Subscription will be canceled at the end of the billing period',
        cancelAt: subscription.currentPeriodEnd,
      });
    } catch (error) {
      logger.error('Failed to cancel subscription', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to cancel subscription',
        code: 'CANCEL_ERROR',
      });
    }
  }
);

/**
 * POST /api/billing/reactivate
 * Reactivate canceled subscription (before period end)
 * Requires owner role only
 */
router.post(
  '/reactivate',
  requireCompany,
  requireCompanyRole('owner'),
  featureFlagMiddleware('billing.enabled'),
  async (req, res) => {
    try {
      const db = getPrisma();

      const subscription = await db.subscription.findUnique({
        where: { companyId: req.company.id },
      });

      if (!subscription || !subscription.stripeSubscriptionId) {
        return res.status(400).json({
          error: 'No subscription found',
          code: 'NO_SUBSCRIPTION',
        });
      }

      if (!subscription.cancelAtPeriodEnd) {
        return res.status(400).json({
          error: 'Subscription is not scheduled for cancellation',
          code: 'NOT_CANCELED',
        });
      }

      await stripeService.reactivateSubscription(subscription.stripeSubscriptionId);

      // Update local record
      await db.subscription.update({
        where: { companyId: req.company.id },
        data: {
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

      logger.info('Subscription reactivated', {
        level: 'SECURITY',
        action: 'SUBSCRIPTION_REACTIVATED',
        userId: req.user.id,
        companyId: req.company.id,
        subscriptionId: subscription.id,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'Subscription has been reactivated',
      });
    } catch (error) {
      logger.error('Failed to reactivate subscription', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        error: 'Failed to reactivate subscription',
        code: 'REACTIVATE_ERROR',
      });
    }
  }
);

module.exports = router;
