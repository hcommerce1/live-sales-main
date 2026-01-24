/**
 * Company Service
 *
 * Handles company registration, lookup, and management.
 * Integrates with NIP lookup and trial service.
 */

const logger = require('../utils/logger');
const { getNipLookupService, validateNip } = require('./nip');
const { logDataEvent, AUDIT_ACTIONS } = require('./security-audit.service');

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
 * Check if NIP is already registered
 *
 * @param {string} nip - Normalized NIP
 * @returns {Promise<{exists: boolean, company?: Object, trialUsed?: boolean}>}
 */
async function checkNipExists(nip) {
  const db = getPrisma();

  // Check including soft-deleted companies (for trial tracking)
  const company = await db.company.findFirst({
    where: { nip },
    select: {
      id: true,
      name: true,
      trialUsedAt: true,
      deletedAt: true,
    },
  });

  if (!company) {
    return { exists: false };
  }

  return {
    exists: true,
    company: company.deletedAt ? null : company,
    trialUsed: company.trialUsedAt !== null,
    isDeleted: company.deletedAt !== null,
  };
}

/**
 * Lookup NIP and return company data
 *
 * @param {string} nip
 * @returns {Promise<Object>}
 */
async function lookupNip(nip) {
  // Validate NIP first
  const validation = validateNip(nip);
  if (!validation.valid) {
    const error = new Error(validation.reason);
    error.code = 'INVALID_NIP';
    throw error;
  }

  // Check if already registered
  const existing = await checkNipExists(validation.normalized);
  if (existing.exists && !existing.isDeleted) {
    const error = new Error('Company with this NIP is already registered');
    error.code = 'NIP_ALREADY_REGISTERED';
    throw error;
  }

  // Lookup NIP data
  const nipService = getNipLookupService();
  const nipData = await nipService.lookup(validation.normalized);

  return {
    nip: validation.normalized,
    nipData,
    trialAvailable: !existing.trialUsed,
  };
}

/**
 * Register a new company with owner
 *
 * @param {Object} params
 * @param {string} params.nip - Company NIP
 * @param {string} params.name - Company name
 * @param {string} [params.regon] - REGON number
 * @param {string} [params.krs] - KRS number
 * @param {Object} [params.address] - Address object
 * @param {string} [params.vatStatus] - VAT status
 * @param {string} params.ownerEmail - Owner's email
 * @param {string} params.ownerPassword - Owner's hashed password
 * @param {boolean} [params.startTrial=true] - Start trial if available
 * @returns {Promise<{company: Object, user: Object, member: Object, subscription?: Object}>}
 */
