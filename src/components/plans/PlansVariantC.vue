<template>
  <!-- Wariant C: Karty z kategoriami (akordeony) -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div
      v-for="plan in plans"
      :key="plan.id"
      class="bg-white rounded-xl shadow-sm border-2 p-6 flex flex-col"
      :class="plan.id === currentPlanId ? 'border-blue-500' : 'border-gray-200'"
    >
      <!-- Header -->
      <div class="text-center mb-4">
        <div v-if="plan.id === currentPlanId" class="text-xs text-blue-600 font-medium mb-1">AKTUALNY PLAN</div>
        <h3 class="text-xl font-bold">{{ plan.name }}</h3>
        <div class="text-3xl font-bold mt-2" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600' : 'text-blue-600'">
          {{ getPlanPrice(plan) }}
          <span v-if="plan.price?.monthlyRaw > 0" class="text-sm text-gray-500 font-normal">/{{ selectedInterval === 'monthly' ? 'mies' : 'rok' }}</span>
        </div>
      </div>

      <!-- Accordion sections -->
      <div class="flex-1 space-y-2">
        <!-- Eksporty - domyslnie otwarte -->
        <div class="border border-gray-200 rounded-lg overflow-hidden">
          <button
            @click="toggleSection(plan.id, 'exports')"
            class="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span class="text-sm font-medium text-gray-700">Eksporty</span>
            <svg
              class="w-4 h-4 text-gray-500 transition-transform"
              :class="isOpen(plan.id, 'exports') ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-show="isOpen(plan.id, 'exports')" class="p-3 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Liczba eksportow</span>
              <span class="font-medium">{{ plan.features?.['exports.max_count'] }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Min. interwal</span>
              <span class="font-medium">{{ plan.features?.['exports.schedule_min_interval'] }} min</span>
            </div>
          </div>
        </div>

        <!-- Dane BaseLinker -->
        <div class="border border-gray-200 rounded-lg overflow-hidden">
          <button
            @click="toggleSection(plan.id, 'data')"
            class="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span class="text-sm font-medium text-gray-700">Dane BaseLinker</span>
            <svg
              class="w-4 h-4 text-gray-500 transition-transform"
              :class="isOpen(plan.id, 'data') ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-show="isOpen(plan.id, 'data')" class="p-3 space-y-2 text-sm">
            <div v-for="feature in dataFeatures" :key="feature.key" class="flex justify-between items-center">
              <span class="text-gray-600">{{ feature.label }}</span>
              <svg v-if="plan.features?.[feature.key]" class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Wsparcie -->
        <div class="border border-gray-200 rounded-lg overflow-hidden">
          <button
            @click="toggleSection(plan.id, 'support')"
            class="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span class="text-sm font-medium text-gray-700">Wsparcie</span>
            <svg
              class="w-4 h-4 text-gray-500 transition-transform"
              :class="isOpen(plan.id, 'support') ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-show="isOpen(plan.id, 'support')" class="p-3 space-y-2 text-sm">
            <div v-for="feature in supportFeatures" :key="feature.key" class="flex justify-between items-center">
              <span class="text-gray-600">{{ feature.label }}</span>
              <svg v-if="plan.features?.[feature.key]" class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <button
        v-if="plan.id !== 'free' && plan.id !== currentPlanId"
        @click="$emit('select-plan', plan.id)"
        :disabled="isLoading"
        class="mt-4 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
      >
        Wybierz plan
      </button>
      <div v-else-if="plan.id === currentPlanId" class="mt-4 w-full bg-gray-100 text-gray-600 px-6 py-3 rounded-lg text-center font-medium">
        Twoj plan
      </div>
      <div v-else class="mt-4 w-full bg-gray-50 text-gray-500 px-6 py-3 rounded-lg text-center font-medium">
        Plan darmowy
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

// Track open sections per plan
const openSections = ref({})

// Initialize with 'exports' open for all plans
props.plans.forEach(plan => {
  openSections.value[plan.id] = { exports: true, data: false, support: false }
})

const dataFeatures = [
  { key: 'baselinker.orders', label: 'Zamowienia' },
  { key: 'baselinker.products', label: 'Produkty' },
  { key: 'baselinker.returns', label: 'Zwroty' },
  { key: 'baselinker.invoices', label: 'Faktury' }
]

const supportFeatures = [
  { key: 'support.priority', label: 'Priorytetowe wsparcie' },
  { key: 'api.access', label: 'Dostep API' }
]

function isOpen(planId, section) {
  return openSections.value[planId]?.[section] ?? false
}

function toggleSection(planId, section) {
  if (!openSections.value[planId]) {
    openSections.value[planId] = {}
  }
  openSections.value[planId][section] = !openSections.value[planId][section]
}

function getPlanPrice(plan) {
  if (!plan?.price) return '-'
  return props.selectedInterval === 'monthly' ? plan.price.monthly : plan.price.yearly
}
</script>
