<template>
  <div class="flex flex-wrap items-center gap-2">
    <!-- Preset buttons -->
    <div class="flex flex-wrap gap-1">
      <button
        v-for="preset in presets"
        :key="preset.value"
        @click="selectPreset(preset.value)"
        :class="[
          'px-3 py-1.5 text-sm rounded-md transition-colors',
          modelValue.type === preset.value
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
        ]"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- Custom date inputs (shown when custom is selected) -->
    <div v-if="modelValue.type === 'custom'" class="flex items-center gap-2">
      <input
        type="date"
        :value="modelValue.from"
        @input="updateCustomDate('from', $event.target.value)"
        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <span class="text-gray-500 dark:text-gray-400">-</span>
      <input
        type="date"
        :value="modelValue.to"
        @input="updateCustomDate('to', $event.target.value)"
        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ type: 'last_30_days', from: null, to: null })
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const presets = [
  { value: 'last_7_days', label: '7 dni' },
  { value: 'last_30_days', label: '30 dni' },
  { value: 'last_90_days', label: '90 dni' },
  { value: 'this_month', label: 'Ten miesiąc' },
  { value: 'last_month', label: 'Poprzedni miesiąc' },
  { value: 'custom', label: 'Własny zakres' }
]

function selectPreset(type) {
  let from = null
  let to = null

  if (type === 'custom') {
    // Set default custom range to last 30 days
    const now = new Date()
    to = now.toISOString().split('T')[0]
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  }

  const newValue = { type, from, to }
  emit('update:modelValue', newValue)
  emit('change', newValue)
}

function updateCustomDate(field, value) {
  const newValue = {
    ...props.modelValue,
    [field]: value
  }
  emit('update:modelValue', newValue)
  emit('change', newValue)
}
</script>
