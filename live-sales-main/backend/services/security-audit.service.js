/**
 * Security Audit Service
 *
 * Enhanced security event logging for compliance and incident response.
 * Logs to both application logger and database for persistence.
 *
 * Categories:
 * - AUTH: Authentication events (login, logout, password changes)
 * - ACCESS: Authorization events (permission checks, denials)
 * - DATA: Data access and modification events
 * - BILLING: Subscription and payment events
 * - SECURITY: Security-related events (CSRF, ownership violations)
 */

const logger = require('../utils/logger');

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
 * Security event categories
 */
const AUDIT_CATEGORIES = {
  AUTH: 'AUTH',
  ACCESS: 'ACCESS',
  DATA: 'DATA',
  BILLING: 'BILLING',
  SECURITY: 'SECURITY',
  ADMIN: 'ADMIN',
};

/**
 * Predefined audit actions
 */
const AUDIT_ACTIONS = {
  // AUTH
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE: 'PASSWORD_RESET_COMPLETE',
  TWO_FACTOR_ENABLED: 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED: 'TWO_FACTOR_DISABLED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TOKEN_REFRESH: 'TOKEN_REFRESH',

  // ACCESS
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  FEATURE_ACCESS_DENIED: 'FEATURE_ACCESS_DENIED',
  OWNERSHIP_VIOLATION: 'OWNERSHIP_VIOLATION',
  ROLE_CHANGE: 'ROLE_CHANGE',

  // DATA
  EXPORT_CREATED: 'EXPORT_CREATED',
  EXPORT_MODIFIED: 'EXPORT_MODIFIED',
  EXPORT_DELETED: 'EXPORT_DELETED',
  EXPORT_RUN: 'EXPORT_RUN',
  SECRET_ACCESSED: 'SECRET_ACCESSED',
  SECRET_MODIFIED: 'SECRET_MODIFIED',

  // BILLING
  SUBSCRIPTION_CREATED: 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_MODIFIED: 'SUBSCRIPTION_MODIFIED',
  SUBSCRIPTION_CANCELED: 'SUBSCRIPTION_CANCELED',
  TRIAL_STARTED: 'TRIAL_STARTED',
  TRIAL_ENDED: 'TRIAL_ENDED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CHECKOUT_STARTED: 'CHECKOUT_STARTED',

  // SECURITY
  CSRF_VALIDATION_FAILED: 'CSRF_VALIDATION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  IP_BLOCKED: 'IP_BLOCKED',
  BRUTE_FORCE_DETECTED: 'BRUTE_FORCE_DETECTED',

  // ADMIN
  FEATURE_FLAG_CHANGED: 'FEATURE_FLAG_CHANGED',
  USER_IMPERSONATION: 'USER_IMPERSONATION',
  SYSTEM_CONFIG_CHANGED: 'SYSTEM_CONFIG_CHANGED',

  // COMPANY
  COMPANY_CREATED: 'COMPANY_CREATED',
  COMPANY_MODIFIED: 'COMPANY_MODIFIED',
  MEMBER_INVITED: 'MEMBER_INVITED',
  MEMBER_JOINED: 'MEMBER_JOINED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
};

/**
 * Severity levels
 */
const SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

/**
 * Action to severity mapping
 */
const actionSeverity = {
  [AUDIT_ACTIONS.LOGIN_FAILURE]: SEVERITY.MEDIUM,
  [AUDIT_ACTIONS.OWNERSHIP_VIOLATION]: SEVERITY.HIGH,
  [AUDIT_ACTIONS.CSRF_VALIDATION_FAILED]: SEVERITY.HIGH,
  [AUDIT_ACTIONS.BRUTE_FORCE_DETECTED]: SEVERITY.CRITICAL,
  [AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY]: SEVERITY.HIGH,
  [AUDIT_ACTIONS.PERMISSION_DENIED]: SEVERITY.MEDIUM,
  [AUDIT_ACTIONS.SECRET_ACCESSED]: SEVERITY.MEDIUM,
  [AUDIT_ACTIONS.PASSWORD_CHANGE]: SEVERITY.MEDIUM,
  [AUDIT_ACTIONS.TWO_FACTOR_DISABLED]: SEVERITY.HIGH,
  [AUDIT_ACTIONS.SUBSCRIPTION_CANCELED]: SEVERITY.MEDIUM,
  [AUDIT_ACTIONS.USER_IMPERSONATION]: SEVERITY.HIGH,
};

/**
 * Log a security audit event
 *
 * @param {Object} event - Audit event
 * @param {string} event.action - Action type (from AUDIT_ACTIONS)
 * @param {string} event.category - Category (from AUDIT_CATEGORIES)
 * @param {string} [event.userId] - User ID (if authenticated)
 * @param {string} [event.companyId] - Company ID (if in company context)
 * @param {string} [event.targetId] - Target resource ID
 * @param {string} [event.targetType] - Target resource type
 * @param {Object} [event.metadata] - Additional metadata
 * @param {string} [event.ip] - Client IP address
 * @param {string} [event.userAgent] - Client user agent
 * @param {string} [event.severity] - Override auto-detected severity
 * @param {boolean} [event.persist=true] - Whether to persist to DB
 */
