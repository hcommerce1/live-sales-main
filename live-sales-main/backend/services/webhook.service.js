/**
 * Stripe Webhook Service
 *
 * Handles Stripe webhook events with persist-first pattern.
 * Feature flag: billing.enabled
 *
 * FLOW:
 * 1. Receive → Verify signature → Persist → Return 200 immediately
 * 2. Process async (can be in queue)
 * 3. Track status: received → processing → processed/failed
 *
 * This ensures idempotency and prevents duplicate processing.
 */

const logger = require('../utils/logger');
const { constructWebhookEvent } = require('./stripe.service');
const { SUBSCRIPTION_STATUS } = require('../config/plans');

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
 * Process incoming webhook
 *
 * Persist-first pattern: save event BEFORE processing
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {Promise<{received: boolean, duplicate: boolean, eventId: string}>}
 */
async function handleWebhook(rawBody, signature) {
  const db = getPrisma();

  // 1. Verify signature and construct event
  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    logger.error('Webhook signature verification failed', {
      error: err.message,
    });
    throw new Error('INVALID_SIGNATURE');
  }

  // 2. Check for duplicate (idempotency)
  const existing = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });

  if (existing) {
    logger.debug('Duplicate webhook event ignored', {
      stripeEventId: event.id,
      eventType: event.type,
      existingStatus: existing.status,
    });

    return {
      received: true,
      duplicate: true,
      eventId: event.id,
    };
  }

  // 3. Persist event BEFORE processing (persist-first)
  await db.stripeWebhookEvent.create({
    data: {
      stripeEventId: event.id,
      eventType: event.type,
      payload: event,
      status: 'received',
      receivedAt: new Date(),
    },
  });

  logger.info('Webhook event received and persisted', {
    stripeEventId: event.id,
    eventType: event.type,
  });

  // 4. Process async (don't block response)
  // Using setImmediate to process after response is sent
  setImmediate(() => {
    processWebhookEvent(event.id).catch((err) => {
      logger.error('Async webhook processing failed', {
        stripeEventId: event.id,
        error: err.message,
      });
    });
  });

  return {
    received: true,
    duplicate: false,
    eventId: event.id,
  };
}

/**
 * Process a persisted webhook event
 *
 * @param {string} stripeEventId
 */
async function processWebhookEvent(stripeEventId) {
  const db = getPrisma();

  // Update status to processing
  await db.stripeWebhookEvent.update({
    where: { stripeEventId },
    data: { status: 'processing' },
  });

  try {
    // Get event payload
    const webhookEvent = await db.stripeWebhookEvent.findUnique({
      where: { stripeEventId },
    });

    if (!webhookEvent) {
      throw new Error('Webhook event not found');
    }

    const event = webhookEvent.payload;

    // Route to appropriate handler
    await routeEvent(event);

    // Mark as processed
    await db.stripeWebhookEvent.update({
      where: { stripeEventId },
      data: {
        status: 'processed',
        processedAt: new Date(),
      },
    });

    logger.info('Webhook event processed', {
      stripeEventId,
      eventType: event.type,
    });
  } catch (error) {
    // Mark as failed
    const webhookEvent = await db.stripeWebhookEvent.update({
      where: { stripeEventId },
      data: {
        status: 'failed',
        errorMessage: error.message,
        retryCount: { increment: 1 },
      },
    });

    logger.error('Webhook event processing failed', {
      stripeEventId,
      error: error.message,
      retryCount: webhookEvent.retryCount,
    });

    // Requeue for retry if under limit
    if (webhookEvent.retryCount < 3) {
      // In production, use a proper job queue (Bull)
      setTimeout(() => {
        processWebhookEvent(stripeEventId).catch(() => {});
      }, 60000 * webhookEvent.retryCount); // 1min, 2min, 3min
    }
  }
}

/**
 * Route event to appropriate handler
 *
 * @param {object} event - Stripe event
 */
async function routeEvent(event) {
  switch (event.type) {
    // Subscription lifecycle
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    // Trial
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event.data.object);
      break;

    // Invoices
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object);
      break;

    // Checkout
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    default:
      logger.debug('Unhandled webhook event type', { type: event.type });
  }
}

// ============================================
// Event Handlers
// ============================================

