<template>
  <!-- Wariant A: Klasyczny (uporządkowany) - 3 kolumny z pogrupowanymi funkcjami -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div
      v-for="plan in plans"
      :key="plan.id"
      class="bg-white rounded-xl shadow-sm border-2 p-6 flex flex-col"
      :class="plan.id === currentPlanId ? 'border-blue-500' : 'border-gray-200'"
    >
      <!-- Header -->
      <div v-if="plan.id === currentPlanId" class="text-xs text-blue-600 font-medium mb-2">AKTUALNY PLAN</div>
      <h3 class="text-lg font-bold mb-2">{{ plan.name }}</h3>

      <!-- Price -->
      <div v-if="selectedInterval === 'yearly' && plan.price?.yearlyRaw > 0" class="mb-1">
        <span class="text-lg text-gray-400 line-through">{{ formatOriginalYearly(plan) }}</span>
      </div>
      <div class="text-3xl font-bold mb-1" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600' : 'text-blue-600'">
        {{ formatPrice(plan) }}
        <span v-if="plan.price?.monthlyRaw > 0" class="text-sm text-gray-600">/{{ selectedInterval === 'monthly' ? 'mies' : 'rok' }}</span>
      </div>
      <p v-if="selectedInterval === 'yearly' && plan.price?.yearlyRaw > 0 && getSavings(plan)" class="text-sm text-green-600 mb-4">
        Oszczedzasz {{ getSavings(plan) }}% rocznie
      </p>
      <div v-else class="mb-4"></div>

      <!-- Features grouped -->
      <div class="space-y-4 mb-6 flex-1">
        <!-- Eksporty -->
        <div>
          <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Eksporty</h4>
          <ul class="space-y-1.5">
            <li class="flex items-center gap-2 text-sm">
              <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <span>{{ getFeatureValue(plan, 'exports.max_count') }} eksportow</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <span>Co {{ getFeatureValue(plan, 'exports.schedule_min_interval') }} min</span>
            </li>
          </ul>
        </div>

        <!-- Dane BaseLinker -->
        <div>
          <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dane BaseLinker</h4>
          <ul class="space-y-1.5">
            <li v-for="feature in baselinkerFeatures" :key="feature.key" class="flex items-center gap-2 text-sm">
              <svg v-if="getFeatureValue(plan, feature.key)" class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
              <span :class="getFeatureValue(plan, feature.key) ? '' : 'text-gray-400'">{{ feature.label }}</span>
            </li>
          </ul>
        </div>

        <!-- Wsparcie -->
        <div>
          <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Wsparcie</h4>
          <ul class="space-y-1.5">
            <li v-for="feature in supportFeatures" :key="feature.key" class="flex items-center gap-2 text-sm">
              <svg v-if="getFeatureValue(plan, feature.key)" class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
              <span :class="getFeatureValue(plan, feature.key) ? '' : 'text-gray-400'">{{ feature.label }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- CTA Button -->
      <button
        v-if="plan.id !== 'free' && plan.id !== currentPlanId"
        @click="$emit('select-plan', plan.id)"
        :disabled="isLoading"
        class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ currentPlanId && currentPlanId !== 'free' ? 'Zmien plan' : 'Wybierz plan' }}
      </button>
      <div v-else-if="plan.id === currentPlanId" class="w-full bg-gray-100 text-gray-600 px-6 py-3 rounded-lg text-center font-medium">
        Twoj plan
      </div>
      <div v-else class="w-full bg-gray-50 text-gray-500 px-6 py-3 rounded-lg text-center font-medium">
        Plan darmowy
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  plans: { type: Array, required: true },
  currentPlanId: { type: String, default: null },
  selectedInterval: { type: String, default: 'monthly' },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-plan'])

const baselinkerFeatures = [
  { key: 'baselinker.orders', label: 'Zamowienia' },
  { key: 'baselinker.products', label: 'Produkty' },
  { key: 'baselinker.returns', label: 'Zwroty' },
  { key: 'baselinker.invoices', label: 'Faktury' }
]

const supportFeatures = [
  { key: 'support.priority', label: 'Priorytetowe wsparcie' },
  { key: 'api.access', label: 'Dostep API' }
]

function getFeatureValue(plan, key) {
  return plan.features?.[key]
}

function formatPrice(plan) {
  if (!plan?.price) return '-'
  return this?.selectedInterval === 'monthly' ? plan.price.monthly : plan.price.yearly
}

function formatOriginalYearly(plan) {
  const monthlyRaw = plan?.price?.monthlyRaw
  if (!monthlyRaw || monthlyRaw <= 0) return null
  const originalYearly = (monthlyRaw * 12) / 100
  return `${originalYearly.toFixed(2).replace('.', ',')} zl`
}

function getSavings(plan) {
  const monthlyRaw = plan?.price?.monthlyRaw
  const yearlyRaw = plan?.price?.yearlyRaw
  if (!monthlyRaw || !yearlyRaw || monthlyRaw <= 0) return null
  const fullYearlyPrice = monthlyRaw * 12
  const savings = Math.round(((fullYearlyPrice - yearlyRaw) / fullYearlyPrice) * 100)
  return savings > 0 ? savings : null
}
</script>
