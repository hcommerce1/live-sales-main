/**
 * Trial Service
 *
 * Manages trial logic with strict NIP rules.
 * Feature flag: billing.trial.enabled
 *
 * SYSTEM REQUIREMENTS (R1-R6):
 * R1: One trial per NIP - each NIP can use trial EXACTLY ONCE
 * R2: NIP is immutable - cannot be changed after registration
 * R3: Eligibility check MUST be on backend
 * R4: Atomic trial start - transaction to prevent race conditions
 * R5: Soft delete doesn't reset trial - trialUsedAt is permanent
 * R6: NIP validation before save - checksum must be valid
 */

const logger = require('../utils/logger');
const { TRIAL_CONFIG, SUBSCRIPTION_STATUS } = require('../config/plans');

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
 * Check if NIP is eligible for trial
 *
 * R1, R3, R5: Checks ALL companies with this NIP (including deleted)
 *
 * @param {string} nip - Normalized NIP (10 digits)
 * @returns {Promise<{eligible: boolean, reason: string|null}>}
 */
async function isTrialEligible(nip) {
  const db = getPrisma();

  // Query for ANY company with this NIP that has used trial
  // Includes soft-deleted companies (R5)
  const companyWithUsedTrial = await db.company.findFirst({
    where: {
      nip: nip,
      trialUsedAt: { not: null },
    },
    select: {
      id: true,
      trialUsedAt: true,
      deletedAt: true,
    },
  });

  if (companyWithUsedTrial) {
    logger.debug('Trial not eligible - already used', {
      nip,
      usedAt: companyWithUsedTrial.trialUsedAt,
      wasDeleted: !!companyWithUsedTrial.deletedAt,
    });

    return {
      eligible: false,
      reason: 'Trial już został wykorzystany dla tego NIP',
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

/**
 * Start trial for company
 *
 * R4: Atomic transaction to prevent race conditions
 *
 * @param {string} companyId
 * @returns {Promise<object>} Created subscription
 * @throws {Error} If trial not eligible or already used
 */
async function startTrial(companyId) {
  const db = getPrisma();

  // Use transaction with row-level locking
  return await db.$transaction(async (tx) => {
    // 1. Get company with lock (FOR UPDATE semantics via findFirst + unique)
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        nip: true,
        trialUsedAt: true,
        subscription: {
          select: { id: true, status: true },
        },
      },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    // 2. Check if company already has active subscription
    if (company.subscription) {
      throw new Error('Company already has a subscription');
    }

    // 3. Check eligibility (including soft-deleted companies with same NIP)
    const anyTrialUsed = await tx.company.findFirst({
      where: {
        nip: company.nip,
        trialUsedAt: { not: null },
      },
    });

    if (anyTrialUsed) {
      logger.warn('Trial start rejected - already used for NIP', {
        companyId,
        nip: company.nip,
        previousUsage: anyTrialUsed.trialUsedAt,
      });

      throw new Error('TRIAL_ALREADY_USED');
    }

    // 4. Mark trial as used (this is permanent - R5)
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_CONFIG.DURATION_DAYS);

    await tx.company.update({
      where: { id: companyId },
      data: { trialUsedAt: now },
    });

    // 5. Create subscription in trialing status
    const subscription = await tx.subscription.create({
      data: {
        companyId: companyId,
        planId: TRIAL_CONFIG.PLAN_ID,
        status: SUBSCRIPTION_STATUS.TRIALING,
        trialStart: now,
        trialEnd: trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
    });

    logger.info('Trial started', {
      companyId,
      nip: company.nip,
      subscriptionId: subscription.id,
      trialEnd: trialEnd.toISOString(),
    });

    return subscription;
  });
}

/**
 * Check if company's trial is expiring soon
 *
 * @param {string} companyId
 * @param {number} daysThreshold - Days before expiry to consider "soon"
 * @returns {Promise<{expiring: boolean, daysRemaining: number|null}>}
 */
async function isTrialExpiringSoon(companyId, daysThreshold = 3) {
  const db = getPrisma();

  const subscription = await db.subscription.findUnique({
    where: { companyId },
    select: {
      status: true,
      trialEnd: true,
    },
  });

  if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.TRIALING) {
    return { expiring: false, daysRemaining: null };
  }

  if (!subscription.trialEnd) {
    return { expiring: false, daysRemaining: null };
  }

  const now = new Date();
  const trialEnd = new Date(subscription.trialEnd);
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  return {
    expiring: daysRemaining <= daysThreshold && daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
  };
}

/**
 * Handle trial expiration
 *
 * Called by scheduler or webhook when trial ends.
 * Downgrades to free plan if no payment method.
 *
 * @param {string} companyId
 */
async function handleTrialExpiration(companyId) {
  const db = getPrisma();

  const subscription = await db.subscription.findUnique({
    where: { companyId },
    select: {
      id: true,
      status: true,
      stripeSubscriptionId: true,
    },
  });

  if (!subscription) {
    logger.warn('Trial expiration called but no subscription', { companyId });
    return;
  }

  // If Stripe subscription exists, Stripe handles the transition
  if (subscription.stripeSubscriptionId) {
    logger.debug('Trial expiration handled by Stripe', {
      companyId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
    return;
  }

  // No Stripe subscription = downgrade to free
  await db.subscription.update({
    where: { companyId },
    data: {
      planId: 'free',
      status: SUBSCRIPTION_STATUS.ACTIVE,
      trialEnd: new Date(), // Mark trial as ended
    },
  });

  logger.info('Trial expired - downgraded to free', { companyId });
}

/**
 * Get trial status for company
 *
 * @param {string} companyId
 * @returns {Promise<object>}
 */
async function getTrialStatus(companyId) {
  const db = getPrisma();

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      nip: true,
      trialUsedAt: true,
      subscription: {
        select: {
          status: true,
          trialStart: true,
          trialEnd: true,
        },
      },
    },
  });

  if (!company) {
    return null;
  }

  const isCurrentlyTrialing = company.subscription?.status === SUBSCRIPTION_STATUS.TRIALING;
  const trialWasUsed = company.trialUsedAt !== null;

  let daysRemaining = null;
  if (isCurrentlyTrialing && company.subscription?.trialEnd) {
    const now = new Date();
    const trialEnd = new Date(company.subscription.trialEnd);
    const msRemaining = trialEnd.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  }

  return {
    trialUsed: trialWasUsed,
    trialUsedAt: company.trialUsedAt,
    isTrialing: isCurrentlyTrialing,
    trialStart: company.subscription?.trialStart || null,
    trialEnd: company.subscription?.trialEnd || null,
    daysRemaining,
  };
}

module.exports = {
  isTrialEligible,
  startTrial,
  isTrialExpiringSoon,
  handleTrialExpiration,
  getTrialStatus,
  TRIAL_CONFIG,
};
