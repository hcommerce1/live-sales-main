// Frontend API Client for Live Sales Backend

const API_BASE_URL = window.location.origin;

// Refresh token lock to prevent race conditions
let refreshPromise = null;

export const API = {
  /**
   * Get access token from localStorage
   */
  getAccessToken() {
    return localStorage.getItem('accessToken');
  },

  /**
   * Get refresh token from localStorage (LEGACY - now in httpOnly cookie)
   */
  getRefreshToken() {
    return localStorage.getItem('refreshToken');
  },

  /**
   * Set access token in localStorage (refresh token is in httpOnly cookie)
   */
  setAccessToken(accessToken) {
    localStorage.setItem('accessToken', accessToken);
  },

  /**
   * Set tokens in localStorage (for backward compatibility)
   */
  setTokens(accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    // refreshToken is now handled by httpOnly cookie
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  },

  /**
   * Clear tokens and user data
   */
  clearAuth() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  /**
   * Refresh access token (uses httpOnly cookie)
   * Uses lock to prevent multiple simultaneous refresh attempts (race condition fix)
   */
  async refreshAccessToken() {
    // If refresh is already in progress, wait for it
    if (refreshPromise) {
      return refreshPromise;
    }

    // Start new refresh
    refreshPromise = this._doRefresh();

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Clear lock after completion (success or failure)
      refreshPromise = null;
    }
  },

  /**
   * Internal refresh implementation
   */
  async _doRefresh() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // IMPORTANT: Send httpOnly cookie
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.setAccessToken(data.accessToken);
      return data.accessToken;
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  },

  /**
   * Make API request with automatic token refresh
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} - Response data
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    // Add authorization header if token exists
    const token = this.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token && !endpoint.startsWith('/api/auth/login') && !endpoint.startsWith('/api/auth/register')) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      headers,
      credentials: 'include', // IMPORTANT: Send/receive cookies
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      // If 401 and not an auth endpoint, try to refresh
      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        try {
          // Refresh token
          const newToken = await this.refreshAccessToken();

          // Retry original request with new token
          config.headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(url, config);
          const retryData = await retryResponse.json();

          if (!retryResponse.ok) {
            throw new Error(retryData.error || `HTTP error! status: ${retryResponse.status}`);
          }

          return retryData;
        } catch (refreshError) {
          // Refresh failed - clear auth but don't redirect (let Vue handle it)
          this.clearAuth();
          throw new Error('Session expired');
        }
      }

      if (!response.ok) {
        const error = new Error(data.error || `HTTP error! status: ${response.status}`);
        error.code = data.code;
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Authentication
   */
  auth: {
    // Login - handles 2FA flow
    async login(email, password) {
      const response = await API.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Check if 2FA is required
      if (response.requires2FA) {
        return {
          requires2FA: true,
          tempToken: response.tempToken,
          message: response.message,
        };
      }

      // Normal login - store access token (refresh is in httpOnly cookie)
      API.setAccessToken(response.accessToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response;
    },

    // Verify 2FA code during login
    async verify2FALogin(code, tempToken) {
      const response = await API.request('/api/auth/2fa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ code, tempToken }),
      });

      // Store tokens after successful 2FA
      API.setAccessToken(response.accessToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response;
    },

    // Register
    async register(email, password) {
      const response = await API.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      API.setAccessToken(response.accessToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response;
    },

    // Logout
    async logout() {
      try {
        await API.request('/api/auth/logout', {
          method: 'POST',
        });
      } catch {
        // Silent fail - still clear local auth
      } finally {
        API.clearAuth();
      }
    },

    // Get current user
    async getCurrentUser() {
      const response = await API.request('/api/auth/me');
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    },

    // Refresh token (explicit call)
    async refresh() {
      const response = await API.request('/api/auth/refresh', {
        method: 'POST',
      });
      if (response.accessToken) {
        API.setAccessToken(response.accessToken);
      }
      return response;
    },

    // Change password
    async changePassword(currentPassword, newPassword) {
      return API.request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },

    // Enable 2FA - step 1 (sends code to email)
    async enable2FA() {
      return API.request('/api/auth/2fa/enable', {
        method: 'POST',
      });
    },

    // Enable 2FA - step 2 (confirm with code)
    async confirm2FAEnable(code) {
      return API.request('/api/auth/2fa/confirm-enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },

    // Disable 2FA - step 1 (sends code to email)
    async request2FADisable() {
      return API.request('/api/auth/2fa/disable/request', {
        method: 'POST',
      });
    },

    // Disable 2FA - step 2 (confirm with code)
    async confirm2FADisable(code) {
      return API.request('/api/auth/2fa/disable/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },

    // Check if user is logged in
    isLoggedIn() {
      return !!API.getAccessToken();
    },

    // Get stored user data
    getUser() {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    },
  },

  /**
   * Export Management
   */
  exports: {
    // Get all exports
    async getAll() {
      const response = await API.request('/api/exports');
      return response.data || [];
    },

    // Get single export
    async get(id) {
      const response = await API.request(`/api/exports/${id}`);
      return response.data;
    },

    // Save export configuration
    async save(config) {
      const response = await API.request('/api/exports', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      return response.data;
    },

    // Delete export
    async delete(id) {
      const response = await API.request(`/api/exports/${id}`, {
        method: 'DELETE',
      });
      return response;
    },

    // Run export immediately with optional runId and trigger
    // Returns full response with cached/inProgress/stale flags
    async run(id, options = {}) {
      const response = await API.request(`/api/exports/${id}/run`, {
        method: 'POST',
        body: JSON.stringify(options),
      });

      // Return full response with deduplication info
      // { success, cached, inProgress, stale, message, result }
      return response;
    },

    // Toggle export status
    async toggle(id) {
      const response = await API.request(`/api/exports/${id}/toggle`, {
        method: 'POST',
      });
      return response.data;
    },

    // Get export stats
    async getStats(id) {
      const response = await API.request(`/api/exports/${id}/stats`);
      return response.data;
    },

    // Get field definitions for export wizard
    async getFieldDefinitions() {
      const response = await API.request('/api/exports/field-definitions');
      return response.data;
    },

    // Get export run history
    async getRunHistory(id, limit = 10) {
      const response = await API.request(`/api/exports/${id}/runs?limit=${limit}`);
      return response.data || [];
    },
  },

  /**
   * Integrations Management
   */
  integrations: {
    // Get all integrations status
    async getAll() {
      return API.request('/api/integrations');
    },

    // Get detailed status (for dashboard)
    async getStatus() {
      return API.request('/api/integrations/status');
    },

    // Get BaseLinker integration status
    async getBaselinker() {
      return API.request('/api/integrations/baselinker');
    },

    // Save BaseLinker token
    async saveBaselinkerToken(token) {
      return API.request('/api/integrations/baselinker', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },

    // Remove BaseLinker integration
    async removeBaselinker() {
      return API.request('/api/integrations/baselinker', {
        method: 'DELETE',
      });
    },

    // Test BaseLinker connection
    async testBaselinker(token = null) {
      const body = token ? JSON.stringify({ token }) : undefined;
      return API.request('/api/integrations/baselinker/test', {
        method: 'POST',
        body,
      });
    },
  },

  /**
   * Baselinker API
   */
  baselinker: {
    // Get orders
    async getOrders(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/orders?${params}`);
      return response.data || [];
    },

    // Get products
    async getProducts(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/products?${params}`);
      return response.data || [];
    },

    // Get order statuses
    async getOrderStatuses() {
      const response = await API.request('/api/baselinker/order-statuses');
      return response.data || [];
    },

    // Get order sources
    async getOrderSources() {
      const response = await API.request('/api/baselinker/order-sources');
      return response.data || {};
    },

    // Get inventories
    async getInventories() {
      const response = await API.request('/api/baselinker/inventories');
      return response.data || [];
    },

    // Get invoices
    async getInvoices(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/invoices?${params}`);
      return response.data || [];
    },

    // Get invoice file
    async getInvoiceFile(invoiceId) {
      const response = await API.request(`/api/baselinker/invoice/${invoiceId}/file`);
      return response.data;
    },

    // Get external storages (shops, wholesalers)
    async getExternalStorages() {
      const response = await API.request('/api/baselinker/external-storages');
      return response.data || [];
    },

    // Get Base Connect integrations (B2B)
    async getConnectIntegrations() {
      const response = await API.request('/api/baselinker/connect-integrations');
      return response.data || {};
    },
  },

  /**
   * Google Sheets API
   */
  sheets: {
    // Validate sheet URL
    async validate(sheetUrl) {
      const response = await API.request('/api/sheets/validate', {
        method: 'POST',
        body: JSON.stringify({ sheetUrl }),
      });
      return response;
    },

    // Write data to sheets
    async write(sheetUrl, headers, data, writeMode = 'append') {
      const response = await API.request('/api/sheets/write', {
        method: 'POST',
        body: JSON.stringify({ sheetUrl, headers, data, writeMode }),
      });
      return response.result;
    },

    // Read data from sheets
    async read(sheetUrl, range = 'A:Z') {
      const params = new URLSearchParams({ sheetUrl, range });
      const response = await API.request(`/api/sheets/read?${params}`);
      return response.data || [];
    },
  },

  /**
   * Health check
   */
  async health() {
    const response = await API.request('/health');
    return response;
  },

  // ============================================
  // COMPANY MODULE
  // ============================================
  company: {
    /**
     * Lookup NIP (public - no auth required)
     */
    async lookupNip(nip) {
      return API.request('/api/company/lookup-nip', {
        method: 'POST',
        body: JSON.stringify({ nip }),
      });
    },

    /**
     * Register company with owner account (public)
     */
    async register(data) {
      return API.request('/api/company/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Check if NIP exists (public)
     */
    async checkNip(nip) {
      return API.request(`/api/company/check-nip/${nip}`);
    },

    /**
     * Get all companies user belongs to
     */
    async getMyCompanies() {
      return API.request('/api/company/my-companies');
    },

    /**
     * Get company details
     */
    async get(companyId) {
      return API.request(`/api/company/${companyId}`);
    },

    /**
     * Update company
     */
    async update(companyId, data) {
      return API.request(`/api/company/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete company (soft delete)
     */
    async delete(companyId) {
      return API.request(`/api/company/${companyId}`, {
        method: 'DELETE',
      });
    },
  },

  // ============================================
  // TEAM MODULE
  // ============================================
  team: {
    /**
     * Get team members
     */
    async getMembers() {
      return API.request('/api/team');
    },

    /**
     * Get pending invitations
     */
    async getPending() {
      return API.request('/api/team/pending');
    },

    /**
     * Invite member
     */
    async invite(email, role = 'member') {
      return API.request('/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
    },

    /**
     * Accept invitation
     */
    async acceptInvitation(token) {
      return API.request(`/api/team/invitations/${token}/accept`, {
        method: 'POST',
      });
    },

    /**
     * Cancel invitation
     */
    async cancelInvitation(token) {
      return API.request(`/api/team/invitations/${token}`, {
        method: 'DELETE',
      });
    },

    /**
     * Resend invitation
     */
    async resendInvitation(token) {
      return API.request(`/api/team/invitations/${token}/resend`, {
        method: 'POST',
      });
    },

    /**
     * Remove member
     */
    async remove(memberId) {
      return API.request(`/api/team/${memberId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Change member role
     */
    async changeRole(memberId, newRole) {
      return API.request(`/api/team/${memberId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ newRole }),
      });
    },

    /**
     * Transfer ownership
     */
    async transferOwnership(newOwnerId) {
      return API.request('/api/team/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({ newOwnerId }),
      });
    },

    /**
     * Leave company
     */
    async leave() {
      return API.request('/api/team/leave', {
        method: 'POST',
      });
    },

    /**
     * Get my role in current company
     */
    async getMyRole() {
      return API.request('/api/team/my-role');
    },
  },

  // ============================================
  // BILLING MODULE
  // ============================================
  billing: {
    /**
     * Get available plans (public)
     */
    async getPlans() {
      return API.request('/api/billing/plans');
    },

    /**
     * Get current subscription
     */
    async getSubscription() {
      return API.request('/api/billing/subscription');
    },

    /**
     * Get trial status
     */
    async getTrialStatus() {
      return API.request('/api/billing/trial-status');
    },

    /**
     * Start trial (if eligible)
     */
    async startTrial() {
      return API.request('/api/billing/start-trial', {
        method: 'POST',
      });
    },

    /**
     * Create Stripe checkout session
     */
    async checkout(planId, interval = 'monthly') {
      return API.request('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, interval }),
      });
    },

    /**
     * Get Stripe customer portal URL
     */
    async getPortal() {
      return API.request('/api/billing/portal', {
        method: 'POST',
      });
    },

    /**
     * Cancel subscription at period end
     */
    async cancel() {
      return API.request('/api/billing/cancel', {
        method: 'POST',
      });
    },

    /**
     * Reactivate canceled subscription
     */
    async reactivate() {
      return API.request('/api/billing/reactivate', {
        method: 'POST',
      });
    },
  },

  // ============================================
  // FEATURES MODULE
  // ============================================
  features: {
    /**
     * Get capabilities (limits, permissions) for current company
     */
    async getCapabilities() {
      return API.request('/api/features/capabilities');
    },

    /**
     * Get plans with features
     */
    async getPlans() {
      return API.request('/api/features/plans');
    },

    /**
     * Get usage summary
     */
    async getUsage() {
      return API.request('/api/features/usage');
    },

    /**
     * Check specific feature access
     */
    async check(featureId) {
      return API.request(`/api/features/check/${featureId}`);
    },

    /**
     * Get feature definitions
     */
    async getDefinitions() {
      return API.request('/api/features/definitions');
    },

    /**
     * Validate selected fields for plan
     */
    async validateFields(selectedFields, fieldDefinitions) {
      return API.request('/api/features/validate-fields', {
        method: 'POST',
        body: JSON.stringify({ selectedFields, fieldDefinitions }),
      });
    },
  },
};

// Make API available globally for compatibility
window.LiveSalesAPI = API;
