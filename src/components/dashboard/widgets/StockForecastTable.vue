<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Na podstawie sprzedaży z ostatnich {{ daysForAverage }} dni
        </p>
      </div>

      <!-- Status summary -->
      <div class="flex gap-4 text-sm">
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-red-500"></span>
          <span class="text-gray-600 dark:text-gray-400">{{ criticalCount }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
          <span class="text-gray-600 dark:text-gray-400">{{ warningCount }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-green-500"></span>
          <span class="text-gray-600 dark:text-gray-400">{{ okCount }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="h-64 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>

    <div v-else-if="!hasData" class="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
      Brak danych do wyświetlenia
    </div>

    <div v-else class="overflow-x-auto max-h-96">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-white dark:bg-gray-800">
          <tr class="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Produkt</th>
            <th class="pb-2 font-medium text-right">Stan</th>
            <th class="pb-2 font-medium text-right">Śr. sprzedaż/dzień</th>
            <th class="pb-2 font-medium text-right">Dni do wyczerpania</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr
            v-for="product in data"
            :key="product.productId"
            class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <td class="py-2">
              <span
                :class="[
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  statusClasses[product.status]
                ]"
              >
                {{ statusLabels[product.status] }}
              </span>
            </td>
            <td class="py-2">
              <div class="font-medium text-gray-900 dark:text-white truncate max-w-xs" :title="product.name">
                {{ product.name }}
              </div>
              <div v-if="product.sku" class="text-xs text-gray-500 dark:text-gray-400">
                SKU: {{ product.sku }}
              </div>
            </td>
            <td class="py-2 text-right text-gray-700 dark:text-gray-300">
              {{ formatNumber(product.currentStock) }}
            </td>
            <td class="py-2 text-right text-gray-700 dark:text-gray-300">
              {{ product.avgDailySales.toFixed(1) }}
            </td>
            <td class="py-2 text-right">
              <span
                :class="[
                  'font-semibold',
                  product.status === 'critical' ? 'text-red-600 dark:text-red-400' :
                  product.status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                ]"
              >
                {{ product.daysRemaining >= 999 ? '∞' : product.daysRemaining }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: 'Prognoza magazynowa'
  },
  data: {
    type: Array,
    default: () => []
  },
  daysForAverage: {
    type: Number,
    default: 7
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const statusLabels = {
  critical: 'Krytyczny',
  warning: 'Ostrzeżenie',
  ok: 'OK'
}

const statusClasses = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  ok: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
}

const hasData = computed(() => props.data?.length > 0)

const criticalCount = computed(() => props.data.filter(p => p.status === 'critical').length)
const warningCount = computed(() => props.data.filter(p => p.status === 'warning').length)
const okCount = computed(() => props.data.filter(p => p.status === 'ok').length)

function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(value)
}
</script>