async function logAuditEvent(event) {
  const {
    action,
    category = AUDIT_CATEGORIES.SECURITY,
    userId = null,
    companyId = null,
    targetId = null,
    targetType = null,
    metadata = {},
    ip = null,
    userAgent = null,
    severity = null,
    persist = true,
  } = event;

  // Determine severity
  const eventSeverity = severity || actionSeverity[action] || SEVERITY.LOW;

  // Build log entry
  const logEntry = {
    level: 'SECURITY',
    category,
    action,
    severity: eventSeverity,
    userId,
    companyId,
    targetId,
    targetType,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  // Log to application logger
  if (eventSeverity === SEVERITY.CRITICAL || eventSeverity === SEVERITY.HIGH) {
    logger.warn('Security audit event', logEntry);
  } else {
    logger.info('Security audit event', logEntry);
  }

  // Persist to database (async, don't block)
  if (persist) {
    persistAuditEvent(logEntry).catch((err) => {
      logger.error('Failed to persist audit event', { error: err.message, action });
    });
  }

  return logEntry;
}

/**
 * Persist audit event to database
 * @param {Object} logEntry
 */
async function persistAuditEvent(logEntry) {
  const db = getPrisma();

  await db.auditLog.create({
    data: {
      action: logEntry.action,
      category: logEntry.category,
      severity: logEntry.severity,
      userId: logEntry.userId,
      companyId: logEntry.companyId,
      targetId: logEntry.targetId,
      targetType: logEntry.targetType,
      ip: logEntry.ip,
      userAgent: logEntry.userAgent,
      metadata: logEntry,
      createdAt: new Date(logEntry.timestamp),
    },
  });
}

/**
 * Helper: Log authentication event
 */
async function logAuthEvent(action, { userId, email, ip, userAgent, success = true, reason = null }) {
  return logAuditEvent({
    action,
    category: AUDIT_CATEGORIES.AUTH,
    userId,
    ip,
    userAgent,
    metadata: {
      email,
      success,
      reason,
    },
  });
}

/**
 * Helper: Log access control event
 */
async function logAccessEvent(action, { userId, companyId, resourceType, resourceId, ip, reason = null }) {
  return logAuditEvent({
    action,
    category: AUDIT_CATEGORIES.ACCESS,
    userId,
    companyId,
    targetId: resourceId,
    targetType: resourceType,
    ip,
    metadata: { reason },
  });
}

/**
 * Helper: Log data modification event
 */
async function logDataEvent(action, { userId, companyId, resourceType, resourceId, changes = null }) {
  return logAuditEvent({
    action,
    category: AUDIT_CATEGORIES.DATA,
    userId,
    companyId,
    targetId: resourceId,
    targetType: resourceType,
    metadata: { changes },
  });
}

/**
 * Helper: Log billing event
 */
async function logBillingEvent(action, { userId, companyId, subscriptionId, planId, amount = null, ip }) {
  return logAuditEvent({
    action,
    category: AUDIT_CATEGORIES.BILLING,
    userId,
    companyId,
    targetId: subscriptionId,
    targetType: 'subscription',
    ip,
    metadata: { planId, amount },
  });
}

/**
 * Helper: Log security incident
 */
async function logSecurityIncident(action, { userId, companyId, ip, userAgent, details = {} }) {
  return logAuditEvent({
    action,
    category: AUDIT_CATEGORIES.SECURITY,
    userId,
    companyId,
    ip,
    userAgent,
    severity: SEVERITY.HIGH,
    metadata: details,
  });
}

/**
 * Query audit logs (for admin dashboard)
 *
 * @param {Object} filters
 * @param {string} [filters.category]
 * @param {string} [filters.action]
 * @param {string} [filters.userId]
 * @param {string} [filters.companyId]
 * @param {string} [filters.severity]
 * @param {Date} [filters.startDate]
 * @param {Date} [filters.endDate]
 * @param {number} [filters.limit=100]
 * @param {number} [filters.offset=0]
 */
async function queryAuditLogs(filters = {}) {
  const db = getPrisma();
  const {
    category,
    action,
    userId,
    companyId,
    severity,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters;

  const where = {};

  if (category) where.category = category;
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (companyId) where.companyId = companyId;
  if (severity) where.severity = severity;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    limit,
    offset,
  };
}

/**
 * Get security summary (for dashboard)
 *
 * @param {string} companyId
 * @param {number} [days=7]
 */
async function getSecuritySummary(companyId, days = 7) {
  const db = getPrisma();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalEvents,
    highSeverityEvents,
    loginFailures,
    accessDenials,
  ] = await Promise.all([
    db.auditLog.count({
      where: { companyId, createdAt: { gte: startDate } },
    }),
    db.auditLog.count({
      where: {
        companyId,
        createdAt: { gte: startDate },
        severity: { in: [SEVERITY.HIGH, SEVERITY.CRITICAL] },
      },
    }),
    db.auditLog.count({
      where: {
        companyId,
        createdAt: { gte: startDate },
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
      },
    }),
    db.auditLog.count({
      where: {
        companyId,
        createdAt: { gte: startDate },
        action: { in: [AUDIT_ACTIONS.PERMISSION_DENIED, AUDIT_ACTIONS.OWNERSHIP_VIOLATION] },
      },
    }),
  ]);

  return {
    period: `${days} days`,
    totalEvents,
    highSeverityEvents,
    loginFailures,
    accessDenials,
  };
}

module.exports = {
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  SEVERITY,
  logAuditEvent,
  logAuthEvent,
  logAccessEvent,
  logDataEvent,
  logBillingEvent,
  logSecurityIncident,
  queryAuditLogs,
  getSecuritySummary,
};
