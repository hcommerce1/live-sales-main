/**
 * Company Secret Service
 *
 * Manages encrypted secrets for companies (BaseLinker tokens, API keys, etc.)
 *
 * SECURITY:
 * - All secrets are encrypted using AES-256-GCM
 * - Decryption happens only when needed
 * - Secrets are never logged
 */

const cryptoService = require('../utils/crypto');
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
 * Supported secret types
 */
const SECRET_TYPES = {
  BASELINKER_TOKEN: 'baselinker_token',
  GOOGLE_CREDENTIALS: 'google_credentials',
  API_KEY: 'api_key',
};

/**
 * Get a secret for company
 *
 * @param {string} companyId
 * @param {string} secretType - One of SECRET_TYPES
 * @returns {Promise<{value: string, lastUsedAt: Date}|null>}
 */
async function getSecret(companyId, secretType) {
  logger.info('=== GET SECRET ===', {
    companyId,
    companyIdType: typeof companyId,
    secretType,
    timestamp: new Date().toISOString()
  });

  const db = getPrisma();

  logger.info('Querying CompanySecret table', {
    companyId,
    secretType,
    query: `companyId_secretType: { companyId: ${companyId}, secretType: ${secretType} }`
  });

  const secret = await db.companySecret.findUnique({
    where: {
      companyId_secretType: {
        companyId,
        secretType,
      },
    },
  });

  logger.info('CompanySecret query result', {
    companyId,
    secretType,
    found: !!secret,
    secretId: secret?.id,
    secretCreatedAt: secret?.createdAt,
    secretUpdatedAt: secret?.updatedAt,
    hasEncryptedValue: !!secret?.encryptedValue,
    encryptedValueLength: secret?.encryptedValue?.length
  });

  if (!secret) {
    logger.warn('Secret NOT FOUND in database', {
      companyId,
      secretType,
      suggestion: 'Check if token was saved with correct companyId'
    });

    // Debug: list all secrets for this company
    try {
      const allSecrets = await db.companySecret.findMany({
        where: { companyId },
        select: { secretType: true, createdAt: true }
      });
      logger.info('All secrets for this company', {
        companyId,
        secretsCount: allSecrets.length,
        secretTypes: allSecrets.map(s => s.secretType)
      });
    } catch (e) {
      logger.warn('Could not list secrets for debug', { error: e.message });
    }

    // Debug: list all companies with this secret type
    try {
      const companiesWithSecret = await db.companySecret.findMany({
        where: { secretType },
        select: { companyId: true, createdAt: true }
      });
      logger.info('All companies with this secret type', {
        secretType,
        companiesCount: companiesWithSecret.length,
        companyIds: companiesWithSecret.map(s => s.companyId)
      });
    } catch (e) {
      logger.warn('Could not list companies for debug', { error: e.message });
    }

    return null;
  }

  // Decrypt the value
  let decryptedValue;
  try {
    logger.info('Decrypting secret value', { companyId, secretType });
    decryptedValue = cryptoService.decrypt(secret.encryptedValue);
    logger.info('Secret decrypted successfully', {
      companyId,
      secretType,
      decryptedLength: decryptedValue.length
    });
  } catch (error) {
    logger.error('Failed to decrypt secret', {
      companyId,
      secretType,
      error: error.message,
      stack: error.stack
    });
    throw new Error('DECRYPTION_FAILED');
  }

  // Update last used timestamp (fire and forget)
  db.companySecret.update({
    where: { id: secret.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    value: decryptedValue,
    lastUsedAt: secret.lastUsedAt,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

/**
 * Set (create or update) a secret for company
 *
 * @param {string} companyId
 * @param {string} secretType - One of SECRET_TYPES
 * @param {string} plainValue - Unencrypted secret value
 * @param {string} userId - User making the change (for audit)
 * @returns {Promise<{id: string, secretType: string}>}
 */
async function setSecret(companyId, secretType, plainValue, userId) {
  const db = getPrisma();

  // Validate secret type
  if (!Object.values(SECRET_TYPES).includes(secretType)) {
    throw new Error(`Invalid secret type: ${secretType}`);
  }

  // Encrypt the value
  const encryptedValue = cryptoService.encrypt(plainValue);

  // Upsert secret
  const secret = await db.companySecret.upsert({
    where: {
      companyId_secretType: {
        companyId,
        secretType,
      },
    },
    create: {
      companyId,
      secretType,
      encryptedValue,
      createdBy: userId,
    },
    update: {
      encryptedValue,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      secretType: true,
    },
  });

  logger.info('Company secret set', {
    level: 'SECURITY',
    action: 'SECRET_SET',
    companyId,
    secretType,
    userId,
  });

  return secret;
}

/**
 * Delete a secret for company
 *
 * @param {string} companyId
 * @param {string} secretType
 * @param {string} userId - User making the change (for audit)
 * @returns {Promise<boolean>}
 */
async function deleteSecret(companyId, secretType, userId) {
  const db = getPrisma();

  try {
    await db.companySecret.delete({
      where: {
        companyId_secretType: {
          companyId,
          secretType,
        },
      },
    });

    logger.info('Company secret deleted', {
      level: 'SECURITY',
      action: 'SECRET_DELETED',
      companyId,
      secretType,
      userId,
    });

    return true;
  } catch (error) {
    if (error.code === 'P2025') {
      // Record not found
      return false;
    }
    throw error;
  }
}

/**
 * Check if company has a specific secret configured
 *
 * @param {string} companyId
 * @param {string} secretType
 * @returns {Promise<boolean>}
 */
async function hasSecret(companyId, secretType) {
  const db = getPrisma();

  const count = await db.companySecret.count({
    where: {
      companyId,
      secretType,
    },
  });

  return count > 0;
}

/**
 * Get all secret types configured for company (without values)
 *
 * @param {string} companyId
 * @returns {Promise<Array<{secretType: string, lastUsedAt: Date, createdAt: Date}>>}
 */
async function listSecrets(companyId) {
  const db = getPrisma();

  const secrets = await db.companySecret.findMany({
    where: { companyId },
    select: {
      secretType: true,
      lastUsedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return secrets;
}

/**
 * Validate BaseLinker token by making a test API call
 *
 * @param {string} token - BaseLinker API token
 * @returns {Promise<{valid: boolean, accountName?: string, error?: string}>}
 */
async function validateBaseLinkerToken(token) {
  const axios = require('axios');

  try {
    const response = await axios.post(
      'https://api.baselinker.com/connector.php',
      new URLSearchParams({
        token: token,
        method: 'getInventories',
        parameters: JSON.stringify({}),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    if (response.data.status === 'SUCCESS') {
      return {
        valid: true,
        inventories: response.data.inventories?.length || 0,
      };
    }

    return {
      valid: false,
      error: response.data.error_message || 'Unknown error',
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

module.exports = {
  SECRET_TYPES,
  getSecret,
  setSecret,
  deleteSecret,
  hasSecret,
  listSecrets,
  validateBaseLinkerToken,
};
