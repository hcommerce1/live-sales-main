const cron = require('node-cron');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class Scheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Initialize scheduler - load all active exports and schedule them
   */
  init() {
    logger.info('Initializing scheduler');

    const exports = exportService.getAllExports();
    exports.forEach(exportConfig => {
      if (exportConfig.status === 'active' && exportConfig.schedule_minutes > 0) {
        this.scheduleExport(exportConfig.id, exportConfig.schedule_minutes);
      }
    });

    // Schedule maintenance tasks
    this.scheduleMaintenanceTasks();

    logger.info(`Scheduler initialized with ${this.jobs.size} scheduled exports`);
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
      logger.info(`Scheduler triggered export ${exportId}`);
      try {
        await exportService.runExport(exportId);
        logger.info(`Scheduled export ${exportId} completed successfully`);
      } catch (error) {
        logger.error(`Scheduled export ${exportId} failed`, {
          error: error.message
        });
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
}

module.exports = new Scheduler();
