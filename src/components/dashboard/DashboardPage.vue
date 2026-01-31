<template>
  <div class="p-4 md:p-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboardy</h1>
        <p class="text-gray-500 dark:text-gray-400">Analiza sprzedaży i stanów magazynowych</p>
      </div>

      <!-- Dashboard tabs -->
      <div class="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        <button
          @click="activeDashboard = 'sales'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeDashboard === 'sales'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          ]"
        >
          Sprzedaż
        </button>
        <button
          @click="activeDashboard = 'inventory'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeDashboard === 'inventory'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          ]"
        >
          Magazyn
        </button>
      </div>
    </div>

    <!-- Date range picker (for sales dashboard) -->
    <div v-if="activeDashboard === 'sales'" class="mb-6">
      <DateRangePicker
        v-model="dashboardStore.dateRange"
        @change="refreshSalesDashboard"
      />
    </div>

    <!-- Inventory selector (for inventory dashboard) -->
    <div v-if="activeDashboard === 'inventory'" class="mb-6">
      <div class="flex items-center gap-4">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Katalog:</label>
        <select
          v-model="selectedInventory"
          @change="onInventoryChange"
          class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Wybierz katalog</option>
          <option v-for="inv in inventories" :key="inv.inventory_id" :value="inv.inventory_id">
            {{ inv.name }}
          </option>
        </select>
        <button
          v-if="selectedInventory"
          @click="refreshInventoryDashboard"
          :disabled="dashboardStore.isLoading"
          class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Odśwież
        </button>
      </div>
    </div>

    <!-- Sales Dashboard -->
    <div v-if="activeDashboard === 'sales'" class="space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIWidget
          title="Zamówienia"
          :value="dashboardStore.kpi.orderCount.value"
          :trend="dashboardStore.kpi.orderCount.trend"
          format="number"
          :loading="dashboardStore.loadingStates.kpi"
        />
        <KPIWidget
          title="Wartość sprzedaży"
          :value="dashboardStore.kpi.totalValue.value"
          :trend="dashboardStore.kpi.totalValue.trend"
          format="currency"
          :loading="dashboardStore.loadingStates.kpi"
        />
        <KPIWidget
          title="Średni koszyk"
          :value="dashboardStore.kpi.avgBasket.value"
          :trend="dashboardStore.kpi.avgBasket.trend"
          format="currency"
          :loading="dashboardStore.loadingStates.kpi"
        />
        <KPIWidget
          title="Sprzedane sztuki"
          :value="dashboardStore.kpi.totalQuantity.value"
          :trend="dashboardStore.kpi.totalQuantity.trend"
          format="number"
          :loading="dashboardStore.loadingStates.kpi"
        />
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LineChartWidget
          title="Sprzedaż w czasie"
          :data="dashboardStore.salesData"
          :metric="selectedMetric"
          :granularity="selectedGranularity"
          :loading="dashboardStore.loadingStates.salesChart"
          @granularity-change="onGranularityChange"
        />
        <BarChartWidget
          title="Porównanie okresów"
          :comparison-data="dashboardStore.comparisonData"
          :loading="dashboardStore.loadingStates.salesChart"
        />
      </div>

      <!-- Bottom row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsTable
          title="Top 10 produktów"
          :data="dashboardStore.topProducts"
          :sort-by="topProductsSortBy"
          :loading="dashboardStore.loadingStates.topProducts"
          @sort-change="onTopProductsSortChange"
        />
        <PieChartWidget
          title="Kanały sprzedaży"
          :data="dashboardStore.channels"
          :loading="dashboardStore.loadingStates.channels"
        />
      </div>
    </div>

    <!-- Inventory Dashboard -->
    <div v-if="activeDashboard === 'inventory'" class="space-y-6">
      <!-- KPI Cards for inventory -->
      <div v-if="dashboardStore.stockForecast.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPIWidget
          title="Produkty krytyczne"
          :value="dashboardStore.criticalStockProducts.length"
          :show-trend="false"
          format="number"
          suffix="< 7 dni"
        />
        <KPIWidget
          title="Produkty z ostrzeżeniem"
          :value="dashboardStore.warningStockProducts.length"
          :show-trend="false"
          format="number"
          suffix="< 14 dni"
        />
        <KPIWidget
          title="Wszystkie produkty"
          :value="dashboardStore.stockForecast.length"
          :show-trend="false"
          format="number"
        />
      </div>

      <!-- Stock forecast table -->
      <StockForecastTable
        title="Prognoza magazynowa"
        :data="dashboardStore.stockForecast"
        :days-for-average="7"
        :loading="dashboardStore.loadingStates.stockForecast"
      />

      <!-- Empty state when no inventory selected -->
      <div v-if="!selectedInventory" class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Wybierz katalog</h3>
        <p class="text-gray-500 dark:text-gray-400">
          Wybierz katalog produktów z listy powyżej, aby zobaczyć prognozę magazynową.
        </p>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="dashboardStore.error" class="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p class="text-red-600 dark:text-red-400">{{ dashboardStore.error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'
import { API } from '../../api'

// Widgets
import KPIWidget from './widgets/KPIWidget.vue'
import LineChartWidget from './widgets/LineChartWidget.vue'
import BarChartWidget from './widgets/BarChartWidget.vue'
import PieChartWidget from './widgets/PieChartWidget.vue'
import TopProductsTable from './widgets/TopProductsTable.vue'
import StockForecastTable from './widgets/StockForecastTable.vue'
import DateRangePicker from './DateRangePicker.vue'

const dashboardStore = useDashboardStore()

// Local state
const activeDashboard = ref('sales')
const selectedMetric = ref('totalValue')
const selectedGranularity = ref('day')
const topProductsSortBy = ref('value')
const selectedInventory = ref('')
const inventories = ref([])

// Watch dashboard tab changes
watch(activeDashboard, (newValue) => {
  if (newValue === 'sales') {
    refreshSalesDashboard()
  } else if (newValue === 'inventory' && inventories.value.length === 0) {
    loadInventories()
  }
})

// Methods
async function refreshSalesDashboard() {
  await dashboardStore.refreshSalesDashboard()
}

async function refreshInventoryDashboard() {
  if (selectedInventory.value) {
    await dashboardStore.refreshInventoryDashboard(selectedInventory.value)
  }
}

function onGranularityChange(granularity) {
  selectedGranularity.value = granularity
  dashboardStore.fetchSalesData(granularity)
}

function onTopProductsSortChange(sortBy) {
  topProductsSortBy.value = sortBy
  dashboardStore.fetchTopProducts(10, sortBy)
}

function onInventoryChange() {
  if (selectedInventory.value) {
    refreshInventoryDashboard()
  }
}

async function loadInventories() {
  try {
    const response = await API.baselinker.getInventories()
    inventories.value = response || []

    // Auto-select first inventory if available
    if (inventories.value.length > 0 && !selectedInventory.value) {
      selectedInventory.value = inventories.value[0].inventory_id
      refreshInventoryDashboard()
    }
  } catch (error) {
    console.error('Failed to load inventories:', error)
  }
}

// Initialize
onMounted(() => {
  refreshSalesDashboard()
})
</script>
