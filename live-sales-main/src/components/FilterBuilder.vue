<template>
  <div class="filter-builder">
    <!-- Main logic connector -->
    <div class="main-logic">
      <span class="logic-label">Grupy warunków połączone:</span>
      <div class="logic-toggle">
        <button
          :class="{ active: filters.logic === 'AND' }"
          @click="filters.logic = 'AND'"
        >
          ORAZ
        </button>
        <button
          :class="{ active: filters.logic === 'OR' }"
          @click="filters.logic = 'OR'"
        >
          LUB
        </button>
      </div>
    </div>

    <!-- Filter groups -->
    <div class="filter-groups">
      <div
        v-for="(group, groupIndex) in filters.groups"
        :key="groupIndex"
        class="filter-group"
      >
        <div class="group-header">
          <span class="group-title">Grupa {{ groupIndex + 1 }}</span>
          <div class="group-logic">
            <span>Warunki:</span>
            <div class="logic-toggle small">
              <button
                :class="{ active: group.logic === 'AND' }"
                @click="group.logic = 'AND'"
              >
                ORAZ
              </button>
              <button
                :class="{ active: group.logic === 'OR' }"
                @click="group.logic = 'OR'"
              >
                LUB
              </button>
            </div>
          </div>
          <button
            v-if="filters.groups.length > 1"
            class="remove-group-btn"
            @click="removeGroup(groupIndex)"
            title="Usuń grupę"
          >
            ×
          </button>
        </div>

        <div class="conditions">
          <div
            v-for="(condition, condIndex) in group.conditions"
            :key="condIndex"
            class="condition-row"
          >
            <!-- Field select -->
            <select
              v-model="condition.field"
              class="field-select"
              @change="onFieldChange(condition)"
            >
              <option value="">Wybierz pole...</option>
              <optgroup
                v-for="fieldGroup in groupedFields"
                :key="fieldGroup.name"
                :label="fieldGroup.name"
              >
                <option
                  v-for="field in fieldGroup.fields"
                  :key="field.key"
                  :value="field.key"
                >
                  {{ field.label }}
                </option>
              </optgroup>
            </select>

            <!-- Operator select -->
            <select
              v-model="condition.operator"
              class="operator-select"
              :disabled="!condition.field"
            >
              <option value="">Operator...</option>
              <option
                v-for="op in getOperatorsForField(condition.field)"
                :key="op.key"
                :value="op.key"
                :disabled="!op.available"
              >
                {{ op.label }}{{ !op.available ? ` (${op.plan.toUpperCase()})` : '' }}
              </option>
            </select>

            <!-- Value input -->
            <template v-if="!['is_empty', 'is_not_empty'].includes(condition.operator)">
              <!-- Select for select-type fields (status, source) -->
              <select
                v-if="getFieldType(condition.field) === 'select'"
                v-model="condition.value"
                class="value-input"
                :disabled="!condition.operator"
              >
                <option value="">Wybierz...</option>
                <option
                  v-for="option in getFieldOptions(condition.field)"
                  :key="option.value || option.id"
                  :value="option.value || option.id"
                >
                  {{ option.label || option.name }}
                </option>
              </select>

              <!-- Date input for date fields -->
              <input
                v-else-if="getFieldType(condition.field) === 'date'"
                v-model="condition.value"
                type="datetime-local"
                class="value-input"
                :disabled="!condition.operator"
              />

              <!-- Number input for number fields -->
              <input
                v-else-if="getFieldType(condition.field) === 'number'"
                v-model="condition.value"
                type="number"
                class="value-input"
                placeholder="Wartość..."
                :disabled="!condition.operator"
              />

              <!-- Text input for text fields -->
              <input
                v-else
                v-model="condition.value"
                type="text"
                class="value-input"
                placeholder="Wartość..."
                :disabled="!condition.operator"
              />
            </template>
            <span v-else class="no-value-placeholder">—</span>

            <!-- Remove condition -->
            <button
              v-if="group.conditions.length > 1"
              class="remove-condition-btn"
              @click="removeCondition(groupIndex, condIndex)"
              title="Usuń warunek"
            >
              ×
            </button>
          </div>

          <!-- Add condition button -->
          <button class="add-condition-btn" @click="addCondition(groupIndex)">
            + Dodaj warunek
          </button>
        </div>
      </div>
    </div>

    <!-- Add group button -->
    <button class="add-group-btn" @click="addGroup">
      + Dodaj grupę warunków
    </button>

    <!-- Info about operators -->
    <div v-if="hasLockedOperators" class="upgrade-notice">
      <svg class="w-4 h-4 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Niektore operatory wymagaja wyzszego planu. Uaktualnij plan, aby uzyskac dostep do wszystkich operatorow.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      logic: 'AND',
      groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
    })
  },
  fields: {
    type: Array,
    required: true
  },
  operators: {
    type: Array,
    required: true
  },
  // Dynamic options for select fields (statuses, sources)
  orderStatuses: {
    type: Array,
    default: () => []
  },
  orderSources: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue'])

