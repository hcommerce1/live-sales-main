/**
 * Resource Ownership Middleware
 *
 * Validates that the authenticated user's company owns the requested resource.
 * MANDATORY for all endpoints that modify resources.
 *
 * Security principle: Never trust client-provided resource IDs without ownership check.
 *
 * Flow:
 * 1. Auth middleware verifies JWT → req.user
 * 2. Company context middleware loads company → req.company
 * 3. This middleware loads resource and verifies company_id matches
 * 4. If mismatch → 403 + Audit log
 * 5. If match → req.resource populated, continue
 */

const logger = require('../utils/logger');

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
 * Resource loaders - map resource type to load function
 */
const resourceLoaders = {
  export: async (id) => {
    const db = getPrisma();
    return db.export.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        createdBy: true,
        status: true,
      },
    });
  },

  subscription: async (id) => {
    const db = getPrisma();
    return db.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        planId: true,
        status: true,
      },
    });
  },

  companyMember: async (id) => {
    const db = getPrisma();
    return db.companyMember.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        userId: true,
        role: true,
        isActive: true,
      },
    });
  },

  companySecret: async (id) => {
    const db = getPrisma();
    return db.companySecret.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        secretType: true,
      },
    });
  },
};

/**
 * Custom error for ownership violations
 */
class OwnershipError extends Error {
  constructor(resourceType, resourceId, message) {
    super(message || `Access denied to ${resourceType} ${resourceId}`);
    this.name = 'OwnershipError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.status = 403;
    this.code = 'RESOURCE_ACCESS_DENIED';
  }
}

/**
 * Custom error for not found resources
 */
class ResourceNotFoundError extends Error {
  constructor(resourceType, resourceId) {
    super(`${resourceType} not found: ${resourceId}`);
    this.name = 'ResourceNotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.status = 404;
    this.code = 'RESOURCE_NOT_FOUND';
  }
}

/**
 * Middleware factory - validates ownership of a resource
 *
 * @param {string} resourceType - Type of resource (export, subscription, etc.)
 * @param {string} [paramName='id'] - Request param containing resource ID
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.allowDeleted=false] - Allow access to soft-deleted resources
 * @param {string[]} [options.requiredRoles] - Roles required (in addition to ownership)
 * @returns {Function} Express middleware
 *
 * @example
 * router.put('/exports/:id',
 *   authMiddleware,
 *   companyContextMiddleware,
 *   requireOwnership('export'),
 *   exportController.update
 * );
 */
