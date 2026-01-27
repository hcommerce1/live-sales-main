/**
 * Feature Flags Unit Tests
 *
 * Tests for PR 0.1 Feature Flags Infrastructure
 *
 * Required test scenarios:
 * 1. default=true → endpoint allowed (current config)
 * 2. override=false in Redis → endpoint blocked
 * 3. override per company ≠ global
 * 4. middleware doesn't break legacy mode when flag off
 */

// Mock Redis before importing feature flags
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisOn = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    connect: mockRedisConnect,
    on: mockRedisOn,
    status: 'ready',
  }));
});

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Clear module cache before each test to get fresh instance
beforeEach(() => {
  jest.clearAllMocks();
  // Reset the feature flags module to get fresh instance
  jest.resetModules();
});

describe('Feature Flags Config', () => {
  const { FEATURE_FLAGS, isValidFlag, getAllFlagNames, getFlagConfig } = require('../../backend/config/feature-flags.config');

  test('should have all required flag definitions', () => {
    const requiredFlags = [
      'company.enabled',
      'company.secrets.enabled',
      'features.gating.enabled',
      'billing.enabled',
      'billing.trial.enabled',
      'registration.nip.enabled',
    ];

    requiredFlags.forEach((flagName) => {
      expect(FEATURE_FLAGS[flagName]).toBeDefined();
      // All production flags now default to true (fully rolled out)
      expect(FEATURE_FLAGS[flagName].default).toBe(true);
      expect(FEATURE_FLAGS[flagName].description).toBeDefined();
      expect(typeof FEATURE_FLAGS[flagName].rolloutPercent).toBe('number');
    });
  });

  test('isValidFlag returns true for valid flags', () => {
    expect(isValidFlag('company.enabled')).toBe(true);
    expect(isValidFlag('billing.enabled')).toBe(true);
  });

  test('isValidFlag returns false for invalid flags', () => {
    expect(isValidFlag('nonexistent.flag')).toBe(false);
    expect(isValidFlag('')).toBe(false);
    expect(isValidFlag(null)).toBe(false);
  });

  test('getAllFlagNames returns array of flag names', () => {
    const names = getAllFlagNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('company.enabled');
  });

  test('getFlagConfig returns config for valid flag', () => {
    const config = getFlagConfig('company.enabled');
    expect(config).toBeDefined();
    expect(config.default).toBe(true);
    expect(config.description).toBeDefined();
  });

  test('getFlagConfig returns null for invalid flag', () => {
    const config = getFlagConfig('nonexistent.flag');
    expect(config).toBeNull();
  });
});

