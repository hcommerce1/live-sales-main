/**
 * Security Middleware Unit Tests
 *
 * Tests for CSRF protection, resource ownership, and audit logging
 */

// Mock Redis
const mockRedisGet = jest.fn();
const mockRedisSetex = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
  }));
});

// Mock Prisma
const mockPrismaExportFindUnique = jest.fn();
const mockPrismaSubscriptionFindUnique = jest.fn();
const mockPrismaAuditLogCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    export: { findUnique: mockPrismaExportFindUnique },
    subscription: { findUnique: mockPrismaSubscriptionFindUnique },
    auditLog: { create: mockPrismaAuditLogCreate },
  })),
}));

// Mock feature flags
jest.mock('../../backend/utils/feature-flags', () => ({
  isEnabled: jest.fn(),
}));

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('CSRF Protection', () => {
  let csrf;
  let featureFlags;
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    featureFlags = require('../../backend/utils/feature-flags');
    csrf = require('../../backend/middleware/csrf');

    req = {
      method: 'POST',
      path: '/api/test',
      headers: {},
      user: { id: 'user-123', sessionId: 'session-123' },
      ip: '127.0.0.1',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe('csrfProtection middleware', () => {
    test('skips when CSRF is disabled', async () => {
      featureFlags.isEnabled.mockResolvedValue(false);

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('skips safe methods (GET, HEAD, OPTIONS)', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);

      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        req.method = method;
        next.mockClear();

        const middleware = csrf.csrfProtection();
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      }
    });

    test('skips when no user session', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      req.user = null;

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('returns 403 when CSRF token missing', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'CSRF token required',
        code: 'CSRF_TOKEN_MISSING',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 when session expired', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      req.headers['x-csrf-token'] = 'some-token';
      mockRedisGet.mockResolvedValue(null);

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'CSRF session expired',
        code: 'CSRF_SESSION_EXPIRED',
      });
    });

    test('returns 403 when token mismatch', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      req.headers['x-csrf-token'] = 'wrong-token-here-1234567890123456789012345678901234567890123456789012345678901234';
      mockRedisGet.mockResolvedValue('correct-token-12345678901234567890123456789012345678901234567890123456789012');

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
    });

    test('allows request when token matches', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      const token = 'a'.repeat(64); // 64 hex chars = 256 bits
      req.headers['x-csrf-token'] = token;
      mockRedisGet.mockResolvedValue(token);

      const middleware = csrf.csrfProtection();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('token management', () => {
    test('generateCsrfToken returns 64-char hex string', () => {
      const token = csrf.generateCsrfToken();
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    test('storeCsrfToken stores in Redis with TTL', async () => {
      await csrf.storeCsrfToken('session-123', 'token-abc', 3600);

      expect(mockRedisSetex).toHaveBeenCalledWith('csrf:session-123', 3600, 'token-abc');
    });

    test('getCsrfToken retrieves from Redis', async () => {
      mockRedisGet.mockResolvedValue('stored-token');

      const token = await csrf.getCsrfToken('session-123');

      expect(mockRedisGet).toHaveBeenCalledWith('csrf:session-123');
      expect(token).toBe('stored-token');
    });

    test('deleteCsrfToken removes from Redis', async () => {
      await csrf.deleteCsrfToken('session-123');

      expect(mockRedisDel).toHaveBeenCalledWith('csrf:session-123');
    });
  });
});

describe('Resource Ownership', () => {
  let ownership;
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    ownership = require('../../backend/middleware/resourceOwnership');

    req = {
      company: { id: 'company-123' },
      user: { id: 'user-123' },
      params: { id: 'resource-123' },
      memberRole: 'owner',
      path: '/api/test',
      method: 'PUT',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe('requireOwnership middleware', () => {
    test('returns 400 when no company context', async () => {
      req.company = null;

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    });

    test('returns 400 when no resource ID', async () => {
      req.params = {};

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing resource ID parameter: id',
        code: 'MISSING_RESOURCE_ID',
      });
    });

    test('returns 404 when resource not found', async () => {
      mockPrismaExportFindUnique.mockResolvedValue(null);

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'export not found',
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    test('returns 403 when company mismatch', async () => {
      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'other-company-456', // Different company
      });

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied to this resource',
        code: 'RESOURCE_ACCESS_DENIED',
      });
    });

    test('logs ownership violation as security event', async () => {
      const logger = require('../../backend/utils/logger');
      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'other-company-456',
      });

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Unauthorized resource access attempt',
        expect.objectContaining({
          level: 'SECURITY',
          action: 'OWNERSHIP_VIOLATION',
          userId: 'user-123',
          userCompanyId: 'company-123',
          resourceCompanyId: 'other-company-456',
        })
      );
    });

    test('allows when ownership matches', async () => {
      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'company-123', // Same company
      });

      const middleware = ownership.requireOwnership('export');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.resource).toEqual({
        id: 'resource-123',
        companyId: 'company-123',
      });
    });

    test('checks required roles when specified', async () => {
      req.memberRole = 'member'; // Not owner or admin

      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'company-123',
      });

      const middleware = ownership.requireOwnership('export', 'id', {
        requiredRoles: ['owner', 'admin'],
      });
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions for this resource',
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: ['owner', 'admin'],
      });
    });
  });

  describe('checkOwnership (soft check)', () => {
    test('attaches result but does not block', async () => {
      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'other-company-456', // Different company
      });

      const middleware = ownership.checkOwnership('export');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.ownershipCheck.valid).toBe(false);
      expect(req.resource).toBeUndefined();
    });

    test('attaches resource when ownership matches', async () => {
      mockPrismaExportFindUnique.mockResolvedValue({
        id: 'resource-123',
        companyId: 'company-123',
      });

      const middleware = ownership.checkOwnership('export');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.ownershipCheck.valid).toBe(true);
      expect(req.resource).toBeDefined();
    });
  });
});

