/**
 * Feature Service
 *
 * Centralny mechanizm sprawdzania dostępu do funkcji.
 * Source of truth: config/plans.js (kod, nie DB)
 *
 * Feature flag: features.gating.enabled
 *
 * Funkcje:
 * - checkAccess(companyId, featureId) - sprawdza dostęp do feature
 * - validateSelectedFields(companyId, fields) - waliduje PRO pola
 * - getCapabilities(companyId) - zwraca wszystkie capabilities dla frontendu
 * - incrementUsage(companyId, featureId) - inkrementuje usage counter
 */

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const {
  PLANS,
  FEATURES,
  getPlan,
  getFeatureValue,
  hasFullAccess,
  isInGracePeriod,
  hasAnyAccess,
  TRIAL_CONFIG,
} = require('../config/plans');

// Lazy load Prisma
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Feature access result
 * @typedef {Object} FeatureAccessResult
 * @property {boolean} allowed - czy dostęp jest dozwolony
 * @property {number} [limit] - limit (dla count features)
 * @property {number} [usage] - aktualne użycie
 * @property {number} [remaining] - pozostało
 * @property {string} [reason] - powód odmowy
 * @property {string} [requiredPlan] - wymagany plan
 * @property {boolean} [inGracePeriod] - czy w grace period
 */

/**
 * Sprawdza czy firma ma dostęp do danej funkcji
 *
 * @param {string} companyId - ID firmy
 * @param {string} featureId - ID feature (np. 'exports.fields.pro')
 * @returns {Promise<FeatureAccessResult>}
 */
async function checkAccess(companyId, featureId) {
  const db = getPrisma();

  // 1. Check if feature gating is enabled
  const gatingEnabled = await featureFlags.isEnabled('features.gating.enabled', { companyId });

  if (!gatingEnabled) {
    // Gating disabled - allow all
    return { allowed: true, reason: 'Feature gating disabled' };
  }

  // 2. Get company subscription
  const subscription = await db.subscription.findUnique({
    where: { companyId },
    select: {
      planId: true,
      status: true,
      trialEnd: true,
      currentPeriodEnd: true,
    },
  });

  // 3. Determine effective plan
  let effectivePlanId = 'free';
  let subscriptionStatus = null;
  let inGracePeriod = false;

  if (subscription) {
    subscriptionStatus = subscription.status;

    // Check subscription status
    if (!hasAnyAccess(subscription.status)) {
      return {
        allowed: false,
        reason: 'Subskrypcja nieaktywna',
        requiredPlan: 'basic',
      };
    }

    // Check if in grace period
    inGracePeriod = isInGracePeriod(subscription.status);

    // Check if has full access
    if (hasFullAccess(subscription.status)) {
      effectivePlanId = subscription.planId;
    } else {
      // Canceled but within period - still has access
      if (subscription.status === 'canceled' && subscription.currentPeriodEnd > new Date()) {
        effectivePlanId = subscription.planId;
      }
    }
  }

  // 4. Get plan features
  const plan = getPlan(effectivePlanId);
  if (!plan) {
    logger.error('Invalid plan ID', { companyId, planId: effectivePlanId });
    return { allowed: false, reason: 'Invalid plan configuration' };
  }

  // 5. Get feature value from plan
  const featureValue = getFeatureValue(effectivePlanId, featureId);

  if (featureValue === null || featureValue === undefined) {
    // Feature not defined for this plan - check if it exists at all
    const featureDef = FEATURES[featureId];
    if (!featureDef) {
      logger.warn('Unknown feature requested', { companyId, featureId });
      return { allowed: false, reason: 'Unknown feature' };
    }

    // Feature exists but not in this plan
    return {
      allowed: false,
      reason: `Feature '${featureId}' wymaga wyższego planu`,
      requiredPlan: findRequiredPlan(featureId),
    };
  }

  // 6. Handle different feature types
  const featureDef = FEATURES[featureId];
  const limitType = featureDef?.limitType || 'boolean';

  switch (limitType) {
    case 'boolean':
      return {
        allowed: featureValue === true,
        inGracePeriod,
        reason: featureValue ? null : `Feature '${featureId}' wymaga wyższego planu`,
        requiredPlan: featureValue ? null : findRequiredPlan(featureId),
      };

    case 'count':
      // Get current usage
      const usage = await getUsage(companyId, featureId);
      const limit = featureValue;
      const remaining = Math.max(0, limit - usage);

      return {
        allowed: usage < limit,
        limit,
        usage,
        remaining,
        inGracePeriod,
        reason: usage >= limit ? `Limit ${featureId} wyczerpany (${usage}/${limit})` : null,
      };

    case 'tier':
      // Numeric value (e.g., min interval)
      return {
        allowed: true,
        limit: featureValue,
        inGracePeriod,
      };

    default:
      return { allowed: !!featureValue, inGracePeriod };
  }
}

