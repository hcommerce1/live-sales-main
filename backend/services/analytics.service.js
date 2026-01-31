/**
 * Analytics Service
 * Provides aggregated data for dashboards and reports
 */

const baselinkerService = require('./baselinkerService');
const companySecretService = require('./companySecret.service');
const logger = require('../utils/logger');

/**
 * Get decrypted BaseLinker token for company
 */
async function getCompanyToken(companyId) {
  const secret = await companySecretService.getSecret(companyId, 'baselinker_token');
  if (!secret) {
    throw new Error('BaseLinker token not configured for this company');
  }
  return secret;
}

/**
 * Aggregate orders by time periods
 * @param {Array} orders - Raw orders from BaseLinker
 * @param {string} granularity - 'day' | 'week' | 'month'
 * @returns {Array} - Aggregated periods
 */
function aggregateOrdersByPeriod(orders, granularity = 'day') {
  const periodMap = new Map();

  for (const order of orders) {
    const date = new Date(order.date_confirmed * 1000);
    let periodKey;

    switch (granularity) {
      case 'week':
        // Get ISO week start (Monday)
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'day':
      default:
        periodKey = date.toISOString().split('T')[0];
    }

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        period: periodKey,
        orderCount: 0,
        totalValue: 0,
        totalQuantity: 0,
        currencies: {}
      });
    }

    const period = periodMap.get(periodKey);
    period.orderCount++;

    // Calculate order value from products
    const orderValue = (order.products || []).reduce((sum, product) => {
      return sum + (parseFloat(product.price_brutto) || 0) * (parseInt(product.quantity) || 1);
    }, 0);

    const orderQuantity = (order.products || []).reduce((sum, product) => {
      return sum + (parseInt(product.quantity) || 1);
    }, 0);

    const currency = order.currency || 'PLN';
    if (!period.currencies[currency]) {
      period.currencies[currency] = { value: 0, count: 0 };
    }
    period.currencies[currency].value += orderValue;
    period.currencies[currency].count++;

    period.totalValue += orderValue;
    period.totalQuantity += orderQuantity;
  }

  // Convert to array and sort by period
  const periods = Array.from(periodMap.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(period => ({
      ...period,
      avgBasket: period.orderCount > 0 ? Math.round(period.totalValue / period.orderCount * 100) / 100 : 0
    }));

  return periods;
}

/**
 * Calculate totals from periods
 */
function calculateTotals(periods) {
  return periods.reduce((totals, period) => ({
    orderCount: totals.orderCount + period.orderCount,
    totalValue: Math.round((totals.totalValue + period.totalValue) * 100) / 100,
    totalQuantity: totals.totalQuantity + period.totalQuantity,
    avgBasket: 0 // Will be calculated after
  }), { orderCount: 0, totalValue: 0, totalQuantity: 0, avgBasket: 0 });
}

/**
 * Get orders summary with aggregation
 */
async function getOrdersSummary(companyId, { dateFrom, dateTo, granularity = 'day', groupBy }) {
  const token = await getCompanyToken(companyId);

  logger.info('Analytics: Fetching orders summary', { companyId, dateFrom, dateTo, granularity });

  // Fetch orders from BaseLinker
  const orders = await baselinkerService.getOrdersWithPagination(token, {
    date_from: dateFrom,
    date_to: dateTo
  });

  logger.info('Analytics: Fetched orders', { count: orders.length });

  // Aggregate by period
  const periods = aggregateOrdersByPeriod(orders, granularity);

  // Calculate totals
  const totals = calculateTotals(periods);
  totals.avgBasket = totals.orderCount > 0 ? Math.round(totals.totalValue / totals.orderCount * 100) / 100 : 0;

  // Optional groupBy for additional breakdown
  let breakdown = null;
  if (groupBy === 'order_source') {
    breakdown = groupByField(orders, 'order_source');
  } else if (groupBy === 'delivery_country_code') {
    breakdown = groupByField(orders, 'delivery_country_code');
  }

  return {
    periods,
    totals,
    breakdown,
    meta: {
      dateFrom,
      dateTo,
      granularity,
      recordCount: orders.length
    }
  };
}

/**
 * Group orders by a specific field
 */
function groupByField(orders, field) {
  const groups = new Map();

  for (const order of orders) {
    const key = order[field] || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { key, orderCount: 0, totalValue: 0 });
    }

    const group = groups.get(key);
    group.orderCount++;

    const orderValue = (order.products || []).reduce((sum, product) => {
      return sum + (parseFloat(product.price_brutto) || 0) * (parseInt(product.quantity) || 1);
    }, 0);

    group.totalValue += orderValue;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .map(g => ({
      ...g,
      totalValue: Math.round(g.totalValue * 100) / 100,
      share: 0 // Will be calculated in route
    }));
}

