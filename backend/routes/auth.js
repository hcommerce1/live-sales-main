const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const passwordService = require('../utils/password');
const authMiddleware = require('../middleware/auth');
const { validate, registerSchema, loginSchema, refreshTokenSchema } = require('../validators/schemas');
const { loginLimiter, twoFactorLimiter, passwordChangeLimiter } = require('../middleware/rateLimiter');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================
// CONSTANTS
// ============================================

const LOCKOUT_THRESHOLD = 5; // Failed attempts before lockout
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_2FA_ATTEMPTS = 3; // Max attempts for 2FA code verification
const TWO_FACTOR_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const TEMP_TOKEN_EXPIRY = '5m'; // Temporary token for 2FA pending state

// Dummy hash for constant-time comparison (prevents timing attacks)
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Set refresh token as httpOnly cookie
 */
function setRefreshTokenCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  });
}

/**
 * Clear refresh token cookie
 */
function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

/**
 * Generate 6-digit 2FA code
 */
function generate2FACode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Increment failed login attempts and potentially lock account
 */
async function incrementFailedLoginAttempts(userId) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (user.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accountLockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
        failedLoginAttempts: 0,
      },
    });
    logger.warn('Account locked due to failed attempts', { userId });
  }
}

/**
 * Reset failed login attempts
 */
async function resetFailedLoginAttempts(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0 },
  });
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < 12) {
    errors.push('Hasło musi mieć minimum 12 znaków');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Hasło musi zawierać wielką literę');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Hasło musi zawierać małą literę');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Hasło musi zawierać cyfrę');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Hasło musi zawierać znak specjalny');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Send 2FA code and save hash to user
 */
async function sendAndSave2FACode(userId, email, purpose) {
  const code = generate2FACode();
  const codeHash = await argon2.hash(code);

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: codeHash,
      twoFactorExpiry: new Date(Date.now() + TWO_FACTOR_CODE_EXPIRY_MS),
      twoFactorAttempts: 0,
    },
  });

  await emailService.send2FACode(email, code, purpose);

  return true;
}

/**
 * Verify 2FA code
 * @returns {Object} { valid: boolean, error?: string }
 */
async function verify2FACode(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorSecret: true,
      twoFactorExpiry: true,
      twoFactorAttempts: true,
    },
  });

  return user;
}

// ============================================
// ROUTES
// ============================================

/**
 * @route POST /api/auth/register
 * @desc Register new user
 * @access Public
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordValidation.errors.join(', '),
        code: 'WEAK_PASSWORD',
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        code: 'USER_EXISTS',
      });
    }

    // Hash password
    const passwordHash = await passwordService.hash(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: passwordHash,
        role: 'user',
        isActive: true,
        emailVerified: false,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Log registration
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        category: 'AUTH',
        severity: 'LOW',
        resource: 'user',
        resourceId: user.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
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
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    // Return only accessToken in body (refreshToken is in cookie)
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
    });
  } catch (error) {
    logger.error('Registration failed', {
      error: error.message,
      email: req.body.email,
    });

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

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
        accountLockedUntil: true,
        failedLoginAttempts: true,
      },
    });

    // SECURITY: Constant-time comparison - always verify password even if user doesn't exist
    const passwordToVerify = user?.password || DUMMY_HASH;
    const isValidPassword = await passwordService.verify(password, passwordToVerify);

    // Check if user exists and password is valid (combined check)
    if (!user || !isValidPassword) {
      // Increment failed attempts if user exists
      if (user) {
        await incrementFailedLoginAttempts(user.id);

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_FAILED',
            category: 'AUTH',
            severity: 'MEDIUM',
            ip: req.ip,
            userAgent: req.get('user-agent'),
            success: false,
            errorMessage: 'Invalid password',
          },
        });
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Check account lockout
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const remainingMs = user.accountLockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);

      return res.status(423).json({
        error: `Konto zablokowane. Spróbuj za ${remainingMin} minut.`,
        code: 'ACCOUNT_LOCKED',
        retryAfter: Math.ceil(remainingMs / 1000),
      });
    }

    // Check if account is active
    if (!user.isActive) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          category: 'AUTH',
          severity: 'MEDIUM',
          ip: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Account deactivated',
        },
      });

      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Reset failed login attempts on successful password verification
    await resetFailedLoginAttempts(user.id);

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      // Generate temporary token for 2FA flow
      const tempToken = jwt.sign(
        {
          userId: user.id,
          purpose: '2fa-pending',
          ip: req.ip,
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: TEMP_TOKEN_EXPIRY }
      );

      // Send 2FA code
      try {
        await sendAndSave2FACode(user.id, user.email, 'login');
      } catch (emailError) {
        logger.error('Failed to send 2FA code', { userId: user.id, error: emailError.message });
        return res.status(500).json({
          error: 'Nie udało się wysłać kodu weryfikacyjnego',
          code: 'EMAIL_SEND_FAILED',
        });
      }

      logger.info('2FA code sent for login', { userId: user.id });

      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Kod weryfikacyjny został wysłany na email',
      });
    }

    // No 2FA - proceed with normal login
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now,
      },
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        category: 'AUTH',
        severity: 'LOW',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
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
      },
    });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      accessToken,
    });
  } catch (error) {
    logger.error('Login failed', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
      email: req.body.email,
    });

    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route POST /api/auth/2fa/verify-login
 * @desc Verify 2FA code during login
 * @access Public (with tempToken)
 */
