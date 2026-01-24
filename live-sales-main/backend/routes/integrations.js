/**
 * Integrations Routes
 *
 * API endpoints for managing company integrations (BaseLinker, Google Sheets, etc.)
 * All routes require authentication and company context.
 *
 * Endpoints:
 * - GET  /api/integrations              - List all integrations status
 * - GET  /api/integrations/baselinker   - Get BaseLinker integration status
 * - POST /api/integrations/baselinker   - Configure BaseLinker token
 * - DELETE /api/integrations/baselinker - Remove BaseLinker token
 * - POST /api/integrations/baselinker/test - Test BaseLinker connection
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const logger = require('../utils/logger');
const { companyContextMiddleware, requireCompany, requireCompanyRole } = require('../middleware/companyContext');
const { featureFlagMiddleware } = require('../middleware/featureFlag');
const companySecretService = require('../services/companySecret.service');
const { invalidateCache } = require('../services/baselinker');

// ============================================
// Validation Schemas
// ============================================

const baselinkerTokenSchema = z.object({
  token: z.string().min(10).max(500),
});

// ============================================
// Middleware
// ============================================

router.use(companyContextMiddleware);
router.use(requireCompany);

// ============================================
// Routes
// ============================================

/**
 * GET /api/integrations
 * List all integrations and their status
 */
router.get('/', async (req, res) => {
  try {
    const secrets = await companySecretService.listSecrets(req.company.id);

    const integrations = {
      baselinker: {
        configured: secrets.some((s) => s.secretType === companySecretService.SECRET_TYPES.BASELINKER_TOKEN),
        lastUsedAt: secrets.find((s) => s.secretType === companySecretService.SECRET_TYPES.BASELINKER_TOKEN)?.lastUsedAt || null,
      },
      googleSheets: {
        configured: secrets.some((s) => s.secretType === companySecretService.SECRET_TYPES.GOOGLE_CREDENTIALS),
        lastUsedAt: secrets.find((s) => s.secretType === companySecretService.SECRET_TYPES.GOOGLE_CREDENTIALS)?.lastUsedAt || null,
      },
    };

    res.json({
      success: true,
      data: integrations,
    });
  } catch (error) {
    logger.error('Failed to list integrations', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve integrations',
    });
  }
});

/**
 * GET /api/integrations/baselinker
 * Get BaseLinker integration status
 */
router.get('/baselinker', async (req, res) => {
  try {
    const hasToken = await companySecretService.hasSecret(
      req.company.id,
      companySecretService.SECRET_TYPES.BASELINKER_TOKEN
    );

    const secrets = await companySecretService.listSecrets(req.company.id);
    const baselinkerSecret = secrets.find(
      (s) => s.secretType === companySecretService.SECRET_TYPES.BASELINKER_TOKEN
    );

    res.json({
      success: true,
      data: {
        configured: hasToken,
        lastUsedAt: baselinkerSecret?.lastUsedAt || null,
        createdAt: baselinkerSecret?.createdAt || null,
        updatedAt: baselinkerSecret?.updatedAt || null,
      },
    });
  } catch (error) {
    logger.error('Failed to get BaseLinker status', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve BaseLinker status',
    });
  }
});

/**
 * POST /api/integrations/baselinker
 * Configure BaseLinker API token
 * Requires owner or admin role
 */
router.post(
  '/baselinker',
  requireCompanyRole('owner', 'admin'),
  featureFlagMiddleware('company.secrets.enabled'),
  async (req, res) => {
    try {
      // Validate input
      const validation = baselinkerTokenSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid token format',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors,
        });
      }

      const { token } = validation.data;

      // Validate token by making a test API call
      const testResult = await companySecretService.validateBaseLinkerToken(token);

      if (!testResult.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid BaseLinker token',
          code: 'INVALID_TOKEN',
          message: testResult.error || 'Token validation failed',
        });
      }

      // Save token
      await companySecretService.setSecret(
        req.company.id,
        companySecretService.SECRET_TYPES.BASELINKER_TOKEN,
        token,
        req.user.id
      );

      // Invalidate cached client
      invalidateCache(req.company.id);

      logger.info('BaseLinker token configured', {
        level: 'SECURITY',
        action: 'INTEGRATION_CONFIGURED',
        userId: req.user.id,
        companyId: req.company.id,
        integration: 'baselinker',
        inventoriesFound: testResult.inventories,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'BaseLinker token configured successfully',
        data: {
          inventoriesFound: testResult.inventories,
        },
      });
    } catch (error) {
      logger.error('Failed to configure BaseLinker', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to configure BaseLinker',
      });
    }
  }
);

/**
 * DELETE /api/integrations/baselinker
 * Remove BaseLinker API token
 * Requires owner or admin role
 */
router.delete(
  '/baselinker',
  requireCompanyRole('owner', 'admin'),
  featureFlagMiddleware('company.secrets.enabled'),
  async (req, res) => {
    try {
      const deleted = await companySecretService.deleteSecret(
        req.company.id,
        companySecretService.SECRET_TYPES.BASELINKER_TOKEN,
        req.user.id
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'BaseLinker integration not found',
          code: 'NOT_FOUND',
        });
      }

      // Invalidate cached client
      invalidateCache(req.company.id);

      logger.info('BaseLinker token removed', {
        level: 'SECURITY',
        action: 'INTEGRATION_REMOVED',
        userId: req.user.id,
        companyId: req.company.id,
        integration: 'baselinker',
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'BaseLinker integration removed',
      });
    } catch (error) {
      logger.error('Failed to remove BaseLinker', {
        error: error.message,
        companyId: req.company?.id,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to remove BaseLinker integration',
      });
    }
  }
);

/**
 * POST /api/integrations/baselinker/test
 * Test BaseLinker connection (without saving)
 */
router.post('/baselinker/test', async (req, res) => {
  try {
    // Check if token is provided in body or use existing
    let token;

    if (req.body.token) {
      // Validate provided token
      const validation = baselinkerTokenSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid token format',
        });
      }
      token = validation.data.token;
    } else {
      // Use existing token
      const secret = await companySecretService.getSecret(
        req.company.id,
        companySecretService.SECRET_TYPES.BASELINKER_TOKEN
      );

      if (!secret) {
        return res.status(400).json({
          success: false,
          error: 'No BaseLinker token configured',
          code: 'NOT_CONFIGURED',
        });
      }

      token = secret.value;
    }

    // Test the token
    const testResult = await companySecretService.validateBaseLinkerToken(token);

    if (!testResult.valid) {
      return res.json({
        success: true,
        data: {
          connected: false,
          error: testResult.error,
        },
      });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        inventoriesFound: testResult.inventories,
      },
    });
  } catch (error) {
    logger.error('Failed to test BaseLinker connection', {
      error: error.message,
      companyId: req.company?.id,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to test connection',
    });
  }
});

module.exports = router;
