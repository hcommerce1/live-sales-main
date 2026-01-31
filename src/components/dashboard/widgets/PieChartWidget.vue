<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
    </div>

    <div v-if="loading" class="h-64 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>

    <div v-else-if="!hasData" class="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
      Brak danych do wyświetlenia
    </div>

    <div v-else class="flex flex-col md:flex-row items-center gap-4">
      <div class="w-48 h-48">
        <Doughnut :data="chartData" :options="chartOptions" />
      </div>

      <!-- Legend -->
      <div class="flex-1 space-y-2">
        <div
          v-for="(item, index) in data"
          :key="item.source"
          class="flex items-center justify-between text-sm"
        >
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :style="{ backgroundColor: colors[index % colors.length] }"
            ></div>
            <span class="text-gray-700 dark:text-gray-300">{{ item.source }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-gray-500 dark:text-gray-400">{{ item.orderCount }} zam.</span>
            <span class="font-medium text-gray-900 dark:text-white">{{ item.share }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  title: {
    type: String,
    default: 'Kanały sprzedaży'
  },
  data: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const colors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16'  // lime
]

const hasData = computed(() => props.data?.length > 0)

const chartData = computed(() => {
  return {
    labels: props.data.map(d => d.source),
    datasets: [{
      data: props.data.map(d => d.value),
      backgroundColor: colors.slice(0, props.data.length),
      borderWidth: 0,
      hoverOffset: 4
    }]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  cutout: '60%',
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      callbacks: {
        label: (context) => {
          const value = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed)
          return ` ${context.label}: ${value}`
        }
      }
    }
  }
}
</script>
