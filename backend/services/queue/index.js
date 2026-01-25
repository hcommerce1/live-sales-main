/**
 * Queue Service
 *
 * Provides BullMQ queue for webhook processing.
 * Falls back to in-memory processing if Redis is unavailable.
 *
 * Feature flag: billing.queue.enabled
 *
 * @module services/queue
 */

const logger = require('../../utils/logger');

let Queue = null;
let webhookQueue = null;
let isInitialized = false;

/**
 * Default job options for webhook processing
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 6,
  backoff: {
    type: 'exponential',
    delay: 60000, // 1 minute initial delay
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 500, // Keep last 500 failed jobs for debugging
};

/**
 * Initialize the queue connection
 * Called once at server startup
 *
 * @returns {boolean} True if queue was initialized successfully
 */
async function initQueue() {
  if (isInitialized) {
    return !!webhookQueue;
  }

  isInitialized = true;

  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not configured - webhook queue disabled, using fallback');
    return false;
  }

  try {
    // Dynamically import BullMQ to avoid startup errors if not installed
    const bullmq = require('bullmq');
    Queue = bullmq.Queue;

    const Redis = require('ioredis');
    const connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
    });

    // Test connection
    await connection.ping();

    webhookQueue = new Queue('stripe-webhooks', {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    logger.info('Stripe webhook queue initialized', {
      attempts: DEFAULT_JOB_OPTIONS.attempts,
      backoffDelay: DEFAULT_JOB_OPTIONS.backoff.delay,
    });

    return true;
  } catch (error) {
    logger.error('Failed to initialize webhook queue', {
      error: error.message,
    });
    webhookQueue = null;
    return false;
  }
}

/**
 * Get the webhook queue instance
 * Returns null if queue is not available
 *
 * @returns {Queue|null}
 */
function getWebhookQueue() {
  return webhookQueue;
}

/**
 * Check if queue is available
 *
 * @returns {boolean}
 */
function isQueueAvailable() {
  return !!webhookQueue;
}

/**
 * Add a webhook event to the processing queue
 *
 * @param {string} stripeEventId - Stripe event ID
 * @param {Object} options - Optional job options
 * @returns {Promise<{queued: boolean, jobId?: string}>}
 */
async function addWebhookJob(stripeEventId, options = {}) {
  if (!webhookQueue) {
    return { queued: false };
  }

  try {
    const job = await webhookQueue.add(
      'process-webhook',
      { stripeEventId },
      {
        jobId: stripeEventId, // Use event ID as job ID for idempotency
        ...options,
      }
    );

    logger.debug('Webhook job added to queue', {
      stripeEventId,
      jobId: job.id,
    });

    return { queued: true, jobId: job.id };
  } catch (error) {
    logger.error('Failed to add webhook job to queue', {
      stripeEventId,
      error: error.message,
    });
    return { queued: false };
  }
}

/**
 * Get queue metrics
 *
 * @returns {Promise<Object>}
 */
async function getQueueMetrics() {
  if (!webhookQueue) {
    return { available: false };
  }

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      webhookQueue.getWaitingCount(),
      webhookQueue.getActiveCount(),
      webhookQueue.getCompletedCount(),
      webhookQueue.getFailedCount(),
    ]);

    return {
      available: true,
      waiting,
      active,
      completed,
      failed,
    };
  } catch (error) {
    logger.error('Failed to get queue metrics', { error: error.message });
    return { available: false, error: error.message };
  }
}

/**
 * Gracefully close the queue connection
 */
async function closeQueue() {
  if (webhookQueue) {
    try {
      await webhookQueue.close();
      logger.info('Webhook queue closed');
    } catch (error) {
      logger.error('Error closing webhook queue', { error: error.message });
    }
    webhookQueue = null;
  }
}

module.exports = {
  initQueue,
  getWebhookQueue,
  isQueueAvailable,
  addWebhookJob,
  getQueueMetrics,
  closeQueue,
  DEFAULT_JOB_OPTIONS,
};
