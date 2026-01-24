<template>
  <!-- Variant B: Big Cards with Icons & Visual Categories -->
  <div class="h-full flex flex-col">
    <!-- Dataset selection - horizontal cards with icons -->
    <div class="flex-shrink-0 mb-6">
      <label class="text-sm font-medium text-gray-700 mb-3 block">Wybierz typ danych</label>
      <div class="grid grid-cols-4 gap-4">
        <button
          v-for="dataset in availableDatasets"
          :key="dataset.key"
          type="button"
          class="relative p-6 rounded-xl border-2 text-center transition-all group"
          :class="{
            'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg shadow-blue-100': selectedDataset === dataset.key,
            'border-gray-200 hover:border-blue-300 hover:bg-gray-50 hover:shadow-md': selectedDataset !== dataset.key && dataset.available,
            'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed': !dataset.available
          }"
          :disabled="!dataset.available"
          @click="selectDataset(dataset)"
        >
          <!-- Icon -->
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center transition-colors"
            :class="{
              'bg-blue-500 text-white': selectedDataset === dataset.key,
              'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600': selectedDataset !== dataset.key
            }"
          >
            <svg v-if="dataset.key === 'orders'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <svg v-else-if="dataset.key === 'products'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <svg v-else-if="dataset.key === 'invoices'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <div class="font-semibold text-gray-900">{{ dataset.label }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ dataset.description }}</div>

          <!-- Selected indicator -->
          <div v-if="selectedDataset === dataset.key" class="absolute top-3 right-3">
            <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          </div>

          <span v-if="!dataset.available" class="absolute top-3 right-3 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
            {{ dataset.requiredPlan.toUpperCase() }}
          </span>
        </button>
      </div>
    </div>

    <!-- Fields selection with categories -->
    <div v-if="selectedDataset" class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-medium text-gray-700">Wybierz pola do eksportu</label>
        <div class="flex items-center gap-4">
          <button type="button" class="text-xs text-blue-600 hover:text-blue-800" @click="selectAll">Zaznacz wszystkie</button>
          <button type="button" class="text-xs text-gray-500 hover:text-gray-700" @click="clearAll">Wyczysc</button>
          <span class="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{{ selectedFields.length }} wybrano</span>
        </div>
      </div>

      <!-- Categorized fields -->
      <div class="flex-1 border border-gray-200 rounded-xl bg-white overflow-y-auto p-4">
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="category in fieldCategories" :key="category.name" class="space-y-2">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider pb-2 border-b border-gray-100">
              {{ category.name }}
            </h4>
            <label
              v-for="field in category.fields"
              :key="field.key"
              class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              :class="{
                'opacity-50 cursor-not-allowed': field.locked,
                'bg-blue-50 ring-1 ring-blue-200': selectedFields.includes(field.key)
              }"
            >
              <input
                type="checkbox"
                :checked="selectedFields.includes(field.key)"
                :disabled="field.locked"
                class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                @change="toggleField(field)"
              />
              <span class="text-sm text-gray-700 flex-1">{{ field.label }}</span>
              <span v-if="field.locked" class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">PRO</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Selected fields as visual chips -->
      <div v-if="selectedFields.length > 0" class="mt-4 flex-shrink-0">
        <label class="text-xs font-medium text-gray-500 mb-2 block">Kolejnosc kolumn w arkuszu</label>
        <div class="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
          <div
            v-for="(fieldKey, index) in selectedFields"
            :key="fieldKey"
            class="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm shadow-sm cursor-move hover:shadow-md hover:border-blue-300 transition-all"
            draggable="true"
            @dragstart="dragStart(index, $event)"
            @dragend="dragEnd"
            @dragover.prevent
            @drop.stop="drop(index)"
          >
            <span class="text-xs text-gray-400 font-mono">{{ index + 1 }}</span>
            <span class="text-gray-700 font-medium">{{ getFieldLabel(fieldKey) }}</span>
            <button type="button" class="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50" @click="removeField(fieldKey)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  availableDatasets: { type: Array, required: true },
  fields: { type: Array, required: true },
  selectedDataset: { type: String, default: '' },
  selectedFields: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:selectedDataset', 'update:selectedFields'])

const draggedIndex = ref(null)

// Group fields by category
const fieldCategories = computed(() => {
  const categories = {
    'Podstawowe': [],
    'Dane klienta': [],
    'Adres dostawy': [],
    'Platnosci': [],
    'Punkt odbioru': [],
    'Faktura': [],
    'Inne': []
  }

  props.fields.forEach(field => {
    const label = field.label.toLowerCase()
    if (label.includes('email') || label.includes('telefon') || label.includes('imie') || label.includes('nazwisko') || label.includes('login')) {
      categories['Dane klienta'].push(field)
    } else if (label.includes('dostaw') || label.includes('kod poczt') || label.includes('miasto') && label.includes('dostaw') || label.includes('kraj') && label.includes('dostaw') || label.includes('wojewodz') && label.includes('dostaw') || label.includes('adres') && label.includes('dostaw')) {
      categories['Adres dostawy'].push(field)
    } else if (label.includes('punkt') || label.includes('odbioru')) {
      categories['Punkt odbioru'].push(field)
    } else if (label.includes('faktur') || label.includes('nip')) {
      categories['Faktura'].push(field)
    } else if (label.includes('platno') || label.includes('zaplac') || label.includes('walut') || label.includes('pobrani') || label.includes('cena')) {
      categories['Platnosci'].push(field)
    } else if (label.includes('id') || label.includes('status') || label.includes('data') || label.includes('zrodl')) {
      categories['Podstawowe'].push(field)
    } else {
      categories['Inne'].push(field)
    }
  })

  return Object.entries(categories)
    .filter(([_, fields]) => fields.length > 0)
    .map(([name, fields]) => ({ name, fields }))
})

function selectDataset(dataset) {
  if (!dataset.available) return
  emit('update:selectedDataset', dataset.key)
}

function toggleField(field) {
  if (field.locked) return
  const fields = [...props.selectedFields]
  const index = fields.indexOf(field.key)
  if (index === -1) {
    fields.push(field.key)
  } else {
    fields.splice(index, 1)
  }
  emit('update:selectedFields', fields)
}

function removeField(fieldKey) {
  emit('update:selectedFields', props.selectedFields.filter(f => f !== fieldKey))
}

function selectAll() {
  const allKeys = props.fields.filter(f => !f.locked).map(f => f.key)
  emit('update:selectedFields', allKeys)
}

function clearAll() {
  emit('update:selectedFields', [])
}

function getFieldLabel(fieldKey) {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function dragStart(index, event) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function dragEnd() {
  draggedIndex.value = null
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return
  const fields = [...props.selectedFields]
  const [moved] = fields.splice(draggedIndex.value, 1)
  fields.splice(targetIndex, 0, moved)
  emit('update:selectedFields', fields)
  draggedIndex.value = null
}
</script>