describe('Feature Flags Service', () => {
  let featureFlags;

  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    featureFlags = require('../../backend/utils/feature-flags');
    featureFlags.init();
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  describe('isEnabled', () => {
    /**
     * TEST: default=true → returns true when no override
     * (All flags now default to true in production config)
     */
    test('returns true for flag with default=true when no override exists', async () => {
      mockRedisGet.mockResolvedValue(null); // No override in Redis

      const result = await featureFlags.isEnabled('company.enabled', {});

      expect(result).toBe(true);
    });

    /**
     * TEST: override=false → can disable a flag
     */
    test('returns false when global override is set to false in Redis', async () => {
      mockRedisGet
        .mockResolvedValueOnce(null) // company override
        .mockResolvedValueOnce('false'); // global override

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'test-company' });

      expect(result).toBe(false);
    });

    /**
     * TEST: override=true in Redis → returns true (endpoint passes)
     */
    test('returns true when global override is set to true in Redis', async () => {
      // Company override = null, global override = 'true'
      mockRedisGet
        .mockResolvedValueOnce(null) // company override
        .mockResolvedValueOnce('true'); // global override

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'test-company' });

      expect(result).toBe(true);
    });

    test('returns true when company-specific override is set to true in Redis', async () => {
      mockRedisGet.mockResolvedValueOnce('true'); // company override

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'test-company' });

      expect(result).toBe(true);
      // Should check company key first
      expect(mockRedisGet).toHaveBeenCalledWith('ff:company.enabled:test-company');
    });

    /**
     * TEST SCENARIO 3: override per company ≠ global
     */
    test('company override takes precedence over global override', async () => {
      // Company override = true, should not check global
      mockRedisGet.mockResolvedValueOnce('true'); // company override

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'company-A' });

      expect(result).toBe(true);
      expect(mockRedisGet).toHaveBeenCalledTimes(1); // Only company check
      expect(mockRedisGet).toHaveBeenCalledWith('ff:company.enabled:company-A');
    });

    test('different companies can have different overrides', async () => {
      // Company A has override=true
      mockRedisGet.mockResolvedValueOnce('true');
      const resultA = await featureFlags.isEnabled('company.enabled', { companyId: 'company-A' });
      expect(resultA).toBe(true);

      // Reset mocks
      mockRedisGet.mockClear();

      // Company B has override=false
      mockRedisGet.mockResolvedValueOnce('false');
      const resultB = await featureFlags.isEnabled('company.enabled', { companyId: 'company-B' });
      expect(resultB).toBe(false);
    });

    test('global override applies when no company override exists', async () => {
      // Company override = null, global override = true
      mockRedisGet
        .mockResolvedValueOnce(null) // company override
        .mockResolvedValueOnce('true'); // global override

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'company-C' });

      expect(result).toBe(true);
      expect(mockRedisGet).toHaveBeenCalledTimes(2);
      expect(mockRedisGet).toHaveBeenNthCalledWith(1, 'ff:company.enabled:company-C');
      expect(mockRedisGet).toHaveBeenNthCalledWith(2, 'ff:company.enabled:global');
    });

    test('returns false for unknown flags (fail-secure)', async () => {
      const result = await featureFlags.isEnabled('nonexistent.flag', {});

      expect(result).toBe(false);
      expect(mockRedisGet).not.toHaveBeenCalled(); // Should not query Redis
    });

    test('returns default when Redis fails (graceful degradation)', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      const result = await featureFlags.isEnabled('company.enabled', { companyId: 'test' });

      // Falls back to default which is now true
      expect(result).toBe(true);
    });
  });

  describe('setOverride', () => {
    test('sets global override in Redis', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const result = await featureFlags.setOverride('company.enabled', true, null);

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith('ff:company.enabled:global', 'true');
    });

    test('sets company-specific override in Redis', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const result = await featureFlags.setOverride('company.enabled', true, 'company-X');

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith('ff:company.enabled:company-X', 'true');
    });

    test('returns false for invalid flag name', async () => {
      const result = await featureFlags.setOverride('invalid.flag', true, null);

      expect(result).toBe(false);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  describe('removeOverride', () => {
    test('removes global override from Redis', async () => {
      mockRedisDel.mockResolvedValue(1);

      const result = await featureFlags.removeOverride('company.enabled', null);

      expect(result).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith('ff:company.enabled:global');
    });

    test('removes company-specific override from Redis', async () => {
      mockRedisDel.mockResolvedValue(1);

      const result = await featureFlags.removeOverride('company.enabled', 'company-X');

      expect(result).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith('ff:company.enabled:company-X');
    });
  });

  describe('getOverride', () => {
    test('returns hasOverride=true and value when override exists', async () => {
      mockRedisGet.mockResolvedValue('true');

      const result = await featureFlags.getOverride('company.enabled', 'company-X');

      expect(result).toEqual({ hasOverride: true, value: true });
    });

    test('returns hasOverride=false when no override exists', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await featureFlags.getOverride('company.enabled', 'company-X');

      expect(result).toEqual({ hasOverride: false, value: null });
    });
  });
});

