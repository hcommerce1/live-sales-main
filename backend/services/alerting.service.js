/**
 * Alerting Service
 *
 * Handles alerts for critical system events, including webhook failures.
 * Supports email notifications with throttling to prevent alert storms.
 *
 * @module services/alerting
 */

const logger = require('../utils/logger');

/**
 * Alert throttle map: key -> { lastAlertTime, count }
 * Prevents alert storms by limiting alerts per event type
 */
const alertThrottle = new Map();

/**
 * Throttle configuration
 */
const THROTTLE_CONFIG = {
  WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  MAX_ALERTS_PER_WINDOW: 3,
};

/**
 * Alert severity levels
 */
const ALERT_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

/**
 * Check if alert should be throttled
 *
 * @param {string} alertKey - Unique key for the alert type
 * @returns {boolean} True if alert should be throttled
 */
function shouldThrottle(alertKey) {
  const now = Date.now();
  const throttleData = alertThrottle.get(alertKey);

  if (!throttleData) {
    // First alert for this key
    alertThrottle.set(alertKey, { lastAlertTime: now, count: 1 });
    return false;
  }

  const timeSinceLastAlert = now - throttleData.lastAlertTime;

  if (timeSinceLastAlert >= THROTTLE_CONFIG.WINDOW_MS) {
    // Window expired, reset
    alertThrottle.set(alertKey, { lastAlertTime: now, count: 1 });
    return false;
  }

  if (throttleData.count >= THROTTLE_CONFIG.MAX_ALERTS_PER_WINDOW) {
    // Too many alerts in window
    return true;
  }

  // Increment count
  throttleData.count++;
  throttleData.lastAlertTime = now;
  alertThrottle.set(alertKey, throttleData);
  return false;
}

/**
 * Send webhook failure alert
 *
 * @param {string} stripeEventId - Stripe event ID
 * @param {string} eventType - Stripe event type
 * @param {string} errorMessage - Error message
 * @param {number} retryCount - Number of retry attempts
 * @returns {Promise<void>}
 */
async function sendWebhookFailureAlert(stripeEventId, eventType, errorMessage, retryCount) {
  const alertKey = `webhook:${eventType}`;

  // Always log the alert
  const alertData = {
    level: 'SECURITY',
    action: 'WEBHOOK_PROCESSING_FAILED',
    stripeEventId,
    eventType,
    errorMessage,
    retryCount,
    timestamp: new Date().toISOString(),
  };

  // Determine alert level based on retry count
  const maxRetries = parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 6;
  const alertLevel = retryCount >= maxRetries ? ALERT_LEVELS.CRITICAL : ALERT_LEVELS.HIGH;

  logger.error(`ALERT [${alertLevel}]: Webhook processing failed`, alertData);

  // Check throttle
  if (shouldThrottle(alertKey)) {
    logger.debug('Alert throttled', { alertKey, stripeEventId });
    return;
  }

  // Send email alert if configured and retries exhausted
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (adminEmail && retryCount >= maxRetries) {
    await sendAlertEmail({
      to: adminEmail,
      subject: `[CRITICAL] Stripe webhook failed: ${eventType}`,
      body: formatWebhookAlertBody(stripeEventId, eventType, errorMessage, retryCount),
    });
  }
}

/**
 * Send general alert
 *
 * @param {Object} options
 * @param {string} options.level - Alert level (INFO, WARNING, HIGH, CRITICAL)
 * @param {string} options.action - Action identifier
 * @param {string} options.message - Alert message
 * @param {Object} options.context - Additional context
 * @returns {Promise<void>}
 */
async function sendAlert({ level, action, message, context = {} }) {
  const alertKey = `${action}:${level}`;

  // Log alert
  const logMethod = level === ALERT_LEVELS.CRITICAL || level === ALERT_LEVELS.HIGH
    ? 'error'
    : level === ALERT_LEVELS.WARNING
      ? 'warn'
      : 'info';

  logger[logMethod](`ALERT [${level}]: ${message}`, {
    level: 'SECURITY',
    action,
    ...context,
    timestamp: new Date().toISOString(),
  });

  // Check throttle
  if (shouldThrottle(alertKey)) {
    logger.debug('Alert throttled', { alertKey });
    return;
  }

  // Send email for critical alerts
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (adminEmail && (level === ALERT_LEVELS.CRITICAL || level === ALERT_LEVELS.HIGH)) {
    await sendAlertEmail({
      to: adminEmail,
      subject: `[${level}] ${action}: ${message}`,
      body: formatAlertBody(level, action, message, context),
    });
  }
}

/**
 * Send alert email
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text)
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendAlertEmail({ to, subject, body }) {
  // Check if email is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn('Alert email not sent - SMTP not configured', { subject });
    return false;
  }

  try {
    // Lazy load nodemailer to avoid startup errors
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `[Live Sales] ${subject}`,
      text: body,
    });

    logger.info('Alert email sent', { to, subject });
    return true;
  } catch (error) {
    logger.error('Failed to send alert email', {
      to,
      subject,
      error: error.message,
    });
    return false;
  }
}

/**
 * Format webhook alert email body
 */
function formatWebhookAlertBody(stripeEventId, eventType, errorMessage, retryCount) {
  return `
Stripe Webhook Processing Failed
================================

Event ID: ${stripeEventId}
Event Type: ${eventType}
Error: ${errorMessage}
Retry Count: ${retryCount}

Time: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'development'}

Action Required:
- Check the webhook event in Stripe Dashboard
- Review logs for more details
- Use admin API to manually retry if needed:
  POST /api/admin/webhooks/retry
  Body: { "stripeEventId": "${stripeEventId}" }

---
This is an automated alert from Live Sales.
  `.trim();
}

/**
 * Format general alert email body
 */
function formatAlertBody(level, action, message, context) {
  return `
Alert: ${message}
================================

Level: ${level}
Action: ${action}
Time: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'development'}

Context:
${JSON.stringify(context, null, 2)}

---
This is an automated alert from Live Sales.
  `.trim();
}

/**
 * Clear throttle data (for testing)
 */
function clearThrottle() {
  alertThrottle.clear();
}

module.exports = {
  sendWebhookFailureAlert,
  sendAlert,
  sendAlertEmail,
  clearThrottle,
  ALERT_LEVELS,
};
