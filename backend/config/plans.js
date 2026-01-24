/**
 * Plans & Features Configuration
 *
 * SOURCE OF TRUTH for subscription plans and features.
 * Defined in code (not DB) per architectural decision AD1.
 *
 * Benefits:
 * - No DB sync issues
 * - Easy testing
 * - Version controlled
 * - Deploy = update (intentional trade-off)
 *
 * Feature flag: billing.enabled
 */

/**
 * Subscription Plans
 *
 * Prices in grosze (1/100 PLN) to avoid floating point issues
 */
const PLANS = {
  free: {
    id: 'free',
    name: 'Darmowy',
    description: 'Podstawowa funkcjonalność dla małych sklepów',
    price: {
      monthly: 0,
      yearly: 0,
    },
    stripePriceId: {
      monthly: null, // Free plan has no Stripe price
      yearly: null,
    },
    features: {
      // Exports
      'exports.max_count': 1,
      'exports.schedule_min_interval': 60, // minutes
      'exports.fields.basic': true,
      'exports.fields.pro': false,

      // Team
      'team.max_members': 1,
      'team.roles': ['owner'],

      // BaseLinker
      'baselinker.orders': true,
      'baselinker.products': false,
      'baselinker.returns': false,
      'baselinker.invoices': false,

      // Support & API
      'support.priority': false,
      'api.access': false,
    },
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Dla rozwijających się sklepów',
    price: {
      monthly: 6900, // 69 PLN
      yearly: 69000, // 690 PLN (2 miesiące gratis)
    },
    stripePriceId: {
      // TODO: Replace with actual Stripe Price IDs after creating products
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || 'price_basic_monthly_placeholder',
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || 'price_basic_yearly_placeholder',
    },
    features: {
      // Exports
      'exports.max_count': 10,
      'exports.schedule_min_interval': 5,
      'exports.fields.basic': true,
      'exports.fields.pro': false,

      // Team
      'team.max_members': 3,
      'team.roles': ['owner', 'admin', 'member'],

      // BaseLinker
      'baselinker.orders': true,
      'baselinker.products': true,
      'baselinker.returns': false,
      'baselinker.invoices': false,

      // Support & API
      'support.priority': false,
      'api.access': false,
    },
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Pełna funkcjonalność dla profesjonalistów',
    price: {
      monthly: 9900, // 99 PLN
      yearly: 99000, // 990 PLN (2 miesiące gratis)
    },
    stripePriceId: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly_placeholder',
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly_placeholder',
    },
    features: {
      // Exports
      'exports.max_count': 25,
      'exports.schedule_min_interval': 1,
      'exports.fields.basic': true,
      'exports.fields.pro': true,

      // Team
      'team.max_members': 10,
      'team.roles': ['owner', 'admin', 'member'],

      // BaseLinker
      'baselinker.orders': true,
      'baselinker.products': true,
      'baselinker.returns': true,
      'baselinker.invoices': true,

      // Support & API
      'support.priority': true,
      'api.access': true,
    },
  },
};

/**
 * Feature Definitions
 *
 * Describes each feature for UI and validation
 */
const FEATURES = {
  'exports.max_count': {
    id: 'exports.max_count',
    name: 'Liczba eksportów',
    category: 'exports',
    limitType: 'count', // 'count', 'boolean', 'tier'
    description: 'Maksymalna liczba konfiguracji eksportów',
  },
  'exports.schedule_min_interval': {
    id: 'exports.schedule_min_interval',
    name: 'Minimalny interwał',
    category: 'exports',
    limitType: 'tier',
    description: 'Minimalny interwał harmonogramu w minutach',
  },
  'exports.fields.basic': {
    id: 'exports.fields.basic',
    name: 'Pola podstawowe',
    category: 'exports',
    limitType: 'boolean',
    description: 'Dostęp do podstawowych pól eksportu',
  },
  'exports.fields.pro': {
    id: 'exports.fields.pro',
    name: 'Pola PRO',
    category: 'exports',
    limitType: 'boolean',
    description: 'Dostęp do zaawansowanych pól (faktury, komentarze)',
  },
  'team.max_members': {
    id: 'team.max_members',
    name: 'Członkowie zespołu',
    category: 'team',
    limitType: 'count',
    description: 'Maksymalna liczba użytkowników w firmie',
  },
  'team.roles': {
    id: 'team.roles',
    name: 'Role w zespole',
    category: 'team',
    limitType: 'list',
    description: 'Dostępne role dla członków zespołu',
  },
  'baselinker.orders': {
    id: 'baselinker.orders',
    name: 'Synchronizacja zamówień',
    category: 'baselinker',
    limitType: 'boolean',
    description: 'Dostęp do danych zamówień z BaseLinker',
  },
  'baselinker.products': {
    id: 'baselinker.products',
    name: 'Synchronizacja produktów',
    category: 'baselinker',
    limitType: 'boolean',
    description: 'Dostęp do danych produktów z BaseLinker',
  },
  'baselinker.returns': {
    id: 'baselinker.returns',
    name: 'Synchronizacja zwrotów',
    category: 'baselinker',
    limitType: 'boolean',
    description: 'Dostęp do danych zwrotów z BaseLinker',
  },
  'baselinker.invoices': {
    id: 'baselinker.invoices',
    name: 'Synchronizacja faktur',
    category: 'baselinker',
    limitType: 'boolean',
    description: 'Dostęp do danych faktur z BaseLinker',
  },
  'support.priority': {
    id: 'support.priority',
    name: 'Priorytetowe wsparcie',
    category: 'support',
    limitType: 'boolean',
    description: 'Priorytetowa obsługa zgłoszeń',
  },
  'api.access': {
    id: 'api.access',
    name: 'Dostęp API',
    category: 'api',
    limitType: 'boolean',
    description: 'Programistyczny dostęp przez API keys',
  },
};