function requireOwnership(resourceType, paramName = 'id', options = {}) {
  const { allowDeleted = false, requiredRoles = null } = options;

  return async (req, res, next) => {
    try {
      // Require company context
      if (!req.company) {
        logger.warn('Ownership check without company context', {
          resourceType,
          path: req.path,
        });
        return res.status(400).json({
          error: 'Company context required',
          code: 'COMPANY_REQUIRED',
        });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({
          error: `Missing resource ID parameter: ${paramName}`,
          code: 'MISSING_RESOURCE_ID',
        });
      }

      // Get resource loader
      const loader = resourceLoaders[resourceType];
      if (!loader) {
        logger.error('Unknown resource type for ownership check', { resourceType });
        return res.status(500).json({
          error: 'Internal configuration error',
          code: 'UNKNOWN_RESOURCE_TYPE',
        });
      }

      // Load resource
      const resource = await loader(resourceId);

      if (!resource) {
        return res.status(404).json({
          error: `${resourceType} not found`,
          code: 'RESOURCE_NOT_FOUND',
        });
      }

      // Check soft delete (if applicable)
      if (!allowDeleted && resource.deletedAt) {
        return res.status(404).json({
          error: `${resourceType} not found`,
          code: 'RESOURCE_NOT_FOUND',
        });
      }

      // Verify ownership
      if (resource.companyId !== req.company.id) {
        // CRITICAL: Log unauthorized access attempt
        logger.warn('Unauthorized resource access attempt', {
          level: 'SECURITY',
          action: 'OWNERSHIP_VIOLATION',
          userId: req.user?.id,
          userCompanyId: req.company.id,
          resourceType,
          resourceId,
          resourceCompanyId: resource.companyId,
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(403).json({
          error: 'Access denied to this resource',
          code: 'RESOURCE_ACCESS_DENIED',
        });
      }

      // Check required roles (if specified)
      if (requiredRoles && requiredRoles.length > 0) {
        const memberRole = req.memberRole;
        if (!memberRole || !requiredRoles.includes(memberRole)) {
          logger.info('Role-based access denied', {
            userId: req.user?.id,
            companyId: req.company.id,
            resourceType,
            resourceId,
            requiredRoles,
            actualRole: memberRole,
          });

          return res.status(403).json({
            error: 'Insufficient permissions for this resource',
            code: 'INSUFFICIENT_ROLE',
            requiredRoles,
          });
        }
      }

      // Attach resource to request for use in controller
      req.resource = resource;

      logger.debug('Ownership verified', {
        resourceType,
        resourceId,
        companyId: req.company.id,
      });

      next();
    } catch (error) {
      logger.error('Ownership check error', {
        resourceType,
        resourceId: req.params[paramName],
        error: error.message,
      });

      next(error);
    }
  };
}

/**
 * Soft ownership check - doesn't block, just attaches result
 *
 * @param {string} resourceType
 * @param {string} [paramName='id']
 * @returns {Function} Express middleware
 */
function checkOwnership(resourceType, paramName = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.company) {
        req.ownershipCheck = { valid: false, reason: 'No company context' };
        return next();
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        req.ownershipCheck = { valid: false, reason: 'No resource ID' };
        return next();
      }

      const loader = resourceLoaders[resourceType];
      if (!loader) {
        req.ownershipCheck = { valid: false, reason: 'Unknown resource type' };
        return next();
      }

      const resource = await loader(resourceId);
      if (!resource) {
        req.ownershipCheck = { valid: false, reason: 'Resource not found' };
        return next();
      }

      const isOwner = resource.companyId === req.company.id;
      req.ownershipCheck = {
        valid: isOwner,
        resource: isOwner ? resource : null,
        reason: isOwner ? null : 'Not owner',
      };

      if (isOwner) {
        req.resource = resource;
      }

      next();
    } catch (error) {
      req.ownershipCheck = { valid: false, reason: 'Check failed' };
      next();
    }
  };
}

/**
 * Validate ownership in bulk (for batch operations)
 *
 * @param {string} resourceType
 * @param {string[]} resourceIds
 * @param {string} companyId
 * @returns {Promise<{valid: boolean, unauthorized: string[]}>}
 */
async function validateBulkOwnership(resourceType, resourceIds, companyId) {
  const db = getPrisma();
  const unauthorized = [];

  // Batch query based on resource type
  let resources;

  switch (resourceType) {
    case 'export':
      resources = await db.export.findMany({
        where: { id: { in: resourceIds } },
        select: { id: true, companyId: true },
      });
      break;

    default:
      throw new Error(`Bulk ownership not supported for ${resourceType}`);
  }

  // Check each resource
  const resourceMap = new Map(resources.map((r) => [r.id, r]));

  for (const id of resourceIds) {
    const resource = resourceMap.get(id);
    if (!resource || resource.companyId !== companyId) {
      unauthorized.push(id);
    }
  }

  return {
    valid: unauthorized.length === 0,
    unauthorized,
  };
}

/**
 * Register a custom resource loader
 *
 * @param {string} resourceType
 * @param {Function} loader - async (id) => resource | null
 */
function registerResourceLoader(resourceType, loader) {
  if (resourceLoaders[resourceType]) {
    logger.warn('Overwriting existing resource loader', { resourceType });
  }
  resourceLoaders[resourceType] = loader;
}

module.exports = {
  requireOwnership,
  checkOwnership,
  validateBulkOwnership,
  registerResourceLoader,
  OwnershipError,
  ResourceNotFoundError,
};
