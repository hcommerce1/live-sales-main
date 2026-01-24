/**
 * Trial Service Unit Tests
 *
 * Tests for trial logic with NIP rules (R1-R6)
 */

// Mock Prisma
const mockPrismaCompanyFindFirst = jest.fn();
const mockPrismaCompanyFindUnique = jest.fn();
const mockPrismaCompanyUpdate = jest.fn();
const mockPrismaSubscriptionCreate = jest.fn();
const mockPrismaSubscriptionFindUnique = jest.fn();
const mockPrismaTransaction = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    company: {
      findFirst: mockPrismaCompanyFindFirst,
      findUnique: mockPrismaCompanyFindUnique,
      update: mockPrismaCompanyUpdate,
    },
    subscription: {
      create: mockPrismaSubscriptionCreate,
      findUnique: mockPrismaSubscriptionFindUnique,
    },
    $transaction: mockPrismaTransaction,
  })),
}));

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Trial Service', () => {
  let trialService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    trialService = require('../../backend/services/trial.service');
  });

  describe('isTrialEligible', () => {
    /**
     * R1: One trial per NIP
     */
    test('returns eligible=true when NIP has never used trial', async () => {
      mockPrismaCompanyFindFirst.mockResolvedValue(null);

      const result = await trialService.isTrialEligible('1234567819');

      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    test('returns eligible=false when NIP already used trial', async () => {
      mockPrismaCompanyFindFirst.mockResolvedValue({
        id: 'company-123',
        trialUsedAt: new Date('2024-01-01'),
        deletedAt: null,
      });

      const result = await trialService.isTrialEligible('1234567819');

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('wykorzystany');
    });

    /**
     * R5: Soft delete doesn't reset trial
     */
    test('returns eligible=false when deleted company used trial (R5)', async () => {
      mockPrismaCompanyFindFirst.mockResolvedValue({
        id: 'company-123',
        trialUsedAt: new Date('2024-01-01'),
        deletedAt: new Date('2024-02-01'), // Soft deleted
      });

      const result = await trialService.isTrialEligible('1234567819');

      expect(result.eligible).toBe(false);
      // Deleted company with used trial should still block new trials
    });
  });

  describe('startTrial', () => {
    /**
     * R4: Atomic transaction
     */
    test('uses transaction for atomic trial start', async () => {
      const mockCompany = {
        id: 'company-123',
        nip: '1234567819',
        trialUsedAt: null,
        subscription: null,
      };

      const mockSubscription = {
        id: 'sub-123',
        planId: 'pro',
        status: 'trialing',
      };

      // Mock transaction execution
      mockPrismaTransaction.mockImplementation(async (callback) => {
        // Create mock tx object with same methods
        const tx = {
          company: {
            findUnique: jest.fn().mockResolvedValue(mockCompany),
            findFirst: jest.fn().mockResolvedValue(null), // No previous trial
            update: jest.fn().mockResolvedValue({ ...mockCompany, trialUsedAt: new Date() }),
          },
          subscription: {
            create: jest.fn().mockResolvedValue(mockSubscription),
          },
        };
        return await callback(tx);
      });

      const result = await trialService.startTrial('company-123');

      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(result.planId).toBe('pro');
      expect(result.status).toBe('trialing');
    });

    test('throws error if company already has subscription', async () => {
      const mockCompany = {
        id: 'company-123',
        nip: '1234567819',
        trialUsedAt: null,
        subscription: { id: 'existing-sub' },
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          company: {
            findUnique: jest.fn().mockResolvedValue(mockCompany),
          },
        };
        return await callback(tx);
      });

      await expect(trialService.startTrial('company-123')).rejects.toThrow(
        'Company already has a subscription'
      );
    });

    test('throws TRIAL_ALREADY_USED if NIP used trial (R1)', async () => {
      const mockCompany = {
        id: 'company-new',
        nip: '1234567819',
        trialUsedAt: null,
        subscription: null,
      };

      const mockOtherCompany = {
        id: 'company-old',
        nip: '1234567819',
        trialUsedAt: new Date('2024-01-01'),
      };

      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          company: {
            findUnique: jest.fn().mockResolvedValue(mockCompany),
            findFirst: jest.fn().mockResolvedValue(mockOtherCompany), // Another company used trial
          },
        };
        return await callback(tx);
      });

      await expect(trialService.startTrial('company-new')).rejects.toThrow('TRIAL_ALREADY_USED');
    });
  });

  describe('getTrialStatus', () => {
    test('returns correct status for trialing subscription', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 3); // 3 days left

      mockPrismaCompanyFindUnique.mockResolvedValue({
        nip: '1234567819',
        trialUsedAt: new Date('2024-01-01'),
        subscription: {
          status: 'trialing',
          trialStart: new Date('2024-01-01'),
          trialEnd,
        },
      });

      const result = await trialService.getTrialStatus('company-123');

      expect(result.trialUsed).toBe(true);
      expect(result.isTrialing).toBe(true);
      expect(result.daysRemaining).toBe(3);
    });

    test('returns null for non-existent company', async () => {
      mockPrismaCompanyFindUnique.mockResolvedValue(null);

      const result = await trialService.getTrialStatus('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('isTrialExpiringSoon', () => {
    test('returns expiring=true when within threshold', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 2); // 2 days left

      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        status: 'trialing',
        trialEnd,
      });

      const result = await trialService.isTrialExpiringSoon('company-123', 3);

      expect(result.expiring).toBe(true);
      expect(result.daysRemaining).toBe(2);
    });

    test('returns expiring=false when outside threshold', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 5); // 5 days left

      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        status: 'trialing',
        trialEnd,
      });

      const result = await trialService.isTrialExpiringSoon('company-123', 3);

      expect(result.expiring).toBe(false);
      expect(result.daysRemaining).toBe(5);
    });

    test('returns expiring=false for non-trialing subscription', async () => {
      mockPrismaSubscriptionFindUnique.mockResolvedValue({
        status: 'active',
        trialEnd: null,
      });

      const result = await trialService.isTrialExpiringSoon('company-123');

      expect(result.expiring).toBe(false);
    });
  });
});
