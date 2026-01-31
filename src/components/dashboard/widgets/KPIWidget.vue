<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ title }}</h3>
      <div v-if="icon" class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <component :is="icon" class="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </div>
    </div>

    <div class="flex items-end gap-2">
      <span class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
        {{ formattedValue }}
      </span>
      <span v-if="suffix" class="text-sm text-gray-500 dark:text-gray-400 mb-1">
        {{ suffix }}
      </span>
    </div>

    <div v-if="showTrend" class="flex items-center mt-2 gap-1">
      <span
        :class="[
          'inline-flex items-center text-sm font-medium',
          trendPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        ]"
      >
        <svg
          v-if="trendPositive"
          class="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        <svg
          v-else
          class="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        {{ Math.abs(trend) }}%
      </span>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        vs poprzedni okres
      </span>
    </div>

    <div v-if="loading" class="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center rounded-lg">
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    default: 0
  },
  trend: {
    type: Number,
    default: 0
  },
  showTrend: {
    type: Boolean,
    default: true
  },
  format: {
    type: String,
    default: 'number' // 'number', 'currency', 'percent'
  },
  suffix: {
    type: String,
    default: ''
  },
  icon: {
    type: [Object, String],
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const formattedValue = computed(() => {
  if (props.format === 'currency') {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(props.value)
  }

  if (props.format === 'percent') {
    return `${props.value.toFixed(1)}%`
  }

  return new Intl.NumberFormat('pl-PL').format(props.value)
})

const trendPositive = computed(() => props.trend >= 0)
</script>