async function handleSubscriptionCreated(subscription) {
  const db = getPrisma();
  const companyId = subscription.metadata?.companyId;

  if (!companyId) {
    logger.warn('Subscription created without companyId', {
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  // Check if we already have this subscription
  const existing = await db.subscription.findUnique({
    where: { companyId },
  });

  if (existing?.stripeSubscriptionId === subscription.id) {
    logger.debug('Subscription already exists', { companyId });
    return;
  }

  // Map Stripe status to our status
  const status = mapStripeStatus(subscription.status);

  // Create or update subscription
  await db.subscription.upsert({
    where: { companyId },
    create: {
      companyId,
      planId: subscription.metadata?.planId || 'basic',
      status,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id,
      status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  logger.info('Subscription created/updated from webhook', {
    companyId,
    stripeSubscriptionId: subscription.id,
    status,
  });
}

async function handleSubscriptionUpdated(subscription) {
  const db = getPrisma();
  const companyId = subscription.metadata?.companyId;

  if (!companyId) {
    // Try to find by stripeSubscriptionId
    const existing = await db.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!existing) {
      logger.warn('Subscription updated but company not found', {
        stripeSubscriptionId: subscription.id,
      });
      return;
    }
    // Use existing company
    await updateSubscriptionFromStripe(existing.companyId, subscription);
    return;
  }

  await updateSubscriptionFromStripe(companyId, subscription);
}

async function updateSubscriptionFromStripe(companyId, subscription) {
  const db = getPrisma();
  const status = mapStripeStatus(subscription.status);

  await db.subscription.update({
    where: { companyId },
    data: {
      status,
      stripePriceId: subscription.items.data[0]?.price?.id,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    },
  });

  logger.info('Subscription updated from webhook', {
    companyId,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function handleSubscriptionDeleted(subscription) {
  const db = getPrisma();

  // Find by Stripe ID
  const existing = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!existing) {
    logger.warn('Deleted subscription not found', {
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: SUBSCRIPTION_STATUS.CANCELED,
      endedAt: new Date(),
    },
  });

  logger.info('Subscription marked as canceled', {
    companyId: existing.companyId,
    stripeSubscriptionId: subscription.id,
  });
}

async function handleTrialWillEnd(subscription) {
  // This is informational - send notification to user
  const companyId = subscription.metadata?.companyId;

  if (!companyId) return;

  logger.info('Trial will end soon', {
    companyId,
    trialEnd: subscription.trial_end,
  });

  // TODO: Send email notification
  // await notificationService.sendTrialEndingEmail(companyId, subscription.trial_end);
}

async function handleInvoicePaid(invoice) {
  const db = getPrisma();

  // Get subscription from invoice
  if (!invoice.subscription) return;

  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
  });

  if (!subscription) return;

  // Update to active if was past_due
  if (subscription.status === SUBSCRIPTION_STATUS.PAST_DUE) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: SUBSCRIPTION_STATUS.ACTIVE },
    });

    logger.info('Subscription activated after payment', {
      companyId: subscription.companyId,
    });
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const db = getPrisma();

  if (!invoice.subscription) return;

  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
  });

  if (!subscription) return;

  // Stripe will automatically set past_due, but we log it
  logger.warn('Invoice payment failed', {
    companyId: subscription.companyId,
    invoiceId: invoice.id,
    attemptCount: invoice.attempt_count,
  });

  // TODO: Send payment failed email
  // await notificationService.sendPaymentFailedEmail(subscription.companyId);
}

async function handleCheckoutCompleted(session) {
  // Checkout completed - subscription should be created via subscription.created
  // This is mostly for logging/analytics

  logger.info('Checkout completed', {
    sessionId: session.id,
    companyId: session.metadata?.companyId,
    mode: session.mode,
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Map Stripe subscription status to our status enum
 */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    trialing: SUBSCRIPTION_STATUS.TRIALING,
    active: SUBSCRIPTION_STATUS.ACTIVE,
    past_due: SUBSCRIPTION_STATUS.PAST_DUE,
    canceled: SUBSCRIPTION_STATUS.CANCELED,
    unpaid: SUBSCRIPTION_STATUS.UNPAID,
    incomplete: SUBSCRIPTION_STATUS.INCOMPLETE,
    incomplete_expired: SUBSCRIPTION_STATUS.INCOMPLETE_EXPIRED,
  };

  return statusMap[stripeStatus] || stripeStatus;
}

/**
 * Retry failed webhook events (for manual recovery)
 *
 * @param {number} maxRetries - Max events to retry
 */
async function retryFailedEvents(maxRetries = 10) {
  const db = getPrisma();

  const failedEvents = await db.stripeWebhookEvent.findMany({
    where: {
      status: 'failed',
      retryCount: { lt: 3 },
    },
    take: maxRetries,
    orderBy: { receivedAt: 'asc' },
  });

  for (const event of failedEvents) {
    await processWebhookEvent(event.stripeEventId);
  }

  return failedEvents.length;
}

module.exports = {
  handleWebhook,
  processWebhookEvent,
  retryFailedEvents,
};