/**
 * Compare two periods
 */
async function getOrdersComparison(companyId, { currentFrom, currentTo, previousFrom, previousTo }) {
  const token = await getCompanyToken(companyId);

  logger.info('Analytics: Comparing periods', { companyId, currentFrom, currentTo, previousFrom, previousTo });

  // Fetch both periods in parallel
  const [currentOrders, previousOrders] = await Promise.all([
    baselinkerService.getOrdersWithPagination(token, { date_from: currentFrom, date_to: currentTo }),
    baselinkerService.getOrdersWithPagination(token, { date_from: previousFrom, date_to: previousTo })
  ]);

  // Calculate totals for each period
  const calcPeriodTotals = (orders) => {
    let totalValue = 0;
    let totalQuantity = 0;

    for (const order of orders) {
      const orderValue = (order.products || []).reduce((sum, product) => {
        return sum + (parseFloat(product.price_brutto) || 0) * (parseInt(product.quantity) || 1);
      }, 0);

      const orderQuantity = (order.products || []).reduce((sum, product) => {
        return sum + (parseInt(product.quantity) || 1);
      }, 0);

      totalValue += orderValue;
      totalQuantity += orderQuantity;
    }

    return {
      orderCount: orders.length,
      totalValue: Math.round(totalValue * 100) / 100,
      totalQuantity,
      avgBasket: orders.length > 0 ? Math.round(totalValue / orders.length * 100) / 100 : 0
    };
  };

  const current = calcPeriodTotals(currentOrders);
  const previous = calcPeriodTotals(previousOrders);

  // Calculate percentage changes
  const calcChange = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round((curr - prev) / prev * 100 * 10) / 10;
  };

  const change = {
    orderCount: calcChange(current.orderCount, previous.orderCount),
    totalValue: calcChange(current.totalValue, previous.totalValue),
    avgBasket: calcChange(current.avgBasket, previous.avgBasket)
  };

  return { current, previous, change };
}

/**
 * Get top products by sales
 */
async function getTopProducts(companyId, { dateFrom, dateTo, limit = 10, sortBy = 'value' }) {
  const token = await getCompanyToken(companyId);

  logger.info('Analytics: Fetching top products', { companyId, dateFrom, dateTo, limit, sortBy });

  // Fetch orders
  const orders = await baselinkerService.getOrdersWithPagination(token, {
    date_from: dateFrom,
    date_to: dateTo
  });

  // Aggregate products from orders
  const productMap = new Map();

  for (const order of orders) {
    for (const product of order.products || []) {
      const key = product.product_id || product.sku || product.name;
      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: product.product_id,
          name: product.name,
          sku: product.sku || '',
          ean: product.ean || '',
          quantity: 0,
          value: 0,
          orderCount: 0
        });
      }

      const agg = productMap.get(key);
      const qty = parseInt(product.quantity) || 1;
      const price = parseFloat(product.price_brutto) || 0;

      agg.quantity += qty;
      agg.value += price * qty;
      agg.orderCount++;
    }
  }

  // Convert to array and sort
  let products = Array.from(productMap.values());

  if (sortBy === 'quantity') {
    products.sort((a, b) => b.quantity - a.quantity);
  } else {
    products.sort((a, b) => b.value - a.value);
  }

  // Apply limit and round values
  return products.slice(0, limit).map(p => ({
    ...p,
    value: Math.round(p.value * 100) / 100
  }));
}

/**
 * Get sales channels breakdown
 */
async function getChannelsBreakdown(companyId, { dateFrom, dateTo }) {
  const token = await getCompanyToken(companyId);

  logger.info('Analytics: Fetching channels breakdown', { companyId, dateFrom, dateTo });

  const orders = await baselinkerService.getOrdersWithPagination(token, {
    date_from: dateFrom,
    date_to: dateTo
  });

  const channels = groupByField(orders, 'order_source');

  // Calculate total for shares
  const totalValue = channels.reduce((sum, ch) => sum + ch.totalValue, 0);

  return channels.map(ch => ({
    source: ch.key,
    orderCount: ch.orderCount,
    value: ch.totalValue,
    share: totalValue > 0 ? Math.round(ch.totalValue / totalValue * 100 * 10) / 10 : 0
  }));
}

/**
 * Get stock forecast based on recent sales
 */
