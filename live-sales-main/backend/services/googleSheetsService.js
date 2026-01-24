const { google } = require('googleapis');
const config = require('../config/googleSheets');
const logger = require('../utils/logger');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initAuth();
  }

  /**
   * Initialize Google Sheets API authentication
   */
  initAuth() {
    try {
      // Try using full credentials JSON first (recommended)
      if (config.credentialsJson) {
        logger.info('Initializing Google Sheets auth with credentials JSON', {
          email: config.credentialsJson.client_email,
          projectId: config.credentialsJson.project_id
        });

        this.auth = new google.auth.GoogleAuth({
          credentials: config.credentialsJson,
          scopes: config.scopes,
        });

        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        logger.info('Google Sheets API initialized successfully (using JSON credentials)');
        return;
      }

      // Fallback to separate email/key (legacy)
      if (!config.serviceAccountEmail || !config.privateKey) {
        logger.warn('Google Sheets credentials not configured');
        return;
      }

      logger.info('Initializing Google Sheets auth with email/key', {
        email: config.serviceAccountEmail,
        keyLength: config.privateKey?.length,
        keyStart: config.privateKey?.substring(0, 30)
      });

      this.auth = new google.auth.JWT({
        email: config.serviceAccountEmail,
        key: config.privateKey,
        scopes: config.scopes,
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('Google Sheets API initialized successfully (using email/key)');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets API', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Extract Sheet ID from URL
   * @param {string} url - Google Sheets URL
   * @returns {string} - Sheet ID
   */
  extractSheetId(url) {
    logger.info('[extractSheetId] Input URL', {
      url,
      urlType: typeof url,
      urlLength: url?.length
    });

    if (!url || typeof url !== 'string') {
      logger.error('[extractSheetId] URL is invalid', { url, urlType: typeof url });
      throw new Error(`Invalid Google Sheets URL: ${url}`);
    }

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    logger.info('[extractSheetId] Regex match result', {
      matchFound: !!match,
      extractedId: match ? match[1] : null
    });

    if (!match) {
      throw new Error(`Invalid Google Sheets URL format: ${url}`);
    }
    return match[1];
  }

  /**
   * Extract GID (sub-sheet ID) from URL
   * Supports both ?gid= and #gid= formats
   * @param {string} url - Google Sheets URL
   * @returns {string|null} - GID if present, null otherwise
   */
  extractGid(url) {
    // Support both ?gid= and #gid= formats (Google uses both)
    const match = url.match(/[?#]gid=(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Get sheet name by GID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} gid - Sheet GID
   * @returns {Promise<string>} - Sheet name
   */
  async getSheetNameByGid(spreadsheetId, gid) {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.sheetId === parseInt(gid, 10)
    );

    if (!sheet) {
      throw new Error(`Sheet with GID "${gid}" not found`);
    }

    return sheet.properties.title;
  }

  /**
   * Convert column number to letter (1 = A, 27 = AA, 200 = GR)
   * @param {number} col - Column number (1-based)
   * @returns {string} - Column letter(s)
   */
  columnToLetter(col) {
    let letter = '';
    while (col > 0) {
      const remainder = (col - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  }

  /**
   * Ensure sheet has enough rows and columns
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} sheetName - Sheet name
   * @param {number} requiredRows - Required number of rows
   * @param {number} requiredCols - Required number of columns
   */
  async ensureSheetSize(spreadsheetId, sheetName, requiredRows, requiredCols) {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      const sheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );

      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      const currentRows = sheet.properties.gridProperties.rowCount;
      const currentCols = sheet.properties.gridProperties.columnCount;
      const sheetId = sheet.properties.sheetId;

      logger.info('[SHEETS] Checking sheet size', {
        sheetName,
        currentRows,
        currentCols,
        requiredRows,
        requiredCols
      });

      const requests = [];

      // Expand columns if needed
      if (requiredCols > currentCols) {
        logger.info('[SHEETS] Expanding columns', {
          from: currentCols,
          to: requiredCols
        });
        requests.push({
          appendDimension: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            length: requiredCols - currentCols
          }
        });
      }

      // Expand rows if needed
      if (requiredRows > currentRows) {
        logger.info('[SHEETS] Expanding rows', {
          from: currentRows,
          to: requiredRows
        });
        requests.push({
          appendDimension: {
            sheetId: sheetId,
            dimension: 'ROWS',
            length: requiredRows - currentRows
          }
        });
      }

      if (requests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          resource: { requests }
        });
        logger.info('[SHEETS] Sheet expanded successfully');
      }
    } catch (error) {
      logger.error('[SHEETS] Failed to ensure sheet size', {
        error: error.message,
        spreadsheetId,
        sheetName
      });
      throw error;
    }
  }

  /**
   * Write data to Google Sheets
   * @param {string} sheetUrl - Google Sheets URL
   * @param {Array<string>} headers - Column headers
   * @param {Array<Array>} data - Data rows
   * @param {string} writeMode - 'append' (insert at top) or 'replace' (clear and write)
   * @param {string} sheetName - Sheet name (default: first sheet)
   * @returns {Promise<object>} - Update result
   */
  async writeData(sheetUrl, headers, data, writeMode = 'append', sheetName = null) {
    try {
      logger.info(`[SHEETS WRITE] Starting`, {
        sheetUrl,
        writeMode,
        rowCount: data.length,
        columnCount: headers.length,
        hasSheets: !!this.sheets,
        hasAuth: !!this.auth,
        headersPreview: headers.slice(0, 5).join(', ') + '...'
      });

      if (!this.sheets) {
        logger.error('[SHEETS WRITE] Google Sheets API not initialized!');
        throw new Error('Google Sheets API not initialized');
      }

      // Step 1: Extract sheet ID
      logger.info('[SHEETS WRITE] Step 1: Extracting sheet ID from URL...');
      let sheetId, gid;
      try {
        sheetId = this.extractSheetId(sheetUrl);
        gid = this.extractGid(sheetUrl);
        logger.info(`[SHEETS WRITE] Step 1 OK: Extracted IDs`, { sheetId, gid });
      } catch (extractError) {
        logger.error('[SHEETS WRITE] Step 1 FAILED: Could not extract sheet ID', {
          sheetUrl,
          error: extractError.message
        });
        throw extractError;
      }

      // Step 2: Get sheet name
      logger.info('[SHEETS WRITE] Step 2: Getting sheet name...');
      if (!sheetName) {
        // Try to get sheet name from API first
        try {
          if (gid) {
            logger.info(`[SHEETS WRITE] Getting sheet name by GID...`, { gid });
            sheetName = await this.getSheetNameByGid(sheetId, gid);
            logger.info(`[SHEETS WRITE] Step 2 OK: Resolved sheet name from GID`, { gid, sheetName });
          } else {
            logger.info(`[SHEETS WRITE] Getting first sheet name...`);
            const spreadsheet = await this.sheets.spreadsheets.get({
              spreadsheetId: sheetId,
            });
            sheetName = spreadsheet.data.sheets[0].properties.title;
            logger.info(`[SHEETS WRITE] Step 2 OK: Got first sheet name`, { sheetName });
          }
        } catch (sheetNameError) {
          // If we can't get sheet name from API, try common defaults
          logger.warn('[SHEETS WRITE] Could not get sheet name from API, trying defaults', {
            error: sheetNameError.message,
            errorCode: sheetNameError.code
          });

          // For gid=0, the first sheet is usually 'Sheet1' or 'Arkusz1' (Polish)
          // Try the most common default names
          const defaultNames = gid === '0' || gid === 0 || !gid
            ? ['Sheet1', 'Arkusz1', 'Лист1']
            : ['Sheet1', 'Arkusz1'];

          sheetName = defaultNames[0]; // Start with Sheet1
          logger.info(`[SHEETS WRITE] Step 2: Using default sheet name`, { sheetName, gid });
        }
      } else {
        logger.info(`[SHEETS WRITE] Step 2 OK: Using provided sheet name`, { sheetName });
      }

      // Step 3: Calculate required size
      logger.info('[SHEETS WRITE] Step 3: Calculating required size...');
      const requiredCols = headers.length;
      const requiredRows = data.length + 10; // Extra buffer
      const lastColLetter = this.columnToLetter(requiredCols);
      const range = `${sheetName}!A:${lastColLetter}`;

      logger.info(`[SHEETS WRITE] Step 3 OK: Calculated range`, {
        requiredCols,
        requiredRows,
        lastColLetter,
        range
      });

      // Step 4: Ensure sheet has enough rows and columns (optional - don't fail if can't)
      logger.info('[SHEETS WRITE] Step 4: Ensuring sheet size...');
      try {
        await this.ensureSheetSize(sheetId, sheetName, requiredRows, requiredCols);
        logger.info('[SHEETS WRITE] Step 4 OK: Sheet size ensured');
      } catch (sizeError) {
        logger.warn('[SHEETS WRITE] Step 4: Could not ensure sheet size, will try to write anyway', {
          sheetId,
          sheetName,
          requiredRows,
          requiredCols,
          error: sizeError.message,
          errorCode: sizeError.code
        });
        // Don't throw - try to write anyway, Google Sheets might auto-expand
      }

      logger.info('[SHEETS WRITE] Step 5: Writing data...');

      if (writeMode === 'replace') {
        // Clear existing data
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: sheetId,
          range: range,
        });

        // Write headers and data
        const values = [headers, ...data];
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'RAW',
          resource: {
            values: values,
          },
        });

        logger.info(`Data replaced in Google Sheets`, {
          sheetId,
          totalRows: values.length
        });

        return {
          success: true,
          mode: 'replace',
          rowsWritten: values.length
        };
      } else {
        // 'append' mode - insert at top (after header)
        // First, check if sheet has headers (using dynamic column range)
        const existingData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${sheetName}!A1:${lastColLetter}1`,
        });

        let hasHeaders = false;
        if (existingData.data.values && existingData.data.values.length > 0) {
          hasHeaders = true;
        }

        if (!hasHeaders) {
          // Write headers first
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource: {
              values: [headers],
            },
          });
        }

        // Insert data at row 2 (pushing old data down)
        // This ensures newest data is always at the top
        if (data.length > 0) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            resource: {
              requests: [
                {
                  insertDimension: {
                    range: {
                      sheetId: await this.getSheetIdByName(sheetId, sheetName),
                      dimension: 'ROWS',
                      startIndex: 1,
                      endIndex: 1 + data.length,
                    },
                  },
                },
              ],
            },
          });

          // Write data to newly inserted rows
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource: {
              values: data,
            },
          });
        }

        logger.info(`Data appended to Google Sheets (insert at top)`, {
          sheetId,
          rowsInserted: data.length
        });

        return {
          success: true,
          mode: 'append',
          rowsWritten: data.length
        };
      }
    } catch (error) {
      // Extract HTTP status from Google API error
      const httpStatus = error.response?.status || error.code;

      logger.error('[SHEETS WRITE] FAILED', {
        error: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        errorName: error.name,
        httpStatus,
        errorResponse: JSON.stringify(error.response?.data),
        errorStatus: error.response?.status,
        errorStatusText: error.response?.statusText,
        sheetUrl,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });

      // Ensure the error has a code for upstream error handling
      if (!error.code && httpStatus) {
        error.code = httpStatus;
      }

      throw error;
    }
  }

  /**
   * Get sheet ID by name
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} sheetName - Sheet name
   * @returns {Promise<number>} - Sheet ID
   */
  async getSheetIdByName(spreadsheetId, sheetName) {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === sheetName
    );

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    return sheet.properties.sheetId;
  }

  /**
   * Read data from Google Sheets
   * @param {string} sheetUrl - Google Sheets URL
   * @param {string} range - Range to read (e.g., 'Sheet1!A1:Z100')
   * @returns {Promise<Array<Array>>} - Data rows
   */
  async readData(sheetUrl, range = 'A:Z') {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets API not initialized');
      }

      const sheetId = this.extractSheetId(sheetUrl);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range,
      });

      return response.data.values || [];
    } catch (error) {
      logger.error('Failed to read data from Google Sheets', {
        error: error.message,
        sheetUrl
      });
      throw error;
    }
  }

  /**
   * Validate sheet access
   * @param {string} sheetUrl - Google Sheets URL
   * @returns {Promise<boolean>} - True if accessible
   */
  async validateAccess(sheetUrl) {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets API not initialized');
      }

      const sheetId = this.extractSheetId(sheetUrl);

      await this.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to validate Google Sheets access', {
        error: error.message,
        sheetUrl
      });
      return false;
    }
  }
}

module.exports = new GoogleSheetsService();
