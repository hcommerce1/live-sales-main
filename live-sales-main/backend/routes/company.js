/**
 * Company Routes
 *
 * Endpoints for company registration, lookup, and management.
 * Feature flag: registration.nip.enabled
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');

const companyService = require('../services/company.service');
const authMiddleware = require('../middleware/auth');
const featureFlags = require('../utils/feature-flags');
const logger = require('../utils/logger');
const passwordService = require('../utils/password');

// ============================================
// Validation Schemas
// ============================================

const lookupNipSchema = z.object({
  nip: z.string().min(10).max(13), // Allow formatted NIP
});

const registerCompanySchema = z.object({
  nip: z.string().min(10).max(13),
  name: z.string().min(2).max(255),
  // User data
  email: z.string().email(),
  password: z.string().min(12).max(128),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
  startTrial: z.boolean().default(true),
});

const updateCompanySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  regon: z.string().max(14).optional(),
  krs: z.string().max(10).optional(),
  address: z.object({
    street: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    postalCode: z.string().max(10).optional(),
    country: z.string().length(2).optional(),
  }).optional(),
  vatStatus: z.enum(['active', 'exempt', 'inactive']).optional(),
});

// ============================================
// Helper: Validate request body
// ============================================

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.validatedBody = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

// ============================================
// Helper: Check feature flag
// ============================================

async function requireNipRegistration(req, res, next) {
  const enabled = await featureFlags.isEnabled('registration.nip.enabled');
  if (!enabled) {
    return res.status(403).json({
      error: 'NIP-based registration is not enabled',
      code: 'FEATURE_DISABLED',
    });
  }
  next();
}

// ============================================
// Public Routes
// ============================================

/**
 * POST /api/company/lookup-nip
 * Lookup company data by NIP (public, for registration form)
 */
router.post('/lookup-nip', requireNipRegistration, validateBody(lookupNipSchema), async (req, res, next) => {
  try {
    const { nip } = req.validatedBody;

    const result = await companyService.lookupNip(nip);

    res.json({
      success: true,
      data: {
        nip: result.nip,
        name: result.nipData?.name || null,
        regon: result.nipData?.regon || null,
        krs: result.nipData?.krs || null,
        address: result.nipData?.address || null,
        vatStatus: result.nipData?.vatStatus || null,
        source: result.nipData?.source || 'manual',
        requiresManualEntry: result.nipData?.requiresManualEntry || false,
        trialAvailable: result.trialAvailable,
      },
    });
  } catch (error) {
    if (error.code === 'INVALID_NIP') {
      return res.status(400).json({
        error: error.message,
        code: error.code,
      });
    }
    if (error.code === 'NIP_ALREADY_REGISTERED') {
      return res.status(409).json({
        error: error.message,
        code: error.code,
      });
    }

    logger.error('NIP lookup failed', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/company/register
 * Register new company with owner account
 */
router.post('/register', requireNipRegistration, validateBody(registerCompanySchema), async (req, res, next) => {
  try {
    const {
      nip,
      name,
      email,
      password,
      startTrial,
    } = req.validatedBody;

    // Hash password (using passwordService to include pepper)
    const hashedPassword = await passwordService.hash(password);

    const result = await companyService.registerCompany({
      nip,
      name,
      ownerEmail: email,
      ownerPassword: hashedPassword,
      startTrial,
    });

    logger.info('Company registered via API', {
      companyId: result.company.id,
      email,
    });

    // Don't return password or sensitive data
    res.status(201).json({
      success: true,
      data: {
        company: {
          id: result.company.id,
          nip: result.company.nip,
          name: result.company.name,
        },
        user: {
          id: result.user.id,
          email: result.user.email,
        },
        subscription: {
          planId: result.subscription.planId,
          status: result.subscription.status,
          trialEnd: result.subscription.trialEnd,
        },
      },
      message: result.subscription.status === 'trialing'
        ? 'Company registered with 7-day Pro trial'
        : 'Company registered with Free plan',
    });
  } catch (error) {
    if (error.code === 'INVALID_NIP') {
      return res.status(400).json({
        error: error.message,
        code: error.code,
      });
    }
    if (error.code === 'NIP_ALREADY_REGISTERED' || error.code === 'EMAIL_ALREADY_REGISTERED') {
      return res.status(409).json({
        error: error.message,
        code: error.code,
      });
    }

    logger.error('Company registration failed', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/company/check-nip/:nip
 * Check if NIP is already registered (public)
 */
router.get('/check-nip/:nip', async (req, res, next) => {
  try {
    const { nip } = req.params;

    const result = await companyService.checkNipExists(nip);

    res.json({
      success: true,
      data: {
        exists: result.exists && !result.isDeleted,
        trialAvailable: !result.trialUsed,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Protected Routes
// ============================================

/**
 * GET /api/company/my-companies
 * Get all companies user belongs to
 */
router.get('/my-companies', authMiddleware.authenticate(), async (req, res, next) => {
  try {
    const companies = await companyService.getCompaniesForUser(req.user.id);

    res.json({
      success: true,
      data: {
        companies,
        total: companies.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/company/:id
 * Get company details (requires membership)
 */
router.get('/:id', authMiddleware.authenticate(), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify user is member
    const companies = await companyService.getCompaniesForUser(req.user.id);
    const membership = companies.find((c) => c.id === id);

    if (!membership) {
      return res.status(403).json({
        error: 'You are not a member of this company',
        code: 'NOT_A_MEMBER',
      });
    }

    const company = await companyService.getCompany(id);

    res.json({
      success: true,
      data: {
        company: {
          id: company.id,
          nip: company.nip,
          name: company.name,
          regon: company.regon,
          krs: company.krs,
          address: {
            street: company.addressStreet,
            city: company.addressCity,
            postalCode: company.addressPostalCode,
            country: company.addressCountry,
          },
          vatStatus: company.vatStatus,
          createdAt: company.createdAt,
        },
        subscription: company.subscription,
        myRole: membership.role,
        memberCount: company.members.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/company/:id
 * Update company (requires admin/owner role)
 */
router.patch('/:id', authMiddleware.authenticate(), validateBody(updateCompanySchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify user is admin/owner
    const companies = await companyService.getCompaniesForUser(req.user.id);
    const membership = companies.find((c) => c.id === id);

    if (!membership) {
      return res.status(403).json({
        error: 'You are not a member of this company',
        code: 'NOT_A_MEMBER',
      });
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({
        error: 'Only owner or admin can update company',
        code: 'PERMISSION_DENIED',
      });
    }

    const company = await companyService.updateCompany(id, req.validatedBody, req.user.id);

    res.json({
      success: true,
      data: { company },
      message: 'Company updated successfully',
    });
  } catch (error) {
    if (error.code === 'NIP_IMMUTABLE') {
      return res.status(400).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/company/:id
 * Delete company (requires owner role)
 */
router.delete('/:id', authMiddleware.authenticate(), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify user is owner
    const companies = await companyService.getCompaniesForUser(req.user.id);
    const membership = companies.find((c) => c.id === id);

    if (!membership) {
      return res.status(403).json({
        error: 'You are not a member of this company',
        code: 'NOT_A_MEMBER',
      });
    }

    if (membership.role !== 'owner') {
      return res.status(403).json({
        error: 'Only owner can delete company',
        code: 'PERMISSION_DENIED',
      });
    }

    await companyService.deleteCompany(id, req.user.id);

    res.json({
      success: true,
      message: 'Company deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
