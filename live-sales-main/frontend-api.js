// Frontend API Client for Live Sales Backend

const API_BASE_URL = window.location.origin;

const API = {
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
      const response = await API.request(`/api/exports/${id}/run`, {
        method: 'POST',
      });
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

    // Get inventories
    async getInventories() {
      const response = await API.request('/api/baselinker/inventories');
      return response.data || [];
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
};

// Export for use in app
window.LiveSalesAPI = API;
