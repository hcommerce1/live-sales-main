<template>
  <!-- Wariant D: Minimalistyczny - tylko kluczowe funkcje -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div
      v-for="plan in plans"
      :key="plan.id"
      class="bg-white rounded-xl shadow-sm border-2 p-6 flex flex-col"
      :class="plan.id === currentPlanId ? 'border-blue-500' : 'border-gray-200'"
    >
      <!-- Header -->
      <div class="text-center">
        <div v-if="plan.id === currentPlanId" class="text-xs text-blue-600 font-medium mb-1">AKTUALNY PLAN</div>
        <h3 class="text-xl font-bold text-gray-900">{{ plan.name }}</h3>
        <p class="text-sm text-gray-500 mt-1">{{ planDescriptions[plan.id] }}</p>
      </div>

      <!-- Price - prominent -->
      <div class="text-center my-6">
        <div class="text-4xl font-bold" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600' : 'text-blue-600'">
          {{ getPlanPrice(plan) }}
        </div>
        <div v-if="plan.price?.monthlyRaw > 0" class="text-sm text-gray-500 mt-1">
          /{{ selectedInterval === 'monthly' ? 'miesiac' : 'rok' }}
        </div>
      </div>

      <!-- Key features only -->
      <div class="flex-1">
        <ul class="space-y-3">
          <li class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span class="text-sm font-bold text-blue-600">{{ plan.features?.['exports.max_count'] }}</span>
            </div>
            <span class="text-sm text-gray-700">eksportow</span>
          </li>
          <li class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span class="text-xs font-bold text-green-600">{{ plan.features?.['exports.schedule_min_interval'] }}m</span>
            </div>
            <span class="text-sm text-gray-700">min. interwal</span>
          </li>
          <li class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                 :class="getDataCount(plan) > 2 ? 'bg-green-100' : 'bg-gray-100'">
              <span class="text-sm font-bold" :class="getDataCount(plan) > 2 ? 'text-green-600' : 'text-gray-500'">
                {{ getDataCount(plan) }}
              </span>
            </div>
            <span class="text-sm text-gray-700">typy danych</span>
          </li>
          <li class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                 :class="plan.features?.['support.priority'] ? 'bg-amber-100' : 'bg-gray-100'">
              <svg v-if="plan.features?.['support.priority']" class="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
              </svg>
            </div>
            <span class="text-sm" :class="plan.features?.['support.priority'] ? 'text-gray-700' : 'text-gray-400'">
              {{ plan.features?.['support.priority'] ? 'Priorytetowe wsparcie' : 'Standardowe wsparcie' }}
            </span>
          </li>
        </ul>

        <!-- Expand link -->
        <button
          @click="toggleDetails(plan.id)"
          class="mt-4 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          {{ showDetails[plan.id] ? 'Ukryj szczegoly' : 'Zobacz wszystkie funkcje' }}
          <svg class="w-4 h-4 transition-transform" :class="showDetails[plan.id] ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        <!-- Expanded details -->
        <div v-if="showDetails[plan.id]" class="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm">
          <div v-for="feature in allFeatures" :key="feature.key" class="flex items-center justify-between">
            <span class="text-gray-600">{{ feature.label }}</span>
            <span v-if="typeof plan.features?.[feature.key] === 'boolean'">
              <svg v-if="plan.features[feature.key]" class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </span>
            <span v-else class="font-medium text-gray-900">{{ plan.features?.[feature.key] }}</span>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <button
        v-if="plan.id !== 'free' && plan.id !== currentPlanId"
        @click="$emit('select-plan', plan.id)"
        :disabled="isLoading"
        class="mt-6 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
      >
        Wybierz {{ plan.name }}
      </button>
      <div v-else-if="plan.id === currentPlanId" class="mt-6 w-full bg-gray-100 text-gray-600 px-6 py-3 rounded-lg text-center font-medium">
        Twoj plan
      </div>
      <div v-else class="mt-6 w-full bg-gray-50 text-gray-500 px-6 py-3 rounded-lg text-center font-medium">
        Aktywny
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  plans: { type: Array, required: true },
  currentPlanId: { type: String, default: null },
  selectedInterval: { type: String, default: 'monthly' },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-plan'])

const showDetails = ref({})

const planDescriptions = {
  free: 'Na start',
  basic: 'Dla rozwijajacych sie sklepow',
  pro: 'Pelna moc dla profesjonalistow'
}

const allFeatures = [
  { key: 'baselinker.orders', label: 'Zamowienia' },
  { key: 'baselinker.products', label: 'Produkty' },
  { key: 'baselinker.returns', label: 'Zwroty' },
  { key: 'baselinker.invoices', label: 'Faktury' },
  { key: 'support.priority', label: 'Priorytetowe wsparcie' },
  { key: 'api.access', label: 'Dostep API' }
]

function toggleDetails(planId) {
  showDetails.value[planId] = !showDetails.value[planId]
}

function getDataCount(plan) {
  let count = 0
  if (plan.features?.['baselinker.orders']) count++
  if (plan.features?.['baselinker.products']) count++
  if (plan.features?.['baselinker.returns']) count++
  if (plan.features?.['baselinker.invoices']) count++
  return count
}

function getPlanPrice(plan) {
  if (!plan?.price) return '-'
  return props.selectedInterval === 'monthly' ? plan.price.monthly : plan.price.yearly
}
</script>