/**
 * Waliduje czy wybrane pola są dostępne dla planu firmy
 *
 * @param {string} companyId - ID firmy
 * @param {string[]} selectedFields - wybrane pola
 * @param {Object} fieldDefinitions - definicje pól (z higher_plan flag)
 * @returns {Promise<{valid: boolean, blockedFields?: string[], reason?: string}>}
 */
async function validateSelectedFields(companyId, selectedFields, fieldDefinitions) {
  // Find PRO fields in selection
  const proFields = selectedFields.filter((fieldId) => {
    const def = fieldDefinitions[fieldId];
    return def?.higher_plan === true;
  });

  if (proFields.length === 0) {
    return { valid: true };
  }

  // Check if company has access to PRO fields
  const access = await checkAccess(companyId, 'exports.fields.pro');

  if (!access.allowed) {
    return {
      valid: false,
      blockedFields: proFields,
      reason: `Pola PRO (${proFields.join(', ')}) wymagają planu Pro`,
      requiredPlan: 'pro',
    };
  }

  return { valid: true };
}

/**
 * Zwraca wszystkie capabilities dla frontendu
 *
 * @param {string} companyId - ID firmy
 * @returns {Promise<Object>} capabilities object
 */
async function getCapabilities(companyId) {
  const db = getPrisma();

  // Get subscription
  const subscription = await db.subscription.findUnique({
    where: { companyId },
    select: {
      planId: true,
      status: true,
      trialEnd: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });

  // Determine effective plan
  let planId = 'free';
  let status = null;
  let trialEndsAt = null;

  if (subscription) {
    status = subscription.status;

    if (hasFullAccess(subscription.status)) {
      planId = subscription.planId;
    } else if (subscription.status === 'canceled' && subscription.currentPeriodEnd > new Date()) {
      planId = subscription.planId;
    }

    if (subscription.status === 'trialing' && subscription.trialEnd) {
      trialEndsAt = subscription.trialEnd;
    }
  }

  const plan = getPlan(planId);

  // Build features map
  const features = {};

  for (const [featureId, featureDef] of Object.entries(FEATURES)) {
    const featureValue = plan.features[featureId];
    const limitType = featureDef.limitType || 'boolean';

    switch (limitType) {
      case 'boolean':
        features[featureId] = {
          allowed: featureValue === true,
          requiredPlan: featureValue ? null : findRequiredPlan(featureId),
        };
        break;

      case 'count':
        const usage = await getUsage(companyId, featureId);
        const limit = featureValue || 0;
        features[featureId] = {
          allowed: usage < limit,
          limit,
          usage,
          remaining: Math.max(0, limit - usage),
        };
        break;

      case 'tier':
        features[featureId] = {
          allowed: true,
          value: featureValue,
        };
        break;

      default:
        features[featureId] = {
          allowed: !!featureValue,
        };
    }
  }

  // Build limits summary
  const limits = {
    exports: {
      max: plan.features['exports.max_count'] || 0,
      used: await getUsage(companyId, 'exports.max_count'),
    },
    teamMembers: {
      max: plan.features['team.max_members'] || 1,
      used: await getTeamMemberCount(companyId),
    },
  };

  return {
    plan: planId,
    planName: plan.name,
    status,
    trialEndsAt,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
    inGracePeriod: status ? isInGracePeriod(status) : false,
    features,
    limits,
  };
}

/**
 * Inkrementuje usage counter dla feature
 *
 * @param {string} companyId - ID firmy
 * @param {string} featureId - ID feature
 * @param {number} [amount=1] - ilość do dodania
 * @returns {Promise<{success: boolean, currentUsage: number}>}
 */
async function incrementUsage(companyId, featureId, amount = 1) {
  const db = getPrisma();

  // Get current period (monthly reset)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    // Upsert usage record
    const usage = await db.featureUsage.upsert({
      where: {
        companyId_featureId_periodStart: {
          companyId,
          featureId,
          periodStart,
        },
      },
      create: {
        companyId,
        featureId,
        currentUsage: amount,
        periodStart,
        periodEnd,
      },
      update: {
        currentUsage: { increment: amount },
      },
    });

    logger.debug('Usage incremented', {
      companyId,
      featureId,
      newUsage: usage.currentUsage,
    });

    return {
      success: true,
      currentUsage: usage.currentUsage,
    };
  } catch (error) {
    logger.error('Failed to increment usage', {
      companyId,
      featureId,
      error: error.message,
    });

    return {
      success: false,
      currentUsage: 0,
    };
  }
}

