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
        <!-- Variant Toggle (Akordeony / Dual Panel) -->
        <div class="flex-shrink-0 mb-4 flex items-center justify-end">
          <div class="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              @click="setVariant('C')"
              class="px-4 py-2 text-sm font-medium transition-all duration-200"
              :class="activeVariant === 'C'
                ? 'bg-indigo-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'"
            >
              Akordeony
            </button>
            <button
              type="button"
              @click="setVariant('D')"
              class="px-4 py-2 text-sm font-medium transition-all duration-200 border-l border-gray-200"
              :class="activeVariant === 'D'
                ? 'bg-indigo-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'"
            >
              Dual Panel
            </button>
          </div>
        </div>

        <!-- Inventory selection for products dataset (multi-select) -->
        <div v-if="requiresInventory" class="flex-shrink-0 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <label class="block text-sm font-medium text-amber-800 mb-2">
            Wybierz katalogi produktów
            <span class="font-normal text-amber-600">(można wybrać wiele)</span>
          </label>
          <div v-if="inventories.length > 0" class="space-y-1 max-h-48 overflow-y-auto border border-amber-200 rounded-lg bg-white p-2">
            <label
              v-for="inv in inventories"
              :key="inv.inventory_id"
              class="flex items-center gap-2 p-2 hover:bg-amber-100 rounded cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                :value="inv.inventory_id"
                v-model="config.filters.inventory_ids"
                class="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              >
              <span class="text-sm text-gray-700">{{ inv.name }}</span>
              <span class="text-xs text-gray-400">(ID: {{ inv.inventory_id }})</span>
            </label>
          </div>
          <p v-if="inventories.length === 0" class="text-sm text-amber-600 mt-2">
            Brak katalogów. Upewnij się, że masz skonfigurowaną integrację z BaseLinker.
          </p>
          <p v-if="config.filters.inventory_ids?.length > 0" class="text-xs text-amber-700 mt-2">
            Wybrano: {{ config.filters.inventory_ids.length }} katalog(ów)
          </p>
        </div>

        <!-- External storage selection for products_external dataset -->
        <div v-if="requiresStorage" class="flex-shrink-0 mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <label class="block text-sm font-medium text-purple-800 mb-2">
            Wybierz magazyn zewnętrzny
          </label>
          <select
            v-model="config.settings.storageId"
            class="w-full md:w-80 px-3 py-2 border border-purple-300 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none bg-white"
          >
            <option :value="null" disabled>-- Wybierz magazyn --</option>
            <option v-for="storage in externalStorages" :key="storage.storage_id" :value="storage.storage_id">
              {{ storage.name }} ({{ storage.type }})
            </option>
          </select>
          <p v-if="externalStorages.length === 0" class="text-sm text-purple-600 mt-2">
            Brak zewnętrznych magazynów. Sprawdź konfigurację w BaseLinker.
          </p>
        </div>

        <!-- Data type selection for basic_data dataset -->
        <div v-if="requiresDataType" class="flex-shrink-0 mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <label class="block text-sm font-medium text-green-800 mb-2">
            Wybierz typ danych
          </label>
          <select
            v-model="config.settings.dataType"
            class="w-full md:w-80 px-3 py-2 border border-green-300 rounded-lg text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none bg-white"
          >
            <option :value="null" disabled>-- Wybierz typ danych --</option>
            <option v-for="dt in currentDatasetConfig.dataTypes" :key="dt.id" :value="dt.id">
              {{ dt.label }}
            </option>
          </select>
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

      <!-- Step 2: Target Sheets (was Step 3) -->
      <div v-else-if="currentStep === 1" class="h-full flex flex-col">
        <p class="text-sm text-gray-500 mb-4 flex-shrink-0">
          Podaj link do arkusza Google Sheets.
        </p>

        <!-- Duplicate URL warning -->
        <div v-if="duplicateSheetWarning" class="p-3 bg-red-50 border border-red-300 rounded-lg mb-4 flex-shrink-0">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <p class="text-sm font-medium text-red-800">
                {{ duplicateInSameExport ? 'Zduplikowany arkusz w tym eksporcie!' : 'Ten arkusz jest już używany!' }}
              </p>
              <p class="text-sm text-red-700 mt-1">
                {{ duplicateInSameExport
                  ? 'Ten sam arkusz (ta sama zakładka) nie może być użyty wielokrotnie w jednym eksporcie.'
                  : 'Każdy eksport musi mieć unikalny arkusz docelowy.' }}
              </p>
            </div>
          </div>
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

      <!-- Step 3: Summary (was Step 4) -->
      <div v-else-if="currentStep === 2" class="h-full flex flex-col">
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

            <!-- Settings: Netto/Brutto (order_products only) -->
            <div v-if="showSettingsSection" class="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-4">
              <h4 class="text-sm font-semibold text-blue-900">Ustawienia przeliczania cen</h4>

              <!-- Delivery VAT rate -->
              <div v-if="showDeliveryTaxSetting">
                <label class="block text-sm font-medium text-gray-700 mb-1">Stawka VAT na dostawę</label>
                <p class="text-xs text-gray-500 mb-2">BaseLinker nie podaje stawki VAT dostawy — wybierz odpowiednią stawkę</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in deliveryTaxOptions"
                    :key="opt.value"
                    type="button"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                    :class="{
                      'border-blue-500 bg-blue-50 text-blue-700': config.settings.deliveryTaxRate === opt.value,
                      'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.deliveryTaxRate !== opt.value
                    }"
                    @click="config.settings.deliveryTaxRate = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <!-- Inventory price format -->
              <div v-if="showInventoryPriceFormatSetting">
                <label class="block text-sm font-medium text-gray-700 mb-1">Ceny zakupowe w magazynie są zapisane jako</label>
                <p class="text-xs text-gray-500 mb-2">Sprawdź ustawienia w panelu BaseLinker</p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                    :class="{
                      'border-blue-500 bg-blue-50 text-blue-700': config.settings.inventoryPriceFormat === 'netto',
                      'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.inventoryPriceFormat !== 'netto'
                    }"
                    @click="config.settings.inventoryPriceFormat = 'netto'"
                  >
                    Netto
                  </button>
                  <button
                    type="button"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                    :class="{
                      'border-blue-500 bg-blue-50 text-blue-700': config.settings.inventoryPriceFormat === 'brutto',
                      'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.inventoryPriceFormat !== 'brutto'
                    }"
                    @click="config.settings.inventoryPriceFormat = 'brutto'"
                  >
                    Brutto
                  </button>
                </div>
              </div>

              <!-- Decimal separator format -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Format liczb w arkuszu</label>
                <p class="text-xs text-gray-500 mb-2">Wybierz separator dziesiętny zgodny z ustawieniami Twojego arkusza Google</p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                    :class="{
                      'border-blue-500 bg-blue-50 text-blue-700': config.settings.decimalSeparator === ',',
                      'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.decimalSeparator !== ','
                    }"
                    @click="config.settings.decimalSeparator = ','"
                  >
                    Polski (1,99)
                  </button>
                  <button
                    type="button"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                    :class="{
                      'border-blue-500 bg-blue-50 text-blue-700': config.settings.decimalSeparator === '.',
                      'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.decimalSeparator !== '.'
                    }"
                    @click="config.settings.decimalSeparator = '.'"
                  >
                    Angielski (1.99)
                  </button>
                </div>
              </div>

              <!-- Currency conversion (orders only) -->
              <div v-if="showCurrencyConversionSetting" class="border-t border-blue-200 pt-4 mt-4">
                <div class="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    :class="config.settings.currencyConversion?.enabled ? 'bg-blue-600' : 'bg-gray-200'"
                    @click="toggleCurrencyConversion"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      :class="config.settings.currencyConversion?.enabled ? 'translate-x-5' : 'translate-x-0'"
                    />
                  </button>
                  <label class="text-sm font-medium text-gray-700">Przewalutowanie</label>
                </div>

                <div v-if="config.settings.currencyConversion?.enabled" class="space-y-4 pl-14">
                  <!-- Target currency -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Waluta docelowa</label>
                    <select
                      v-model="config.settings.currencyConversion.targetCurrency"
                      class="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                    >
                      <option v-for="opt in currencyOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </option>
                    </select>
                  </div>

                  <!-- Exchange rate date source -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Data kursu wymiany</label>
                    <p class="text-xs text-gray-500 mb-2">Wybierz ktora data ma byc uzyta do pobrania kursu NBP</p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="opt in exchangeRateDateOptions"
                        :key="opt.value"
                        type="button"
                        class="px-4 py-2 rounded-lg border text-sm font-medium transition-all"
                        :class="{
                          'border-blue-500 bg-blue-50 text-blue-700': config.settings.currencyConversion?.exchangeRateSource === opt.value,
                          'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50': config.settings.currencyConversion?.exchangeRateSource !== opt.value
                        }"
                        @click="config.settings.currencyConversion.exchangeRateSource = opt.value"
                      >
                        {{ opt.label }}
                      </button>
                    </div>
                  </div>

                  <p class="text-xs text-gray-500">
                    Kursy wymiany pobierane sa z Narodowego Banku Polskiego (NBP).
                    Przeliczone wartosci pojawia sie w dodatkowych kolumnach.
                  </p>
                </div>
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
              <div v-if="requiresInventory" class="flex justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Katalogi</span>
                <span class="font-medium text-gray-900">{{ getInventoryNames(config.filters?.inventory_ids) }}</span>
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

