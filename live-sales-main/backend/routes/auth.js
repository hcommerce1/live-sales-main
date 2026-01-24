const express = require('express');
const { PrismaClient } = require('@prisma/client');
const passwordService = require('../utils/password');
const authMiddleware = require('../middleware/auth');
const { validate, registerSchema, loginSchema, refreshTokenSchema } = require('../validators/schemas');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route POST /api/auth/register
 * @desc Register new user
 * @access Public
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await passwordService.hash(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: 'user',
        isActive: true,
        emailVerified: false, // Should be verified via email
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    // Log registration
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    // Generate tokens
    const accessToken = authMiddleware.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = authMiddleware.generateRefreshToken({
      userId: user.id,
    });

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      }
    });

    // Return tokens
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Registration failed', {
      error: error.message,
      email: req.body.email
    });

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Find user (email is stored lowercase)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      }
    });

    if (!user) {
      // Generic error to prevent email enumeration
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Account deactivated',
        }
      });

      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isValidPassword = await passwordService.verify(password, user.password);

    if (!isValidPassword) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Invalid password',
        }
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check 2FA if enabled
    // SECURITY: 2FA verification not yet implemented - block login if 2FA enabled
    if (user.twoFactorEnabled) {
      logger.warn('Login blocked - 2FA enabled but not implemented', { userId: user.id });
      return res.status(403).json({
        error: '2FA is enabled but verification is not yet available. Please contact support.',
        code: '2FA_NOT_IMPLEMENTED'
      });
    }

    // Update last login and activity timestamp
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now  // Reset session timeout on login
      }
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Generate tokens
    const accessToken = authMiddleware.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = authMiddleware.generateRefreshToken({
      userId: user.id,
    });

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      }
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Login failed', {
      error: error.message,
      email: req.body.email
    });

    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = authMiddleware.verifyRefreshToken(refreshToken);

    // Check if token exists in database and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        }
      }
    });

    if (!storedToken || storedToken.revoked) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    if (!storedToken.user.isActive) {
      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Revoke old refresh token (token rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true }
    });

    // Generate new tokens
    const newAccessToken = authMiddleware.generateAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });

    const newRefreshToken = authMiddleware.generateRefreshToken({
      userId: storedToken.user.id,
    });

    // Store new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.user.id,
        expiresAt,
      }
    });

    logger.info('Token refreshed', { userId: storedToken.user.id });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });

    res.status(401).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (revoke refresh token)
 * @access Private
 */
router.post('/logout', authMiddleware.authenticate(), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Revoke refresh token
      await prisma.refreshToken.updateMany({
        where: {
          token: refreshToken,
          userId: req.user.id,
        },
        data: { revoked: true }
      });
    }

    // Log logout
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LOGOUT',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      }
    });

    logger.info('User logged out', { userId: req.user.id });

    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user
 * @access Private
 */
router.get('/me', authMiddleware.authenticate(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
      }
    });

    res.json({ user });
  } catch (error) {
    logger.error('Failed to get user', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;
