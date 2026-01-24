<template>
  <div class="space-y-8">
    <!-- Change Password Section -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        Zmiana hasła
      </h3>

      <!-- Success Message -->
      <div
        v-if="passwordSuccess"
        class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3"
      >
        <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-green-700">Hasło zostało zmienione pomyślnie</p>
      </div>

      <!-- Error Message -->
      <div
        v-if="passwordError"
        class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3"
      >
        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-red-700">{{ passwordError }}</p>
      </div>

      <form @submit.prevent="handlePasswordChange" class="space-y-4">
        <div>
          <label for="currentPassword" class="block text-sm font-medium text-gray-700 mb-1">
            Obecne hasło
          </label>
          <input
            id="currentPassword"
            v-model="passwordForm.current"
            type="password"
            required
            :disabled="passwordLoading"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Wpisz obecne hasło"
          />
        </div>

        <div>
          <label for="newPassword" class="block text-sm font-medium text-gray-700 mb-1">
            Nowe hasło
          </label>
          <input
            id="newPassword"
            v-model="passwordForm.new"
            type="password"
            required
            minlength="12"
            :disabled="passwordLoading"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Min. 12 znaków"
          />
          <p class="mt-1 text-xs text-gray-500">
            Hasło musi mieć co najmniej 12 znaków
          </p>
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
            Potwierdź nowe hasło
          </label>
          <input
            id="confirmPassword"
            v-model="passwordForm.confirm"
            type="password"
            required
            :disabled="passwordLoading"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Powtórz nowe hasło"
          />
          <p
            v-if="passwordForm.new && passwordForm.confirm && passwordForm.new !== passwordForm.confirm"
            class="mt-1 text-xs text-red-500"
          >
            Hasła nie są identyczne
          </p>
        </div>

        <button
          type="submit"
          :disabled="passwordLoading || !canSubmitPassword"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg v-if="passwordLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{{ passwordLoading ? 'Zmieniam...' : 'Zmień hasło' }}</span>
        </button>
      </form>
    </div>

    <!-- Two-Factor Authentication Section -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Weryfikacja dwuetapowa (2FA)
        </h3>
        <span
          :class="[
            'px-3 py-1 text-sm font-medium rounded-full',
            twoFactorEnabled
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          ]"
        >
          {{ twoFactorEnabled ? 'Włączone' : 'Wyłączone' }}
        </span>
      </div>

      <p class="text-gray-600 mb-6">
        Dodatkowa warstwa bezpieczeństwa. Po włączeniu, przy każdym logowaniu otrzymasz kod weryfikacyjny na swój adres email.
      </p>

      <!-- 2FA Success Message -->
      <div
        v-if="twoFactorSuccess"
        class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3"
      >
        <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-green-700">{{ twoFactorSuccess }}</p>
      </div>

      <!-- 2FA Error Message -->
      <div
        v-if="twoFactorError"
        class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3"
      >
        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-red-700">{{ twoFactorError }}</p>
      </div>

      <!-- Enable 2FA Flow -->
      <template v-if="!twoFactorEnabled">
        <!-- Step 1: Request Enable -->
        <div v-if="twoFactorStep === 'idle'">
          <button
            @click="startEnable2FA"
            :disabled="twoFactorLoading"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg v-if="twoFactorLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ twoFactorLoading ? 'Wysyłam kod...' : 'Włącz 2FA' }}</span>
          </button>
        </div>

        <!-- Step 2: Confirm with code -->
        <div v-else-if="twoFactorStep === 'confirm-enable'">
          <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
            <p class="text-sm text-blue-700">
              Kod weryfikacyjny został wysłany na Twój adres email. Wpisz go poniżej, aby włączyć 2FA.
            </p>
          </div>

          <form @submit.prevent="confirmEnable2FA" class="space-y-4">
            <div>
              <label for="enable2faCode" class="block text-sm font-medium text-gray-700 mb-1">
                Kod weryfikacyjny
              </label>
              <input
                id="enable2faCode"
                v-model="twoFactorCode"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="6"
                required
                :disabled="twoFactorLoading"
                class="w-full max-w-xs px-4 py-2 text-center text-xl font-mono tracking-[0.3em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="000000"
              />
            </div>

            <div class="flex gap-3">
              <button
                type="submit"
                :disabled="twoFactorLoading || twoFactorCode.length !== 6"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg v-if="twoFactorLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ twoFactorLoading ? 'Weryfikuję...' : 'Potwierdź' }}</span>
              </button>
              <button
                type="button"
                @click="cancelTwoFactorFlow"
                class="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      </template>

      <!-- Disable 2FA Flow -->
      <template v-else>
        <!-- Step 1: Request Disable -->
        <div v-if="twoFactorStep === 'idle'">
          <button
            @click="startDisable2FA"
            :disabled="twoFactorLoading"
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:bg-red-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg v-if="twoFactorLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ twoFactorLoading ? 'Wysyłam kod...' : 'Wyłącz 2FA' }}</span>
          </button>
        </div>

        <!-- Step 2: Confirm disable with code -->
        <div v-else-if="twoFactorStep === 'confirm-disable'">
          <div class="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
            <p class="text-sm text-amber-700">
              Kod weryfikacyjny został wysłany na Twój adres email. Wpisz go poniżej, aby wyłączyć 2FA.
            </p>
          </div>

          <form @submit.prevent="confirmDisable2FA" class="space-y-4">
            <div>
              <label for="disable2faCode" class="block text-sm font-medium text-gray-700 mb-1">
                Kod weryfikacyjny
              </label>
              <input
                id="disable2faCode"
                v-model="twoFactorCode"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="6"
                required
                :disabled="twoFactorLoading"
                class="w-full max-w-xs px-4 py-2 text-center text-xl font-mono tracking-[0.3em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="000000"
              />
            </div>

            <div class="flex gap-3">
              <button
                type="submit"
                :disabled="twoFactorLoading || twoFactorCode.length !== 6"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:bg-red-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg v-if="twoFactorLoading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ twoFactorLoading ? 'Wyłączam...' : 'Wyłącz 2FA' }}</span>
              </button>
              <button
                type="button"
                @click="cancelTwoFactorFlow"
                class="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      </template>
    </div>

    <!-- Account Sessions Section (Future) -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 opacity-60">
      <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Aktywne sesje
      </h3>
      <p class="text-gray-500 text-sm">
        Funkcja zarządzania sesjami będzie dostępna wkrótce.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

