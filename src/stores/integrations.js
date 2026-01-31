/**
 * Integrations Store - Pinia store for integration management
 *
 * Handles:
 * - BaseLinker integration status
 * - Google Sheets integration status
 * - Connection testing
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API } from '../api'

export const useIntegrationsStore = defineStore('integrations', () => {
  // ============================================
  // STATE
  // ============================================

  const baselinker = ref({
    configured: false,
    connected: null, // null = not tested, true/false = test result
    lastChecked: null,
    lastUsedAt: null,
    error: null,
  })

  const googleSheets = ref({
    configured: false,
    connected: null,
    lastChecked: null,
    lastUsedAt: null,
    error: null,
  })

  const isTestingConnection = ref(false)
  const error = ref(null)

  // ============================================
  // GETTERS
  // ============================================

  const baselinkerStatus = computed(() => {
    const bl = baselinker.value
    if (!bl.configured) {
      return { text: 'Nieskonfigurowane', class: 'text-gray-500', icon: 'circle' }
    }
    if (bl.connected === true) {
      return { text: 'Połączone', class: 'text-green-600', icon: 'check-circle' }
    }
    if (bl.connected === false) {
      return {
        text: 'Błąd: ' + (bl.error || 'Brak połączenia'),
        class: 'text-red-600',
        icon: 'x-circle',
      }
    }
    return { text: 'Skonfigurowane', class: 'text-blue-600', icon: 'circle' }
  })

  const googleSheetsStatus = computed(() => {
    const gs = googleSheets.value
    if (!gs.configured) {
      return { text: 'Nieskonfigurowane', class: 'text-gray-500', icon: 'circle' }
    }
    if (gs.connected === true) {
      return { text: 'Połączone', class: 'text-green-600', icon: 'check-circle' }
    }
    if (gs.connected === false) {
      return {
        text: 'Błąd: ' + (gs.error || 'Brak połączenia'),
        class: 'text-red-600',
        icon: 'x-circle',
      }
    }
    return { text: 'Skonfigurowane', class: 'text-blue-600', icon: 'circle' }
  })

  const isConfigured = computed(() =>
    baselinker.value.configured || googleSheets.value.configured
  )

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Fetch status of all integrations
   */
  async function fetchStatus() {
    error.value = null

    try {
      const response = await API.integrations.getStatus()
      if (response.success && response.data) {
        baselinker.value = {
          ...baselinker.value,
          ...response.data.baselinker,
        }
        googleSheets.value = {
          ...googleSheets.value,
          ...response.data.googleSheets,
        }
      }
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Save BaseLinker token
   * Note: Token is NOT stored in state - only sent to API
   */
  async function saveBaselinkerToken(token) {
    error.value = null

    try {
      const response = await API.integrations.saveBaselinkerToken(token)

      // Refresh status after saving
      await fetchStatus()

      // Mark as connected after successful save
      baselinker.value.connected = true
      baselinker.value.lastChecked = new Date().toISOString()

      return response
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Test BaseLinker connection
   */
  async function testBaselinker() {
    isTestingConnection.value = true
    error.value = null

    try {
      const result = await API.integrations.testBaselinker()

      if (result.success && result.data) {
        baselinker.value.connected = result.data.connected
        baselinker.value.error = result.data.error || null
        baselinker.value.lastChecked = new Date().toISOString()
      }

      return result.data
    } catch (err) {
      baselinker.value.connected = false
      baselinker.value.error = err.message
      error.value = err.message
      throw err
    } finally {
      isTestingConnection.value = false
    }
  }

  /**
   * Remove BaseLinker integration
   */
  async function removeBaselinker() {
    error.value = null

    try {
      await API.integrations.removeBaselinker()

      // Reset state
      baselinker.value = {
        configured: false,
        connected: null,
        lastChecked: null,
        lastUsedAt: null,
        error: null,
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Reset store to initial state
   */
  function $reset() {
    baselinker.value = {
      configured: false,
      connected: null,
      lastChecked: null,
      lastUsedAt: null,
      error: null,
    }
    googleSheets.value = {
      configured: false,
      connected: null,
      lastChecked: null,
      lastUsedAt: null,
      error: null,
    }
    isTestingConnection.value = false
    error.value = null
  }

  return {
    // State
    baselinker,
    googleSheets,
    isTestingConnection,
    error,

    // Getters
    baselinkerStatus,
    googleSheetsStatus,
    isConfigured,

    // Actions
    fetchStatus,
    saveBaselinkerToken,
    testBaselinker,
    removeBaselinker,
    $reset,
  }
})