// Step 1 Variants (A/B test concluded - keeping Akordeony and Dual Panel)
import WizardStep1VariantC from './wizard/WizardStep1VariantC.vue'
import WizardStep1VariantD from './wizard/WizardStep1VariantD.vue'

const step1Variants = {
  C: { component: WizardStep1VariantC, name: 'Akordeony' },
  D: { component: WizardStep1VariantD, name: 'Dual Panel' }
}

const props = defineProps({
  exportId: {
    type: String,
    default: null
  },
  templateData: {
    type: Object,
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
const lastSaveTime = ref(0) // Debounce protection
const isLoading = ref(true)
const draggedIndex = ref(null)
const duplicateSheetWarning = ref(false)
const fieldsPerDataset = ref({})  // Autozapis pól per dataset

// Step 1 Variant (C=Akordeony or D=Dual Panel)
const activeVariant = ref(localStorage.getItem('wizardStep1Variant') || 'C')

// Ensure valid variant (migrate from old A/B/E variants)
if (!['C', 'D'].includes(activeVariant.value)) {
  activeVariant.value = 'C'
  localStorage.setItem('wizardStep1Variant', 'C')
}

// Save variant preference
function setVariant(variant) {
  activeVariant.value = variant
  localStorage.setItem('wizardStep1Variant', variant)
}

const currentVariantComponent = computed(() => step1Variants[activeVariant.value]?.component || WizardStep1VariantC)

// Field definitions from backend
const fieldDefinitions = ref({
  operators: [],
  datasets: {}
})

// Dynamic data from BaseLinker
const orderStatuses = ref([])
const orderSources = ref({})
const inventories = ref([]) // Katalogi produktów
const externalStorages = ref([]) // Zewnętrzne magazyny
const connectIntegrations = ref({}) // Integracje Base Connect

// Configuration
const config = ref({
  id: null,
  name: 'Nowy eksport',
  description: '',
  dataset: 'orders',
  selected_fields: [],
  filters: {
    logic: 'AND',
    groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }],
    inventory_ids: []
  },
  sheets_config: [{
    sheet_url: '',
    write_mode: 'replace'
  }],
  schedule_minutes: 15,
  status: 'active',
  settings: {
    inventoryPriceFormat: 'brutto',
    deliveryTaxRate: 23,
    decimalSeparator: ',',
    currencyConversion: {
      enabled: false,
      targetCurrency: 'PLN',
      exchangeRateSource: 'today'
    },
    // Dataset-specific settings
    storageId: null,
    integrationId: null,
    dataType: null
  }
})

// Steps definition (Step 2 "Filtry" hidden - backend support preserved)
const steps = [
  { label: 'Dane', description: 'Wybierz typ danych i pola' },
  { label: 'Arkusz', description: 'Konfiguracja arkusza' },
  { label: 'Zapisz', description: 'Nazwa i zapis' }
]

const scheduleOptions = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 godz' },
  { value: 360, label: '6 godz' },
  { value: 1440, label: '24 godz' }
]

