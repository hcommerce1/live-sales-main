const cron = require('node-cron');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Global timeout for export execution (10 minutes)
// Prevents exports from hanging indefinitely and blocking scheduler
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Execute a promise with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name for error message
 * @returns {Promise} - Result or timeout error
 */
async function withTimeout(promise, timeoutMs, operationName = 'Export') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

class Scheduler {
  constructor() {
    this.jobs = new Map();
    // Track currently running exports to prevent overlapping executions
    this.runningExports = new Set();
  }

  /**
   * Initialize scheduler - load all active exports from DATABASE and schedule them
   * MIG-1 FIX: Now loads from Prisma instead of in-memory (which is empty after restart)
   */
  async init() {
    logger.info('Initializing scheduler - loading exports from database');

    try {
      // Load active exports with schedule from database
      const activeExports = await prisma.export.findMany({
        where: {
          status: 'active',
          scheduleMinutes: { gt: 0 }
        },
        select: {
          id: true,
          name: true,
          scheduleMinutes: true,
          companyId: true
        }
      });

      logger.info(`Found ${activeExports.length} active exports with schedules in database`);

      // Schedule each export
      for (const exportConfig of activeExports) {
        this.scheduleExport(exportConfig.id, exportConfig.scheduleMinutes);
        logger.debug('Scheduled export from database', {
          exportId: exportConfig.id,
          name: exportConfig.name,
          interval: exportConfig.scheduleMinutes
        });
      }

      // Schedule maintenance tasks
      this.scheduleMaintenanceTasks();

      logger.info(`Scheduler initialized with ${this.jobs.size} scheduled exports`);
    } catch (error) {
      logger.error('Failed to initialize scheduler from database', {
        error: error.message,
        stack: error.stack
      });

      // Fallback to in-memory (for backward compatibility during migration)
      logger.warn('Falling back to in-memory exports');
      const exports = exportService.getAllExports();
      exports.forEach(exportConfig => {
        if (exportConfig.status === 'active' && exportConfig.schedule_minutes > 0) {
          this.scheduleExport(exportConfig.id, exportConfig.schedule_minutes);
        }
      });

      this.scheduleMaintenanceTasks();
      logger.info(`Scheduler initialized (fallback) with ${this.jobs.size} scheduled exports`);
    }
  }

  /**
   * Schedule maintenance tasks (audit log cleanup, etc.)
   */
  scheduleMaintenanceTasks() {
    // Audit log retention: Run daily at 3 AM
    const auditLogCleanupJob = cron.schedule('0 3 * * *', async () => {
      logger.info('Running audit log cleanup task');
      try {
        await this.cleanupAuditLogs();
        logger.info('Audit log cleanup completed');
      } catch (error) {
        logger.error('Audit log cleanup failed', { error: error.message });
      }
    });

    this.jobs.set('maintenance-audit-logs', auditLogCleanupJob);
    logger.info('Maintenance tasks scheduled');
  }

  /**
   * Cleanup audit logs older than 90 days
   * Configurable via AUDIT_LOG_RETENTION_DAYS env var
   */
  async cleanupAuditLogs() {
    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`Deleting audit logs older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });

    logger.info(`Deleted ${result.count} old audit log entries`);
    return result.count;
  }

  /**
   * Schedule an export to run periodically
   * @param {string} exportId - Export ID
   * @param {number} minutes - Interval in minutes
   */
  scheduleExport(exportId, minutes) {
    // Stop existing job if any
    this.stopExport(exportId);

    if (minutes === 0) {
      logger.info(`Export ${exportId} is set to live mode (manual trigger only)`);
      return;
    }

    // Convert minutes to cron expression
    const cronExpression = this.minutesToCron(minutes);

    logger.info(`Scheduling export ${exportId} with interval ${minutes} minutes (${cronExpression})`);

    const job = cron.schedule(cronExpression, async () => {
      // Mutex: Skip if export is already running (prevents overlapping executions)
      if (this.runningExports.has(exportId)) {
        logger.warn(`Scheduler skipped export ${exportId} - already running`, {
          exportId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      this.runningExports.add(exportId);
      logger.info(`Scheduler triggered export ${exportId}`);

      try {
        // Execute with global timeout to prevent hanging exports
        await withTimeout(
          exportService.runExport(exportId),
          EXPORT_TIMEOUT_MS,
          `Export ${exportId}`
        );
        logger.info(`Scheduled export ${exportId} completed successfully`);
      } catch (error) {
        logger.error(`Scheduled export ${exportId} failed`, {
          error: error.message,
          stack: error.stack,
          code: error.code,
          exportId,
          isTimeout: error.message?.includes('timed out'),
          timestamp: new Date().toISOString()
        });
      } finally {
        this.runningExports.delete(exportId);
      }
    });

    this.jobs.set(exportId, job);
    logger.info(`Export ${exportId} scheduled successfully`);
  }

  /**
   * Stop scheduled export
   * @param {string} exportId - Export ID
   */
  stopExport(exportId) {
    const job = this.jobs.get(exportId);
    if (job) {
      job.stop();
      this.jobs.delete(exportId);
      logger.info(`Export ${exportId} unscheduled`);
    }
  }

  /**
   * Reschedule export with new interval
   * @param {string} exportId - Export ID
   * @param {number} minutes - New interval in minutes
   */
  rescheduleExport(exportId, minutes) {
    this.scheduleExport(exportId, minutes);
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping all scheduled jobs');
    this.jobs.forEach((job, exportId) => {
      job.stop();
      logger.info(`Stopped job for export ${exportId}`);
    });
    this.jobs.clear();
    this.runningExports.clear();
    logger.info('All scheduled jobs stopped');
  }

  /**
   * Convert minutes to cron expression
   * @param {number} minutes - Interval in minutes
   * @returns {string} - Cron expression
   */
  minutesToCron(minutes) {
    if (minutes < 60) {
      // Every X minutes
      return `*/${minutes} * * * *`;
    } else if (minutes < 1440) {
      // Every X hours
      const hours = Math.floor(minutes / 60);
      return `0 */${hours} * * *`;
    } else {
      // Every X days
      const days = Math.floor(minutes / 1440);
      if (days === 1) {
        // Daily at midnight
        return '0 0 * * *';
      } else {
        // Every X days at midnight
        return `0 0 */${days} * *`;
      }
    }
  }

  /**
   * Get list of all scheduled jobs
   * @returns {Array} - List of scheduled exports
   */
  getScheduledJobs() {
    return Array.from(this.jobs.keys());
  }

  /**
   * Check if export is scheduled
   * @param {string} exportId - Export ID
   * @returns {boolean} - True if scheduled
   */
  isScheduled(exportId) {
    return this.jobs.has(exportId);
  }

  /**
   * Check if export is currently running
   * @param {string} exportId - Export ID
   * @returns {boolean} - True if running
   */
  isRunning(exportId) {
    return this.runningExports.has(exportId);
  }

  /**
   * Get count of currently running exports
   * @returns {number} - Count of running exports
   */
  getRunningCount() {
    return this.runningExports.size;
  }
}

module.exports = new Scheduler();
