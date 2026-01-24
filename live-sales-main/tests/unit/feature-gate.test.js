/**
 * Feature Gate Middleware Unit Tests
 */

// Mock feature service
const mockCheckAccess = jest.fn();
const mockGetMinScheduleInterval = jest.fn();
const mockValidateSelectedFields = jest.fn();

jest.mock('../../backend/services/feature.service', () => ({
  checkAccess: mockCheckAccess,
  getMinScheduleInterval: mockGetMinScheduleInterval,
  validateSelectedFields: mockValidateSelectedFields,
}));

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const {
  requireFeature,
  requireFeatures,
  requireAnyFeature,
  checkFeature,
  validateScheduleInterval,
  FeatureGateError,
} = require('../../backend/middleware/featureGate');

describe('Feature Gate Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      company: { id: 'company-123' },
      user: { id: 'user-123' },
      body: {},
      params: {},
      path: '/api/test',
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe('requireFeature', () => {
    test('calls next() when feature is allowed', async () => {
      mockCheckAccess.mockResolvedValue({ allowed: true });

      const middleware = requireFeature('exports.create');
      await middleware(req, res, next);

      expect(mockCheckAccess).toHaveBeenCalledWith('company-123', 'exports.create');
      expect(next).toHaveBeenCalled();
      expect(req.featureAccess['exports.create'].allowed).toBe(true);
    });

    test('returns 403 when feature is not allowed', async () => {
      mockCheckAccess.mockResolvedValue({
        allowed: false,
        reason: 'Feature requires Pro plan',
        requiredPlan: 'pro',
      });

      const middleware = requireFeature('exports.fields.pro');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Feature requires Pro plan',
        code: 'FEATURE_NOT_AVAILABLE',
        featureId: 'exports.fields.pro',
        requiredPlan: 'pro',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 400 when no company context', async () => {
      req.company = null;

      const middleware = requireFeature('exports.create');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    });

    test('logs grace period warning', async () => {
      const logger = require('../../backend/utils/logger');
      mockCheckAccess.mockResolvedValue({
        allowed: true,
        inGracePeriod: true,
      });

      const middleware = requireFeature('exports.create');
      await middleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith('Access granted during grace period', {
        companyId: 'company-123',
        featureId: 'exports.create',
      });
    });
  });

  describe('requireFeatures (AND logic)', () => {
    test('allows when all features are available', async () => {
      mockCheckAccess.mockResolvedValue({ allowed: true });

      const middleware = requireFeatures('exports.create', 'exports.fields.pro');
      await middleware(req, res, next);

      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalled();
    });

    test('denies when any feature is not available', async () => {
      mockCheckAccess
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false, reason: 'Not available', requiredPlan: 'pro' });

      const middleware = requireFeatures('exports.create', 'exports.fields.pro');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'FEATURES_NOT_AVAILABLE',
          deniedFeatures: expect.arrayContaining([
            expect.objectContaining({ featureId: 'exports.fields.pro' }),
          ]),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAnyFeature (OR logic)', () => {
    test('allows when at least one feature is available', async () => {
      mockCheckAccess
        .mockResolvedValueOnce({ allowed: false })
        .mockResolvedValueOnce({ allowed: true });

      const middleware = requireAnyFeature('baselinker.returns', 'baselinker.orders');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('denies when no features are available', async () => {
      mockCheckAccess.mockResolvedValue({ allowed: false });

      const middleware = requireAnyFeature('baselinker.returns', 'baselinker.invoices');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('checkFeature (soft check)', () => {
    test('adds feature access to request but does not block', async () => {
      mockCheckAccess.mockResolvedValue({ allowed: false, reason: 'Not available' });

      const middleware = checkFeature('exports.fields.pro');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.featureAccess['exports.fields.pro'].allowed).toBe(false);
    });

    test('handles missing company gracefully', async () => {
      req.company = null;

      const middleware = checkFeature('exports.fields.pro');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.featureAccess['exports.fields.pro'].allowed).toBe(false);
    });
  });

  describe('validateScheduleInterval', () => {
    test('allows when interval is above minimum', async () => {
      req.body.scheduleMinutes = 15;
      mockGetMinScheduleInterval.mockResolvedValue(5);

      const middleware = validateScheduleInterval();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('denies when interval is below minimum', async () => {
      req.body.scheduleMinutes = 2;
      mockGetMinScheduleInterval.mockResolvedValue(5);

      const middleware = validateScheduleInterval();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Minimalny interwał dla Twojego planu to 5 minut',
        code: 'SCHEDULE_INTERVAL_TOO_LOW',
        requestedInterval: 2,
        minInterval: 5,
        requiredPlan: 'basic',
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('skips validation when no interval provided', async () => {
      req.body.scheduleMinutes = undefined;

      const middleware = validateScheduleInterval();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGetMinScheduleInterval).not.toHaveBeenCalled();
    });

    test('suggests pro plan for intervals below 5 minutes', async () => {
      req.body.scheduleMinutes = 1;
      mockGetMinScheduleInterval.mockResolvedValue(5);

      const middleware = validateScheduleInterval();
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredPlan: 'pro',
        })
      );
    });
  });

  describe('FeatureGateError', () => {
    test('creates error with correct properties', () => {
      const error = new FeatureGateError('exports.fields.pro', 'Requires Pro plan', 'pro');

      expect(error.name).toBe('FeatureGateError');
      expect(error.featureId).toBe('exports.fields.pro');
      expect(error.message).toBe('Requires Pro plan');
      expect(error.requiredPlan).toBe('pro');
      expect(error.status).toBe(403);
      expect(error.code).toBe('FEATURE_NOT_AVAILABLE');
    });

    test('creates error with default message', () => {
      const error = new FeatureGateError('exports.fields.pro');

      expect(error.message).toBe("Access to feature 'exports.fields.pro' denied");
    });
  });
});