const datasetDescriptions = {
  orders: 'Zamówienia z BaseLinker',
  order_items: 'Pozycje zamówień (produkty)',
  returns: 'Zwroty i reklamacje',
  products_catalog: 'Produkty z katalogu BaseLinker',
  accounting_docs: 'Faktury i paragony',
  warehouse_docs: 'Dokumenty magazynowe (PZ, WZ, MM)',
  products_external: 'Produkty z zewnętrznych magazynów',
  purchase_orders: 'Zamówienia zakupu od dostawców',
  shipments: 'Przesyłki kurierskie',
  base_connect: 'Kontrahenci B2B',
  basic_data: 'Dane słownikowe (statusy, źródła, magazyny)',
  // Legacy mappings
  products: 'Produkty z magazynu',
  invoices: 'Faktury',
  order_products: 'Produkty w zamówieniach'
}

const serviceAccountEmail = 'live-sales-worker@livesales-483523.iam.gserviceaccount.com'
const maxSheets = 3

// Computed
const availableDatasets = computed(() => {
  const datasets = fieldDefinitions.value?.datasets || {}
  const result = Object.entries(datasets).map(([key, ds]) => ({
    key,
    label: ds.label,
    available: !ds.locked,
    requiredPlan: ds.requiredPlan || 'basic',
    description: datasetDescriptions[key] || ''
  }))
  return result
})

