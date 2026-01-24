<template>
  <!-- Variant E: Minimal Compact Tags -->
  <div class="h-full flex flex-col">
    <!-- Dataset + Field count in one row -->
    <div class="flex-shrink-0 flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-500">Dane:</span>
        <select
          :value="selectedDataset"
          class="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
          @change="handleDatasetChange"
        >
          <option value="" disabled>Wybierz typ</option>
          <option
            v-for="dataset in availableDatasets"
            :key="dataset.key"
            :value="dataset.key"
            :disabled="!dataset.available"
          >
            {{ dataset.label }}{{ !dataset.available ? ' (PRO)' : '' }}
          </option>
        </select>
      </div>
      <div v-if="selectedDataset" class="flex items-center gap-4">
        <button type="button" class="text-sm text-blue-600 hover:text-blue-800 font-medium" @click="selectPopular">Popularne</button>
        <button type="button" class="text-sm text-gray-500 hover:text-gray-700" @click="selectAll">Wszystkie</button>
        <button type="button" class="text-sm text-gray-500 hover:text-gray-700" @click="clearAll">Wyczysc</button>
        <div class="text-sm text-gray-900">
          <span class="font-bold text-blue-600">{{ selectedFields.length }}</span>
          <span class="text-gray-400"> / {{ fields.length }}</span>
        </div>
      </div>
    </div>

    <!-- All fields as clickable tags -->
    <div v-if="selectedDataset" class="flex-1 overflow-y-auto">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="field in fields"
          :key="field.key"
          type="button"
          class="px-3 py-1.5 rounded-full text-sm font-medium transition-all border"
          :class="{
            'bg-blue-500 text-white border-blue-500 shadow-sm': selectedFields.includes(field.key),
            'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50': !selectedFields.includes(field.key) && !field.locked,
            'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed': field.locked
          }"
          :disabled="field.locked"
          @click="toggleField(field)"
        >
          <span class="flex items-center gap-1.5">
            <svg v-if="selectedFields.includes(field.key)" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {{ field.label }}
            <svg v-if="field.locked" class="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
            </svg>
          </span>
        </button>
      </div>
    </div>

    <!-- Selected fields reorder - horizontal strip -->
    <div v-if="selectedFields.length > 0" class="flex-shrink-0 mt-4 pt-4 border-t border-gray-200">
      <div class="flex items-center gap-4">
        <span class="text-xs font-medium text-gray-500 flex-shrink-0">Kolejnosc:</span>
        <div class="flex-1 flex items-center gap-1 overflow-x-auto pb-1">
          <div
            v-for="(fieldKey, index) in selectedFields"
            :key="fieldKey"
            class="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium flex-shrink-0 cursor-move hover:bg-blue-200 transition-colors"
            draggable="true"
            @dragstart="dragStart(index, $event)"
            @dragend="dragEnd"
            @dragover.prevent
            @drop.stop="drop(index)"
          >
            <span class="text-blue-400 font-mono text-[10px]">{{ index + 1 }}</span>
            <span>{{ getFieldLabel(fieldKey) }}</span>
            <button type="button" class="ml-1 text-blue-400 hover:text-red-500" @click="removeField(fieldKey)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
import { ref } from 'vue'

const props = defineProps({
  availableDatasets: { type: Array, required: true },
  fields: { type: Array, required: true },
  selectedDataset: { type: String, default: '' },
  selectedFields: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:selectedDataset', 'update:selectedFields'])

const draggedIndex = ref(null)

// Popular fields for quick selection
const popularFieldKeys = ['order_id', 'date_add', 'status_id', 'email', 'delivery_fullname', 'delivery_address', 'delivery_city', 'delivery_postcode', 'payment_method', 'payment_done']

function handleDatasetChange(event) {
  emit('update:selectedDataset', event.target.value)
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

function selectPopular() {
  const available = props.fields.filter(f => !f.locked).map(f => f.key)
  const popular = popularFieldKeys.filter(k => available.includes(k))
  emit('update:selectedFields', popular)
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
