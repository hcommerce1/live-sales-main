/**
 * Auth Store - Pinia store for authentication state
 *
 * Handles:
 * - User authentication state
 * - Login/logout flow
 * - 2FA verification
 * - Password change
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API } from '../api'

export const useAuthStore = defineStore('auth', () => {
  // ============================================
  // STATE
  // ============================================

  // 'CHECKING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | '2FA_REQUIRED'
  const authState = ref('CHECKING')
  const user = ref(null)
  const tempToken = ref(null) // For 2FA flow
  const logoutInProgress = ref(false)
  const error = ref(null)

  // ============================================
  // GETTERS
  // ============================================

  const isAuthenticated = computed(() => authState.value === 'AUTHENTICATED')
  const hasTwoFactor = computed(() => user.value?.twoFactorEnabled || false)
  const isChecking = computed(() => authState.value === 'CHECKING')
  const requires2FA = computed(() => authState.value === '2FA_REQUIRED')

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Check if user is authenticated on app load
   */
  async function checkAuth() {
    authState.value = 'CHECKING'
    error.value = null

    try {
      const userData = await API.auth.getCurrentUser()
      user.value = userData
      authState.value = 'AUTHENTICATED'
      return true
    } catch (err) {
      user.value = null
      authState.value = 'UNAUTHENTICATED'
      API.clearAuth()
      return false
    }
  }

  /**
   * Login user
   * @returns {Object} { success: boolean, requires2FA?: boolean }
   */
  async function login(email, password) {
    error.value = null

    try {
      const response = await API.auth.login(email, password)

      if (response.requires2FA) {
        tempToken.value = response.tempToken
        authState.value = '2FA_REQUIRED'
        return { requires2FA: true, message: response.message }
      }

      // Normal login success
      user.value = response.user
      authState.value = 'AUTHENTICATED'
      return { success: true }
    } catch (err) {
      error.value = err.message || 'Błąd logowania'
      throw err
    }
  }

  /**
   * Verify 2FA code during login
   */
  async function verify2FA(code) {
    error.value = null

    try {
      const response = await API.auth.verify2FALogin(code, tempToken.value)
      user.value = response.user
      tempToken.value = null
      authState.value = 'AUTHENTICATED'
      return { success: true }
    } catch (err) {
      error.value = err.message || 'Nieprawidłowy kod'
      throw err
    }
  }

  /**
   * Logout user and reset all stores
   */
  async function logout() {
    if (logoutInProgress.value) return
    logoutInProgress.value = true

    // 1. Immediately hide data (show loading)
    authState.value = 'CHECKING'

    // 2. API logout (ignore errors)
    try {
      await API.auth.logout()
    } catch (e) {
      // Ignore
    }

    // 3. Reset state
    $reset()

    logoutInProgress.value = false
  }

  /**
   * Change password
   * @returns {Promise} - Resolves on success, rejects on failure
   */
  async function changePassword(currentPassword, newPassword) {
    error.value = null

    try {
      await API.auth.changePassword(currentPassword, newPassword)
      // Backend invalidates all sessions - force logout
      await logout()
    } catch (err) {
      error.value = err.message || 'Zmiana hasła nie powiodła się'
      throw err
    }
  }

  /**
   * Enable 2FA - step 1 (request code)
   */
  async function enable2FA() {
    error.value = null
    try {
      const response = await API.auth.enable2FA()
      return response
    } catch (err) {
      error.value = err.message || 'Nie udało się wysłać kodu'
      throw err
    }
  }

  /**
   * Enable 2FA - step 2 (confirm with code)
   */
  async function confirm2FAEnable(code) {
    error.value = null
    try {
      await API.auth.confirm2FAEnable(code)
      // Update local user state
      if (user.value) {
        user.value = { ...user.value, twoFactorEnabled: true }
      }
      return { success: true }
    } catch (err) {
      error.value = err.message || 'Nieprawidłowy kod'
      throw err
    }
  }

  /**
   * Disable 2FA - step 1 (request code)
   */
  async function request2FADisable() {
    error.value = null
    try {
      const response = await API.auth.request2FADisable()
      return response
    } catch (err) {
      error.value = err.message || 'Nie udało się wysłać kodu'
      throw err
    }
  }

  /**
   * Disable 2FA - step 2 (confirm with code)
   */
  async function confirm2FADisable(code) {
    error.value = null
    try {
      await API.auth.confirm2FADisable(code)
      // Update local user state
      if (user.value) {
        user.value = { ...user.value, twoFactorEnabled: false }
      }
      return { success: true }
    } catch (err) {
      error.value = err.message || 'Nieprawidłowy kod'
      throw err
    }
  }

  /**
   * Reset store to initial state
   */
  function $reset() {
    authState.value = 'UNAUTHENTICATED'
    user.value = null
    tempToken.value = null
    logoutInProgress.value = false
    error.value = null
  }

  return {
    // State
    authState,
    user,
    tempToken,
    logoutInProgress,
    error,

    // Getters
    isAuthenticated,
    hasTwoFactor,
    isChecking,
    requires2FA,

    // Actions
    checkAuth,
    login,
    verify2FA,
    logout,
    changePassword,
    enable2FA,
    confirm2FAEnable,
    request2FADisable,
    confirm2FADisable,
    $reset,
  }
})