async function registerCompany(params) {
  const db = getPrisma();

  const {
    nip,
    name,
    regon,
    krs,
    address = {},
    vatStatus,
    ownerEmail,
    ownerPassword,
    startTrial = true,
  } = params;

  // Validate NIP
  const validation = validateNip(nip);
  if (!validation.valid) {
    const error = new Error(validation.reason);
    error.code = 'INVALID_NIP';
    throw error;
  }

  const normalizedNip = validation.normalized;

  // Check NIP doesn't exist
  const existing = await checkNipExists(normalizedNip);
  if (existing.exists && !existing.isDeleted) {
    const error = new Error('Company with this NIP is already registered');
    error.code = 'NIP_ALREADY_REGISTERED';
    throw error;
  }

  // Check email doesn't exist
  const existingUser = await db.user.findUnique({
    where: { email: ownerEmail.toLowerCase() },
  });
  if (existingUser) {
    const error = new Error('Email is already registered');
    error.code = 'EMAIL_ALREADY_REGISTERED';
    throw error;
  }

  // Determine if trial is available
  const trialAvailable = startTrial && !existing.trialUsed;

  // Create everything in a transaction
  const result = await db.$transaction(async (tx) => {
    // 1. Create company
    const company = await tx.company.create({
      data: {
        nip: normalizedNip,
        name,
        regon: regon || null,
        krs: krs || null,
        addressStreet: address.street || null,
        addressCity: address.city || null,
        addressPostalCode: address.postalCode || null,
        addressCountry: address.country || 'PL',
        vatStatus: vatStatus || null,
        trialUsedAt: trialAvailable ? new Date() : (existing.trialUsed ? existing.company?.trialUsedAt : null),
      },
    });

    // 2. Create user
    const user = await tx.user.create({
      data: {
        email: ownerEmail.toLowerCase(),
        password: ownerPassword,
        role: 'user',
        isActive: true,
        emailVerified: false,
      },
    });

    // 3. Create company member (owner)
    const member = await tx.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: 'owner',
        joinedAt: new Date(),
        isActive: true,
      },
    });

    // 4. Create subscription (trial or free)
    let subscription = null;
    if (trialAvailable) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      subscription = await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: 'pro', // Trial gives Pro access
          status: 'trialing',
          trialStart: new Date(),
          trialEnd,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEnd,
        },
      });
    } else {
      // Free plan
      subscription = await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: 'free',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: null, // No end for free plan
        },
      });
    }

    return { company, user, member, subscription };
  });

  // Audit log
  await logDataEvent(AUDIT_ACTIONS.COMPANY_CREATED, {
    userId: result.user.id,
    companyId: result.company.id,
    resourceType: 'company',
    resourceId: result.company.id,
    changes: {
      nip: normalizedNip,
      trialStarted: trialAvailable,
    },
  });

  logger.info('Company registered', {
    companyId: result.company.id,
    nip: normalizedNip,
    userId: result.user.id,
    trialStarted: trialAvailable,
  });

  return result;
}

/**
 * Get company by ID
 */
async function getCompany(companyId) {
  const db = getPrisma();

  return db.company.findUnique({
    where: { id: companyId },
    include: {
      subscription: true,
      members: {
        where: { isActive: true },
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });
}

/**
 * Get company by NIP
 */
async function getCompanyByNip(nip) {
  const db = getPrisma();
  const normalized = validateNip(nip).normalized;

  return db.company.findUnique({
    where: { nip: normalized },
  });
}

/**
 * Get companies for user
 */
async function getCompaniesForUser(userId) {
  const db = getPrisma();

  const memberships = await db.companyMember.findMany({
    where: {
      userId,
      isActive: true,
      company: { deletedAt: null },
    },
    include: {
      company: {
        include: {
          subscription: true,
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    nip: m.company.nip,
    role: m.role,
    joinedAt: m.joinedAt,
    subscription: m.company.subscription,
  }));
}

/**
 * Update company
 */
async function updateCompany(companyId, data, updatedBy) {
  const db = getPrisma();

  // NIP cannot be changed
  if (data.nip) {
    const error = new Error('NIP cannot be modified after registration');
    error.code = 'NIP_IMMUTABLE';
    throw error;
  }

  const company = await db.company.update({
    where: { id: companyId },
    data: {
      name: data.name,
      regon: data.regon,
      krs: data.krs,
      addressStreet: data.address?.street,
      addressCity: data.address?.city,
      addressPostalCode: data.address?.postalCode,
      addressCountry: data.address?.country,
      vatStatus: data.vatStatus,
    },
  });

  await logDataEvent(AUDIT_ACTIONS.COMPANY_MODIFIED, {
    userId: updatedBy,
    companyId,
    resourceType: 'company',
    resourceId: companyId,
    changes: data,
  });

  return company;
}

/**
 * Soft delete company
 */
async function deleteCompany(companyId, deletedBy) {
  const db = getPrisma();

  // Soft delete
  const company = await db.company.update({
    where: { id: companyId },
    data: { deletedAt: new Date() },
  });

  // Cancel active subscription
  await db.subscription.updateMany({
    where: { companyId, status: { in: ['active', 'trialing'] } },
    data: { status: 'canceled', canceledAt: new Date() },
  });

  logger.info('Company deleted', { companyId, deletedBy });

  return company;
}

module.exports = {
  checkNipExists,
  lookupNip,
  registerCompany,
  getCompany,
  getCompanyByNip,
  getCompaniesForUser,
  updateCompany,
  deleteCompany,
};
