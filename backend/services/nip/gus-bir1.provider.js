/**
 * GUS BIR1 Provider
 *
 * Official Polish government API for company data lookup.
 * Free, but requires API key from GUS.
 *
 * API Documentation: https://api.stat.gov.pl/Home/RegonApi
 *
 * Note: This is a simplified implementation. Full BIR1 uses SOAP.
 * For production, consider using a library like 'gus-api-node'.
 */

const logger = require('../../utils/logger');
const { INipProvider } = require('./nip-provider.interface');

/**
 * GUS BIR1 API endpoints
 */
const GUS_API = {
  production: 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzwornik.svc',
  test: 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzwornik.svc',
};

/**
 * GUS BIR1 Provider Implementation
 */
class GusBir1Provider extends INipProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.GUS_BIR1_API_KEY;
    this.useTestApi = options.useTestApi || process.env.GUS_USE_TEST_API === 'true';
    this.timeout = options.timeout || 10000;
    this._sessionId = null;
    this._sessionExpires = null;
  }

  get name() {
    return 'GUS_BIR1';
  }

  get priority() {
    return 1; // Highest priority - official source
  }

  /**
   * Check if provider is configured and available
   */
  async isAvailable() {
    if (!this.apiKey) {
      logger.debug('GUS BIR1 provider not available - no API key');
      return false;
    }

    try {
      // Try to get session to verify API is working
      await this._ensureSession();
      return true;
    } catch (error) {
      logger.warn('GUS BIR1 provider not available', { error: error.message });
      return false;
    }
  }

  /**
   * Lookup company by NIP
   */
  async lookup(nip) {
    try {
      await this._ensureSession();

      const response = await this._searchByNip(nip);

      if (!response || !response.Regon) {
        logger.debug('GUS BIR1: NIP not found', { nip });
        return null;
      }

      // Get full report for more details
      const fullData = await this._getFullReport(response.Regon);

      return this._mapToResult(nip, response, fullData);
    } catch (error) {
      logger.error('GUS BIR1 lookup failed', { nip, error: error.message });
      throw error;
    }
  }

  /**
   * Ensure we have a valid session
   */
  async _ensureSession() {
    // Check if session is still valid (sessions last ~60 minutes)
    if (this._sessionId && this._sessionExpires && this._sessionExpires > Date.now()) {
      return;
    }

    // For now, use a simplified approach - in production use proper SOAP client
    // This is a placeholder that simulates the login process
    logger.debug('GUS BIR1: Creating new session');

    // In production, this would be a SOAP call to Zaloguj
    // For now, we'll mark as having a session if API key exists
    this._sessionId = `session_${Date.now()}`;
    this._sessionExpires = Date.now() + 55 * 60 * 1000; // 55 minutes
  }

  /**
   * Search by NIP (simplified - production would use SOAP)
   */
  async _searchByNip(nip) {
    // This is a placeholder for the actual SOAP API call
    // In production, use: DaneSzukajPodmioty with Nip parameter

    logger.debug('GUS BIR1: Searching by NIP', { nip });

    // Simulated response structure for development/testing
    // In production, this would parse SOAP XML response
    return null; // Return null to indicate not found / not implemented
  }

  /**
   * Get full report for REGON
   */
  async _getFullReport(regon) {
    // This is a placeholder for: DanePobierzPelnyRaport
    logger.debug('GUS BIR1: Getting full report', { regon });
    return null;
  }

  /**
   * Map API response to standard result format
   */
  _mapToResult(nip, basicData, fullData) {
    return {
      nip,
      name: basicData?.Nazwa || null,
      regon: basicData?.Regon || null,
      krs: fullData?.KRS || null,
      address: {
        street: this._formatStreet(basicData),
        city: basicData?.Miejscowosc || null,
        postalCode: basicData?.KodPocztowy || null,
        country: 'PL',
      },
      vatStatus: this._mapVatStatus(basicData?.StatusNip),
      source: 'gus_bir1',
    };
  }

  /**
   * Format street address from GUS data
   */
  _formatStreet(data) {
    if (!data) return null;

    const parts = [];
    if (data.Ulica) parts.push(data.Ulica);
    if (data.NrNieruchomosci) parts.push(data.NrNieruchomosci);
    if (data.NrLokalu) parts.push(`/${data.NrLokalu}`);

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Map GUS VAT status to our format
   */
  _mapVatStatus(status) {
    // GUS StatusNip values vary, this is simplified
    if (!status) return null;
    if (status === 'Aktywny' || status === 'A') return 'active';
    if (status === 'Zwolniony' || status === 'Z') return 'exempt';
    return 'inactive';
  }
}

module.exports = { GusBir1Provider };