router.post('/2fa/verify-login', twoFactorLimiter, async (req, res) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      return res.status(400).json({
        error: 'Kod i token są wymagane',
        code: 'MISSING_FIELDS',
      });
    }

    // Verify temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: 'Token wygasł. Zaloguj się ponownie.',
        code: 'INVALID_TEMP_TOKEN',
      });
    }

    if (decoded.purpose !== '2fa-pending') {
      return res.status(401).json({
        error: 'Nieprawidłowy token',
        code: 'INVALID_TOKEN_PURPOSE',
      });
    }

    const userId = decoded.userId;

    // Get user 2FA data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        twoFactorSecret: true,
        twoFactorExpiry: true,
        twoFactorAttempts: true,
        twoFactorEnabled: true,
      },
    });

    if (!user || !user.twoFactorEnabled) {
      return res.status(401).json({
        error: 'Nieprawidłowy użytkownik',
        code: 'INVALID_USER',
      });
    }

    // Check expiry
    if (!user.twoFactorSecret || !user.twoFactorExpiry || user.twoFactorExpiry < new Date()) {
      return res.status(401).json({
        error: 'Kod wygasł. Zaloguj się ponownie.',
        code: 'CODE_EXPIRED',
      });
    }

    // Check attempts
    if (user.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      // Invalidate the code
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorExpiry: null,
          twoFactorAttempts: 0,
        },
      });

      return res.status(401).json({
        error: 'Zbyt wiele prób. Zaloguj się ponownie.',
        code: 'TOO_MANY_ATTEMPTS',
      });
    }

    // Verify code using argon2 (constant-time)
    const isValid = await argon2.verify(user.twoFactorSecret, code);

    if (!isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorAttempts: { increment: 1 } },
      });

      const attemptsLeft = MAX_2FA_ATTEMPTS - user.twoFactorAttempts - 1;
      return res.status(401).json({
        error: `Nieprawidłowy kod. Pozostało prób: ${attemptsLeft}`,
        code: 'INVALID_CODE',
        attemptsLeft,
      });
    }

    // Success - clear 2FA data
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorExpiry: null,
        twoFactorAttempts: 0,
        lastLoginAt: now,
        lastActivityAt: now,
      },
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_2FA',
        category: 'AUTH',
        severity: 'LOW',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    logger.info('User logged in with 2FA', { userId: user.id });

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
      },
    });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      accessToken,
    });
  } catch (error) {
    logger.error('2FA verification failed', { error: error.message });

    res.status(500).json({
      error: '2FA verification failed',
      code: 'VERIFY_2FA_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', async (req, res) => {
  try {
    // Get refresh token from cookie or body (prefer cookie)
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'No refresh token provided',
        code: 'NO_REFRESH_TOKEN',
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = authMiddleware.verifyRefreshToken(refreshToken);
    } catch (err) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

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
            twoFactorEnabled: true,
          },
        },
      },
    });

    // SECURITY: Token reuse detection
    if (storedToken && storedToken.revoked) {
      // Someone is trying to use an already-rotated token - potential attack!
      // Revoke ALL tokens for this user
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revoked: true },
      });

      logger.warn('SECURITY: Refresh token reuse detected', {
        userId: storedToken.userId,
        ip: req.ip,
      });

      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Session invalidated for security reasons',
        code: 'TOKEN_REUSE_DETECTED',
      });
    }

    if (!storedToken) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (!storedToken.user.isActive) {
      clearRefreshTokenCookie(res);
      return res.status(403).json({
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Revoke old refresh token (token rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
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
      },
    });

    // Set new refresh token cookie
    setRefreshTokenCookie(res, newRefreshToken);

    logger.info('Token refreshed', { userId: storedToken.user.id });

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    clearRefreshTokenCookie(res);

    res.status(401).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR',
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
    // Get refresh token from cookie or body
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      // Revoke refresh token
      await prisma.refreshToken.updateMany({
        where: {
          token: refreshToken,
          userId: req.user.id,
        },
        data: { revoked: true },
      });
    }

    // Clear the cookie
    clearRefreshTokenCookie(res);

    // Log logout
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LOGOUT',
        category: 'AUTH',
        severity: 'LOW',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    logger.info('User logged out', { userId: req.user.id });

    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout failed', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR',
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
      },
    });

    res.json({ user });
  } catch (error) {
    logger.error('Failed to get user', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authMiddleware.authenticate(), passwordChangeLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Aktualne i nowe hasło są wymagane',
        code: 'MISSING_FIELDS',
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, email: true },
    });

    // Verify current password
    const isValid = await passwordService.verify(currentPassword, user.password);
    if (!isValid) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGE_FAILED',
          category: 'AUTH',
          severity: 'MEDIUM',
          ip: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Invalid current password',
        },
      });

      return res.status(401).json({
        error: 'Nieprawidłowe aktualne hasło',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.errors.join(', '),
        code: 'WEAK_PASSWORD',
        errors: validation.errors,
      });
    }

    // Hash and update password
    const newHash = await passwordService.hash(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    });

    // Revoke ALL refresh tokens (logout from all devices)
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    // Clear current cookie
    clearRefreshTokenCookie(res);

    // Log password change
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PASSWORD_CHANGED',
        category: 'AUTH',
        severity: 'HIGH',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    logger.info('Password changed', { userId });

    // Send notification email
    try {
      await emailService.sendPasswordChangedNotification(user.email, req.ip);
    } catch (emailError) {
      logger.warn('Failed to send password change notification', { userId });
    }

    res.json({
      success: true,
      message: 'Hasło zostało zmienione. Zaloguj się ponownie.',
    });
  } catch (error) {
    logger.error('Password change failed', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Zmiana hasła nie powiodła się',
      code: 'PASSWORD_CHANGE_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/2fa/enable
 * @desc Start 2FA enable process (send code to email)
 * @access Private
 */
router.post('/2fa/enable', authMiddleware.authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if 2FA is already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error: '2FA jest już włączone',
        code: '2FA_ALREADY_ENABLED',
      });
    }

    // Send 2FA code
    await sendAndSave2FACode(userId, user.email, 'enable');

    logger.info('2FA enable code sent', { userId });

    res.json({
      success: true,
      message: 'Kod weryfikacyjny został wysłany na email',
    });
  } catch (error) {
    logger.error('Failed to initiate 2FA enable', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Nie udało się wysłać kodu',
      code: 'ENABLE_2FA_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/2fa/confirm-enable
 * @desc Confirm 2FA enable with code
 * @access Private
 */
router.post('/2fa/confirm-enable', authMiddleware.authenticate(), twoFactorLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({
        error: 'Kod jest wymagany',
        code: 'MISSING_CODE',
      });
    }

    // Get user 2FA data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorSecret: true,
        twoFactorExpiry: true,
        twoFactorAttempts: true,
        twoFactorEnabled: true,
      },
    });

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error: '2FA jest już włączone',
        code: '2FA_ALREADY_ENABLED',
      });
    }

    // Check expiry
    if (!user.twoFactorSecret || !user.twoFactorExpiry || user.twoFactorExpiry < new Date()) {
      return res.status(401).json({
        error: 'Kod wygasł. Poproś o nowy kod.',
        code: 'CODE_EXPIRED',
      });
    }

    // Check attempts
    if (user.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorExpiry: null,
          twoFactorAttempts: 0,
        },
      });

      return res.status(401).json({
        error: 'Zbyt wiele prób. Poproś o nowy kod.',
        code: 'TOO_MANY_ATTEMPTS',
      });
    }

    // Verify code
    const isValid = await argon2.verify(user.twoFactorSecret, code);

    if (!isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorAttempts: { increment: 1 } },
      });

      const attemptsLeft = MAX_2FA_ATTEMPTS - user.twoFactorAttempts - 1;
      return res.status(401).json({
        error: `Nieprawidłowy kod. Pozostało prób: ${attemptsLeft}`,
        code: 'INVALID_CODE',
        attemptsLeft,
      });
    }

    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: null,
        twoFactorExpiry: null,
        twoFactorAttempts: 0,
      },
    });

    // Log
    await prisma.auditLog.create({
      data: {
        userId,
        action: '2FA_ENABLED',
        category: 'AUTH',
        severity: 'HIGH',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    logger.info('2FA enabled', { userId });

    res.json({
      success: true,
      message: '2FA zostało włączone',
    });
  } catch (error) {
    logger.error('Failed to confirm 2FA enable', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Nie udało się włączyć 2FA',
      code: 'CONFIRM_2FA_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/2fa/disable/request
 * @desc Request 2FA disable (send code to email)
 * @access Private
 */
router.post('/2fa/disable/request', authMiddleware.authenticate(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if 2FA is enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        error: '2FA nie jest włączone',
        code: '2FA_NOT_ENABLED',
      });
    }

    // Send 2FA code
    await sendAndSave2FACode(userId, user.email, 'disable');

    logger.info('2FA disable code sent', { userId });

    res.json({
      success: true,
      message: 'Kod weryfikacyjny został wysłany na email',
    });
  } catch (error) {
    logger.error('Failed to initiate 2FA disable', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Nie udało się wysłać kodu',
      code: 'DISABLE_2FA_REQUEST_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/2fa/disable/confirm
 * @desc Confirm 2FA disable with code
 * @access Private
 */
router.post('/2fa/disable/confirm', authMiddleware.authenticate(), twoFactorLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({
        error: 'Kod jest wymagany',
        code: 'MISSING_CODE',
      });
    }

    // Get user 2FA data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorSecret: true,
        twoFactorExpiry: true,
        twoFactorAttempts: true,
        twoFactorEnabled: true,
      },
    });

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        error: '2FA nie jest włączone',
        code: '2FA_NOT_ENABLED',
      });
    }

    // Check expiry
    if (!user.twoFactorSecret || !user.twoFactorExpiry || user.twoFactorExpiry < new Date()) {
      return res.status(401).json({
        error: 'Kod wygasł. Poproś o nowy kod.',
        code: 'CODE_EXPIRED',
      });
    }

    // Check attempts
    if (user.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorExpiry: null,
          twoFactorAttempts: 0,
        },
      });

      return res.status(401).json({
        error: 'Zbyt wiele prób. Poproś o nowy kod.',
        code: 'TOO_MANY_ATTEMPTS',
      });
    }

    // Verify code
    const isValid = await argon2.verify(user.twoFactorSecret, code);

    if (!isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorAttempts: { increment: 1 } },
      });

      const attemptsLeft = MAX_2FA_ATTEMPTS - user.twoFactorAttempts - 1;
      return res.status(401).json({
        error: `Nieprawidłowy kod. Pozostało prób: ${attemptsLeft}`,
        code: 'INVALID_CODE',
        attemptsLeft,
      });
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorExpiry: null,
        twoFactorAttempts: 0,
      },
    });

    // Log
    await prisma.auditLog.create({
      data: {
        userId,
        action: '2FA_DISABLED',
        category: 'AUTH',
        severity: 'HIGH',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    logger.info('2FA disabled', { userId });

    res.json({
      success: true,
      message: '2FA zostało wyłączone',
    });
  } catch (error) {
    logger.error('Failed to confirm 2FA disable', {
      error: error.message,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Nie udało się wyłączyć 2FA',
      code: 'CONFIRM_DISABLE_2FA_ERROR',
    });
  }
});

module.exports = router;
