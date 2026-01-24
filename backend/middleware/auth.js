const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * JWT Authentication Middleware
 *
 * SECURITY:
 * - Access tokens: Short-lived (15 minutes)
 * - Refresh tokens: Long-lived (7 days), stored in httpOnly cookies
 * - Token rotation: New refresh token on each refresh
 * - Revocation: Refresh tokens can be revoked in database
 */

class AuthMiddleware {
  constructor() {
    // JWT secrets from environment
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET;

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      logger.error('JWT secrets not configured');
      throw new Error('JWT secrets must be set in environment');
    }

    // Token expiration times
    this.accessTokenExpiry = '15m';   // 15 minutes
    this.refreshTokenExpiry = '7d';   // 7 days

    // Session timeout: 30 minutes of inactivity
    this.sessionTimeoutMinutes = 30;
  }

  /**
   * Generate access token (short-lived)
   * @param {object} payload - Token payload { userId, email, role }
   * @returns {string} - JWT access token
   */
  generateAccessToken(payload) {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: 'live-sales',
        audience: 'live-sales-api',
      }
    );
  }

  /**
   * Generate refresh token (long-lived)
   * @param {object} payload - Token payload { userId }
   * @returns {string} - JWT refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign(
      {
        userId: payload.userId,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'live-sales',
        audience: 'live-sales-api',
      }
    );
  }

  /**
   * Verify access token
   * @param {string} token - JWT access token
   * @returns {object} - Decoded token payload
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'live-sales',
        audience: 'live-sales-api',
      });

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      logger.debug('Access token verification failed', { error: error.message });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token
   * @returns {object} - Decoded token payload
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'live-sales',
        audience: 'live-sales-api',
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      logger.debug('Refresh token verification failed', { error: error.message });
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Authentication middleware - verify access token
   * @param {object} req - Express request
   * @param {object} res - Express response
   * @param {function} next - Next middleware
   */
  authenticate() {
    return async (req, res, next) => {
      try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'NO_TOKEN'
          });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = this.verifyAccessToken(token);

        // Check if user still exists and is active
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            emailVerified: true,
            lastActivityAt: true,
          }
        });

        if (!user) {
          return res.status(401).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        if (!user.isActive) {
          return res.status(403).json({
            error: 'Account deactivated',
            code: 'ACCOUNT_DEACTIVATED'
          });
        }

        // Check session timeout (30 minutes of inactivity)
        if (user.lastActivityAt) {
          const inactiveMinutes = (Date.now() - new Date(user.lastActivityAt).getTime()) / (1000 * 60);

          if (inactiveMinutes > this.sessionTimeoutMinutes) {
            logger.info('Session timeout', {
              userId: user.id,
              inactiveMinutes: Math.round(inactiveMinutes)
            });

            return res.status(401).json({
              error: 'Session expired due to inactivity',
              code: 'SESSION_TIMEOUT',
              inactiveMinutes: Math.round(inactiveMinutes)
            });
          }
        }

        // Update last activity timestamp (non-blocking)
        prisma.user.update({
          where: { id: user.id },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          logger.warn('Failed to update lastActivityAt', { error: err.message });
        });

        // Attach user to request
        req.user = user;

        next();
      } catch (error) {
        logger.warn('Authentication failed', {
          error: error.message,
          ip: req.ip,
          path: req.path
        });

        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }
    };
  }

  /**
   * Authorization middleware - check user role
   * @param {array} allowedRoles - Array of allowed roles
   */
  authorize(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Authorization failed', {
          userId: req.user.id,
          role: req.user.role,
          requiredRoles: allowedRoles,
          path: req.path
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN'
        });
      }

      next();
    };
  }

  /**
   * Optional authentication - continue even if no token
   */
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = this.verifyAccessToken(token);

          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
            }
          });

          if (user && user.isActive) {
            req.user = user;
          }
        }

        next();
      } catch (error) {
        // Ignore errors in optional auth
        next();
      }
    };
  }
}

module.exports = new AuthMiddleware();
