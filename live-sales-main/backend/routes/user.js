const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { companyContextMiddleware } = require('../middleware/companyContext');
const crypto = require('../utils/crypto');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * POST /api/user/baselinker-token
 * Save user's BaseLinker API token (encrypted)
 *
 * Saves to:
 * - CompanySecret (for multi-company support) - primary
 * - User.baselinkerToken (legacy compatibility) - secondary
 */
router.post('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    logger.info('BaseLinker token save request received', {
      userId: req.user?.id,
      companyId: req.company?.id,
      hasToken: !!req.body.token
    });

    const { token } = req.body;
    const userId = req.user.id;
    const companyId = req.company?.id;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      logger.warn('Invalid token provided', { userId });
      return res.status(400).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.info('Encrypting BaseLinker token', { userId, companyId });
    // Encrypt the token with AES-256-GCM
    const encryptedToken = crypto.encrypt(token);

    // Save to CompanySecret if company context available (primary storage)
    if (companyId) {
      await prisma.companySecret.upsert({
        where: {
          companyId_secretType: {
            companyId,
            secretType: 'baselinker_token'
          }
        },
        create: {
          companyId,
          secretType: 'baselinker_token',
          encryptedValue: encryptedToken,
          createdBy: userId
        },
        update: {
          encryptedValue: encryptedToken,
          createdBy: userId,
          updatedAt: new Date()
        }
      });

      logger.info('BaseLinker token saved to CompanySecret', {
        userId,
        companyId,
        action: 'SAVE_BASELINKER_TOKEN_COMPANY'
      });
    }

    // Also save to User record for backward compatibility
    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: encryptedToken,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token saved successfully', {
      userId,
      companyId,
      action: 'SAVE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token saved successfully'
    });
  } catch (error) {
    logger.error('Error saving BaseLinker token', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      companyId: req.company?.id,
      errorName: error.name,
      errorCode: error.code
    });

    res.status(500).json({
      error: `Failed to save token: ${error.message}`,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/user/baselinker-token
 * Get user's BaseLinker API token (decrypted)
 *
 * Priority:
 * 1. CompanySecret (if company context available)
 * 2. User.baselinkerToken (legacy fallback)
 */
router.get('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company?.id;

    // Try CompanySecret first (if company context available)
    if (companyId) {
      const companySecret = await prisma.companySecret.findUnique({
        where: {
          companyId_secretType: {
            companyId,
            secretType: 'baselinker_token'
          }
        }
      });

      if (companySecret) {
        const decryptedToken = crypto.decrypt(companySecret.encryptedValue);
        return res.json({
          token: decryptedToken,
          source: 'company'
        });
      }
    }

    // Fallback to User.baselinkerToken
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { baselinkerToken: true }
    });

    if (!user || !user.baselinkerToken) {
      return res.json({
        token: null
      });
    }

    // Decrypt the token
    const decryptedToken = crypto.decrypt(user.baselinkerToken);

    res.json({
      token: decryptedToken,
      source: 'user'
    });
  } catch (error) {
    logger.error('Error loading BaseLinker token', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to load token',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * DELETE /api/user/baselinker-token
 * Delete user's BaseLinker API token
 */
router.delete('/baselinker-token', authMiddleware.authenticate(), companyContextMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company?.id;

    // Delete from CompanySecret if company context available
    if (companyId) {
      await prisma.companySecret.deleteMany({
        where: {
          companyId,
          secretType: 'baselinker_token'
        }
      });

      logger.info('BaseLinker token deleted from CompanySecret', {
        userId,
        companyId,
        action: 'DELETE_BASELINKER_TOKEN_COMPANY'
      });
    }

    // Also delete from User record
    await prisma.user.update({
      where: { id: userId },
      data: {
        baselinkerToken: null,
        updatedAt: new Date()
      }
    });

    logger.info('BaseLinker token deleted', {
      userId,
      companyId,
      action: 'DELETE_BASELINKER_TOKEN'
    });

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting BaseLinker token', {
      error: error.message,
      userId: req.user?.id,
      companyId: req.company?.id
    });

    res.status(500).json({
      error: 'Failed to delete token',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
