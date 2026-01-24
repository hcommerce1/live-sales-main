// Frontend API Client for Live Sales Backend

const API_BASE_URL = window.location.origin;

export const API = {
  /**
   * Get access token from localStorage
   */
  getAccessToken() {
    return localStorage.getItem('accessToken');
  },

  /**
   * Get refresh token from localStorage
   */
  getRefreshToken() {
    return localStorage.getItem('refreshToken');
  },

  /**
   * Set tokens in localStorage
   */
  setTokens(accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  },

  /**
   * Clear tokens and user data
   */
  clearAuth() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('activeCompanyId');
  },

  /**
   * Get active company ID
   */
  getActiveCompanyId() {
    return localStorage.getItem('activeCompanyId');
  },

  /**
   * Set active company ID
   */
  setActiveCompanyId(companyId) {
    if (companyId) {
      localStorage.setItem('activeCompanyId', companyId);
    } else {
      localStorage.removeItem('activeCompanyId');
    }
  },

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch (error) {
      this.clearAuth();
      window.location.href = '/login.html';
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
    console.log('[API.request]', options.method || 'GET', endpoint);
    const url = `${API_BASE_URL}${endpoint}`;

    // Add authorization header if token exists
    const token = this.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token && !endpoint.startsWith('/api/auth/')) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // WARUNEK 1 (P0): Add X-Company-Id header for multi-company support
    // Required for: /api/team/*, /api/billing/*, /api/features/*, /api/exports/*
    const companyId = this.getActiveCompanyId();
    if (companyId && !endpoint.startsWith('/api/auth/') && !endpoint.startsWith('/api/company/register') && !endpoint.startsWith('/api/company/lookup')) {
      headers['X-Company-Id'] = companyId;
    }

    const config = {
      headers,
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      // If 401 and we have a refresh token, try to refresh
      if (response.status === 401 && this.getRefreshToken()) {
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
          // Refresh failed, redirect to login
          this.clearAuth();
          window.location.href = '/login.html';
          throw refreshError;
        }
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  },

  /**
   * Authentication
   */
  auth: {
    // Login
    async login(email, password) {
      const response = await API.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      API.setTokens(response.accessToken, response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response;
    },

    // Register
    async register(email, password) {
      const response = await API.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      API.setTokens(response.accessToken, response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response;
    },

    // Logout
    async logout() {
      const refreshToken = API.getRefreshToken();

      try {
        await API.request('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        console.error('Logout error:', error);
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

    // Run export immediately
    async run(id) {
      console.log('[API.exports.run] Starting request for export ID:', id);
      const response = await API.request(`/api/exports/${id}/run`, {
        method: 'POST',
      });
      console.log('[API.exports.run] Response received:', response);
      return response.result;
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

    // Get field definitions for export wizard (NEW)
    async getFieldDefinitions() {
      const response = await API.request('/api/exports/field-definitions');
      return response.data;
    },

    // Get export run history (NEW)
    async getRunHistory(id, limit = 10) {
      const response = await API.request(`/api/exports/${id}/runs?limit=${limit}`);
      return response.data || [];
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

    // Get order sources (NEW)
    async getOrderSources() {
      const response = await API.request('/api/baselinker/order-sources');
      return response.data || {};
    },

    // Get inventories
    async getInventories() {
      const response = await API.request('/api/baselinker/inventories');
      return response.data || [];
    },

    // Get invoices (NEW)
    async getInvoices(filters = {}) {
      const params = new URLSearchParams(filters);
      const response = await API.request(`/api/baselinker/invoices?${params}`);
      return response.data || [];
    },

    // Get invoice file (NEW)
    async getInvoiceFile(invoiceId) {
      const response = await API.request(`/api/baselinker/invoice/${invoiceId}/file`);
      return response.data;
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
     * POST /api/company/lookup-nip
     */
    async lookupNip(nip) {
      return API.request('/api/company/lookup-nip', {
        method: 'POST',
        body: JSON.stringify({ nip }),
      });
    },

    /**
     * Register company with owner account (public)
     * POST /api/company/register
     */
    async register(data) {
      return API.request('/api/company/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * Check if NIP exists (public)
     * GET /api/company/check-nip/:nip
     */
    async checkNip(nip) {
      return API.request(`/api/company/check-nip/${nip}`);
    },

    /**
     * Get all companies user belongs to
     * GET /api/company/my-companies
     */
    async getMyCompanies() {
      return API.request('/api/company/my-companies');
    },

    /**
     * Get company details
     * GET /api/company/:id
     */
    async get(companyId) {
      return API.request(`/api/company/${companyId}`);
    },

    /**
     * Update company
     * PATCH /api/company/:id
     */
    async update(companyId, data) {
      return API.request(`/api/company/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete company (soft delete)
     * DELETE /api/company/:id
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
     * GET /api/team
     */
    async getMembers() {
      return API.request('/api/team');
    },

    /**
     * Get pending invitations
     * GET /api/team/pending
     */
    async getPending() {
      return API.request('/api/team/pending');
    },

    /**
     * Invite member
     * POST /api/team/invite
     */
    async invite(email, role = 'member') {
      return API.request('/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
    },

    /**
     * Accept invitation
     * POST /api/team/invitations/:token/accept
     */
    async acceptInvitation(token) {
      return API.request(`/api/team/invitations/${token}/accept`, {
        method: 'POST',
      });
    },

    /**
     * Cancel invitation
     * DELETE /api/team/invitations/:token
     */
    async cancelInvitation(token) {
      return API.request(`/api/team/invitations/${token}`, {
        method: 'DELETE',
      });
    },

    /**
     * Resend invitation
     * POST /api/team/invitations/:token/resend
     */
    async resendInvitation(token) {
      return API.request(`/api/team/invitations/${token}/resend`, {
        method: 'POST',
      });
    },

    /**
     * Remove member
     * DELETE /api/team/:memberId
     */
    async remove(memberId) {
      return API.request(`/api/team/${memberId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Change member role
     * PATCH /api/team/:memberId/role
     * WARUNEK 2 (P0): Backend expects { newRole: 'admin'|'member' }
     */
    async changeRole(memberId, newRole) {
      return API.request(`/api/team/${memberId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ newRole }),
      });
    },

    /**
     * Transfer ownership
     * POST /api/team/transfer-ownership
     */
    async transferOwnership(newOwnerId) {
      return API.request('/api/team/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({ newOwnerId }),
      });
    },

    /**
     * Leave company
     * POST /api/team/leave
     */
    async leave() {
      return API.request('/api/team/leave', {
        method: 'POST',
      });
    },

    /**
     * Get my role in current company
     * GET /api/team/my-role
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
     * GET /api/billing/plans
     */
    async getPlans() {
      return API.request('/api/billing/plans');
    },

    /**
     * Get current subscription
     * GET /api/billing/subscription
     */
    async getSubscription() {
      return API.request('/api/billing/subscription');
    },

    /**
     * Get trial status
     * GET /api/billing/trial-status
     */
    async getTrialStatus() {
      return API.request('/api/billing/trial-status');
    },

    /**
     * Start trial (if eligible)
     * POST /api/billing/start-trial
     */
    async startTrial() {
      return API.request('/api/billing/start-trial', {
        method: 'POST',
      });
    },

    /**
     * Create Stripe checkout session
     * POST /api/billing/checkout
     */
    async checkout(planId, interval = 'monthly') {
      return API.request('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, interval }),
      });
    },

    /**
     * Get Stripe customer portal URL
     * POST /api/billing/portal
     */
    async getPortal() {
      return API.request('/api/billing/portal', {
        method: 'POST',
      });
    },

    /**
     * Cancel subscription at period end
     * POST /api/billing/cancel
     */
    async cancel() {
      return API.request('/api/billing/cancel', {
        method: 'POST',
      });
    },

    /**
     * Reactivate canceled subscription
     * POST /api/billing/reactivate
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
     * GET /api/features/capabilities
     */
    async getCapabilities() {
      return API.request('/api/features/capabilities');
    },

    /**
     * Get plans with features
     * GET /api/features/plans
     */
    async getPlans() {
      return API.request('/api/features/plans');
    },

    /**
     * Get usage summary
     * GET /api/features/usage
     */
    async getUsage() {
      return API.request('/api/features/usage');
    },

    /**
     * Check specific feature access
     * GET /api/features/check/:featureId
     */
    async check(featureId) {
      return API.request(`/api/features/check/${featureId}`);
    },

    /**
     * Get feature definitions
     * GET /api/features/definitions
     */
    async getDefinitions() {
      return API.request('/api/features/definitions');
    },

    /**
     * Validate selected fields for plan
     * POST /api/features/validate-fields
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
