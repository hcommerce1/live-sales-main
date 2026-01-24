<template>
  <!-- Variant D: Side-by-Side Dual Panel (Available ↔ Selected) -->
  <div class="h-full flex flex-col">
    <!-- Top: Dataset selection - collapsible after selection -->
    <div class="flex-shrink-0 mb-4">
      <!-- Selected dataset badge (shown after selection) -->
      <div v-if="selectedDataset && !showDatasetSelector" class="flex items-center gap-3">
        <span class="text-sm text-gray-500">Typ danych:</span>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
          <span class="font-medium text-blue-900 text-sm">{{ getDatasetLabel(selectedDataset) }}</span>
          <button
            type="button"
            class="text-xs text-blue-600 hover:text-blue-800 ml-1"
            @click="showChangeDatasetModal = true"
          >
            (zmien)
          </button>
        </div>
      </div>

      <!-- Dataset tabs (hidden after selection) -->
      <div v-else class="flex items-center gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          v-for="dataset in availableDatasets"
          :key="dataset.key"
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
          :class="{
            'bg-white text-blue-600 shadow-sm': selectedDataset === dataset.key,
            'text-gray-600 hover:text-gray-800': selectedDataset !== dataset.key && dataset.available,
            'text-gray-400 cursor-not-allowed': !dataset.available
          }"
          :disabled="!dataset.available"
          @click="selectDataset(dataset)"
        >
          {{ dataset.label }}
          <span v-if="!dataset.available" class="absolute -top-1 -right-1 text-[10px] px-1 py-0.5 bg-amber-400 text-white rounded">
            PRO
          </span>
        </button>
      </div>
    </div>

    <!-- Main: Dual panel -->
    <div v-if="selectedDataset" class="flex-1 flex gap-4 min-h-0">
      <!-- Left: Available fields -->
      <div class="flex-1 flex flex-col min-w-0 border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div class="p-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-gray-900">Dostepne pola</h3>
            <span class="text-sm text-gray-500">{{ availableFieldsFiltered.length }} pol</span>
          </div>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Szukaj..."
              class="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
            />
            <svg class="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <div
            v-for="field in availableFieldsFiltered"
            :key="field.key"
            class="flex items-center justify-between p-2.5 rounded-lg hover:bg-blue-50 cursor-pointer group transition-colors"
            :class="{ 'opacity-50 cursor-not-allowed': field.locked }"
            @click="!field.locked && addField(field)"
          >
            <span class="text-sm text-gray-700">{{ field.label }}</span>
            <div class="flex items-center gap-2">
              <span v-if="field.locked" class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">PRO</span>
              <span
                v-if="!field.locked"
                class="p-1.5 rounded-lg text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
              </span>
            </div>
          </div>
          <div v-if="availableFieldsFiltered.length === 0" class="text-center py-8 text-gray-400">
            <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01"/>
            </svg>
            <p>Brak wynikow</p>
          </div>
        </div>
      </div>

      <!-- Right: Selected fields -->
      <div class="flex-1 flex flex-col min-w-0 border-2 border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">
        <div class="p-3 bg-blue-100/50 border-b border-blue-200 flex-shrink-0">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-blue-900">Wybrane pola</h3>
            <span class="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{{ selectedFields.length }}</span>
          </div>
          <p class="text-xs text-blue-700 mt-1">Przeciagnij aby zmienic kolejnosc</p>
        </div>
        <div
          class="flex-1 overflow-y-auto p-2"
          @dragover.prevent
          @drop="handleDropOnContainer"
        >
          <template v-for="(fieldKey, index) in selectedFields" :key="fieldKey">
            <!-- Drop indicator line -->
            <div
              v-if="dropTargetIndex === index"
              class="h-0.5 bg-blue-500 rounded-full mx-2 my-1 animate-pulse"
            ></div>
            <div
              class="flex items-center gap-2 p-2.5 mb-1.5 rounded-lg bg-white border border-blue-200 cursor-move hover:border-blue-400 hover:shadow-sm transition-all group"
              :class="{ 'ring-2 ring-blue-500 border-blue-500': draggedIndex === index }"
              draggable="true"
              @dragstart="dragStart(index, $event)"
              @dragend="dragEnd"
              @dragover.prevent="handleDragOver(index)"
              @drop.stop="drop(index)"
            >
              <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
              </svg>
              <span class="text-xs text-gray-400 font-mono w-5">{{ index + 1 }}.</span>
              <span class="text-sm text-gray-700 flex-1">{{ getFieldLabel(fieldKey) }}</span>
              <button
                type="button"
                class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                @click="removeField(fieldKey)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </template>
          <!-- Drop indicator at end -->
          <div
            v-if="dropTargetIndex === selectedFields.length"
            class="h-0.5 bg-blue-500 rounded-full mx-2 my-1 animate-pulse"
          ></div>
          <div v-if="selectedFields.length === 0" class="text-center py-12 text-blue-400">
            <svg class="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <p class="font-medium">Brak wybranych pol</p>
            <p class="text-sm mt-1">Kliknij na pole po lewej aby je dodac</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Change dataset warning -->
    <div v-if="showChangeDatasetModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showChangeDatasetModal = false"></div>
      <div class="relative bg-white rounded-xl shadow-2xl p-6 max-w-lg mx-4">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Zmiana typu danych</h3>
        <p class="text-gray-600 mb-4">
          Jeden eksport = jeden typ danych.<br>
          Zmiana typu usunie wybrane pola.
        </p>
        <p class="text-sm text-gray-500 mb-6">
          Jesli potrzebujesz innego typu danych, utworz nowy eksport.
        </p>

        <!-- Dataset options in modal (excluding currently selected) -->
        <div class="space-y-2 mb-6">
          <label
            v-for="dataset in availableDatasets.filter(d => d.key !== selectedDataset)"
            :key="dataset.key"
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
            :class="{
              'border-blue-500 bg-blue-50': pendingDataset === dataset.key,
              'border-gray-200 hover:border-gray-300': pendingDataset !== dataset.key && dataset.available,
              'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed': !dataset.available
            }"
          >
            <input
              type="radio"
              :value="dataset.key"
              :checked="pendingDataset === dataset.key"
              :disabled="!dataset.available"
              class="w-4 h-4 text-blue-600"
              @change="pendingDataset = dataset.key"
            />
            <div class="flex-1">
              <div class="font-medium text-gray-900 text-sm">{{ dataset.label }}</div>
            </div>
          </label>
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            @click="showChangeDatasetModal = false"
          >
            Anuluj
          </button>
          <button
            type="button"
            class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            @click="confirmDatasetChange"
          >
            Zmien typ
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  availableDatasets: { type: Array, required: true },
  fields: { type: Array, required: true },
  selectedDataset: { type: String, default: '' },
  selectedFields: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:selectedDataset', 'update:selectedFields'])

