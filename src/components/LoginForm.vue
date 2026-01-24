<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-20 h-20 mx-auto mb-4">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect fill="white" width="100" height="100" rx="20"/>
            <text x="50" y="72" font-size="55" font-weight="bold" fill="#2563eb" text-anchor="middle" font-family="Arial, sans-serif">LS</text>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Live Sales</h1>
        <p class="text-blue-200 mt-1">Automatyczny eksport danych</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-2xl shadow-2xl p-8">
        <!-- Login Form -->
        <form v-if="mode === 'login'" @submit.prevent="handleLogin">
          <h2 class="text-xl font-semibold text-gray-900 mb-6">Zaloguj się</h2>

          <!-- Error Alert -->
          <div
            v-if="error"
            class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
          >
            <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p class="text-sm text-red-700">{{ error }}</p>
              <p v-if="isLockedOut" class="text-xs text-red-600 mt-1">
                Konto tymczasowo zablokowane. Spróbuj ponownie za {{ lockoutMinutes }} minut.
              </p>
            </div>
          </div>

          <!-- Email Field -->
          <div class="mb-4">
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              :disabled="isLoading"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-gray-100"
              placeholder="twoj@email.pl"
            />
          </div>

          <!-- Password Field -->
          <div class="mb-6">
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Hasło
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                :disabled="isLoading"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-gray-100 pr-12"
                placeholder="Twoje hasło"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                <svg v-if="showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="isLoading" class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ isLoading ? 'Logowanie...' : 'Zaloguj się' }}</span>
          </button>

          <!-- Register Link -->
          <p class="mt-6 text-center text-sm text-gray-600">
            Nie masz jeszcze konta?
            <a href="/login.html" class="text-blue-600 hover:text-blue-700 font-medium">
              Zarejestruj się
            </a>
          </p>
        </form>

        <!-- 2FA Form -->
        <form v-else-if="mode === '2fa'" @submit.prevent="handle2FAVerify">
          <div class="text-center mb-6">
            <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900">Weryfikacja dwuetapowa</h2>
            <p class="text-gray-600 mt-2">
              Wpisz 6-cyfrowy kod wysłany na Twój adres email
            </p>
          </div>

          <!-- Error Alert -->
          <div
            v-if="error"
            class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
          >
            <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-red-700">{{ error }}</p>
          </div>

          <!-- 2FA Code Input -->
          <div class="mb-6">
            <label for="code" class="block text-sm font-medium text-gray-700 mb-1">
              Kod weryfikacyjny
            </label>
            <input
              id="code"
              v-model="twoFactorCode"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              required
              :disabled="isLoading"
              class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-gray-100"
              placeholder="000000"
              autocomplete="one-time-code"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading || twoFactorCode.length !== 6"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="isLoading" class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ isLoading ? 'Weryfikacja...' : 'Zweryfikuj' }}</span>
          </button>

          <!-- Back to Login -->
          <button
            type="button"
            @click="cancelLogin"
            class="w-full mt-4 py-3 px-4 text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Anuluj i wróć do logowania
          </button>

          <!-- Resend Code Info -->
          <p class="mt-4 text-center text-sm text-gray-500">
            Kod wygasa po 10 minutach
          </p>
        </form>
      </div>

      <!-- Footer -->
      <p class="text-center text-blue-200 text-sm mt-8">
        &copy; {{ new Date().getFullYear() }} Live Sales. Wszelkie prawa zastrzeżone.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  initialMode: {
    type: String,
    default: 'login',
    validator: (value) => ['login', '2fa'].includes(value)
  }
})

const authStore = useAuthStore()

// Form state
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const twoFactorCode = ref('')
const mode = ref(props.initialMode)

// Computed from store
const isLoading = computed(() => authStore.isLoading)
const error = computed(() => authStore.error)

const isLockedOut = computed(() => {
  return error.value && error.value.includes('zablokowane')
})

const lockoutMinutes = computed(() => {
  if (!isLockedOut.value) return 0
  // Extract minutes from error message if present
  const match = error.value?.match(/(\d+)\s*minut/)
  return match ? parseInt(match[1]) : 15
})

onMounted(() => {
  // Set mode based on auth state
  if (authStore.authState === '2FA_REQUIRED') {
    mode.value = '2fa'
  }
})

async function handleLogin() {
  try {
    const result = await authStore.login(email.value, password.value)

    if (result.requires2FA) {
      mode.value = '2fa'
    }
    // If successful without 2FA, authState will change to AUTHENTICATED
    // and App.vue will show main content
  } catch (err) {
    // Error is already stored in authStore.error
    console.error('Login failed:', err)
  }
}

async function handle2FAVerify() {
  try {
    await authStore.verify2FA(twoFactorCode.value)
    // If successful, authState will change to AUTHENTICATED
  } catch (err) {
    // Error is already stored in authStore.error
    console.error('2FA verification failed:', err)
    twoFactorCode.value = '' // Clear code on error
  }
}

function cancelLogin() {
  // Reset state and go back to login
  authStore.$reset()
  mode.value = 'login'
  email.value = ''
  password.value = ''
  twoFactorCode.value = ''
}
</script>