describe('Feature Flag Middleware', () => {
  let featureFlagMiddleware;
  let requireAllFeatures;
  let requireAnyFeature;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';

    const featureFlags = require('../../backend/utils/feature-flags');
    featureFlags.init();

    const middleware = require('../../backend/middleware/featureFlag');
    featureFlagMiddleware = middleware.featureFlagMiddleware;
    requireAllFeatures = middleware.requireAllFeatures;
    requireAnyFeature = middleware.requireAnyFeature;

    mockReq = {
      company: { id: 'test-company' },
      user: { id: 'test-user' },
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
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

  /**
   * TEST: Feature flag explicitly disabled via Redis → 403
   */
  test('blocks request with 403 when feature flag is disabled via override', async () => {
    mockRedisGet.mockResolvedValue('false'); // Explicitly disabled

    const middleware = featureFlagMiddleware('company.enabled');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FEATURE_DISABLED',
        feature: 'company.enabled',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  /**
   * TEST: override=true in Redis → endpoint passes (next called)
   */
  test('allows request when feature flag is enabled via Redis override', async () => {
    mockRedisGet.mockResolvedValueOnce('true'); // Company override

    const middleware = featureFlagMiddleware('company.enabled');
    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  /**
   * TEST: Disabled flag returns clean error response
   */
  test('returns clean error response without crashing when flag is disabled', async () => {
    mockRedisGet.mockResolvedValue('false'); // Explicitly disabled

    const middleware = featureFlagMiddleware('company.enabled');

    // Should not throw
    await expect(middleware(mockReq, mockRes, mockNext)).resolves.not.toThrow();

    // Should return proper error structure
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Feature not available',
        code: 'FEATURE_DISABLED',
        feature: 'company.enabled',
        message: expect.any(String),
      })
    );
  });

  test('handles missing company context gracefully', async () => {
    mockRedisGet.mockResolvedValue('false'); // Explicitly disabled
    mockReq.company = null; // No company context

    const middleware = featureFlagMiddleware('company.enabled');
    await middleware(mockReq, mockRes, mockNext);

    // Should block (flag explicitly disabled)
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  test('handles Redis errors gracefully (falls back to default)', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis down'));

    const middleware = featureFlagMiddleware('company.enabled');
    await middleware(mockReq, mockRes, mockNext);

    // With default=true, Redis errors fall back to default → request passes through
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  describe('requireAllFeatures', () => {
    test('blocks when any flag is disabled via override', async () => {
      // company.enabled: enabled, billing.enabled: explicitly disabled
      mockRedisGet
        .mockResolvedValueOnce('true') // company.enabled - company
        .mockResolvedValueOnce('false'); // billing.enabled - company

      const middleware = requireAllFeatures(['company.enabled', 'billing.enabled']);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('allows when all flags are enabled', async () => {
      mockRedisGet
        .mockResolvedValueOnce('true') // company.enabled
        .mockResolvedValueOnce('true'); // billing.enabled

      const middleware = requireAllFeatures(['company.enabled', 'billing.enabled']);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAnyFeature', () => {
    test('allows when at least one flag is enabled', async () => {
      // Mock isEnabled directly for reliable control
      const featureFlags = require('../../backend/utils/feature-flags');
      jest.spyOn(featureFlags, 'isEnabled')
        .mockResolvedValueOnce(false) // company.enabled → disabled
        .mockResolvedValueOnce(true); // billing.enabled → enabled

      const middleware = requireAnyFeature(['company.enabled', 'billing.enabled']);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      featureFlags.isEnabled.mockRestore();
    });

    test('blocks when all flags are disabled', async () => {
      // Mock isEnabled directly for reliable control
      const featureFlags = require('../../backend/utils/feature-flags');
      jest.spyOn(featureFlags, 'isEnabled')
        .mockResolvedValue(false); // All flags disabled

      const middleware = requireAnyFeature(['company.enabled', 'billing.enabled']);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      featureFlags.isEnabled.mockRestore();
    });
  });
});

describe('Redis Key Format', () => {
  let featureFlags;

  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    featureFlags = require('../../backend/utils/feature-flags');
    featureFlags.init();
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  test('uses correct key format for company override: ff:{flagName}:{companyId}', async () => {
    mockRedisGet.mockResolvedValue(null);

    await featureFlags.isEnabled('company.enabled', { companyId: 'my-company-123' });

    expect(mockRedisGet).toHaveBeenCalledWith('ff:company.enabled:my-company-123');
  });

  test('uses correct key format for global override: ff:{flagName}:global', async () => {
    mockRedisGet
      .mockResolvedValueOnce(null) // company
      .mockResolvedValueOnce(null); // global

    await featureFlags.isEnabled('company.enabled', { companyId: 'any' });

    expect(mockRedisGet).toHaveBeenNthCalledWith(2, 'ff:company.enabled:global');
  });
});