/**
 * Subscription Status Definitions
 */
const SUBSCRIPTION_STATUS = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
};

/**
 * Status groups for access control
 */
const STATUS_GROUPS = {
  // Full access statuses
  FULL_ACCESS: [SUBSCRIPTION_STATUS.TRIALING, SUBSCRIPTION_STATUS.ACTIVE],

  // Grace period - full access but with warning
  GRACE_PERIOD: [SUBSCRIPTION_STATUS.PAST_DUE],

  // Read-only access
  READ_ONLY: [SUBSCRIPTION_STATUS.UNPAID, SUBSCRIPTION_STATUS.CANCELED],

  // No access
  NO_ACCESS: [SUBSCRIPTION_STATUS.INCOMPLETE, SUBSCRIPTION_STATUS.INCOMPLETE_EXPIRED],
};

/**
 * Trial Configuration
 */
const TRIAL_CONFIG = {
  DURATION_DAYS: 7,
  PLAN_ID: 'pro', // Trial gives Pro plan access
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get plan by ID
 * @param {string} planId
 * @returns {object|null}
 */
function getPlan(planId) {
  return PLANS[planId] || null;
}

/**
 * Get all plan IDs
 * @returns {string[]}
 */
function getAllPlanIds() {
  return Object.keys(PLANS);
}

/**
 * Check if plan exists
 * @param {string} planId
 * @returns {boolean}
 */
function isValidPlan(planId) {
  return Object.prototype.hasOwnProperty.call(PLANS, planId);
}

/**
 * Get feature value for a plan
 * @param {string} planId
 * @param {string} featureId
 * @returns {*} Feature value or null
 */
function getFeatureValue(planId, featureId) {
  const plan = getPlan(planId);
  if (!plan) return null;
  return plan.features[featureId] ?? null;
}

/**
 * Get feature definition
 * @param {string} featureId
 * @returns {object|null}
 */
function getFeatureDefinition(featureId) {
  return FEATURES[featureId] || null;
}

/**
 * Check if status allows full access
 * @param {string} status
 * @returns {boolean}
 */
function hasFullAccess(status) {
  return STATUS_GROUPS.FULL_ACCESS.includes(status) || STATUS_GROUPS.GRACE_PERIOD.includes(status);
}

/**
 * Check if status is in grace period (show warning)
 * @param {string} status
 * @returns {boolean}
 */
function isInGracePeriod(status) {
  return STATUS_GROUPS.GRACE_PERIOD.includes(status);
}

/**
 * Check if status allows any access
 * @param {string} status
 * @returns {boolean}
 */
function hasAnyAccess(status) {
  return !STATUS_GROUPS.NO_ACCESS.includes(status);
}

/**
 * Get Stripe Price ID for plan and interval
 * @param {string} planId
 * @param {'monthly'|'yearly'} interval
 * @returns {string|null}
 */
function getStripePriceId(planId, interval) {
  const plan = getPlan(planId);
  if (!plan) return null;
  return plan.stripePriceId[interval] || null;
}

/**
 * Format price for display
 * @param {number} priceInGrosze
 * @returns {string} e.g., "69,00 zł"
 */
function formatPrice(priceInGrosze) {
  const pln = priceInGrosze / 100;
  return `${pln.toFixed(2).replace('.', ',')} zł`;
}

module.exports = {
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
};
