/**
 * Dashboard Store - Pinia store for analytics dashboards
 *
 * Handles:
 * - Date range selection
 * - KPI metrics with trends
 * - Sales data for charts
 * - Top products
 * - Channels breakdown
 * - Stock forecast
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API } from '../api'

export const useDashboardStore = defineStore('dashboard', () => {
  // ============================================
  // STATE
  // ============================================

  // Date range
  const dateRange = ref({
    type: 'last_30_days',
    from: null,
    to: null
  })

  // Loading states
  const isLoading = ref(false)
  const loadingStates = ref({
    kpi: false,
    salesChart: false,
    topProducts: false,
    channels: false,
    stockForecast: false
  })

  // Error state
  const error = ref(null)

  // KPI data
  const kpi = ref({
    orderCount: { value: 0, trend: 0, previousValue: 0 },
    totalValue: { value: 0, trend: 0, previousValue: 0 },
    avgBasket: { value: 0, trend: 0, previousValue: 0 },
    totalQuantity: { value: 0, trend: 0, previousValue: 0 }
  })

  // Sales chart data
  const salesData = ref({
    periods: [],
    totals: {},
    meta: {}
  })

  // Comparison data
  const comparisonData = ref({
    current: {},
    previous: {},
    change: {}
  })

  // Top products
  const topProducts = ref([])

  // Channels breakdown
  const channels = ref([])

  // Stock forecast
  const stockForecast = ref([])

  // Active dashboard
  const activeDashboard = ref('sales') // 'sales' | 'inventory'

  // Selected inventory for stock forecast
  const selectedInventoryId = ref(null)

  // ============================================
  // GETTERS
  // ============================================

  const dateRangeFormatted = computed(() => {
    const { from, to } = getDateRangeValues()
    return { from, to }
  })

  const criticalStockProducts = computed(() =>
    stockForecast.value.filter(p => p.status === 'critical')
  )

  const warningStockProducts = computed(() =>
    stockForecast.value.filter(p => p.status === 'warning')
  )

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Get actual date values from date range type
   */
  function getDateRangeValues() {
    const now = new Date()
    let from, to

    to = now.toISOString().split('T')[0]

    switch (dateRange.value.type) {
      case 'last_7_days':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'last_30_days':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'last_90_days':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        break
      case 'last_month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        from = lastMonth.toISOString().split('T')[0]
        to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
        break
      case 'custom':
        from = dateRange.value.from
        to = dateRange.value.to
        break
      default:
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }

    return { from, to }
  }

  /**
   * Get previous period dates for comparison
   */
  function getPreviousPeriodDates() {
    const { from, to } = getDateRangeValues()
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const periodLength = toDate.getTime() - fromDate.getTime()

    const previousTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000)
    const previousFrom = new Date(previousTo.getTime() - periodLength)

    return {
      previousFrom: previousFrom.toISOString().split('T')[0],
      previousTo: previousTo.toISOString().split('T')[0]
    }
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Set date range
   */
  function setDateRange(type, customFrom = null, customTo = null) {
    dateRange.value = {
      type,
      from: customFrom,
      to: customTo
    }
  }

  /**
   * Fetch KPI summary
   */
  async function fetchKPI() {
    loadingStates.value.kpi = true
    error.value = null

    try {
      const { from, to } = getDateRangeValues()
      const response = await API.analytics.getKPI(from, to)

      if (response.success && response.data) {
        kpi.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch KPI:', err)
    } finally {
      loadingStates.value.kpi = false
    }
  }

  /**
   * Fetch sales chart data
   */
  async function fetchSalesData(granularity = 'day') {
    loadingStates.value.salesChart = true
    error.value = null

    try {
      const { from, to } = getDateRangeValues()
      const response = await API.analytics.getOrdersSummary(from, to, granularity)

      if (response.success && response.data) {
        salesData.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch sales data:', err)
    } finally {
      loadingStates.value.salesChart = false
    }
  }

  /**
   * Fetch period comparison
   */
  async function fetchComparison() {
    loadingStates.value.salesChart = true
    error.value = null

    try {
      const { from, to } = getDateRangeValues()
      const { previousFrom, previousTo } = getPreviousPeriodDates()

      const response = await API.analytics.getOrdersComparison(from, to, previousFrom, previousTo)

      if (response.success && response.data) {
        comparisonData.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch comparison:', err)
    } finally {
      loadingStates.value.salesChart = false
    }
  }

  /**
   * Fetch top products
   */
  async function fetchTopProducts(limit = 10, sortBy = 'value') {
    loadingStates.value.topProducts = true
    error.value = null

    try {
      const { from, to } = getDateRangeValues()
      const response = await API.analytics.getTopProducts(from, to, limit, sortBy)

      if (response.success && response.data) {
        topProducts.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch top products:', err)
    } finally {
      loadingStates.value.topProducts = false
    }
  }

  /**
   * Fetch channels breakdown
   */
  async function fetchChannels() {
    loadingStates.value.channels = true
    error.value = null

    try {
      const { from, to } = getDateRangeValues()
      const response = await API.analytics.getChannels(from, to)

      if (response.success && response.data) {
        channels.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch channels:', err)
    } finally {
      loadingStates.value.channels = false
    }
  }

  /**
   * Fetch stock forecast
   */
  async function fetchStockForecast(inventoryId, daysForAverage = 7) {
    if (!inventoryId) {
      error.value = 'Inventory ID required'
      return
    }

    loadingStates.value.stockForecast = true
    error.value = null
    selectedInventoryId.value = inventoryId

    try {
      const response = await API.analytics.getStockForecast(inventoryId, daysForAverage)

      if (response.success && response.data) {
        stockForecast.value = response.data
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch stock forecast:', err)
    } finally {
      loadingStates.value.stockForecast = false
    }
  }

  /**
   * Refresh all dashboard data
   */
  async function refreshAll() {
    isLoading.value = true

    try {
      await Promise.all([
        fetchKPI(),
        fetchSalesData(),
        fetchTopProducts(),
        fetchChannels()
      ])
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh sales dashboard
   */
  async function refreshSalesDashboard() {
    isLoading.value = true

    try {
      await Promise.all([
        fetchKPI(),
        fetchSalesData(),
        fetchComparison(),
        fetchTopProducts(),
        fetchChannels()
      ])
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh inventory dashboard
   */
  async function refreshInventoryDashboard(inventoryId) {
    isLoading.value = true

    try {
      await fetchStockForecast(inventoryId)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Reset store to initial state
   */
  function $reset() {
    dateRange.value = { type: 'last_30_days', from: null, to: null }
    isLoading.value = false
    loadingStates.value = {
      kpi: false,
      salesChart: false,
      topProducts: false,
      channels: false,
      stockForecast: false
    }
    error.value = null
    kpi.value = {
      orderCount: { value: 0, trend: 0, previousValue: 0 },
      totalValue: { value: 0, trend: 0, previousValue: 0 },
      avgBasket: { value: 0, trend: 0, previousValue: 0 },
      totalQuantity: { value: 0, trend: 0, previousValue: 0 }
    }
    salesData.value = { periods: [], totals: {}, meta: {} }
    comparisonData.value = { current: {}, previous: {}, change: {} }
    topProducts.value = []
    channels.value = []
    stockForecast.value = []
    activeDashboard.value = 'sales'
    selectedInventoryId.value = null
  }

  return {
    // State
    dateRange,
    isLoading,
    loadingStates,
    error,
    kpi,
    salesData,
    comparisonData,
    topProducts,
    channels,
    stockForecast,
    activeDashboard,
    selectedInventoryId,

    // Getters
    dateRangeFormatted,
    criticalStockProducts,
    warningStockProducts,

    // Actions
    setDateRange,
    fetchKPI,
    fetchSalesData,
    fetchComparison,
    fetchTopProducts,
    fetchChannels,
    fetchStockForecast,
    refreshAll,
    refreshSalesDashboard,
    refreshInventoryDashboard,
    $reset
  }
})