const currentDatasetFields = computed(() => {
  const ds = fieldDefinitions.value?.datasets?.[config.value.dataset]
  return ds?.fields || []
})

// Get current dataset configuration (requirements)
const currentDatasetConfig = computed(() => {
  const ds = fieldDefinitions.value?.datasets?.[config.value.dataset]
  return {
    requiresInventory: ds?.requiresInventory || false,
    requiresStorage: ds?.requiresStorage || false,
    requiresIntegration: ds?.requiresIntegration || false,
    requiresDataType: ds?.requiresDataType || false,
    dataTypes: ds?.dataTypes || []
  }
})

// Check if current dataset requires inventory selection
const requiresInventory = computed(() => {
  return currentDatasetConfig.value.requiresInventory || config.value.dataset === 'products'
})

// Check if current dataset requires external storage selection
const requiresStorage = computed(() => {
  return currentDatasetConfig.value.requiresStorage
})

// Check if current dataset requires Base Connect integration selection
const requiresIntegration = computed(() => {
  return currentDatasetConfig.value.requiresIntegration
})

// Check if current dataset requires data type selection (for basic_data)
const requiresDataType = computed(() => {
  return currentDatasetConfig.value.requiresDataType
})

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0: // Dane
      const hasFields = config.value.dataset && config.value.selected_fields.length > 0
      // Check required parameters for dataset
      if (requiresInventory.value && (!config.value.filters?.inventory_ids || config.value.filters.inventory_ids.length === 0)) {
        return false
      }
      if (requiresStorage.value && !config.value.settings?.storageId) {
        return false
      }
      if (requiresDataType.value && !config.value.settings?.dataType) {
        return false
      }
      return hasFields
    case 1: // Arkusz (was case 2)
      return config.value.sheets_config?.some(s => s.sheet_url?.trim()) && !duplicateSheetWarning.value
    default: // Zapisz
      return true
  }
})

