<template>
  <!-- Wariant B: Tabela porownawcza -->
  <div class="overflow-x-auto">
    <table class="w-full border-collapse">
      <!-- Header with plans -->
      <thead>
        <tr>
          <th class="text-left p-4 bg-gray-50 border-b border-gray-200 w-1/4">
            <span class="text-sm font-medium text-gray-600">Funkcje</span>
          </th>
          <th
            v-for="plan in plans"
            :key="plan.id"
            class="p-4 border-b border-gray-200 text-center"
            :class="plan.id === currentPlanId ? 'bg-blue-50' : 'bg-gray-50'"
          >
            <div v-if="plan.id === currentPlanId" class="text-xs text-blue-600 font-medium mb-1">AKTUALNY</div>
            <div class="text-lg font-bold text-gray-900">{{ plan.name }}</div>
            <div class="text-2xl font-bold mt-2" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600' : 'text-blue-600'">
              {{ getPlanPrice(plan) }}
            </div>
            <div v-if="plan.price?.monthlyRaw > 0" class="text-xs text-gray-500">
              /{{ selectedInterval === 'monthly' ? 'miesiac' : 'rok' }}
            </div>
            <button
              v-if="plan.id !== 'free' && plan.id !== currentPlanId"
              @click="$emit('select-plan', plan.id)"
              :disabled="isLoading"
              class="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Wybierz
            </button>
            <div v-else-if="plan.id === currentPlanId" class="mt-3 px-4 py-2 bg-gray-200 text-gray-600 text-sm rounded-lg">
              Aktywny
            </div>
          </th>
        </tr>
      </thead>

      <!-- Features rows -->
      <tbody>
        <!-- Section: Eksporty -->
        <tr class="bg-gray-100">
          <td colspan="4" class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Eksporty</td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="p-4 text-sm text-gray-700">Liczba eksportow</td>
          <td v-for="plan in plans" :key="plan.id" class="p-4 text-center" :class="plan.id === currentPlanId ? 'bg-blue-50/50' : ''">
            <span class="font-medium">{{ plan.features?.['exports.max_count'] || '-' }}</span>
          </td>
        </tr>
        <tr class="border-b border-gray-100">
          <td class="p-4 text-sm text-gray-700">Min. interwal</td>
          <td v-for="plan in plans" :key="plan.id" class="p-4 text-center" :class="plan.id === currentPlanId ? 'bg-blue-50/50' : ''">
            <span class="font-medium">{{ plan.features?.['exports.schedule_min_interval'] || '-' }} min</span>
          </td>
        </tr>

        <!-- Section: Dane -->
        <tr class="bg-gray-100">
          <td colspan="4" class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Dane BaseLinker</td>
        </tr>
        <tr v-for="feature in dataFeatures" :key="feature.key" class="border-b border-gray-100">
          <td class="p-4 text-sm text-gray-700">{{ feature.label }}</td>
          <td v-for="plan in plans" :key="plan.id" class="p-4 text-center" :class="plan.id === currentPlanId ? 'bg-blue-50/50' : ''">
            <svg v-if="plan.features?.[feature.key]" class="w-5 h-5 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-5 h-5 text-gray-300 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </td>
        </tr>

        <!-- Section: Wsparcie -->
        <tr class="bg-gray-100">
          <td colspan="4" class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Wsparcie</td>
        </tr>
        <tr v-for="feature in supportFeatures" :key="feature.key" class="border-b border-gray-100">
          <td class="p-4 text-sm text-gray-700">{{ feature.label }}</td>
          <td v-for="plan in plans" :key="plan.id" class="p-4 text-center" :class="plan.id === currentPlanId ? 'bg-blue-50/50' : ''">
            <svg v-if="plan.features?.[feature.key]" class="w-5 h-5 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-5 h-5 text-gray-300 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  plans: { type: Array, required: true },
  currentPlanId: { type: String, default: null },
  selectedInterval: { type: String, default: 'monthly' },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-plan'])

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

function getPlanPrice(plan) {
  if (!plan?.price) return '-'
  return props.selectedInterval === 'monthly' ? plan.price.monthly : plan.price.yearly
}
</script>
