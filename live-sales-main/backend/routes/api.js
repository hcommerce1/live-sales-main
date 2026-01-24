const express = require('express');
const router = express.Router();

/**
 * GET /api/status
 * Get API status
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
