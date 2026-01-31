<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
      <div class="flex gap-1">
        <button
          @click="$emit('sort-change', 'value')"
          :class="[
            'px-3 py-1 text-xs rounded-md transition-colors',
            sortBy === 'value'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          ]"
        >
          Wartość
        </button>
        <button
          @click="$emit('sort-change', 'quantity')"
          :class="[
            'px-3 py-1 text-xs rounded-md transition-colors',
            sortBy === 'quantity'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          ]"
        >
          Ilość
        </button>
      </div>
    </div>

    <div v-if="loading" class="h-64 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>

    <div v-else-if="!hasData" class="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
      Brak danych do wyświetlenia
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th class="pb-2 font-medium">#</th>
            <th class="pb-2 font-medium">Produkt</th>
            <th class="pb-2 font-medium text-right">Ilość</th>
            <th class="pb-2 font-medium text-right">Wartość</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr v-for="(product, index) in data" :key="product.productId || index" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td class="py-2 text-gray-500 dark:text-gray-400">{{ index + 1 }}</td>
            <td class="py-2">
              <div class="font-medium text-gray-900 dark:text-white truncate max-w-xs" :title="product.name">
                {{ product.name }}
              </div>
              <div v-if="product.sku" class="text-xs text-gray-500 dark:text-gray-400">
                SKU: {{ product.sku }}
              </div>
            </td>
            <td class="py-2 text-right text-gray-700 dark:text-gray-300">
              {{ formatNumber(product.quantity) }}
            </td>
            <td class="py-2 text-right font-medium text-gray-900 dark:text-white">
              {{ formatCurrency(product.value) }}
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
    default: 'Top produkty'
  },
  data: {
    type: Array,
    default: () => []
  },
  sortBy: {
    type: String,
    default: 'value'
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['sort-change'])

const hasData = computed(() => props.data?.length > 0)

function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(value)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}
</script>