const filters = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Group fields by group name
const groupedFields = computed(() => {
  const groups = {}
  props.fields.forEach(field => {
    if (!groups[field.group]) {
      groups[field.group] = []
    }
    groups[field.group].push(field)
  })
  return Object.entries(groups).map(([name, fields]) => ({ name, fields }))
})

// Get field type
function getFieldType(fieldKey) {
  const field = props.fields.find(f => f.key === fieldKey)
  return field?.type || 'text'
}

// Get operators available for a field type
function getOperatorsForField(fieldKey) {
  const fieldType = getFieldType(fieldKey)
  if (!fieldType) return props.operators

  return props.operators.filter(op => {
    // Check if operator supports this field type
    if (op.types && !op.types.includes(fieldType)) {
      return false
    }
    return true
  })
}

// Get options for select-type fields
function getFieldOptions(fieldKey) {
  const field = props.fields.find(f => f.key === fieldKey)
  if (!field) return []

  // Static options defined in field
  if (field.options) {
    return field.options
  }

  // Dynamic options based on source
  if (field.source === 'order-statuses') {
    return props.orderStatuses.map(s => ({ value: s.id, label: s.name }))
  }

  if (field.source === 'order-sources') {
    // Flatten order sources object
    const options = []
    for (const [type, sources] of Object.entries(props.orderSources)) {
      for (const [id, name] of Object.entries(sources)) {
        options.push({ value: type, label: `${name} (${type})` })
      }
    }
    return options
  }

  return []
}

// Reset value when field changes
function onFieldChange(condition) {
  condition.operator = ''
  condition.value = ''
}

// Add new condition to group
function addCondition(groupIndex) {
  filters.value.groups[groupIndex].conditions.push({
    field: '',
    operator: '',
    value: ''
  })
}

// Remove condition
function removeCondition(groupIndex, condIndex) {
  filters.value.groups[groupIndex].conditions.splice(condIndex, 1)
}

// Add new group
function addGroup() {
  filters.value.groups.push({
    logic: 'AND',
    conditions: [{ field: '', operator: '', value: '' }]
  })
}

// Remove group
function removeGroup(groupIndex) {
  filters.value.groups.splice(groupIndex, 1)
}

// Check if there are locked operators
const hasLockedOperators = computed(() => {
  return props.operators.some(op => !op.available)
})

// Initialize with default structure if empty
watch(() => props.modelValue, (newVal) => {
  if (!newVal || !newVal.groups || newVal.groups.length === 0) {
    emit('update:modelValue', {
      logic: 'AND',
      groups: [{ logic: 'AND', conditions: [{ field: '', operator: '', value: '' }] }]
    })
  }
}, { immediate: true })
</script>

<style scoped>
.filter-builder {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.main-logic {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f3f4f6;
  border-radius: 8px;
}

.logic-label {
  font-size: 0.9rem;
  color: #374151;
}

.logic-toggle {
  display: flex;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}

.logic-toggle button {
  padding: 0.5rem 1rem;
  border: none;
  background: white;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.logic-toggle button:first-child {
  border-right: 1px solid #e5e7eb;
}

.logic-toggle button.active {
  background: #6366f1;
  color: white;
}

.logic-toggle.small button {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
}

.filter-groups {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filter-group {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.group-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
}

.group-logic {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.group-logic span {
  font-size: 0.8rem;
  color: #6b7280;
}

.remove-group-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-group-btn:hover {
  opacity: 1;
}

.conditions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.condition-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.field-select,
.operator-select,
.value-input {
  padding: 0.625rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
}

.field-select {
  flex: 2;
}

.operator-select {
  flex: 1.5;
}

.value-input {
  flex: 2;
}

.field-select:focus,
.operator-select:focus,
.value-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.field-select:disabled,
.operator-select:disabled,
.value-input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.no-value-placeholder {
  flex: 2;
  text-align: center;
  color: #9ca3af;
}

.remove-condition-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-condition-btn:hover {
  opacity: 1;
}

.add-condition-btn {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  background: white;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.add-condition-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.add-group-btn {
  align-self: flex-start;
  padding: 0.75rem 1.5rem;
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.add-group-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #eef2ff;
}

.upgrade-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #fef3c7;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #92400e;
}
</style>
