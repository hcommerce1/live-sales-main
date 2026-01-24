/**
 * Plans Configuration Unit Tests
 */

const {
  PLANS,
  FEATURES,
  SUBSCRIPTION_STATUS,
  STATUS_GROUPS,
  TRIAL_CONFIG,
  getPlan,
  getAllPlanIds,
  isValidPlan,
  getFeatureValue,
  getFeatureDefinition,
  hasFullAccess,
  isInGracePeriod,
  hasAnyAccess,
  getStripePriceId,
  formatPrice,
} = require('../../backend/config/plans');

describe('Plans Configuration', () => {
  describe('PLANS structure', () => {
    test('has required plans: free, basic, pro', () => {
      expect(PLANS.free).toBeDefined();
      expect(PLANS.basic).toBeDefined();
      expect(PLANS.pro).toBeDefined();
    });

    test('each plan has required properties', () => {
      Object.values(PLANS).forEach((plan) => {
        expect(plan.id).toBeDefined();
        expect(plan.name).toBeDefined();
        expect(plan.price).toBeDefined();
        expect(plan.price.monthly).toBeDefined();
        expect(plan.price.yearly).toBeDefined();
        expect(plan.features).toBeDefined();
      });
    });

    test('free plan has zero price', () => {
      expect(PLANS.free.price.monthly).toBe(0);
      expect(PLANS.free.price.yearly).toBe(0);
    });

    test('paid plans have positive prices', () => {
      expect(PLANS.basic.price.monthly).toBeGreaterThan(0);
      expect(PLANS.pro.price.monthly).toBeGreaterThan(0);
    });

    test('yearly price is cheaper per month than monthly', () => {
      // Basic: yearly should be less than 12 * monthly
      expect(PLANS.basic.price.yearly).toBeLessThan(PLANS.basic.price.monthly * 12);
      expect(PLANS.pro.price.yearly).toBeLessThan(PLANS.pro.price.monthly * 12);
    });
  });

  describe('Feature hierarchy', () => {
    test('pro plan has more exports than basic', () => {
      expect(PLANS.pro.features['exports.max_count']).toBeGreaterThan(
        PLANS.basic.features['exports.max_count']
      );
    });

    test('basic plan has more exports than free', () => {
      expect(PLANS.basic.features['exports.max_count']).toBeGreaterThan(
        PLANS.free.features['exports.max_count']
      );
    });

    test('pro plan has access to all BaseLinker features', () => {
      expect(PLANS.pro.features['baselinker.orders']).toBe(true);
      expect(PLANS.pro.features['baselinker.products']).toBe(true);
      expect(PLANS.pro.features['baselinker.returns']).toBe(true);
      expect(PLANS.pro.features['baselinker.invoices']).toBe(true);
    });

    test('free plan has limited BaseLinker features', () => {
      expect(PLANS.free.features['baselinker.orders']).toBe(true);
      expect(PLANS.free.features['baselinker.products']).toBe(false);
      expect(PLANS.free.features['baselinker.returns']).toBe(false);
      expect(PLANS.free.features['baselinker.invoices']).toBe(false);
    });

    test('only pro has PRO export fields', () => {
      expect(PLANS.free.features['exports.fields.pro']).toBe(false);
      expect(PLANS.basic.features['exports.fields.pro']).toBe(false);
      expect(PLANS.pro.features['exports.fields.pro']).toBe(true);
    });
  });

  describe('getPlan', () => {
    test('returns plan for valid ID', () => {
      expect(getPlan('basic')).toEqual(PLANS.basic);
    });

    test('returns null for invalid ID', () => {
      expect(getPlan('enterprise')).toBeNull();
    });
  });

  describe('getAllPlanIds', () => {
    test('returns array of plan IDs', () => {
      const ids = getAllPlanIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain('free');
      expect(ids).toContain('basic');
      expect(ids).toContain('pro');
    });
  });

  describe('isValidPlan', () => {
    test('returns true for valid plans', () => {
      expect(isValidPlan('free')).toBe(true);
      expect(isValidPlan('basic')).toBe(true);
      expect(isValidPlan('pro')).toBe(true);
    });

    test('returns false for invalid plans', () => {
      expect(isValidPlan('enterprise')).toBe(false);
      expect(isValidPlan('')).toBe(false);
      expect(isValidPlan(null)).toBe(false);
    });
  });

  describe('getFeatureValue', () => {
    test('returns feature value for valid plan and feature', () => {
      expect(getFeatureValue('pro', 'exports.max_count')).toBe(25);
      expect(getFeatureValue('basic', 'exports.fields.pro')).toBe(false);
    });

    test('returns null for invalid plan', () => {
      expect(getFeatureValue('invalid', 'exports.max_count')).toBeNull();
    });

    test('returns null for invalid feature', () => {
      expect(getFeatureValue('pro', 'invalid.feature')).toBeNull();
    });
  });

  describe('Subscription Status', () => {
    test('SUBSCRIPTION_STATUS has all required statuses', () => {
      expect(SUBSCRIPTION_STATUS.TRIALING).toBe('trialing');
      expect(SUBSCRIPTION_STATUS.ACTIVE).toBe('active');
      expect(SUBSCRIPTION_STATUS.PAST_DUE).toBe('past_due');
      expect(SUBSCRIPTION_STATUS.CANCELED).toBe('canceled');
      expect(SUBSCRIPTION_STATUS.UNPAID).toBe('unpaid');
    });

    test('hasFullAccess returns true for active and trialing', () => {
      expect(hasFullAccess('active')).toBe(true);
      expect(hasFullAccess('trialing')).toBe(true);
      expect(hasFullAccess('past_due')).toBe(true); // Grace period
    });

    test('hasFullAccess returns false for unpaid and canceled', () => {
      expect(hasFullAccess('unpaid')).toBe(false);
      expect(hasFullAccess('incomplete')).toBe(false);
    });

    test('isInGracePeriod returns true only for past_due', () => {
      expect(isInGracePeriod('past_due')).toBe(true);
      expect(isInGracePeriod('active')).toBe(false);
      expect(isInGracePeriod('unpaid')).toBe(false);
    });

    test('hasAnyAccess returns false for incomplete states', () => {
      expect(hasAnyAccess('incomplete')).toBe(false);
      expect(hasAnyAccess('incomplete_expired')).toBe(false);
      expect(hasAnyAccess('active')).toBe(true);
      expect(hasAnyAccess('canceled')).toBe(true); // Can read until period end
    });
  });

  describe('Trial Configuration', () => {
    test('trial is 7 days', () => {
      expect(TRIAL_CONFIG.DURATION_DAYS).toBe(7);
    });

    test('trial gives pro plan access', () => {
      expect(TRIAL_CONFIG.PLAN_ID).toBe('pro');
    });
  });

  describe('formatPrice', () => {
    test('formats price in PLN', () => {
      expect(formatPrice(6900)).toBe('69,00 zł');
      expect(formatPrice(9900)).toBe('99,00 zł');
      expect(formatPrice(0)).toBe('0,00 zł');
    });

    test('handles decimal grosze', () => {
      expect(formatPrice(6950)).toBe('69,50 zł');
      expect(formatPrice(123)).toBe('1,23 zł');
    });
  });

  describe('getStripePriceId', () => {
    test('returns null for free plan', () => {
      expect(getStripePriceId('free', 'monthly')).toBeNull();
      expect(getStripePriceId('free', 'yearly')).toBeNull();
    });

    test('returns price ID for paid plans', () => {
      // These will be placeholders or env vars
      expect(getStripePriceId('basic', 'monthly')).toBeDefined();
      expect(getStripePriceId('pro', 'yearly')).toBeDefined();
    });

    test('returns null for invalid plan', () => {
      expect(getStripePriceId('invalid', 'monthly')).toBeNull();
    });
  });
});