const showDeliveryTaxSetting = computed(() => {
  // Show for orders and order_products datasets when delivery price netto/brutto selected
  if (!['orders', 'order_products'].includes(config.value.dataset)) return false
  return config.value.selected_fields.some(f =>
    f === 'delivery_price_netto' || f === 'delivery_price_brutto'
  )
})

const showInventoryPriceFormatSetting = computed(() => {
  // Show for order_products when inv_* fields selected
  if (config.value.dataset === 'order_products') {
    return config.value.selected_fields.some(f =>
      f.startsWith('inv_purchase_price_') || f.startsWith('inv_average_cost_')
    )
  }
  // Show for orders when products_* summary fields that need inventory are selected
  if (config.value.dataset === 'orders') {
    const inventoryRequiredFields = [
      'products_total_purchase_cost_brutto', 'products_total_purchase_cost_netto',
      'products_average_margin'
    ]
    return config.value.selected_fields.some(f => inventoryRequiredFields.includes(f))
  }
  return false
})

const showSettingsSection = computed(() => {
  // Always show - decimal separator applies to all exports
  return true
})

// Show currency conversion for orders dataset when financial fields are selected
const showCurrencyConversionSetting = computed(() => {
  if (config.value.dataset !== 'orders') return false
  // Check if any convertible financial fields are selected
  const financialFields = [
    'payment_done', 'delivery_price_brutto', 'delivery_price_netto',
    'products_total_value_brutto', 'products_total_value_netto',
    'commission_net', 'commission_gross',
    'ds_total_brutto', 'ds_total_netto',
    'ds_products_total_brutto', 'ds_products_total_netto',
    'ds_delivery_total_brutto', 'ds_delivery_total_netto'
  ]
  return config.value.selected_fields.some(f => financialFields.includes(f))
})

// Currency conversion settings
const currencyOptions = [
  { value: 'PLN', label: 'PLN (zloty polski)' },
  { value: 'EUR', label: 'EUR (euro)' },
  { value: 'USD', label: 'USD (dolar amerykanski)' },
  { value: 'GBP', label: 'GBP (funt brytyjski)' },
  { value: 'CHF', label: 'CHF (frank szwajcarski)' },
  { value: 'CZK', label: 'CZK (korona czeska)' }
]

const exchangeRateDateOptions = [
  { value: 'today', label: 'Dzisiejszy kurs' },
  { value: 'order_date', label: 'Data zamowienia' },
  { value: 'invoice_date', label: 'Data faktury' }
]

function toggleCurrencyConversion() {
  if (!config.value.settings.currencyConversion) {
    config.value.settings.currencyConversion = {
      enabled: true,
      targetCurrency: 'PLN',
      exchangeRateSource: 'today'
    }
  } else {
    config.value.settings.currencyConversion.enabled = !config.value.settings.currencyConversion.enabled
  }
  // Auto-add converted fields when enabling
  if (config.value.settings.currencyConversion.enabled) {
    addConvertedFieldsToSelection()
  }
}

