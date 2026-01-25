/**
 * Stripe Subscription Reconciliation Service
 *
 * Daily job that syncs local subscription records with Stripe.
 * Detects and fixes discrepancies caused by failed webhooks.
 */

const logger = require('../utils/logger');

// Lazy-loaded dependencies
let stripe = null;
let db = null;

function getStripe() {
  if (!stripe) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
  }
  return stripe;
}

function getDb() {
  if (!db) {
    const { PrismaClient } = require('@prisma/client');
    db = new PrismaClient();
  }
  return db;
}

/**
 * Maps Stripe subscription status to local status.
 */
function mapStripeStatus(stripeStatus) {
  const STATUS_MAP = {
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'UNPAID',
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE_EXPIRED',
    paused: 'PAUSED',
  };
  return STATUS_MAP[stripeStatus] || 'UNKNOWN';
}

/**
 * Reconciles all Stripe subscriptions with local database.
 * Should be run daily (e.g., 2 AM).
 */
async function reconcileStripeSubscriptions() {
  const stripeClient = getStripe();
  const prisma = getDb();

  const startTime = Date.now();
  const stats = {
    stripeCount: 0,
    localCount: 0,
    missingInLocal: 0,
    missingInStripe: 0,
    statusMismatch: 0,
    fixed: 0,
    errors: 0,
  };

  logger.info('Starting Stripe subscription reconciliation');

  try {
    // 1. Fetch all subscriptions from Stripe (with companyId metadata)
    const stripeSubscriptions = new Map();

    for await (const sub of stripeClient.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.default_payment_method'],
    })) {
      // Only process subscriptions with companyId (created by our app)
      if (sub.metadata?.companyId) {
        stripeSubscriptions.set(sub.id, sub);
        stats.stripeCount++;
      }
    }

    // 2. Fetch all local subscriptions
    const localSubscriptions = await prisma.subscription.findMany({
      where: {
        stripeSubscriptionId: { not: null },
      },
    });
    stats.localCount = localSubscriptions.length;

    // 3. Check each local subscription against Stripe
    for (const localSub of localSubscriptions) {
      const stripeSub = stripeSubscriptions.get(localSub.stripeSubscriptionId);

      if (!stripeSub) {
        // Subscription exists locally but not in Stripe
        logger.warn('Subscription missing in Stripe', {
          level: 'RECONCILIATION',
          stripeSubscriptionId: localSub.stripeSubscriptionId,
          companyId: localSub.companyId,
          localStatus: localSub.status,
        });
        stats.missingInStripe++;

        // Mark as canceled if missing in Stripe
        if (localSub.status !== 'CANCELED' && localSub.status !== 'canceled') {
          await prisma.subscription.update({
            where: { id: localSub.id },
            data: {
              status: 'canceled',
              canceledAt: new Date(),
            },
          });
          stats.fixed++;
        }
        continue;
      }

      // Check status mismatch
      const expectedStatus = mapStripeStatus(stripeSub.status);
      const localStatus = localSub.status?.toUpperCase?.() || localSub.status;

      if (localStatus !== expectedStatus) {
        logger.warn('Subscription status mismatch', {
          level: 'RECONCILIATION',
          stripeSubscriptionId: stripeSub.id,
          companyId: localSub.companyId,
          stripeStatus: stripeSub.status,
          expectedStatus,
          localStatus: localSub.status,
        });
        stats.statusMismatch++;

        // Fix the status (use lowercase to match Prisma enum if needed)
        await prisma.subscription.update({
          where: { id: localSub.id },
          data: {
            status: stripeSub.status, // Use Stripe's status directly
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            canceledAt: stripeSub.canceled_at
              ? new Date(stripeSub.canceled_at * 1000)
              : null,
          },
        });
        stats.fixed++;
      }

      // Remove from map (processed)
      stripeSubscriptions.delete(stripeSub.id);
    }

    // 4. Check for subscriptions in Stripe but not in local DB
    for (const [stripeSubId, stripeSub] of stripeSubscriptions) {
      logger.warn('Subscription exists in Stripe but not in local DB', {
        level: 'RECONCILIATION',
        stripeSubscriptionId: stripeSubId,
        companyId: stripeSub.metadata.companyId,
        stripeStatus: stripeSub.status,
      });
      stats.missingInLocal++;

      // Create local record
      try {
        await prisma.subscription.create({
          data: {
            companyId: stripeSub.metadata.companyId,
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId: stripeSub.customer,
            status: stripeSub.status,
            planId: stripeSub.metadata.planId || 'unknown',
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          },
        });
        stats.fixed++;
      } catch (error) {
        logger.error('Failed to create missing subscription', {
          stripeSubscriptionId: stripeSubId,
          error: error.message,
        });
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Stripe reconciliation completed', {
      level: 'RECONCILIATION',
      duration: `${duration}ms`,
      ...stats,
    });

    return stats;
  } catch (error) {
    logger.error('Stripe reconciliation failed', {
      level: 'RECONCILIATION',
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  reconcileStripeSubscriptions,
  mapStripeStatus,
};
