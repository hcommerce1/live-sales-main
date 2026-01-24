/**
 * Company Context Middleware
 *
 * Injects company context into request based on user's membership.
 * Feature flag: company.enabled
 *
 * When enabled:
 * - Loads user's company memberships
 * - Sets req.company to active company
 * - Sets req.memberRole to user's role in that company
 *
 * When disabled (legacy mode):
 * - Does nothing, passes through
 */

const featureFlags = require('../utils/feature-flags');
const logger = require('../utils/logger');

// Lazy load prisma to avoid circular dependencies
let prisma = null;
function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Company Context Middleware
 *
 * Must be used AFTER auth middleware (requires req.user)
 *
 * Adds to request:
 * - req.company: Active company object (or null)
 * - req.memberRole: User's role in company ('owner', 'admin', 'member')
 * - req.companyMembers: Array of all user's memberships (for multi-company support)
 */
async function companyContextMiddleware(req, res, next) {
  try {
    // Check if company feature is enabled
    const companyEnabled = await featureFlags.isEnabled('company.enabled');

    if (!companyEnabled) {
      // Legacy mode - no company context
      req.company = null;
      req.memberRole = null;
      req.companyMembers = [];
      return next();
    }

    // Require authenticated user
    if (!req.user || !req.user.id) {
      req.company = null;
      req.memberRole = null;
      req.companyMembers = [];
      return next();
    }

    const db = getPrisma();

    // Load user's company memberships
    const memberships = await db.companyMember.findMany({
      where: {
        userId: req.user.id,
        isActive: true,
        company: {
          deletedAt: null, // Only active companies
        },
      },
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'asc', // First joined company is default
      },
    });

    req.companyMembers = memberships;

    if (memberships.length === 0) {
      // User has no company membership
      req.company = null;
      req.memberRole = null;
      return next();
    }

    // Determine active company
    // Priority: X-Company-Id header > first membership
    let activeCompanyId = req.headers['x-company-id'];
    let activeMembership = null;

    if (activeCompanyId) {
      // Validate user has access to requested company
      activeMembership = memberships.find((m) => m.companyId === activeCompanyId);

      if (!activeMembership) {
        logger.warn('User attempted to access unauthorized company', {
          level: 'SECURITY',
          userId: req.user.id,
          requestedCompanyId: activeCompanyId,
          userCompanies: memberships.map((m) => m.companyId),
          ip: req.ip,
        });

        return res.status(403).json({
          error: 'Access denied to this company',
          code: 'COMPANY_ACCESS_DENIED',
        });
      }
    } else {
      // Default to first company
      activeMembership = memberships[0];
    }

    // Set company context
    req.company = activeMembership.company;
    req.memberRole = activeMembership.role;

    // Add company ID to logger context for tracing
    logger.debug('Company context set', {
      userId: req.user.id,
      companyId: req.company.id,
      companyName: req.company.name,
      memberRole: req.memberRole,
    });

    next();
  } catch (error) {
    logger.error('Company context middleware error', {
      error: error.message,
      userId: req.user?.id,
      stack: error.stack,
    });

    // Fail-open for now (legacy compatibility)
    // TODO: Consider fail-closed when company.enabled is stable
    req.company = null;
    req.memberRole = null;
    req.companyMembers = [];
    next();
  }
}

/**
 * Require company context
 *
 * Use after companyContextMiddleware to enforce company requirement
 */
function requireCompany(req, res, next) {
  if (!req.company) {
    return res.status(400).json({
      error: 'Company context required',
      code: 'COMPANY_REQUIRED',
      message: 'This endpoint requires a company context. Please ensure you have a company membership.',
    });
  }
  next();
}

/**
 * Require specific role in company
 *
 * @param {...string} allowedRoles - Roles that can access (e.g., 'owner', 'admin')
 */
function requireCompanyRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.company) {
      return res.status(400).json({
        error: 'Company context required',
        code: 'COMPANY_REQUIRED',
      });
    }

    if (!allowedRoles.includes(req.memberRole)) {
      logger.warn('Insufficient company role', {
        level: 'SECURITY',
        userId: req.user?.id,
        companyId: req.company.id,
        userRole: req.memberRole,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_ROLE',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        currentRole: req.memberRole,
      });
    }

    next();
  };
}

/**
 * Resource Ownership Middleware Factory
 *
 * Validates that a resource belongs to the current company.
 * MANDATORY for all endpoints that modify company resources.
 *
 * @param {string} resourceType - Type of resource ('export', 'secret', etc.)
 * @param {string} paramName - Request param containing resource ID (default: 'id')
 * @param {object} options - Additional options
 */
function requireOwnership(resourceType, paramName = 'id', options = {}) {
  const modelMap = {
    export: 'export',
    secret: 'companySecret',
  };

  return async (req, res, next) => {
    try {
      // Skip if company feature is disabled
      const companyEnabled = await featureFlags.isEnabled('company.enabled');
      if (!companyEnabled) {
        return next();
      }

      if (!req.company) {
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({
          error: `Missing ${paramName} parameter`,
          code: 'MISSING_PARAM',
        });
      }

      const db = getPrisma();
      const modelName = modelMap[resourceType];

      if (!modelName) {
        logger.error('Unknown resource type in ownership check', { resourceType });
        return res.status(500).json({
          error: 'Internal server error',
          code: 'INVALID_RESOURCE_TYPE',
        });
      }

      // Load resource
      const resource = await db[modelName].findUnique({
        where: { id: resourceId },
        select: { id: true, companyId: true, userId: true },
      });

      if (!resource) {
        return res.status(404).json({
          error: `${resourceType} not found`,
          code: 'NOT_FOUND',
        });
      }

      // Check ownership
      // For resources with companyId, check company match
      // For legacy resources (only userId), check user match
      const hasCompanyId = resource.companyId !== null && resource.companyId !== undefined;

      if (hasCompanyId) {
        if (resource.companyId !== req.company.id) {
          logger.warn('Unauthorized resource access attempt', {
            level: 'SECURITY',
            userId: req.user?.id,
            companyId: req.company.id,
            resourceType,
            resourceId,
            resourceCompanyId: resource.companyId,
            ip: req.ip,
          });

          return res.status(403).json({
            error: 'Access denied to this resource',
            code: 'OWNERSHIP_DENIED',
          });
        }
      } else if (resource.userId) {
        // Legacy check - resource belongs to user
        if (resource.userId !== req.user.id) {
          logger.warn('Unauthorized legacy resource access attempt', {
            level: 'SECURITY',
            userId: req.user?.id,
            resourceType,
            resourceId,
            resourceUserId: resource.userId,
            ip: req.ip,
          });

          return res.status(403).json({
            error: 'Access denied to this resource',
            code: 'OWNERSHIP_DENIED',
          });
        }
      }

      // Attach resource to request for controller use
      req.resource = resource;
      next();
    } catch (error) {
      logger.error('Ownership check error', {
        error: error.message,
        resourceType,
        paramName,
        stack: error.stack,
      });

      return res.status(500).json({
        error: 'Ownership check failed',
        code: 'OWNERSHIP_CHECK_ERROR',
      });
    }
  };
}

module.exports = {
  companyContextMiddleware,
  requireCompany,
  requireCompanyRole,
  requireOwnership,
};