function addConvertedFieldsToSelection() {
  // Map of source fields to their converted versions
  const conversionMap = {
    'payment_done': 'payment_done_converted',
    'delivery_price_brutto': 'delivery_price_brutto_converted',
    'delivery_price_netto': 'delivery_price_netto_converted',
    'products_total_value_brutto': 'products_total_value_brutto_converted',
    'products_total_value_netto': 'products_total_value_netto_converted',
    'commission_net': 'commission_net_converted',
    'commission_gross': 'commission_gross_converted',
    'ds_total_brutto': 'ds_total_brutto_converted',
    'ds_total_netto': 'ds_total_netto_converted',
    'ds_products_total_brutto': 'ds_products_total_brutto_converted',
    'ds_products_total_netto': 'ds_products_total_netto_converted',
    'ds_delivery_total_brutto': 'ds_delivery_total_brutto_converted',
    'ds_delivery_total_netto': 'ds_delivery_total_netto_converted'
  }

  const fieldsToAdd = []
  for (const sourceField of config.value.selected_fields) {
    const convertedField = conversionMap[sourceField]
    if (convertedField && !config.value.selected_fields.includes(convertedField)) {
      fieldsToAdd.push(convertedField)
    }
  }

  if (fieldsToAdd.length > 0) {
    config.value.selected_fields = [...config.value.selected_fields, ...fieldsToAdd]
  }
}

const deliveryTaxOptions = [
  { value: 23, label: '23%' },
  { value: 8, label: '8%' },
  { value: 5, label: '5%' },
  { value: 0, label: '0% (zw.)' }
]

const canSave = computed(() => {
  const basicChecks = config.value.name?.trim() &&
         config.value.selected_fields.length > 0 &&
         config.value.sheets_config?.some(s => s.sheet_url?.trim()) &&
         !duplicateSheetWarning.value

  // Additional check for inventory if dataset requires it
  if (requiresInventory.value) {
    return basicChecks && config.value.filters?.inventory_ids?.length > 0
  }
  return basicChecks
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

function getInventoryNames(inventoryIds) {
  if (!inventoryIds || inventoryIds.length === 0) return 'Nie wybrano'
  return inventoryIds
    .map(id => inventories.value.find(i => i.inventory_id === id)?.name || `ID: ${id}`)
    .join(', ')
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

// Extract Google Sheets ID and GID from URL for comparison
function extractSheetIdentifiers(url) {
  if (!url) return null
  const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  if (!spreadsheetMatch) return null
  return {
    spreadsheetId: spreadsheetMatch[1],
    gid: gidMatch ? gidMatch[1] : '0'
  }
}

// Legacy function for backward compatibility
function extractSheetId(url) {
  const ids = extractSheetIdentifiers(url)
  return ids ? ids.spreadsheetId : null
}

// Get unique key for sheet (spreadsheetId:gid)
function getSheetKey(url) {
  const ids = extractSheetIdentifiers(url)
  return ids ? `${ids.spreadsheetId}:${ids.gid}` : null
}

// URL validation - check duplicates in same export AND other exports
const duplicateInSameExport = ref(false)

function checkDuplicateUrl() {
  const currentSheetKeys = config.value.sheets_config
    ?.map(s => getSheetKey(s.sheet_url))
    .filter(Boolean) || []

  // Check for duplicates within same export
  const uniqueKeys = new Set(currentSheetKeys)
  duplicateInSameExport.value = uniqueKeys.size < currentSheetKeys.length

  // Check for duplicates in other exports (support both sheets[] and legacy sheetsUrl)
  const otherSheetKeys = props.existingExports
    .filter(e => e.id !== config.value.id)
    .flatMap(e => {
      const keys = []
      // New format: sheets array
      if (e.sheets?.length) {
        keys.push(...e.sheets.map(s => getSheetKey(s.sheet_url || s.sheetUrl)))
      }
      // Legacy format: single sheetsUrl
      if (e.sheetsUrl) {
        keys.push(getSheetKey(e.sheetsUrl))
      }
      return keys
    })
    .filter(Boolean)

  const duplicateInOtherExport = currentSheetKeys.some(key => otherSheetKeys.includes(key))

  duplicateSheetWarning.value = duplicateInSameExport.value || duplicateInOtherExport
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
      status: 'draft',
      settings: config.value.settings
    }
    emit('save-draft', draftData)
  } else {
    emit('cancel')
  }
}

async function saveExport() {
  // Debounce: prevent double-clicks within 500ms
  const now = Date.now()
  if (now - lastSaveTime.value < 500) return
  if (!canSave.value || isSaving.value) return

  lastSaveTime.value = now
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
      status: config.value.status || 'active',
      settings: config.value.settings
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
  } catch {
    // Error handled silently - will show empty state
  }
}