async function getStockForecast(companyId, { inventoryId, daysForAverage = 7 }) {
  const token = await getCompanyToken(companyId);

  logger.info('Analytics: Calculating stock forecast', { companyId, inventoryId, daysForAverage });

  // Calculate date range for sales average
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysForAverage);

  // Fetch orders and products in parallel
  const [orders, products] = await Promise.all([
    baselinkerService.getOrdersWithPagination(token, {
      date_from: dateFrom.toISOString().split('T')[0],
      date_to: dateTo.toISOString().split('T')[0]
    }),
    baselinkerService.getInventoryProductsListAll(token, inventoryId)
  ]);

  // Calculate sales per product
  const salesMap = new Map();
  for (const order of orders) {
    for (const product of order.products || []) {
      const key = product.product_id || product.sku;
      if (!key) continue;

      const current = salesMap.get(key) || 0;
      salesMap.set(key, current + (parseInt(product.quantity) || 1));
    }
  }

  // Build forecast for each product
  const forecast = products.map(product => {
    const productId = product.id || product.product_id;
    const totalSales = salesMap.get(productId) || salesMap.get(product.sku) || 0;
    const avgDailySales = totalSales / daysForAverage;

    // Get stock - try different possible fields
    let currentStock = 0;
    if (product.stock !== undefined) {
      if (typeof product.stock === 'object') {
        // Sum all warehouse stocks
        currentStock = Object.values(product.stock).reduce((sum, val) => sum + (parseInt(val) || 0), 0);
      } else {
        currentStock = parseInt(product.stock) || 0;
      }
    } else if (product.quantity !== undefined) {
      currentStock = parseInt(product.quantity) || 0;
    }

    const daysRemaining = avgDailySales > 0 ? Math.round(currentStock / avgDailySales) : 999;

    let status;
    if (daysRemaining <= 7) {
      status = 'critical';
    } else if (daysRemaining <= 14) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      productId,
      name: product.name || '',
      sku: product.sku || '',
      ean: product.ean || '',
      currentStock,
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      daysRemaining: daysRemaining > 999 ? 999 : daysRemaining,
      status
    };
  });

  // Sort by daysRemaining (most critical first), filter out products with no stock
  return forecast
    .filter(p => p.currentStock > 0 || p.avgDailySales > 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Get KPI summary (quick overview metrics)
 */
async function getKPISummary(companyId, { dateFrom, dateTo }) {
  const token = await getCompanyToken(companyId);

  // Calculate previous period of same length
  const currentFrom = new Date(dateFrom);
  const currentTo = new Date(dateTo);
  const periodLength = currentTo - currentFrom;

  const previousTo = new Date(currentFrom);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo.getTime() - periodLength);

  // Fetch both periods
  const [currentOrders, previousOrders] = await Promise.all([
    baselinkerService.getOrdersWithPagination(token, { date_from: dateFrom, date_to: dateTo }),
    baselinkerService.getOrdersWithPagination(token, {
      date_from: previousFrom.toISOString().split('T')[0],
      date_to: previousTo.toISOString().split('T')[0]
    })
  ]);

  const calcMetrics = (orders) => {
    let totalValue = 0;
    let totalQuantity = 0;

    for (const order of orders) {
      const orderValue = (order.products || []).reduce((sum, product) => {
        return sum + (parseFloat(product.price_brutto) || 0) * (parseInt(product.quantity) || 1);
      }, 0);
      totalValue += orderValue;

      const orderQuantity = (order.products || []).reduce((sum, product) => {
        return sum + (parseInt(product.quantity) || 1);
      }, 0);
      totalQuantity += orderQuantity;
    }

    return {
      orderCount: orders.length,
      totalValue: Math.round(totalValue * 100) / 100,
      totalQuantity,
      avgBasket: orders.length > 0 ? Math.round(totalValue / orders.length * 100) / 100 : 0
    };
  };

  const current = calcMetrics(currentOrders);
  const previous = calcMetrics(previousOrders);

  const calcTrend = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round((curr - prev) / prev * 100 * 10) / 10;
  };

  return {
    orderCount: {
      value: current.orderCount,
      trend: calcTrend(current.orderCount, previous.orderCount),
      previousValue: previous.orderCount
    },
    totalValue: {
      value: current.totalValue,
      trend: calcTrend(current.totalValue, previous.totalValue),
      previousValue: previous.totalValue
    },
    avgBasket: {
      value: current.avgBasket,
      trend: calcTrend(current.avgBasket, previous.avgBasket),
      previousValue: previous.avgBasket
    },
    totalQuantity: {
      value: current.totalQuantity,
      trend: calcTrend(current.totalQuantity, previous.totalQuantity),
      previousValue: previous.totalQuantity
    }
  };
}

module.exports = {
  getOrdersSummary,
  getOrdersComparison,
  getTopProducts,
  getChannelsBreakdown,
  getStockForecast,
  getKPISummary
};
