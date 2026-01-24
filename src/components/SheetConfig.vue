<template>
  <div class="space-y-4">
    <!-- Service account info -->
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <p class="text-sm text-blue-800 mb-2">
        <strong>Ważne:</strong> Udostępnij arkusz dla konta serwisowego:
      </p>
      <div
        class="flex items-center gap-2 bg-white rounded px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
        @click="copyEmail"
        :title="emailCopied ? 'Skopiowano!' : 'Kliknij aby skopiowac'"
      >
        <code class="text-xs text-gray-700 flex-1 truncate">{{ serviceAccountEmail }}</code>
        <span class="text-gray-400">
          <svg v-if="!emailCopied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <svg v-else class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </span>
      </div>
      <p class="text-xs text-blue-600 mt-1">Uprawnienia: Edytor</p>
    </div>

    <!-- Sheets list -->
    <div class="space-y-3">
      <div
        v-for="(sheet, index) in sheets"
        :key="index"
        class="p-4 bg-gray-50 border border-gray-200 rounded-lg"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-700">Arkusz {{ index + 1 }}</span>
          <button
            v-if="sheets.length > 1"
            type="button"
            class="text-gray-400 hover:text-red-500 transition-colors"
            @click="removeSheet(index)"
            title="Usuń"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- URL input -->
        <div class="mb-3">
          <label class="block text-xs font-medium text-gray-600 mb-1">URL arkusza</label>
          <div class="relative">
            <input
              v-model="sheet.sheet_url"
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              class="w-full px-3 py-2 pr-8 border rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              :class="{
                'border-green-400 bg-green-50': sheet.urlStatus === 'valid',
                'border-red-400 bg-red-50': sheet.urlStatus === 'invalid',
                'border-gray-200': !sheet.urlStatus
              }"
              @input="validateUrl(sheet)"
            />
            <span v-if="sheet.urlStatus === 'valid'" class="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </span>
            <span v-if="sheet.urlStatus === 'invalid'" class="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </span>
          </div>
          <p v-if="sheet.extractedGid" class="text-xs text-gray-500 mt-1">
            Zakładka: gid={{ sheet.extractedGid }}
          </p>
          <p v-if="sheet.urlStatus === 'invalid'" class="text-xs text-red-500 mt-1">
            Nieprawidłowy URL arkusza
          </p>
        </div>

        <!-- Write mode -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-2">Tryb zapisu</label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                v-model="sheet.write_mode"
                value="replace"
                class="w-4 h-4 text-blue-600"
              />
              <span class="text-sm text-gray-700">Zastąp</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                v-model="sheet.write_mode"
                value="append"
                class="w-4 h-4 text-blue-600"
              />
              <span class="text-sm text-gray-700">Dopisuj</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Add sheet button -->
    <button
      v-if="sheets.length < maxSheets"
      type="button"
      class="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
      @click="addSheet"
    >
      + Dodaj arkusz
    </button>

    <p v-if="sheets.length >= maxSheets" class="text-xs text-gray-400 text-center">
      Limit {{ maxSheets }} arkuszy
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [{
      sheet_url: '',
      write_mode: 'replace',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }]
  },
  serviceAccountEmail: {
    type: String,
    default: 'live-sales-worker@livesales-483523.iam.gserviceaccount.com'
  },
  maxSheets: {
    type: Number,
    default: 3
  }
})

const emit = defineEmits(['update:modelValue', 'url-change'])

const emailCopied = ref(false)

const sheets = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Copy service account email
function copyEmail() {
  navigator.clipboard.writeText(props.serviceAccountEmail)
  emailCopied.value = true
  setTimeout(() => {
    emailCopied.value = false
  }, 2000)
}

// Validate Google Sheets URL and extract ID + GID
function validateUrl(sheet) {
  const url = sheet.sheet_url
  if (!url) {
    sheet.urlStatus = null
    sheet.extractedId = null
    sheet.extractedGid = null
    emit('url-change')
    return
  }

  // Pattern: https://docs.google.com/spreadsheets/d/{spreadsheetId}/...
  const idRegex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  const idMatch = url.match(idRegex)

  // Pattern for GID: ?gid=123 or #gid=123
  const gidRegex = /[?#]gid=(\d+)/
  const gidMatch = url.match(gidRegex)

  if (idMatch) {
    sheet.urlStatus = 'valid'
    sheet.extractedId = idMatch[1]
    sheet.extractedGid = gidMatch ? gidMatch[1] : null
  } else {
    sheet.urlStatus = 'invalid'
    sheet.extractedId = null
    sheet.extractedGid = null
  }

  emit('url-change')
}

// Add new sheet
function addSheet() {
  sheets.value = [
    ...sheets.value,
    {
      sheet_url: '',
      write_mode: 'replace',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }
  ]
}

// Remove sheet
function removeSheet(index) {
  const newSheets = [...sheets.value]
  newSheets.splice(index, 1)
  sheets.value = newSheets
  emit('url-change')
}

// Initialize with default if empty
watch(() => props.modelValue, (newVal) => {
  if (!newVal || newVal.length === 0) {
    emit('update:modelValue', [{
      sheet_url: '',
      write_mode: 'replace',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }])
  }
}, { immediate: true })
</script>
