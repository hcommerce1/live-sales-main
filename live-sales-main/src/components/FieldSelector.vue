<template>
  <div class="field-selector">
    <!-- Search -->
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Szukaj pola..."
        class="search-input"
      />
    </div>

    <!-- Available fields -->
    <div class="fields-container">
      <div class="available-fields">
        <h4>Dostępne pola</h4>
        <div class="field-groups">
          <div
            v-for="group in filteredGroups"
            :key="group.name"
            class="field-group"
          >
            <div
              class="group-header"
              @click="toggleGroup(group.name)"
            >
              <span class="group-icon">{{ expandedGroups.includes(group.name) ? '▼' : '▶' }}</span>
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">{{ group.fields.length }}</span>
            </div>
            <div v-if="expandedGroups.includes(group.name)" class="group-fields">
              <div
                v-for="field in group.fields"
                :key="field.key"
                class="field-item"
                :class="{
                  selected: isSelected(field.key),
                  locked: !field.available
                }"
                @click="toggleField(field)"
              >
                <span class="field-checkbox">
                  <template v-if="isSelected(field.key)">✓</template>
                </span>
                <span class="field-label">{{ field.label }}</span>
                <span v-if="!field.available" class="field-lock" :title="`Wymaga planu ${field.plan.toUpperCase()}`">
                  🔒 {{ field.plan.toUpperCase() }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected fields (with drag & drop) -->
      <div class="selected-fields">
        <h4>Wybrane pola ({{ selectedFields.length }})</h4>
        <div v-if="selectedFields.length === 0" class="empty-message">
          Kliknij pola po lewej stronie, aby je wybrać
        </div>
        <div ref="sortableContainer" class="selected-list">
          <div
            v-for="(fieldKey, index) in selectedFields"
            :key="fieldKey"
            class="selected-item"
            :data-field-key="fieldKey"
          >
            <span class="drag-handle">☰</span>
            <span class="field-index">{{ index + 1 }}.</span>
            <span class="field-label">{{ getFieldLabel(fieldKey) }}</span>
            <button class="remove-btn" @click.stop="removeField(fieldKey)">×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="quick-actions">
      <button @click="selectAll" class="btn-secondary">
        Zaznacz wszystkie dostępne
      </button>
      <button @click="clearAll" class="btn-secondary">
        Wyczyść zaznaczenie
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import Sortable from 'sortablejs'

const props = defineProps({
  fields: {
    type: Array,
    required: true
  },
  modelValue: {
    type: Array,
    default: () => []
  },
  lockedFields: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const searchQuery = ref('')
const expandedGroups = ref(['Podstawowe', 'Dane klienta', 'Produkt'])
const sortableContainer = ref(null)
let sortableInstance = null

const selectedFields = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Combine available and locked fields with availability flag
const allFields = computed(() => {
  const available = props.fields.map(f => ({ ...f, available: true }))
  const locked = props.lockedFields.map(f => ({ ...f, available: false }))
  return [...available, ...locked]
})

// Group fields by group name
const filteredGroups = computed(() => {
  const groups = {}
  const query = searchQuery.value.toLowerCase()

  allFields.value
    .filter(field => {
      if (!query) return true
      return field.label.toLowerCase().includes(query) ||
             field.key.toLowerCase().includes(query)
    })
    .forEach(field => {
      if (!groups[field.group]) {
        groups[field.group] = []
      }
      groups[field.group].push(field)
    })

  return Object.entries(groups).map(([name, fields]) => ({ name, fields }))
})

function toggleGroup(groupName) {
  const index = expandedGroups.value.indexOf(groupName)
  if (index > -1) {
    expandedGroups.value.splice(index, 1)
  } else {
    expandedGroups.value.push(groupName)
  }
}

function isSelected(fieldKey) {
  return selectedFields.value.includes(fieldKey)
}

function toggleField(field) {
  if (!field.available) {
    // Show upgrade prompt or ignore
    return
  }

  const index = selectedFields.value.indexOf(field.key)
  if (index > -1) {
    // Remove
    const newValue = [...selectedFields.value]
    newValue.splice(index, 1)
    selectedFields.value = newValue
  } else {
    // Add
    selectedFields.value = [...selectedFields.value, field.key]
  }
}

function removeField(fieldKey) {
  selectedFields.value = selectedFields.value.filter(k => k !== fieldKey)
}

function getFieldLabel(fieldKey) {
  const field = allFields.value.find(f => f.key === fieldKey)
  return field ? field.label : fieldKey
}

function selectAll() {
  const allAvailable = props.fields.map(f => f.key)
  // Add only those not already selected
  const newFields = allAvailable.filter(k => !selectedFields.value.includes(k))
  selectedFields.value = [...selectedFields.value, ...newFields]
}

function clearAll() {
  selectedFields.value = []
}

// Initialize Sortable.js for drag & drop reordering
onMounted(() => {
  nextTick(() => {
    if (sortableContainer.value) {
      sortableInstance = Sortable.create(sortableContainer.value, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: (evt) => {
          const newOrder = [...selectedFields.value]
          const [moved] = newOrder.splice(evt.oldIndex, 1)
          newOrder.splice(evt.newIndex, 0, moved)
          selectedFields.value = newOrder
        }
      })
    }
  })
})
</script>

<style scoped>
.field-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.search-box {
  margin-bottom: 0.5rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.fields-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  min-height: 400px;
}

.available-fields,
.selected-fields {
  background: #f9fafb;
  border-radius: 12px;
  padding: 1rem;
  overflow-y: auto;
  max-height: 500px;
}

.available-fields h4,
.selected-fields h4 {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.field-groups {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-group {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  background: #f3f4f6;
  transition: background-color 0.2s;
}

.group-header:hover {
  background: #e5e7eb;
}

.group-icon {
  font-size: 0.7rem;
  color: #6b7280;
}

.group-name {
  flex: 1;
  font-weight: 500;
  font-size: 0.85rem;
}

.group-count {
  background: #e5e7eb;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #6b7280;
}

.group-fields {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.field-item:hover {
  background: #f3f4f6;
}

.field-item.selected {
  background: #eef2ff;
  color: #4f46e5;
}

.field-item.locked {
  opacity: 0.6;
  cursor: not-allowed;
}

.field-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: white;
  background: white;
}

.field-item.selected .field-checkbox {
  background: #6366f1;
  border-color: #6366f1;
}

.field-label {
  flex: 1;
  font-size: 0.85rem;
}

.field-lock {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
}

.empty-message {
  color: #9ca3af;
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem;
}

.selected-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.selected-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.drag-handle {
  cursor: grab;
  color: #9ca3af;
  font-size: 0.9rem;
}

.drag-handle:active {
  cursor: grabbing;
}

.field-index {
  color: #9ca3af;
  font-size: 0.8rem;
  min-width: 1.5rem;
}

.selected-item .field-label {
  flex: 1;
}

.remove-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-btn:hover {
  opacity: 1;
}

.quick-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-start;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