describe('Security Audit Service', () => {
  let auditService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockPrismaAuditLogCreate.mockResolvedValue({});
    auditService = require('../../backend/services/security-audit.service');
  });

  test('logAuditEvent logs to logger and persists', async () => {
    const logger = require('../../backend/utils/logger');

    await auditService.logAuditEvent({
      action: auditService.AUDIT_ACTIONS.LOGIN_SUCCESS,
      category: auditService.AUDIT_CATEGORIES.AUTH,
      userId: 'user-123',
      ip: '127.0.0.1',
    });

    expect(logger.info).toHaveBeenCalled();
    // Give time for async persist
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockPrismaAuditLogCreate).toHaveBeenCalled();
  });

  test('high severity events use warn level', async () => {
    const logger = require('../../backend/utils/logger');

    await auditService.logAuditEvent({
      action: auditService.AUDIT_ACTIONS.OWNERSHIP_VIOLATION,
      category: auditService.AUDIT_CATEGORIES.SECURITY,
      userId: 'user-123',
    });

    expect(logger.warn).toHaveBeenCalled();
  });

  test('logAuthEvent helper works correctly', async () => {
    const result = await auditService.logAuthEvent(
      auditService.AUDIT_ACTIONS.LOGIN_FAILURE,
      {
        userId: 'user-123',
        email: 'test@example.com',
        ip: '127.0.0.1',
        success: false,
        reason: 'Invalid password',
      }
    );

    expect(result.action).toBe(auditService.AUDIT_ACTIONS.LOGIN_FAILURE);
    expect(result.category).toBe(auditService.AUDIT_CATEGORIES.AUTH);
  });

  test('logSecurityIncident sets high severity', async () => {
    const result = await auditService.logSecurityIncident(
      auditService.AUDIT_ACTIONS.BRUTE_FORCE_DETECTED,
      {
        ip: '192.168.1.1',
        details: { attempts: 10 },
      }
    );

    expect(result.severity).toBe(auditService.SEVERITY.HIGH);
  });

  test('skip persist when persist=false', async () => {
    await auditService.logAuditEvent({
      action: auditService.AUDIT_ACTIONS.LOGIN_SUCCESS,
      persist: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockPrismaAuditLogCreate).not.toHaveBeenCalled();
  });
});
