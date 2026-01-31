<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
      <div v-if="showGranularitySelector" class="flex gap-1">
        <button
          v-for="option in granularityOptions"
          :key="option.value"
          @click="$emit('granularity-change', option.value)"
          :class="[
            'px-3 py-1 text-xs rounded-md transition-colors',
            granularity === option.value
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          ]"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="h-64 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
    </div>

    <div v-else-if="!hasData" class="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
      Brak danych do wyświetlenia
    </div>

    <div v-else class="h-64">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps({
  title: {
    type: String,
    default: 'Sprzedaż w czasie'
  },
  data: {
    type: Object,
    default: () => ({ periods: [] })
  },
  metric: {
    type: String,
    default: 'totalValue' // 'totalValue', 'orderCount', 'avgBasket'
  },
  granularity: {
    type: String,
    default: 'day'
  },
  showGranularitySelector: {
    type: Boolean,
    default: true
  },
  showComparison: {
    type: Boolean,
    default: false
  },
  comparisonData: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['granularity-change'])

const granularityOptions = [
  { value: 'day', label: 'Dzień' },
  { value: 'week', label: 'Tydzień' },
  { value: 'month', label: 'Miesiąc' }
]

const metricLabels = {
  totalValue: 'Wartość (PLN)',
  orderCount: 'Liczba zamówień',
  avgBasket: 'Średni koszyk (PLN)',
  totalQuantity: 'Ilość sztuk'
}

const hasData = computed(() => props.data?.periods?.length > 0)

const chartData = computed(() => {
  const periods = props.data?.periods || []

  const labels = periods.map(p => formatPeriodLabel(p.period))
  const values = periods.map(p => p[props.metric] || 0)

  const datasets = [
    {
      label: metricLabels[props.metric] || props.metric,
      data: values,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5
    }
  ]

  if (props.showComparison && props.comparisonData?.length > 0) {
    datasets.push({
      label: 'Poprzedni okres',
      data: props.comparisonData.map(p => p[props.metric] || 0),
      borderColor: '#9ca3af',
      backgroundColor: 'transparent',
      borderDash: [5, 5],
      tension: 0.3,
      pointRadius: 2,
      pointHoverRadius: 4
    })
  }

  return { labels, datasets }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      display: props.showComparison,
      position: 'top',
      labels: {
        usePointStyle: true,
        boxWidth: 6
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 12,
      displayColors: true,
      callbacks: {
        label: (context) => {
          let value = context.parsed.y
          if (props.metric === 'totalValue' || props.metric === 'avgBasket') {
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
        display: false
      },
      ticks: {
        maxRotation: 45,
        minRotation: 0
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)'
      },
      ticks: {
        callback: (value) => {
          if (props.metric === 'totalValue' || props.metric === 'avgBasket') {
            return new Intl.NumberFormat('pl-PL', { notation: 'compact' }).format(value) + ' PLN'
          }
          return new Intl.NumberFormat('pl-PL', { notation: 'compact' }).format(value)
        }
      }
    }
  }
}))

function formatPeriodLabel(period) {
  if (!period) return ''

  // For month: 2024-01 -> Sty 2024
  if (period.length === 7) {
    const [year, month] = period.split('-')
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru']
    return `${months[parseInt(month) - 1]} ${year}`
  }

  // For day: 2024-01-15 -> 15.01
  const parts = period.split('-')
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}`
  }

  return period
}
</script>
