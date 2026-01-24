/**
 * Feature Service Unit Tests
 *
 * Tests for feature gating logic
 */

// Mock Prisma
const mockPrismaSubscriptionFindUnique = jest.fn();
const mockPrismaExportCount = jest.fn();
const mockPrismaCompanyMemberCount = jest.fn();
const mockPrismaFeatureUsageUpsert = jest.fn();
const mockPrismaFeatureUsageFindUnique = jest.fn();
const mockPrismaFeatureUsageDeleteMany = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    subscription: {
      findUnique: mockPrismaSubscriptionFindUnique,
    },
    export: {
      count: mockPrismaExportCount,
    },
    companyMember: {
      count: mockPrismaCompanyMemberCount,
    },
    featureUsage: {
      upsert: mockPrismaFeatureUsageUpsert,
      findUnique: mockPrismaFeatureUsageFindUnique,
      deleteMany: mockPrismaFeatureUsageDeleteMany,
    },
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

describe('Feature Service', () => {
  let featureService;
  let featureFlags;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    featureFlags = require('../../backend/utils/feature-flags');
    featureService = require('../../backend/services/feature.service');
  });

  describe('checkAccess', () => {
    test('allows all when feature gating is disabled', async () => {
      featureFlags.isEnabled.mockResolvedValue(false);

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Feature gating disabled');
    });

    test('denies access when subscription is inactive', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'incomplete',
      });

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Subskrypcja nieaktywna');
    });

    test('allows PRO feature for Pro plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'active',
      });

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(true);
    });

    test('denies PRO feature for Basic plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe('pro');
    });

    test('denies PRO feature for Free plan (no subscription)', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue(null);

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe('pro');
    });

    test('checks count limits for exports', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });
      mockPrismaExportCount.mockResolvedValue(5); // 5 of 10 used

      const result = await featureService.checkAccess('company-123', 'exports.max_count');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.usage).toBe(5);
      expect(result.remaining).toBe(5);
    });

    test('denies when export limit reached', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });
      mockPrismaExportCount.mockResolvedValue(10); // 10 of 10 used

      const result = await featureService.checkAccess('company-123', 'exports.max_count');

      expect(result.allowed).toBe(false);
      expect(result.usage).toBe(10);
      expect(result.limit).toBe(10);
    });

    test('allows access during grace period (past_due)', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'past_due',
      });

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(true);
      expect(result.inGracePeriod).toBe(true);
    });

    test('allows access for canceled subscription within period', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'canceled',
        currentPeriodEnd: futureDate,
      });

      const result = await featureService.checkAccess('company-123', 'exports.fields.pro');

      expect(result.allowed).toBe(true);
    });

    test('returns unknown feature error', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'active',
      });

      const result = await featureService.checkAccess('company-123', 'nonexistent.feature');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Unknown feature');
    });
  });

  describe('validateSelectedFields', () => {
    test('returns valid when no PRO fields selected', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);

      const fieldDefs = {
        order_id: { higher_plan: false },
        email: { higher_plan: false },
      };

      const result = await featureService.validateSelectedFields(
        'company-123',
        ['order_id', 'email'],
        fieldDefs
      );

      expect(result.valid).toBe(true);
    });

    test('returns invalid when PRO fields selected without access', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });

      const fieldDefs = {
        order_id: { higher_plan: false },
        invoice_nip: { higher_plan: true },
        admin_comments: { higher_plan: true },
      };

      const result = await featureService.validateSelectedFields(
        'company-123',
        ['order_id', 'invoice_nip', 'admin_comments'],
        fieldDefs
      );

      expect(result.valid).toBe(false);
      expect(result.blockedFields).toContain('invoice_nip');
      expect(result.blockedFields).toContain('admin_comments');
      expect(result.requiredPlan).toBe('pro');
    });

    test('returns valid when PRO fields selected with Pro plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'active',
      });

      const fieldDefs = {
        order_id: { higher_plan: false },
        invoice_nip: { higher_plan: true },
      };

      const result = await featureService.validateSelectedFields(
        'company-123',
        ['order_id', 'invoice_nip'],
        fieldDefs
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('getCapabilities', () => {
    test('returns capabilities for Pro plan', async () => {
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: new Date('2025-12-31'),
        cancelAtPeriodEnd: false,
      });
      mockPrismaExportCount.mockResolvedValue(5);
      mockPrismaCompanyMemberCount.mockResolvedValue(3);

      const result = await featureService.getCapabilities('company-123');

      expect(result.plan).toBe('pro');
      expect(result.status).toBe('active');
      expect(result.features['exports.fields.pro'].allowed).toBe(true);
      expect(result.features['baselinker.returns'].allowed).toBe(true);
      expect(result.limits.exports.max).toBe(25);
      expect(result.limits.exports.used).toBe(5);
    });

    test('returns capabilities for Basic plan', async () => {
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
        trialEnd: null,
        currentPeriodEnd: new Date('2025-12-31'),
        cancelAtPeriodEnd: false,
      });
      mockPrismaExportCount.mockResolvedValue(2);
      mockPrismaCompanyMemberCount.mockResolvedValue(1);

      const result = await featureService.getCapabilities('company-123');

      expect(result.plan).toBe('basic');
      expect(result.features['exports.fields.pro'].allowed).toBe(false);
      expect(result.features['exports.fields.pro'].requiredPlan).toBe('pro');
      expect(result.limits.exports.max).toBe(10);
    });

    test('returns capabilities for Free plan (no subscription)', async () => {
      mockPrismaSubscriptionFindUnique.mockResolvedValue(null);
      mockPrismaExportCount.mockResolvedValue(1);
      mockPrismaCompanyMemberCount.mockResolvedValue(1);

      const result = await featureService.getCapabilities('company-123');

      expect(result.plan).toBe('free');
      expect(result.status).toBe(null);
      expect(result.features['exports.fields.pro'].allowed).toBe(false);
      expect(result.features['baselinker.products'].allowed).toBe(false);
      expect(result.limits.exports.max).toBe(1);
    });

    test('returns trial info for trialing subscription', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 5);

      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'trialing',
        trialEnd,
        currentPeriodEnd: trialEnd,
        cancelAtPeriodEnd: false,
      });
      mockPrismaExportCount.mockResolvedValue(0);
      mockPrismaCompanyMemberCount.mockResolvedValue(1);

      const result = await featureService.getCapabilities('company-123');

      expect(result.plan).toBe('pro');
      expect(result.status).toBe('trialing');
      expect(result.trialEndsAt).toEqual(trialEnd);
    });
  });

  describe('incrementUsage', () => {
    test('increments usage successfully', async () => {
      mockPrismaFeatureUsageUpsert.mockResolvedValue({
        currentUsage: 5,
      });

      const result = await featureService.incrementUsage('company-123', 'api.calls', 1);

      expect(result.success).toBe(true);
      expect(result.currentUsage).toBe(5);
      expect(mockPrismaFeatureUsageUpsert).toHaveBeenCalled();
    });

    test('handles error gracefully', async () => {
      mockPrismaFeatureUsageUpsert.mockRejectedValue(new Error('DB error'));

      const result = await featureService.incrementUsage('company-123', 'api.calls', 1);

      expect(result.success).toBe(false);
    });
  });

  describe('getMinScheduleInterval', () => {
    test('returns 1 minute for Pro plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'pro',
        status: 'active',
      });

      const result = await featureService.getMinScheduleInterval('company-123');

      expect(result).toBe(1);
    });

    test('returns 5 minutes for Basic plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });

      const result = await featureService.getMinScheduleInterval('company-123');

      expect(result).toBe(5);
    });

    test('returns 60 minutes for Free plan', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue(null);

      const result = await featureService.getMinScheduleInterval('company-123');

      expect(result).toBe(60);
    });
  });

  describe('canCreateExport', () => {
    test('returns allowed=true when under limit', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });
      mockPrismaExportCount.mockResolvedValue(5);

      const result = await featureService.canCreateExport('company-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    test('returns allowed=false when at limit', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'free',
        status: 'active',
      });
      mockPrismaExportCount.mockResolvedValue(1); // Free plan has limit of 1

      const result = await featureService.canCreateExport('company-123');

      expect(result.allowed).toBe(false);
    });
  });

  describe('canInviteMember', () => {
    test('returns allowed=true when under limit', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        planId: 'basic',
        status: 'active',
      });
      mockPrismaCompanyMemberCount.mockResolvedValue(2); // 2 of 3

      const result = await featureService.canInviteMember('company-123');

      expect(result.allowed).toBe(true);
    });

    test('returns allowed=false for free plan with 1 member', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      mockPrismaSubscriptionFindUnique.mockResolvedValue(null); // Free
      mockPrismaCompanyMemberCount.mockResolvedValue(1);

      const result = await featureService.canInviteMember('company-123');

      expect(result.allowed).toBe(false);
    });
  });

  describe('findRequiredPlan', () => {
    test('returns "pro" for PRO-only features', () => {
      const result = featureService.findRequiredPlan('exports.fields.pro');
      expect(result).toBe('pro');
    });

    test('returns "basic" for basic features', () => {
      const result = featureService.findRequiredPlan('baselinker.products');
      expect(result).toBe('basic');
    });

    test('returns "free" for free features', () => {
      const result = featureService.findRequiredPlan('baselinker.orders');
      expect(result).toBe('free');
    });
  });
});
