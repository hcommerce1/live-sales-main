/**
 * Exports Store - Pinia store for export management
 *
 * Handles:
 * - Export list and CRUD operations
 * - Running exports
 * - Tracking last sync time
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API } from '../api'

export const useExportsStore = defineStore('exports', () => {
  // ============================================
  // STATE
  // ============================================

  const list = ref([])
  const isLoading = ref(false)
  const lastSyncTime = ref(null)
  const error = ref(null)

  // ============================================
  // GETTERS
  // ============================================

  const activeExports = computed(() =>
    list.value.filter((e) => e.status === 'active')
  )

  const pausedExports = computed(() =>
    list.value.filter((e) => e.status === 'paused')
  )

  const exportCount = computed(() => list.value.length)

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Fetch all exports from API
   */
  async function fetchAll() {
    isLoading.value = true
    error.value = null

    try {
      const data = await API.exports.getAll()
      list.value = data || []
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch exports:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get single export by ID
   */
  async function get(id) {
    try {
      return await API.exports.get(id)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Run export with cryptographically secure runId
   *
   * Returns result object with cached/inProgress/stale flags:
   * - cached: true if this was a duplicate request (same runId already processed)
   * - inProgress: true if export is still running
   * - stale: true if pending > 15 min (may indicate stuck export)
   *
   * @param {string} exportId - Export ID to run
   * @param {string} trigger - Trigger source ('manual', 'scheduler')
   * @returns {Promise<{success, cached, inProgress, stale, result}>}
   */
  async function run(exportId, trigger = 'manual') {
    isLoading.value = true
    error.value = null

    // Generate cryptographically secure UUID for idempotency
    const runId = crypto.randomUUID()

    try {
      const response = await API.exports.run(exportId, { runId, trigger })
      lastSyncTime.value = new Date()

      // Refresh list to get updated data
      await fetchAll()

      // Return full response so UI can handle cached/inProgress appropriately
      // UI should NOT show "Zapisano X rekordów" when cached=true
      return {
        success: response.success,
        cached: response.cached || false,
        inProgress: response.inProgress || false,
        stale: response.stale || false,
        message: response.message,
        result: response.result
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Save export configuration (create or update)
   */
  async function save(config) {
    isLoading.value = true
    error.value = null

    try {
      const result = await API.exports.save(config)
      await fetchAll()
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Delete export
   */
  async function remove(exportId) {
    isLoading.value = true
    error.value = null

    try {
      await API.exports.delete(exportId)
      await fetchAll()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Toggle export status (active/paused)
   */
  async function toggle(exportId) {
    error.value = null

    try {
      await API.exports.toggle(exportId)
      await fetchAll()
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Get export stats
   */
  async function getStats(exportId) {
    try {
      return await API.exports.getStats(exportId)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Get export run history
   */
  async function getRunHistory(exportId, limit = 10) {
    try {
      return await API.exports.getRunHistory(exportId, limit)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  /**
   * Reset store to initial state
   */
  function $reset() {
    list.value = []
    isLoading.value = false
    lastSyncTime.value = null
    error.value = null
  }

  return {
    // State
    list,
    isLoading,
    lastSyncTime,
    error,

    // Getters
    activeExports,
    pausedExports,
    exportCount,

    // Actions
    fetchAll,
    get,
    run,
    save,
    remove,
    toggle,
    getStats,
    getRunHistory,
    $reset,
  }
})
