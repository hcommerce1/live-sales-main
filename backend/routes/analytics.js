/**
 * Analytics Routes
 * Provides endpoints for dashboard analytics and reports
 */

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics.service');
const logger = require('../utils/logger');
const { companyContextMiddleware, requireCompany } = require('../middleware/companyContext');

// Apply company context to all routes
router.use(companyContextMiddleware);

/**
 * GET /api/analytics/orders/summary
 * Get aggregated orders data by time periods
 */
router.get('/orders/summary', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { dateFrom, dateTo, granularity = 'day', groupBy } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: { message: 'dateFrom and dateTo are required', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getOrdersSummary(companyId, {
      dateFrom,
      dateTo,
      granularity,
      groupBy
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics orders/summary error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to fetch orders summary', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

/**
 * GET /api/analytics/orders/comparison
 * Compare two time periods
 */
router.get('/orders/comparison', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { currentFrom, currentTo, previousFrom, previousTo } = req.query;

    if (!currentFrom || !currentTo || !previousFrom || !previousTo) {
      return res.status(400).json({
        error: { message: 'All date parameters are required (currentFrom, currentTo, previousFrom, previousTo)', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getOrdersComparison(companyId, {
      currentFrom,
      currentTo,
      previousFrom,
      previousTo
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics orders/comparison error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to compare periods', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

/**
 * GET /api/analytics/products/top
 * Get top selling products
 */
router.get('/products/top', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { dateFrom, dateTo, limit = '10', sortBy = 'value' } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: { message: 'dateFrom and dateTo are required', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getTopProducts(companyId, {
      dateFrom,
      dateTo,
      limit: parseInt(limit, 10),
      sortBy
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics products/top error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to fetch top products', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

/**
 * GET /api/analytics/channels
 * Get sales channels breakdown
 */
router.get('/channels', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { dateFrom, dateTo } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: { message: 'dateFrom and dateTo are required', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getChannelsBreakdown(companyId, {
      dateFrom,
      dateTo
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics channels error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to fetch channels data', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

/**
 * GET /api/analytics/products/stock-forecast
 * Get stock forecast based on recent sales
 */
router.get('/products/stock-forecast', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { inventoryId, daysForAverage = '7' } = req.query;

    if (!inventoryId) {
      return res.status(400).json({
        error: { message: 'inventoryId is required', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getStockForecast(companyId, {
      inventoryId: parseInt(inventoryId, 10),
      daysForAverage: parseInt(daysForAverage, 10)
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics stock-forecast error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to calculate stock forecast', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

/**
 * GET /api/analytics/kpi
 * Get KPI summary with trends
 */
router.get('/kpi', requireCompany, async (req, res) => {
  try {
    const companyId = req.company.id;

    const { dateFrom, dateTo } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: { message: 'dateFrom and dateTo are required', code: 'MISSING_PARAMS', status: 400 }
      });
    }

    const data = await analyticsService.getKPISummary(companyId, {
      dateFrom,
      dateTo
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Analytics kpi error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to fetch KPI data', code: 'ANALYTICS_ERROR', status: 500 }
    });
  }
});

module.exports = router;
