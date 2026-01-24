/**
 * Company Context Middleware Unit Tests
 */

// Mock dependencies before importing
const mockRedisGet = jest.fn();
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: jest.fn(),
    del: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    status: 'ready',
  }));
});

jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock Prisma
const mockPrismaCompanyMemberFindMany = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    companyMember: {
      findMany: mockPrismaCompanyMemberFindMany,
    },
  })),
}));

describe('Company Context Middleware', () => {
  let companyContextMiddleware;
  let requireCompany;
  let requireCompanyRole;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set up environment
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Initialize feature flags
    const featureFlags = require('../../backend/utils/feature-flags');
    featureFlags.init();

    // Import middleware
    const middleware = require('../../backend/middleware/companyContext');
    companyContextMiddleware = middleware.companyContextMiddleware;
    requireCompany = middleware.requireCompany;
    requireCompanyRole = middleware.requireCompanyRole;

    // Set up mocks
    mockReq = {
      user: { id: 'user-123', email: 'test@example.com' },
      headers: {},
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  describe('companyContextMiddleware', () => {
    describe('when company.enabled is false (legacy mode)', () => {
      beforeEach(() => {
        // Feature flag disabled
        mockRedisGet.mockResolvedValue(null);
      });

      test('sets company context to null and passes through', async () => {
        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toBeNull();
        expect(mockReq.memberRole).toBeNull();
        expect(mockReq.companyMembers).toEqual([]);
        expect(mockNext).toHaveBeenCalled();
      });

      test('does not query database in legacy mode', async () => {
        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockPrismaCompanyMemberFindMany).not.toHaveBeenCalled();
      });
    });

    describe('when company.enabled is true', () => {
      beforeEach(() => {
        // Feature flag enabled
        mockRedisGet.mockResolvedValue('true');
      });

      test('loads user company memberships', async () => {
        const mockCompany = {
          id: 'company-123',
          name: 'Test Company',
          nip: '1234567819',
        };

        mockPrismaCompanyMemberFindMany.mockResolvedValue([
          {
            companyId: 'company-123',
            userId: 'user-123',
            role: 'owner',
            company: mockCompany,
          },
        ]);

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toEqual(mockCompany);
        expect(mockReq.memberRole).toBe('owner');
        expect(mockReq.companyMembers).toHaveLength(1);
        expect(mockNext).toHaveBeenCalled();
      });

      test('sets null company when user has no memberships', async () => {
        mockPrismaCompanyMemberFindMany.mockResolvedValue([]);

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toBeNull();
        expect(mockReq.memberRole).toBeNull();
        expect(mockNext).toHaveBeenCalled();
      });

      test('respects X-Company-Id header for multi-company users', async () => {
        const company1 = { id: 'company-1', name: 'Company 1' };
        const company2 = { id: 'company-2', name: 'Company 2' };

        mockPrismaCompanyMemberFindMany.mockResolvedValue([
          { companyId: 'company-1', role: 'member', company: company1 },
          { companyId: 'company-2', role: 'owner', company: company2 },
        ]);

        mockReq.headers['x-company-id'] = 'company-2';

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toEqual(company2);
        expect(mockReq.memberRole).toBe('owner');
      });

      test('returns 403 when user requests unauthorized company', async () => {
        mockPrismaCompanyMemberFindMany.mockResolvedValue([
          { companyId: 'company-1', role: 'owner', company: { id: 'company-1' } },
        ]);

        mockReq.headers['x-company-id'] = 'company-unauthorized';

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'COMPANY_ACCESS_DENIED',
          })
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      test('defaults to first company when no X-Company-Id header', async () => {
        const company1 = { id: 'company-1', name: 'First Company' };
        const company2 = { id: 'company-2', name: 'Second Company' };

        mockPrismaCompanyMemberFindMany.mockResolvedValue([
          { companyId: 'company-1', role: 'admin', company: company1 },
          { companyId: 'company-2', role: 'owner', company: company2 },
        ]);

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toEqual(company1);
        expect(mockReq.memberRole).toBe('admin');
      });

      test('handles missing user gracefully', async () => {
        mockReq.user = null;

        await companyContextMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.company).toBeNull();
        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  describe('requireCompany', () => {
    test('passes when company exists', () => {
      mockReq.company = { id: 'company-123' };

      requireCompany(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('returns 400 when company is null', () => {
      mockReq.company = null;

      requireCompany(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'COMPANY_REQUIRED',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireCompanyRole', () => {
    beforeEach(() => {
      mockReq.company = { id: 'company-123' };
    });

    test('passes when user has required role', () => {
      mockReq.memberRole = 'owner';

      const middleware = requireCompanyRole('owner', 'admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('passes when user has one of multiple allowed roles', () => {
      mockReq.memberRole = 'admin';

      const middleware = requireCompanyRole('owner', 'admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('returns 403 when user has insufficient role', () => {
      mockReq.memberRole = 'member';

      const middleware = requireCompanyRole('owner', 'admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INSUFFICIENT_ROLE',
          currentRole: 'member',
        })
      );
    });

    test('returns 400 when no company context', () => {
      mockReq.company = null;

      const middleware = requireCompanyRole('owner');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'COMPANY_REQUIRED',
        })
      );
    });
  });
});
