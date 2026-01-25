/**
 * Webhook Worker
 *
 * BullMQ worker for processing Stripe webhook events.
 * Processes jobs from the 'stripe-webhooks' queue.
 *
 * @module services/queue/webhook.worker
 */

const logger = require('../../utils/logger');

let Worker = null;
let worker = null;
let isInitialized = false;

/**
 * Initialize the webhook worker
 * Called once at server startup
 *
 * @returns {boolean} True if worker was initialized successfully
 */
async function initWorker() {
  if (isInitialized) {
    return !!worker;
  }

  isInitialized = true;

  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not configured - webhook worker disabled');
    return false;
  }

  try {
    // Dynamically import BullMQ
    const bullmq = require('bullmq');
    Worker = bullmq.Worker;

    const Redis = require('ioredis');
    const connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Import webhook service for processing
    // Lazy import to avoid circular dependencies
    const { processWebhookEvent } = require('../webhook.service');

    worker = new Worker(
      'stripe-webhooks',
      async (job) => {
        const { stripeEventId } = job.data;

        logger.info('Processing webhook job', {
          jobId: job.id,
          stripeEventId,
          attemptsMade: job.attemptsMade,
        });

        try {
          await processWebhookEvent(stripeEventId);

          logger.info('Webhook job completed', {
            jobId: job.id,
            stripeEventId,
          });

          return { success: true };
        } catch (error) {
          logger.error('Webhook job failed', {
            jobId: job.id,
            stripeEventId,
            error: error.message,
            attemptsMade: job.attemptsMade,
          });

          // Re-throw to trigger BullMQ retry
          throw error;
        }
      },
      {
        connection,
        concurrency: 5, // Process up to 5 webhooks concurrently
        limiter: {
          max: 10,
          duration: 1000, // Max 10 jobs per second
        },
      }
    );

    // Event handlers
    worker.on('completed', (job) => {
      logger.debug('Worker job completed', {
        jobId: job.id,
        stripeEventId: job.data.stripeEventId,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error('Worker job failed', {
        jobId: job?.id,
        stripeEventId: job?.data?.stripeEventId,
        error: err.message,
        attemptsMade: job?.attemptsMade,
      });

      // Alert if max retries exhausted
      if (job && job.attemptsMade >= job.opts.attempts) {
        // Import alerting service lazily
        const alertingService = require('../alerting.service');
        alertingService
          .sendWebhookFailureAlert(
            job.data.stripeEventId,
            'unknown', // Event type not available in job data
            err.message,
            job.attemptsMade
          )
          .catch((alertErr) => {
            logger.error('Failed to send webhook failure alert', {
              error: alertErr.message,
            });
          });
      }
    });

    worker.on('error', (err) => {
      logger.error('Worker error', { error: err.message });
    });

    logger.info('Webhook worker initialized', {
      concurrency: 5,
    });

    return true;
  } catch (error) {
    logger.error('Failed to initialize webhook worker', {
      error: error.message,
    });
    worker = null;
    return false;
  }
}

/**
 * Check if worker is running
 *
 * @returns {boolean}
 */
function isWorkerRunning() {
  return worker !== null && !worker.closing;
}

/**
 * Gracefully close the worker
 */
async function closeWorker() {
  if (worker) {
    try {
      await worker.close();
      logger.info('Webhook worker closed');
    } catch (error) {
      logger.error('Error closing webhook worker', { error: error.message });
    }
    worker = null;
  }
}

/**
 * Get worker metrics
 *
 * @returns {Object}
 */
function getWorkerMetrics() {
  if (!worker) {
    return { running: false };
  }

  return {
    running: !worker.closing,
    concurrency: worker.opts.concurrency,
  };
}

module.exports = {
  initWorker,
  isWorkerRunning,
  closeWorker,
  getWorkerMetrics,
};