/**
 * Pobiera aktualne usage dla feature
 *
 * @param {string} companyId - ID firmy
 * @param {string} featureId - ID feature
 * @returns {Promise<number>}
 */
async function getUsage(companyId, featureId) {
  const db = getPrisma();

  // For exports.max_count, count actual exports instead of usage table
  if (featureId === 'exports.max_count') {
    const count = await db.export.count({
      where: {
        companyId,
        status: { not: 'deleted' },
      },
    });
    return count;
  }

  // For team.max_members, count actual members
  if (featureId === 'team.max_members') {
    return getTeamMemberCount(companyId);
  }

  // For other features, use usage table
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const usage = await db.featureUsage.findUnique({
    where: {
      companyId_featureId_periodStart: {
        companyId,
        featureId,
        periodStart,
      },
    },
    select: { currentUsage: true },
  });

  return usage?.currentUsage || 0;
}

/**
 * Pobiera liczbę członków zespołu
 *
 * @param {string} companyId - ID firmy
 * @returns {Promise<number>}
 */
async function getTeamMemberCount(companyId) {
  const db = getPrisma();

  const count = await db.companyMember.count({
    where: {
      companyId,
      isActive: true,
    },
  });

  return count;
}

/**
 * Znajduje minimalny plan wymagany dla feature
 *
 * @param {string} featureId - ID feature
 * @returns {string|null} - ID planu lub null
 */
function findRequiredPlan(featureId) {
  // Check plans in order: free, basic, pro
  const planOrder = ['free', 'basic', 'pro'];

  for (const planId of planOrder) {
    const plan = getPlan(planId);
    const value = plan?.features[featureId];

    if (value === true || (typeof value === 'number' && value > 0)) {
      return planId;
    }
  }

  return 'pro'; // Default to highest plan
}

/**
 * Resetuje usage dla nowego okresu (wywoływane przez scheduler)
 *
 * @returns {Promise<number>} - liczba zresetowanych rekordów
 */
async function resetExpiredUsage() {
  const db = getPrisma();

  const now = new Date();

  const result = await db.featureUsage.deleteMany({
    where: {
      periodEnd: { lt: now },
    },
  });

  logger.info('Expired usage records cleaned up', { count: result.count });

  return result.count;
}

/**
 * Sprawdza czy firma może utworzyć nowy eksport
 *
 * @param {string} companyId - ID firmy
 * @returns {Promise<{allowed: boolean, reason?: string, remaining?: number}>}
 */
async function canCreateExport(companyId) {
  return checkAccess(companyId, 'exports.max_count');
}

/**
 * Sprawdza czy firma może zaprosić nowego członka
 *
 * @param {string} companyId - ID firmy
 * @returns {Promise<{allowed: boolean, reason?: string, remaining?: number}>}
 */
async function canInviteMember(companyId) {
  return checkAccess(companyId, 'team.max_members');
}

/**
 * Sprawdza minimalny interwał schedulera dla firmy
 *
 * @param {string} companyId - ID firmy
 * @returns {Promise<number>} - minimalny interwał w minutach
 */
async function getMinScheduleInterval(companyId) {
  const access = await checkAccess(companyId, 'exports.schedule_min_interval');
  return access.limit || 60; // Default 60 min for free
}

module.exports = {
  checkAccess,
  validateSelectedFields,
  getCapabilities,
  incrementUsage,
  getUsage,
  resetExpiredUsage,
  canCreateExport,
  canInviteMember,
  getMinScheduleInterval,
  findRequiredPlan,
};
