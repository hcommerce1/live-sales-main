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

    <div v-else class="h-64">
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <!-- Comparison summary -->
    <div v-if="showComparisonSummary && comparisonData.change" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Zamówienia</div>
          <div :class="getChangeClass(comparisonData.change.orderCount)" class="text-sm font-semibold">
            {{ formatChange(comparisonData.change.orderCount) }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Wartość</div>
          <div :class="getChangeClass(comparisonData.change.totalValue)" class="text-sm font-semibold">
            {{ formatChange(comparisonData.change.totalValue) }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Śr. koszyk</div>
          <div :class="getChangeClass(comparisonData.change.avgBasket)" class="text-sm font-semibold">
            {{ formatChange(comparisonData.change.avgBasket) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const props = defineProps({
  title: {
    type: String,
    default: 'Porównanie okresów'
  },
  comparisonData: {
    type: Object,
    default: () => ({ current: {}, previous: {}, change: {} })
  },
  metric: {
    type: String,
    default: 'totalValue'
  },
  showComparisonSummary: {
    type: Boolean,
    default: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const metricLabels = {
  totalValue: 'Wartość (PLN)',
  orderCount: 'Liczba zamówień',
  avgBasket: 'Średni koszyk (PLN)'
}

const hasData = computed(() => {
  return props.comparisonData?.current?.orderCount !== undefined
})

const chartData = computed(() => {
  const { current, previous } = props.comparisonData

  return {
    labels: ['Zamówienia', 'Wartość', 'Śr. koszyk'],
    datasets: [
      {
        label: 'Aktualny okres',
        data: [
          current?.orderCount || 0,
          current?.totalValue || 0,
          current?.avgBasket || 0
        ],
        backgroundColor: '#3b82f6',
        borderRadius: 4
      },
      {
        label: 'Poprzedni okres',
        data: [
          previous?.orderCount || 0,
          previous?.totalValue || 0,
          previous?.avgBasket || 0
        ],
        backgroundColor: '#9ca3af',
        borderRadius: 4
      }
    ]
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        usePointStyle: true,
        boxWidth: 6
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      callbacks: {
        label: (context) => {
          let value = context.parsed.x
          const idx = context.dataIndex
          if (idx === 1 || idx === 2) {
            value = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value)
          } else {
            value = new Intl.NumberFormat('pl-PL').format(value)
          }
          return `${context.dataset.label}: ${value}`
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(0, 0, 0, 0.05)'
      },
      ticks: {
        callback: (value) => {
          return new Intl.NumberFormat('pl-PL', { notation: 'compact' }).format(value)
        }
      }
    },
    y: {
      grid: {
        display: false
      }
    }
  }
}))

function formatChange(value) {
  if (value === undefined || value === null) return '-'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function getChangeClass(value) {
  if (value === undefined || value === null) return 'text-gray-500'
  return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}
</script>