const searchQuery = ref('')
const draggedIndex = ref(null)
const dropTargetIndex = ref(null)
const showDatasetSelector = ref(!props.selectedDataset)
const showChangeDatasetModal = ref(false)
const pendingDataset = ref('')

// Watch for dataset selection to hide selector
watch(() => props.selectedDataset, (newVal) => {
  if (newVal) {
    showDatasetSelector.value = false
  }
})

const availableFieldsFiltered = computed(() => {
  const available = props.fields.filter(f => !props.selectedFields.includes(f.key))
  if (!searchQuery.value.trim()) return available
  const query = searchQuery.value.toLowerCase()
  return available.filter(f => f.label.toLowerCase().includes(query))
})

function getDatasetLabel(key) {
  const dataset = props.availableDatasets.find(d => d.key === key)
  return dataset?.label || key
}

function selectDataset(dataset) {
  if (!dataset.available) return
  emit('update:selectedDataset', dataset.key)
  showDatasetSelector.value = false
}

function confirmDatasetChange() {
  if (pendingDataset.value && pendingDataset.value !== props.selectedDataset) {
    emit('update:selectedFields', [])
    emit('update:selectedDataset', pendingDataset.value)
  }
  showChangeDatasetModal.value = false
  pendingDataset.value = ''
}

function addField(field) {
  if (field.locked || props.selectedFields.includes(field.key)) return
  emit('update:selectedFields', [...props.selectedFields, field.key])
}

function removeField(fieldKey) {
  emit('update:selectedFields', props.selectedFields.filter(f => f !== fieldKey))
}

function getFieldLabel(fieldKey) {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.label || fieldKey
}

// Drag & Drop with visual indicator
function dragStart(index, event) {
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function dragEnd() {
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function handleDragOver(index) {
  if (draggedIndex.value === null) return
  if (index !== draggedIndex.value) {
    dropTargetIndex.value = index
  }
}

function drop(targetIndex) {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    dropTargetIndex.value = null
    return
  }
  const fields = [...props.selectedFields]
  const [moved] = fields.splice(draggedIndex.value, 1)
  const insertAt = targetIndex > draggedIndex.value ? targetIndex - 1 : targetIndex
  fields.splice(insertAt, 0, moved)
  emit('update:selectedFields', fields)
  draggedIndex.value = null
  dropTargetIndex.value = null
}

function handleDropOnContainer() {
  if (draggedIndex.value !== null) {
    const fields = [...props.selectedFields]
    const [moved] = fields.splice(draggedIndex.value, 1)
    fields.push(moved)
    emit('update:selectedFields', fields)
    draggedIndex.value = null
    dropTargetIndex.value = null
  }
}
</script>
