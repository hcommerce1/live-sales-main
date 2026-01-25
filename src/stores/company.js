/**
 * Company Store - Pinia store for company and subscription management
 *
 * Handles:
 * - Current company context (single company per user)
 * - Subscription and billing status
 * - Plan capabilities
 * - Trial status
 * - Team members
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API } from '../api'

export const useCompanyStore = defineStore('company', () => {
  // ============================================
  // STATE
  // ============================================

  const current = ref(null) // User's company
  const subscription = ref(null)
  const plan = ref(null)
  const trialStatus = ref(null)
  const teamMembers = ref([])
  const pendingInvitations = ref([])
  const myRole = ref(null)

  const isLoading = ref(false)
  const error = ref(null)

  // ============================================
  // GETTERS
  // ============================================

  const isCompanySelected = computed(() => !!current.value)

  const companyId = computed(() => current.value?.id)

  const companyName = computed(() => current.value?.name || '')

  const isOwner = computed(() => myRole.value === 'owner')

  const isAdmin = computed(() => myRole.value === 'admin' || myRole.value === 'owner')

  const canManageTeam = computed(() => isAdmin.value)

  const canManageBilling = computed(() => isAdmin.value)

  const subscriptionStatus = computed(() => {
    if (!subscription.value) return 'none'
    return subscription.value.status
  })

  const isTrialing = computed(() => subscriptionStatus.value === 'trialing')

  const isActive = computed(
    () => subscriptionStatus.value === 'active' || subscriptionStatus.value === 'trialing'
  )

  const trialDaysLeft = computed(() => {
    if (!isTrialing.value || !subscription.value?.trialEnd) return 0
    const trialEnd = new Date(subscription.value.trialEnd)
    const now = new Date()
    const diffMs = trialEnd - now
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  })

  const planLimits = computed(() => {
    if (!plan.value) {
      return {
        exports: 1,
        teamMembers: 1,
        minScheduleMinutes: 60,
        features: [],
      }
    }
    return {
      exports: plan.value.limits?.exports || 1,
      teamMembers: plan.value.limits?.teamMembers || 1,
      minScheduleMinutes: plan.value.limits?.minScheduleMinutes || 60,
      features: plan.value.features || [],
    }
  })

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Load user's company
   */
  async function loadCompany() {
    error.value = null
    isLoading.value = true

    try {
      const response = await API.company.getMyCompanies()
      const companies = response.data?.companies || response.companies || []

      if (companies.length > 0) {
        const companyId = companies[0].id
        const details = await API.company.get(companyId)

        if (details.success && details.data) {
          current.value = details.data.company
          subscription.value = details.data.subscription
          myRole.value = details.data.myRole

          // Fetch additional data
          await Promise.all([fetchSubscription(), fetchTeam()])
        }
      } else {
        current.value = null
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to load company:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch subscription details
   */
  async function fetchSubscription() {
    if (!current.value) return

    try {
      const response = await API.billing.getSubscription()
      if (response.success) {
        subscription.value = response.subscription
        plan.value = response.plan
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err)
    }
  }

  /**
   * Fetch trial status
   */
  async function fetchTrialStatus() {
    if (!current.value) return

    try {
      const response = await API.billing.getTrialStatus()
      if (response.success) {
        trialStatus.value = {
          enabled: response.trialEnabled,
          status: response.trialStatus,
          eligible: response.eligibleForTrial,
          reason: response.eligibilityReason,
        }
      }
    } catch (err) {
      console.error('Failed to fetch trial status:', err)
    }
  }

  /**
   * Start trial
   */
  async function startTrial() {
    if (!current.value) throw new Error('No company selected')

    const response = await API.billing.startTrial()
    if (response.success) {
      subscription.value = response.subscription
      await fetchSubscription()
    }
    return response
  }

  /**
   * Fetch team members
   */
  async function fetchTeam() {
    if (!current.value) return

    try {
      const response = await API.team.getMembers()
      if (response.success && response.data) {
        teamMembers.value = response.data.members || []
      }
    } catch (err) {
      console.error('Failed to fetch team:', err)
    }
  }

  /**
   * Fetch pending invitations
   */
  async function fetchPendingInvitations() {
    if (!current.value) return

    try {
      const response = await API.team.getPending()
      if (response.success && response.data) {
        pendingInvitations.value = response.data.invitations || []
      }
    } catch (err) {
      console.error('Failed to fetch pending invitations:', err)
    }
  }

  /**
   * Invite team member
   */
  async function inviteMember(email, role = 'member') {
    const response = await API.team.invite(email, role)
    if (response.success) {
      await fetchPendingInvitations()
    }
    return response
  }

  /**
   * Remove team member
   */
  async function removeMember(memberId) {
    const response = await API.team.remove(memberId)
    if (response.success) {
      await fetchTeam()
    }
    return response
  }

  /**
   * Change member role
   */
  async function changeMemberRole(memberId, newRole) {
    const response = await API.team.changeRole(memberId, newRole)
    if (response.success) {
      await fetchTeam()
    }
    return response
  }

  /**
   * Cancel invitation
   */
  async function cancelInvitation(token) {
    const response = await API.team.cancelInvitation(token)
    if (response.success) {
      await fetchPendingInvitations()
    }
    return response
  }

  /**
   * Create checkout session
   */
  async function createCheckout(planId, interval = 'monthly') {
    return API.billing.checkout(planId, interval)
  }

  /**
   * Create billing portal session
   */
  async function openBillingPortal() {
    const response = await API.billing.getPortal()
    if (response.success && response.url) {
      window.location.href = response.url
    }
    return response
  }

  /**
   * Update company info
   */
  async function updateCompany(data) {
    if (!current.value) throw new Error('No company selected')

    const response = await API.company.update(current.value.id, data)
    if (response.success && response.data) {
      current.value = { ...current.value, ...response.data.company }
    }
    return response
  }

  /**
   * Reset store to initial state
   */
  function $reset() {
    current.value = null
    subscription.value = null
    plan.value = null
    trialStatus.value = null
    teamMembers.value = []
    pendingInvitations.value = []
    myRole.value = null
    isLoading.value = false
    error.value = null
  }

  return {
    // State
    current,
    subscription,
    plan,
    trialStatus,
    teamMembers,
    pendingInvitations,
    myRole,
    isLoading,
    error,

    // Getters
    isCompanySelected,
    companyId,
    companyName,
    isOwner,
    isAdmin,
    canManageTeam,
    canManageBilling,
    subscriptionStatus,
    isTrialing,
    isActive,
    trialDaysLeft,
    planLimits,

    // Actions
    loadCompany,
    fetchSubscription,
    fetchTrialStatus,
    startTrial,
    fetchTeam,
    fetchPendingInvitations,
    inviteMember,
    removeMember,
    changeMemberRole,
    cancelInvitation,
    createCheckout,
    openBillingPortal,
    updateCompany,
    $reset,
  }
})
