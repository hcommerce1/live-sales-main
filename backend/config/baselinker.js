/**
 * Baselinker API Configuration
 *
 * API Documentation: https://api.baselinker.com/
 */

module.exports = {
  apiUrl: process.env.BASELINKER_API_URL || 'https://api.baselinker.com/connector.php',
  apiToken: process.env.BASELINKER_API_TOKEN,

  // Request timeout in milliseconds
  timeout: 30000,

  // Retry configuration
  retry: {
    maxRetries: 3,
    retryDelay: 1000, // ms
  }
};