async function loadOrderStatuses() {
  try {
    const data = await API.baselinker.getOrderStatuses()
    orderStatuses.value = data || []
  } catch {
    // Error handled silently
  }
}

async function loadOrderSources() {
  try {
    const data = await API.baselinker.getOrderSources()
    orderSources.value = data || {}
  } catch {
    // Error handled silently
  }
}

async function loadInventories() {
  try {
    const data = await API.baselinker.getInventories()
    inventories.value = data || []
  } catch {
    // Error handled silently
  }
}

async function loadExternalStorages() {
  try {
    const data = await API.baselinker.getExternalStorages()
    externalStorages.value = data || []
  } catch {
    // Error handled silently
  }
}

async function loadConnectIntegrations() {
  try {
    const data = await API.baselinker.getConnectIntegrations()
    connectIntegrations.value = data || {}
  } catch {
    // Error handled silently
  }
}

async function loadExistingExport() {
  // Load from template if provided (for sample exports)
  if (props.templateData) {
    config.value = {
      id: null,
      name: props.templateData.name || 'Nowy eksport',
      description: '',
      dataset: props.templateData.dataset || 'orders',
      selected_fields: props.templateData.selectedFields || [],
      filters: props.templateData.filters || {
        logic: 'AND',
        groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
      },
      sheets_config: [{ sheet_url: '', write_mode: 'replace' }],
      schedule_minutes: props.templateData.scheduleMinutes || 15,
      status: 'active',
      settings: {
        inventoryPriceFormat: 'brutto',
        deliveryTaxRate: 23,
        decimalSeparator: ',',
        currencyConversion: { enabled: false, targetCurrency: 'PLN', exchangeRateSource: 'today' },
        ...props.templateData.settings
      }
    }
    return
  }

  if (!props.exportId) return

  try {
    const exportData = await API.exports.get(props.exportId)
    if (exportData) {
      // Handle both snake_case and camelCase field names from API
      const selectedFields = exportData.selected_fields || exportData.selectedFields || []
      const scheduleMinutes = exportData.schedule_minutes || exportData.scheduleMinutes || 15
      const sheetsConfig = (exportData.sheets_config || exportData.sheets || []).map(s => ({
        sheet_url: s.sheet_url || s.sheetUrl || '',
        write_mode: s.write_mode || s.writeMode || 'replace'
      }))

      config.value = {
        id: exportData.id,
        name: exportData.name || 'Nowy eksport',
        description: exportData.description || '',
        dataset: exportData.dataset || 'orders',
        selected_fields: selectedFields,
        filters: (() => {
          const f = exportData.filters || {
            logic: 'AND',
            groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
          }
          // Backward compatibility: convert inventory_id to inventory_ids
          if (!f.inventory_ids && f.inventory_id) {
            f.inventory_ids = [f.inventory_id]
          }
          if (!f.inventory_ids) {
            f.inventory_ids = []
          }
          return f
        })(),
        sheets_config: sheetsConfig.length > 0 ? sheetsConfig : [{ sheet_url: '', write_mode: 'replace' }],
        schedule_minutes: scheduleMinutes,
        status: exportData.status || 'active',
        settings: {
          inventoryPriceFormat: 'brutto',
          deliveryTaxRate: 23,
          decimalSeparator: ',',
          currencyConversion: { enabled: false, targetCurrency: 'PLN', exchangeRateSource: 'today' },
          ...exportData.settings
        }
      }
    }
  } catch {
    // Error handled silently
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
      loadInventories(),
      loadExternalStorages(),
      loadConnectIntegrations(),
      loadExistingExport()
    ])
  } finally {
    isLoading.value = false
  }
})
</script>
