/**
 * Feature Flags Configuration
 *
 * SOURCE OF TRUTH for feature flag definitions.
 * Names are STABLE - do not rename without migration.
 *
 * Priority order for flag resolution:
 * 1. Redis override per company (ff:{flagName}:{companyId})
 * 2. Redis global override (ff:{flagName}:global)
 * 3. rolloutPercent (if > 0 and companyId provided)
 * 4. default value from this config
 *
 * IMPORTANT: Missing flag = false (never implicit true)
 */

const FEATURE_FLAGS = {
  // ============================================
  // KROK 1: Company Model
  // ============================================
  'company.enabled': {
    default: true,
    description: 'Enable company-based data model and context middleware',
    rolloutPercent: 100,
  },

  // ============================================
  // KROK 2: Secrets per Company
  // ============================================
  'company.secrets.enabled': {
    default: true,
    description: 'Enable CompanySecret model for storing API tokens',
    rolloutPercent: 100,
  },

  // ============================================
  // KROK 3: Feature Gating
  // ============================================
  'features.gating.enabled': {
    default: true,
    description: 'Enable backend-enforced feature gating based on subscription plan',
    rolloutPercent: 100,
  },

  // ============================================
  // KROK 4: Billing / Stripe
  // ============================================
  'billing.enabled': {
    default: true,
    description: 'Enable Stripe integration and subscription management',
    rolloutPercent: 100,
  },

  'billing.trial.enabled': {
    default: true,
    description: 'Enable 7-day trial per NIP',
    rolloutPercent: 100,
  },

  // ============================================
  // KROK 5: Registration with NIP
  // ============================================
  'registration.nip.enabled': {
    default: true,
    description: 'Enable NIP-based company registration flow',
    rolloutPercent: 100,
  },

  // ============================================
  // KROK 6: Security Hardening
  // ============================================
  'security.csrf.enabled': {
    default: true,
    description: 'Enable CSRF protection for state-changing requests',
    rolloutPercent: 100,
  },

  'security.ownership.strict': {
    default: true,
    description: 'Enable strict resource ownership validation',
    rolloutPercent: 100,
  },

  'security.audit.enhanced': {
    default: true,
    description: 'Enable enhanced security audit logging',
    rolloutPercent: 100,
  },

  // ============================================
  // BaseLinker Feature Gates (per plan)
  // ============================================
  'baselinker.orders': {
    default: true,
    description: 'Access to BaseLinker orders API',
    rolloutPercent: 100,
  },

  'baselinker.products': {
    default: true,
    description: 'Access to BaseLinker products/inventory API',
    rolloutPercent: 100,
  },

  'baselinker.returns': {
    default: true,
    description: 'Access to BaseLinker returns API (PRO feature)',
    rolloutPercent: 100,
  },

  'baselinker.invoices': {
    default: true,
    description: 'Access to BaseLinker invoices API (PRO feature)',
    rolloutPercent: 100,
  },
};

/**
 * Validate flag name exists in config
 * @param {string} flagName
 * @returns {boolean}
 */
function isValidFlag(flagName) {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, flagName);
}

/**
 * Get all flag names
 * @returns {string[]}
 */
function getAllFlagNames() {
  return Object.keys(FEATURE_FLAGS);
}

/**
 * Get flag config
 * @param {string} flagName
 * @returns {object|null}
 */
function getFlagConfig(flagName) {
  return FEATURE_FLAGS[flagName] || null;
}

module.exports = {
  FEATURE_FLAGS,
  isValidFlag,
  getAllFlagNames,
  getFlagConfig,
};