// Password change state
const passwordForm = ref({
  current: '',
  new: '',
  confirm: ''
})
const passwordLoading = ref(false)
const passwordError = ref(null)
const passwordSuccess = ref(false)

// 2FA state
const twoFactorStep = ref('idle') // 'idle', 'confirm-enable', 'confirm-disable'
const twoFactorCode = ref('')
const twoFactorLoading = ref(false)
const twoFactorError = ref(null)
const twoFactorSuccess = ref(null)

// Computed
const twoFactorEnabled = computed(() => authStore.twoFactorEnabled)

const canSubmitPassword = computed(() => {
  return (
    passwordForm.value.current &&
    passwordForm.value.new &&
    passwordForm.value.confirm &&
    passwordForm.value.new.length >= 12 &&
    passwordForm.value.new === passwordForm.value.confirm
  )
})

// Password change
async function handlePasswordChange() {
  if (!canSubmitPassword.value) return

  passwordLoading.value = true
  passwordError.value = null
  passwordSuccess.value = false

  try {
    await authStore.changePassword(
      passwordForm.value.current,
      passwordForm.value.new
    )

    passwordSuccess.value = true
    passwordForm.value = { current: '', new: '', confirm: '' }

    // Auto-hide success after 5 seconds
    setTimeout(() => {
      passwordSuccess.value = false
    }, 5000)
  } catch (err) {
    passwordError.value = err.message || 'Nie udało się zmienić hasła'
  } finally {
    passwordLoading.value = false
  }
}

// 2FA Enable flow
async function startEnable2FA() {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    await authStore.enable2FA()
    twoFactorStep.value = 'confirm-enable'
  } catch (err) {
    twoFactorError.value = err.message || 'Nie udało się wysłać kodu'
  } finally {
    twoFactorLoading.value = false
  }
}

async function confirmEnable2FA() {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    await authStore.confirm2FAEnable(twoFactorCode.value)
    twoFactorSuccess.value = 'Weryfikacja dwuetapowa została włączona'
    twoFactorStep.value = 'idle'
    twoFactorCode.value = ''

    // Auto-hide success after 5 seconds
    setTimeout(() => {
      twoFactorSuccess.value = null
    }, 5000)
  } catch (err) {
    twoFactorError.value = err.message || 'Nieprawidłowy kod'
    twoFactorCode.value = ''
  } finally {
    twoFactorLoading.value = false
  }
}

// 2FA Disable flow
async function startDisable2FA() {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    await authStore.request2FADisable()
    twoFactorStep.value = 'confirm-disable'
  } catch (err) {
    twoFactorError.value = err.message || 'Nie udało się wysłać kodu'
  } finally {
    twoFactorLoading.value = false
  }
}

async function confirmDisable2FA() {
  twoFactorLoading.value = true
  twoFactorError.value = null

  try {
    await authStore.confirm2FADisable(twoFactorCode.value)
    twoFactorSuccess.value = 'Weryfikacja dwuetapowa została wyłączona'
    twoFactorStep.value = 'idle'
    twoFactorCode.value = ''

    // Auto-hide success after 5 seconds
    setTimeout(() => {
      twoFactorSuccess.value = null
    }, 5000)
  } catch (err) {
    twoFactorError.value = err.message || 'Nieprawidłowy kod'
    twoFactorCode.value = ''
  } finally {
    twoFactorLoading.value = false
  }
}

function cancelTwoFactorFlow() {
  twoFactorStep.value = 'idle'
  twoFactorCode.value = ''
  twoFactorError.value = null
}
</script>
