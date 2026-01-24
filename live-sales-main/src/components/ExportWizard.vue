<template>
  <!-- Full-screen wizard - NO SCROLL, everything visible -->
  <div class="h-screen flex flex-col bg-gray-50 overflow-hidden">

    <!-- Compact Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-6">
          <h1 class="text-lg font-semibold text-gray-900">
            {{ props.exportId ? 'Edytuj eksport' : 'Nowy eksport' }}
          </h1>

          <!-- Progress steps - inline -->
          <div class="flex items-center gap-1">
            <template v-for="(step, index) in steps" :key="index">
              <button
                type="button"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium transition-all"
                :class="{
                  'bg-blue-100 text-blue-700': currentStep === index,
                  'text-green-600 hover:bg-green-50': currentStep > index,
                  'text-gray-400': currentStep < index
                }"
                :disabled="currentStep < index"
                @click="goToStep(index)"
              >
                <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2"
                  :class="{
                    'bg-blue-600 text-white border-blue-600': currentStep === index,
                    'bg-green-500 text-white border-green-500': currentStep > index,
                    'border-gray-300 text-gray-400': currentStep < index
                  }"
                >
                  <svg v-if="currentStep > index" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span v-else>{{ index + 1 }}</span>
                </span>
                <span class="hidden lg:inline">{{ step.label }}</span>
              </button>
              <div v-if="index < steps.length - 1" class="w-4 h-px bg-gray-300"/>
            </template>
          </div>
        </div>

        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded transition-colors"
          @click="cancelWizard"
          title="Zamknij"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Main Content - fills all available space -->
    <div class="flex-1 p-6 overflow-hidden">
      <!-- Loading -->
      <div v-if="isLoading" class="h-full flex items-center justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        <span class="ml-3 text-gray-500">Wczytywanie...</span>
      </div>

      <!-- Step 1: Dataset & Fields - A/B TEST VARIANTS -->
      <div v-else-if="currentStep === 0" class="h-full flex flex-col">
        <!-- Variant Switcher -->
        <div class="flex-shrink-0 mb-4 flex items-center justify-end">
          <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <span class="text-xs text-gray-500">Widok:</span>
            <select
              :value="activeVariant"
              class="text-xs font-medium text-gray-700 bg-transparent border-0 focus:ring-0 cursor-pointer pr-6 outline-none"
              @change="setVariant($event.target.value)"
            >
              <option v-for="(variant, key) in step1Variants" :key="key" :value="key">
                {{ variant.name }}
              </option>
            </select>
            <span class="text-xs text-gray-300">|</span>
            <span class="text-xs text-gray-400">Wyprobuj inny widok</span>
          </div>
        </div>

        <!-- Dynamic Variant Component -->
        <div class="flex-1 min-h-0">
          <component
            :is="currentVariantComponent"
            :available-datasets="availableDatasets"
            :fields="currentDatasetFields"
            :selected-dataset="config.dataset"
            :selected-fields="config.selected_fields"
            @update:selected-dataset="handleDatasetChange"
            @update:selected-fields="config.selected_fields = $event"
          />
        </div>
      </div>

      <!-- Step 2: Filters -->
      <div v-else-if="currentStep === 1" class="h-full flex flex-col">
        <p class="text-sm text-gray-500 mb-4 flex-shrink-0">
          Opcjonalne - ustaw warunki filtrowania danych.
        </p>
        <div class="flex-1 overflow-auto">
          <FilterBuilder
            v-model="config.filters"
            :fields="currentDatasetFields"
            :operators="fieldDefinitions.operators || []"
            :order-statuses="orderStatuses"
            :order-sources="orderSources"
          />
        </div>
      </div>

      <!-- Step 3: Target Sheets -->
      <div v-else-if="currentStep === 2" class="h-full flex flex-col">
        <p class="text-sm text-gray-500 mb-4 flex-shrink-0">
          Podaj link do arkusza Google Sheets.
        </p>

        <!-- Duplicate URL warning -->
        <div v-if="duplicateSheetWarning" class="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 flex-shrink-0">
          <p class="text-sm text-amber-800">
            Ten arkusz jest już używany w innym eksporcie. Użyj innego arkusza.
          </p>
        </div>

        <div class="flex-1">
          <SheetConfig
            v-model="config.sheets_config"
            :service-account-email="serviceAccountEmail"
            :max-sheets="maxSheets"
            @url-change="checkDuplicateUrl"
          />
        </div>
      </div>

      <!-- Step 4: Summary -->
      <div v-else-if="currentStep === 3" class="h-full flex flex-col">
        <div class="grid grid-cols-2 gap-6 flex-1">
          <!-- Left: Form -->
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Nazwa eksportu</label>
              <input
                v-model="config.name"
                type="text"
                placeholder="np. Zamówienia dzienne"
                class="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Opis (opcjonalny)</label>
              <textarea
                v-model="config.description"
                rows="3"
                placeholder="Krótki opis eksportu..."
                class="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Częstotliwość</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in scheduleOptions"
                  :key="option.value"
                  type="button"
                  class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                  :class="{
                    'border-blue-500 bg-blue-50 text-blue-700': config.schedule_minutes === option.value,
                    'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.schedule_minutes !== option.value
                  }"
                  @click="config.schedule_minutes = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- Right: Summary -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">Podsumowanie konfiguracji</h3>
            <div class="space-y-3">
              <div class="flex justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Typ danych</span>
                <span class="font-medium text-gray-900">{{ getDatasetLabel(config.dataset) }}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Liczba pól</span>
                <span class="font-medium text-gray-900">{{ config.selected_fields.length }}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Filtry</span>
                <span class="font-medium text-gray-900">{{ getFilterSummary() }}</span>
              </div>
              <div class="flex justify-between py-2">
                <span class="text-gray-600">Arkusze docelowe</span>
                <span class="font-medium text-gray-900">{{ config.sheets_config?.length || 1 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Footer -->
    <div class="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          @click="cancelWizard"
        >
          Anuluj
        </button>

        <div class="flex items-center gap-3">
          <button
            v-if="currentStep > 0"
            type="button"
            class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            @click="prevStep"
          >
            Wstecz
          </button>
          <button
            v-if="currentStep < steps.length - 1"
            type="button"
            class="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Dalej
          </button>
          <button
            v-else
            type="button"
            class="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            :disabled="!canSave || isSaving || duplicateSheetWarning"
            @click="saveExport"
          >
            <svg v-if="isSaving" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            {{ isSaving ? 'Zapisuję...' : 'Zapisz eksport' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { API } from '../api.js'
import FilterBuilder from './FilterBuilder.vue'
import SheetConfig from './SheetConfig.vue'

// Step 1 Variants for A/B Testing
import WizardStep1VariantA from './wizard/WizardStep1VariantA.vue'
import WizardStep1VariantB from './wizard/WizardStep1VariantB.vue'
import WizardStep1VariantC from './wizard/WizardStep1VariantC.vue'
import WizardStep1VariantD from './wizard/WizardStep1VariantD.vue'
import WizardStep1VariantE from './wizard/WizardStep1VariantE.vue'

const step1Variants = {
  A: { component: WizardStep1VariantA, name: 'Klasyczny (Baseline)' },
  B: { component: WizardStep1VariantB, name: 'Karty z ikonami' },
  C: { component: WizardStep1VariantC, name: 'Akordeony + Szukaj' },
  D: { component: WizardStep1VariantD, name: 'Dual Panel' },
  E: { component: WizardStep1VariantE, name: 'Minimalistyczny' }
}

const props = defineProps({
  exportId: {
    type: String,
    default: null
  },
  existingExports: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['save', 'cancel', 'save-draft'])

// State
const currentStep = ref(0)
const isSaving = ref(false)
const isLoading = ref(true)
const draggedIndex = ref(null)
const duplicateSheetWarning = ref(false)
const fieldsPerDataset = ref({})  // Autozapis pól per dataset

// A/B Testing: Step 1 Variant (A-E)
const activeVariant = ref(localStorage.getItem('wizardStep1Variant') || 'A')

// Save variant preference
function setVariant(variant) {
  activeVariant.value = variant
  localStorage.setItem('wizardStep1Variant', variant)
}

const currentVariantComponent = computed(() => step1Variants[activeVariant.value]?.component || WizardStep1VariantA)

// Field definitions from backend
const fieldDefinitions = ref({
  operators: [],
  datasets: {}
})

// Dynamic data from BaseLinker
const orderStatuses = ref([])
const orderSources = ref({})

// Configuration
const config = ref({
  id: null,
  name: 'Nowy eksport',
  description: '',
  dataset: 'orders',
  selected_fields: [],
  filters: {
    logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
  },
  sheets_config: [{
    sheet_url: '',
    write_mode: 'replace'
  }],
  schedule_minutes: 15,
  status: 'active'
})

// Steps definition
const steps = [
  { label: 'Dane', description: 'Wybierz typ danych i pola' },
  { label: 'Filtry', description: 'Filtrowanie (opcjonalne)' },
  { label: 'Arkusz', description: 'Konfiguracja arkusza' },
  { label: 'Zapisz', description: 'Nazwa i zapis' }
]

const scheduleOptions = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 godz' },
  { value: 360, label: '6 godz' },
  { value: 1440, label: '24 godz' }
]

const datasetDescriptions = {
  orders: 'Zamówienia z BaseLinker',
  products: 'Produkty z magazynu',
  invoices: 'Faktury',
  order_products: 'Produkty w zamówieniach'
}

const serviceAccountEmail = 'live-sales-worker@livesales-483523.iam.gserviceaccount.com'
const maxSheets = 3

// Computed
const availableDatasets = computed(() => {
  const datasets = fieldDefinitions.value?.datasets || {}
  return Object.entries(datasets).map(([key, ds]) => ({
    key,
    label: ds.label,
    available: !ds.locked,
    requiredPlan: ds.requiredPlan || 'basic',
    description: datasetDescriptions[key] || ''
  }))
})

const currentDatasetFields = computed(() => {
  const ds = fieldDefinitions.value?.datasets?.[config.value.dataset]
  return ds?.fields || []
})

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0:
      return config.value.dataset && config.value.selected_fields.length > 0
    case 1:
      return true // Filters are optional
    case 2:
      return config.value.sheets_config?.some(s => s.sheet_url?.trim()) && !duplicateSheetWarning.value
    default:
      return true
  }
})

const canSave = computed(() => {
  return config.value.name?.trim() &&
         config.value.selected_fields.length > 0 &&
         config.value.sheets_config?.some(s => s.sheet_url?.trim()) &&
         !duplicateSheetWarning.value
})

// Methods
function selectDataset(dataset) {
  if (!dataset.available) return
  handleDatasetChange(dataset.key)
}

// Handle dataset change from variant components
function handleDatasetChange(datasetKey) {
  if (config.value.dataset !== datasetKey) {
    // Zapisz obecne pola przed zmianą datasetu
    if (config.value.selected_fields.length > 0) {
      fieldsPerDataset.value[config.value.dataset] = [...config.value.selected_fields]
    }

    // Zmień dataset
    config.value.dataset = datasetKey

    // Przywróć zapisane pola dla nowego datasetu lub pusta lista
    config.value.selected_fields = fieldsPerDataset.value[datasetKey] || []
  }
}

function toggleField(field) {
  if (field.locked) return
  const index = config.value.selected_fields.indexOf(field.key)
  if (index === -1) {
    config.value.selected_fields.push(field.key)
  } else {
    config.value.selected_fields.splice(index, 1)
  }
}

function removeField(fieldKey) {
  const index = config.value.selected_fields.indexOf(fieldKey)
  if (index !== -1) {
    config.value.selected_fields.splice(index, 1)
  }
}

function getFieldLabel(fieldKey) {
  const field = currentDatasetFields.value.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

function getDatasetLabel(datasetKey) {
  const ds = fieldDefinitions.value?.datasets?.[datasetKey]
  return ds?.label || datasetKey
}

function getFilterSummary() {
  const groups = config.value.filters?.groups || []
  const conditionCount = groups.reduce((acc, g) => {
    const validConditions = g.conditions?.filter(c => c.field && c.operator) || []
    return acc + validConditions.length
  }, 0)
  return conditionCount > 0 ? `${conditionCount} warunków` : 'Brak'
}

// Drag & Drop
function dragStart(index, event) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function dragEnd() {
  draggedIndex.value = null
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return
  const fields = [...config.value.selected_fields]
  const [moved] = fields.splice(draggedIndex.value, 1)
  fields.splice(targetIndex, 0, moved)
  config.value.selected_fields = fields
  draggedIndex.value = null
}

function handleDropOnContainer() {
  if (draggedIndex.value !== null) {
    const fields = [...config.value.selected_fields]
    const [moved] = fields.splice(draggedIndex.value, 1)
    fields.push(moved)
    config.value.selected_fields = fields
    draggedIndex.value = null
  }
}

// Extract Google Sheets ID from URL for comparison
function extractSheetId(url) {
  if (!url) return null
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// URL validation - check if sheet is already used in another export
function checkDuplicateUrl() {
  const currentSheetIds = config.value.sheets_config
    ?.map(s => extractSheetId(s.sheet_url))
    .filter(Boolean) || []

  const otherSheetIds = props.existingExports
    .filter(e => e.id !== config.value.id)
    .flatMap(e => e.sheets?.map(s => extractSheetId(s.sheet_url)) || [])
    .filter(Boolean)

  duplicateSheetWarning.value = currentSheetIds.some(id => otherSheetIds.includes(id))
}

// Navigation
function goToStep(index) {
  if (index < currentStep.value) {
    currentStep.value = index
  }
}

function nextStep() {
  if (canProceed.value && currentStep.value < steps.length - 1) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function cancelWizard() {
  // If user has selected fields, save as draft
  if (config.value.selected_fields.length > 0 && !props.exportId) {
    const draftData = {
      name: config.value.name || 'Szkic eksportu',
      description: config.value.description,
      dataset: config.value.dataset,
      selectedFields: config.value.selected_fields,
      filters: config.value.filters,
      sheets: config.value.sheets_config?.map(sheet => ({
        sheet_url: sheet.sheet_url,
        write_mode: sheet.write_mode || 'replace'
      })) || [],
      scheduleMinutes: config.value.schedule_minutes,
      status: 'draft'
    }
    emit('save-draft', draftData)
  } else {
    emit('cancel')
  }
}

async function saveExport() {
  if (!canSave.value || isSaving.value) return

  isSaving.value = true
  try {
    const exportData = {
      id: config.value.id,
      name: config.value.name,
      description: config.value.description,
      dataset: config.value.dataset,
      selectedFields: config.value.selected_fields,
      filters: config.value.filters,
      sheets: config.value.sheets_config?.map(sheet => ({
        sheet_url: sheet.sheet_url,
        write_mode: sheet.write_mode || 'replace'
      })) || [],
      scheduleMinutes: config.value.schedule_minutes,
      status: config.value.status || 'active'
    }

    emit('save', exportData)
  } finally {
    isSaving.value = false
  }
}

// Load data
async function loadFieldDefinitions() {
  try {
    const data = await API.exports.getFieldDefinitions()
    if (data) {
      fieldDefinitions.value = data
    }
  } catch (error) {
    console.error('Failed to load field definitions:', error)
  }
}

async function loadOrderStatuses() {
  try {
    const data = await API.baselinker.getOrderStatuses()
    orderStatuses.value = data || []
  } catch (error) {
    console.error('Failed to load order statuses:', error)
  }
}

async function loadOrderSources() {
  try {
    const data = await API.baselinker.getOrderSources()
    orderSources.value = data || {}
  } catch (error) {
    console.error('Failed to load order sources:', error)
  }
}

async function loadExistingExport() {
  if (!props.exportId) return

  try {
    const exportData = await API.exports.get(props.exportId)
    if (exportData) {
      config.value = {
        id: exportData.id,
        name: exportData.name || 'Nowy eksport',
        description: exportData.description || '',
        dataset: exportData.dataset || 'orders',
        selected_fields: exportData.selected_fields || [],
        filters: exportData.filters || {
          logic: 'AND',
          groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
        },
        sheets_config: exportData.sheets?.map(s => ({
          sheet_url: s.sheet_url || '',
          write_mode: s.write_mode || 'replace'
        })) || [{ sheet_url: '', write_mode: 'replace' }],
        schedule_minutes: exportData.schedule_minutes || 15,
        status: exportData.status || 'active'
      }
    }
  } catch (error) {
    console.error('Failed to load export:', error)
  }
}

// Initialize
onMounted(async () => {
  isLoading.value = true
  try {
    await Promise.all([
      loadFieldDefinitions(),
      loadOrderStatuses(),
      loadOrderSources(),
      loadExistingExport()
    ])
  } finally {
    isLoading.value = false
  }
})
</script>
