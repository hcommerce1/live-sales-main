<template>
  <!-- Wariant E: Feature highlights - marketingowy styl z wyroznieniami -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div
      v-for="plan in plans"
      :key="plan.id"
      class="relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 flex flex-col"
      :class="[
        plan.id === currentPlanId ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700',
        plan.id === 'basic' ? 'md:-mt-2 md:mb-2 md:shadow-lg' : ''
      ]"
    >
      <!-- Popular badge for Basic -->
      <div v-if="plan.id === 'basic'" class="absolute -top-3 left-1/2 -translate-x-1/2">
        <span class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-sm">
          NAJPOPULARNIEJSZY
        </span>
      </div>

      <!-- Header with icon -->
      <div class="text-center pt-2">
        <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
             :class="planStyles[plan.id].iconBg">
          <component :is="planStyles[plan.id].icon" class="w-7 h-7" :class="planStyles[plan.id].iconColor" />
        </div>
        <div v-if="plan.id === currentPlanId" class="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">AKTUALNY PLAN</div>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ plan.name }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ planStyles[plan.id].tagline }}</p>
      </div>

      <!-- Price -->
      <div class="text-center my-5 py-4 border-y border-gray-100 dark:border-gray-700">
        <div class="text-4xl font-bold" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'">
          {{ getPlanPrice(plan) }}
          <span v-if="plan.price?.monthlyRaw > 0" class="text-base font-normal text-gray-500 dark:text-gray-400">brutto</span>
        </div>
        <div v-if="plan.price?.monthlyRaw > 0" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ formatNettoPrice(plan) }} netto / {{ selectedInterval === 'monthly' ? 'miesiac' : 'rok' }}
        </div>
        <div v-if="selectedInterval === 'yearly' && plan.price?.monthlyRaw > 0" class="mt-2">
          <span class="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs font-medium px-2 py-1 rounded-full">
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            2 miesiace gratis
          </span>
        </div>
      </div>

      <!-- Features with icons -->
      <div class="flex-1 space-y-3">
        <div v-for="feature in getHighlightedFeatures(plan)" :key="feature.label"
             class="flex items-center gap-3 p-2 rounded-lg"
             :class="feature.highlighted ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               :class="feature.available ? 'bg-green-100 dark:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-700'">
            <svg v-if="feature.available" class="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
            </svg>
          </div>
          <div class="flex-1">
            <span class="text-sm" :class="feature.available ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'">
              {{ feature.label }}
            </span>
            <span v-if="feature.value" class="ml-1 text-sm font-medium text-indigo-700 dark:text-indigo-400">{{ feature.value }}</span>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <button
        v-if="plan.id !== 'free' && plan.id !== currentPlanId"
        @click="$emit('select-plan', plan.id)"
        :disabled="isLoading"
        class="mt-6 w-full px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        :class="plan.id === 'basic'
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
          : 'bg-blue-600 text-white hover:bg-blue-700'"
      >
        Rozpocznij z {{ plan.name }}
      </button>
      <div v-else-if="plan.id === currentPlanId" class="mt-6 w-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-6 py-3 rounded-lg text-center font-medium">
        Twoj aktualny plan
      </div>
      <div v-else class="mt-6 w-full border-2 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 px-6 py-3 rounded-lg text-center font-medium hover:border-gray-300 dark:hover:border-gray-500 cursor-pointer transition-colors">
        Kontynuuj za darmo
      </div>
    </div>
  </div>
</template>

<script setup>
import { h } from 'vue'

const props = defineProps({
  plans: { type: Array, required: true },
  currentPlanId: { type: String, default: null },
  selectedInterval: { type: String, default: 'monthly' },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-plan'])

// Icon components
const RocketIcon = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M13 10V3L4 14h7v7l9-11h-7z' })
    ])
  }
}

const StarIcon = {
  render() {
    return h('svg', { fill: 'currentColor', viewBox: '0 0 20 20' }, [
      h('path', { d: 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' })
    ])
  }
}

const CrownIcon = {
  render() {
    return h('svg', { fill: 'currentColor', viewBox: '0 0 20 20' }, [
      h('path', { 'fill-rule': 'evenodd', d: 'M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L10 6.382l-3.763 1.2 1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z', 'clip-rule': 'evenodd' })
    ])
  }
}

const planStyles = {
  free: {
    icon: RocketIcon,
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-600 dark:text-gray-400',
    tagline: 'Na start - sprawdz mozliwosci'
  },
  basic: {
    icon: StarIcon,
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
    iconColor: 'text-blue-600 dark:text-blue-400',
    tagline: 'Idealne dla rozwijajacych sie sklepow'
  },
  pro: {
    icon: CrownIcon,
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
    iconColor: 'text-amber-600 dark:text-amber-400',
    tagline: 'Pelna moc bez ograniczen'
  }
}

function getHighlightedFeatures(plan) {
  return [
    {
      label: 'Eksporty',
      value: plan.features?.['exports.max_count'],
      available: true,
      highlighted: false
    },
    {
      label: 'Min. interwal',
      value: `${plan.features?.['exports.schedule_min_interval']} min`,
      available: true,
      highlighted: plan.features?.['exports.schedule_min_interval'] <= 5
    },
    {
      label: 'Zamowienia',
      available: plan.features?.['baselinker.orders'],
      highlighted: false
    },
    {
      label: 'Produkty',
      available: plan.features?.['baselinker.products'],
      highlighted: false
    },
    {
      label: 'Zwroty i faktury',
      available: plan.features?.['baselinker.returns'] && plan.features?.['baselinker.invoices'],
      highlighted: plan.features?.['baselinker.returns']
    },
    {
      label: 'Priorytetowe wsparcie',
      available: plan.features?.['support.priority'],
      highlighted: plan.features?.['support.priority']
    },
    {
      label: 'Dostep API',
      available: plan.features?.['api.access'],
      highlighted: plan.features?.['api.access']
    }
  ]
}

function getPlanPrice(plan) {
  if (!plan?.price) return '-'
  return props.selectedInterval === 'monthly' ? plan.price.monthly : plan.price.yearly
}

function formatNettoPrice(plan) {
  if (!plan?.price) return '-'
  // Get raw price in grosze (1/100 PLN)
  const rawPrice = props.selectedInterval === 'monthly'
    ? plan.price.monthlyRaw
    : plan.price.yearlyRaw

  if (!rawPrice || rawPrice === 0) return '-'

  // Calculate netto (brutto / 1.23 for 23% VAT)
  const nettoGrosze = Math.round(rawPrice / 1.23)
  const nettoZloty = (nettoGrosze / 100).toFixed(2).replace('.', ',')

  return `${nettoZloty} zl`
}
</script>
