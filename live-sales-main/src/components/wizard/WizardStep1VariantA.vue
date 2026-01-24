<template>
  <!-- Variant A: Original Layout (Baseline) -->
  <div class="h-full flex gap-6">
    <!-- Left column: Dataset selection -->
    <div class="w-72 flex-shrink-0 flex flex-col">
      <label class="text-sm font-medium text-gray-700 mb-3">Typ danych</label>
      <div class="flex-1 flex flex-col gap-2">
        <button
          v-for="dataset in availableDatasets"
          :key="dataset.key"
          type="button"
          class="p-4 rounded-lg border text-left transition-all flex-1 flex flex-col justify-center"
          :class="{
            'border-blue-500 bg-blue-50 ring-2 ring-blue-200': selectedDataset === dataset.key,
            'border-gray-200 hover:border-gray-300 hover:bg-gray-50': selectedDataset !== dataset.key && dataset.available,
            'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed': !dataset.available
          }"
          :disabled="!dataset.available"
          @click="selectDataset(dataset)"
        >
          <div class="font-semibold text-gray-900">{{ dataset.label }}</div>
          <div class="text-sm text-gray-500 mt-1">{{ dataset.description }}</div>
          <span
            v-if="!dataset.available"
            class="inline-block mt-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium w-fit"
          >
            {{ dataset.requiredPlan.toUpperCase() }}
          </span>
        </button>
      </div>
    </div>

    <!-- Right column: Fields selection -->
    <div v-if="selectedDataset" class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-medium text-gray-700">Wybierz pola do eksportu</label>
        <span class="text-sm text-blue-600 font-medium">{{ selectedFields.length }} wybrano</span>
      </div>

      <!-- Fields grid -->
      <div class="flex-1 border border-gray-200 rounded-lg bg-white overflow-y-auto">
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0">
          <label
            v-for="field in fields"
            :key="field.key"
            class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-r border-gray-100"
            :class="{
              'opacity-50 cursor-not-allowed': field.locked,
              'bg-blue-50': selectedFields.includes(field.key)
            }"
          >
            <input
              type="checkbox"
              :checked="selectedFields.includes(field.key)"
              :disabled="field.locked"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              @change="toggleField(field)"
            />
            <span class="text-sm text-gray-700 flex-1 truncate">{{ field.label }}</span>
            <span v-if="field.locked" class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded flex-shrink-0">PRO</span>
          </label>
        </div>
      </div>

      <!-- Selected fields order -->
      <div v-if="selectedFields.length > 0" class="mt-3 flex-shrink-0">
        <label class="text-xs font-medium text-gray-500 mb-2 block">Kolejnosc kolumn (przeciagnij)</label>
        <div
          class="flex flex-wrap gap-1.5 p-2 bg-gray-100 rounded-lg border border-dashed border-gray-300"
          @dragover.prevent
          @drop="handleDropOnContainer"
        >
          <div
            v-for="(fieldKey, index) in selectedFields"
            :key="fieldKey"
            class="flex items-center gap-1 pl-2 pr-1 py-1 bg-white border border-gray-200 rounded text-xs cursor-move hover:border-blue-400 hover:bg-blue-50 transition-colors"
            draggable="true"
            @dragstart="dragStart(index, $event)"
            @dragend="dragEnd"
            @dragover.prevent
            @drop.stop="drop(index)"
          >
            <svg class="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
            </svg>
            <span class="text-gray-700">{{ getFieldLabel(fieldKey) }}</span>
            <button
              type="button"
              class="p-0.5 text-gray-400 hover:text-red-500 rounded"
              @click="removeField(fieldKey)"
            >
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
  const fields = props.selectedFields.filter(f => f !== fieldKey)
  emit('update:selectedFields', fields)
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

function handleDropOnContainer() {
  if (draggedIndex.value !== null) {
    const fields = [...props.selectedFields]
    const [moved] = fields.splice(draggedIndex.value, 1)
    fields.push(moved)
    emit('update:selectedFields', fields)
    draggedIndex.value = null
  }
}
</script>
