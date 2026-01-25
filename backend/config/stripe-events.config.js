/**
 * Stripe Webhook Events Configuration
 *
 * Defines which Stripe events are handled, ignored, or unknown.
 * Used for logging and alerting on unexpected event types.
 *
 * @module config/stripe-events
 */

/**
 * Events that are actively processed by the webhook handler
 */
const HANDLED_EVENTS = [
  // Subscription lifecycle
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',

  // Invoice/Payment
  'invoice.paid',
  'invoice.payment_failed',

  // Checkout
  'checkout.session.completed',
];

/**
 * Events that are intentionally ignored (no action needed)
 * These are common events that Stripe sends but we don't need to process
 */
const IGNORED_EVENTS = [
  // Customer events (managed by our system)
  'customer.created',
  'customer.updated',
  'customer.deleted',

  // Payment intents (checkout handles these)
  'payment_intent.created',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',

  // Payment methods
  'payment_method.attached',
  'payment_method.detached',

  // Charges (covered by invoice events)
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',

  // Invoice lifecycle (we only care about paid/failed)
  'invoice.created',
  'invoice.updated',
  'invoice.finalized',
  'invoice.sent',
  'invoice.upcoming',

  // Subscription schedule (not used)
  'subscription_schedule.created',
  'subscription_schedule.updated',

  // Setup intents
  'setup_intent.created',
  'setup_intent.succeeded',

  // Prices and products (managed in Stripe Dashboard)
  'price.created',
  'price.updated',
  'product.created',
  'product.updated',

  // Checkout session events we don't need
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];

/**
 * Check if an event type is in our handled list
 *
 * @param {string} eventType - Stripe event type
 * @returns {boolean}
 */
function isHandledEvent(eventType) {
  return HANDLED_EVENTS.includes(eventType);
}

/**
 * Check if an event type is in our ignored list
 *
 * @param {string} eventType - Stripe event type
 * @returns {boolean}
 */
function isIgnoredEvent(eventType) {
  return IGNORED_EVENTS.includes(eventType);
}

/**
 * Check if an event type is unknown (neither handled nor ignored)
 *
 * @param {string} eventType - Stripe event type
 * @returns {boolean}
 */
function isUnknownEvent(eventType) {
  return !isHandledEvent(eventType) && !isIgnoredEvent(eventType);
}

/**
 * Get event classification
 *
 * @param {string} eventType - Stripe event type
 * @returns {'handled' | 'ignored' | 'unknown'}
 */
function getEventClassification(eventType) {
  if (isHandledEvent(eventType)) return 'handled';
  if (isIgnoredEvent(eventType)) return 'ignored';
  return 'unknown';
}

module.exports = {
  HANDLED_EVENTS,
  IGNORED_EVENTS,
  isHandledEvent,
  isIgnoredEvent,
  isUnknownEvent,
  getEventClassification,
};
