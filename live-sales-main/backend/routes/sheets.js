const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const logger = require('../utils/logger');

/**
 * POST /api/sheets/validate
 * Validate Google Sheets URL and check access
 */
router.post('/validate', async (req, res) => {
  try {
    const { sheetUrl } = req.body;

    if (!sheetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Sheet URL is required'
      });
    }

    // Extract sheet ID
    const sheetId = googleSheetsService.extractSheetId(sheetUrl);

    // Validate access
    const hasAccess = await googleSheetsService.validateAccess(sheetUrl);

    res.json({
      success: true,
      sheetId,
      hasAccess
    });
  } catch (error) {
    logger.error('Failed to validate sheet URL', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sheets/write
 * Write data to Google Sheets
 */
router.post('/write', async (req, res) => {
  try {
    const { sheetUrl, headers, data, writeMode } = req.body;

    if (!sheetUrl || !headers || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sheetUrl, headers, data'
      });
    }

    const result = await googleSheetsService.writeData(
      sheetUrl,
      headers,
      data,
      writeMode || 'append'
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Failed to write to Google Sheets', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sheets/read
 * Read data from Google Sheets
 */
router.get('/read', async (req, res) => {
  try {
    const { sheetUrl, range } = req.query;

    if (!sheetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Sheet URL is required'
      });
    }

    const data = await googleSheetsService.readData(sheetUrl, range || 'A:Z');

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Failed to read from Google Sheets', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
