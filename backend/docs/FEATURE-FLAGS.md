# Feature Flags System

## Overview

Feature flags system for Live Sales B2B SaaS. Backend-only source of truth - frontend NEVER decides, it only reads capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     RESOLUTION PRIORITY                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Redis override per company:  ff:{flagName}:{companyId}      │
│ 2. Redis global override:       ff:{flagName}:global           │
│ 3. Rollout percentage (deterministic hash of companyId)         │
│ 4. Default from config                                          │
├─────────────────────────────────────────────────────────────────┤
│ IMPORTANT: Missing/unknown flag = false (never implicit true)   │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `backend/config/feature-flags.config.js` | Flag definitions (source of truth) |
| `backend/utils/feature-flags.js` | FeatureFlags class with Redis |
| `backend/middleware/featureFlag.js` | Express middleware |
| `backend/routes/admin.js` | Admin API endpoints |

## Flag Definitions

All flags are defined in `backend/config/feature-flags.config.js`:

```javascript
const FEATURE_FLAGS = {
  'company.enabled': {
    default: false,
    description: 'Enable company-based data model',
    rolloutPercent: 0,
  },
  'billing.enabled': {
    default: false,
    description: 'Enable Stripe integration',
    rolloutPercent: 0,
  },
  // ... more flags
};
```

## Usage

### In Routes (Middleware)

```javascript
const { featureFlagMiddleware } = require('../middleware/featureFlag');

// Single flag
router.get('/new-feature',
  authMiddleware,
  featureFlagMiddleware('company.enabled'),
  controller.newFeature
);

// Multiple flags (AND logic)
const { requireAllFeatures } = require('../middleware/featureFlag');
router.get('/advanced',
  authMiddleware,
  requireAllFeatures(['company.enabled', 'billing.enabled']),
  controller.advanced
);

// Multiple flags (OR logic)
const { requireAnyFeature } = require('../middleware/featureFlag');
router.get('/flexible',
  authMiddleware,
  requireAnyFeature(['billing.enabled', 'billing.trial.enabled']),
  controller.flexible
);
```

### In Services (Direct Check)

```javascript
const featureFlags = require('../utils/feature-flags');

async function myService(companyId) {
  const isEnabled = await featureFlags.isEnabled('company.enabled', { companyId });

  if (isEnabled) {
    // New behavior
  } else {
    // Legacy behavior
  }
}
```

## Local Development

### Enable a Flag Locally

**Option 1: Via Redis CLI**
```bash
# Enable globally
redis-cli SET ff:company.enabled:global true

# Enable for specific company
redis-cli SET ff:company.enabled:company-123 true

# Disable
redis-cli SET ff:company.enabled:global false

# Remove override (revert to default)
redis-cli DEL ff:company.enabled:global
```

**Option 2: Via Admin API** (requires admin role or DEV mode)
```bash
# Get all flags
curl -X GET http://localhost:3000/api/admin/feature-flags \
  -H "Authorization: Bearer YOUR_TOKEN"

# Enable flag globally
curl -X POST http://localhost:3000/api/admin/feature-flags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flagName": "company.enabled", "value": true}'

# Enable for specific company
curl -X POST http://localhost:3000/api/admin/feature-flags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flagName": "company.enabled", "value": true, "companyId": "company-123"}'

# Remove override
curl -X DELETE http://localhost:3000/api/admin/feature-flags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flagName": "company.enabled"}'
```

**Option 3: No Redis (defaults only)**

If `REDIS_URL` is not set, the system uses config defaults only. All flags default to `false`.

## Admin API Endpoints

All endpoints require authentication. In production, requires `admin` role. In development, any authenticated user can access.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/feature-flags` | List all flags with current values |
| GET | `/api/admin/feature-flags?companyId=X` | List flags resolved for company X |
| POST | `/api/admin/feature-flags` | Set override |
| DELETE | `/api/admin/feature-flags` | Remove override |
| GET | `/api/admin/feature-flags/:flagName/check` | Quick check for specific flag |

### Request/Response Examples

**GET /api/admin/feature-flags**
```json
{
  "success": true,
  "companyId": null,
  "flags": {
    "company.enabled": {
      "enabled": false,
      "default": false,
      "description": "Enable company-based data model",
      "rolloutPercent": 0,
      "hasCompanyOverride": false,
      "companyOverrideValue": null,
      "hasGlobalOverride": false,
      "globalOverrideValue": null
    }
  },
  "redisConnected": true
}
```

**POST /api/admin/feature-flags**
```json
// Request
{
  "flagName": "company.enabled",
  "value": true,
  "companyId": "optional-company-id"
}

// Response
{
  "success": true,
  "flagName": "company.enabled",
  "companyId": null,
  "newValue": true,
  "previousValue": false
}
```

## Security

- All admin endpoints require JWT authentication
- In production: requires `role: 'admin'`
- In development (`NODE_ENV=development`): any authenticated user
- All changes are audit logged with:
  - User ID, email, role
  - Flag name, company ID
  - Old and new values
  - IP address, User-Agent
  - Timestamp

## Error Handling

The middleware is **fail-secure**:
- Unknown flag → returns `false` (blocked)
- Redis error → returns default (usually `false`)
- Missing flag → returns `false`

Error response format:
```json
{
  "error": "Feature not available",
  "code": "FEATURE_DISABLED",
  "feature": "company.enabled",
  "message": "This feature is not currently enabled for your account."
}
```

## Testing

```bash
# Run all tests
npm test

# Run only feature flag tests
npm test -- --testPathPattern=feature-flags

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Adding New Flags

1. Add flag definition to `backend/config/feature-flags.config.js`:
```javascript
'my.new.feature': {
  default: false,
  description: 'Description of what this flag controls',
  rolloutPercent: 0,
},
```

2. Use in code via middleware or service.

3. **Flag names are STABLE** - do not rename without migration.

## Rollout Strategy

For gradual rollout:

1. Deploy code with flag (default: `false`)
2. Test internally with override
3. Set `rolloutPercent: 10` → 10% of companies get feature
4. Monitor, increase gradually
5. When stable: set `default: true`, remove feature flag check

## Current Flags

| Flag | Description | Default |
|------|-------------|---------|
| `company.enabled` | Company-based data model | false |
| `company.secrets.enabled` | CompanySecret model for API tokens | false |
| `feature_gating.enabled` | Backend-enforced feature gating | false |
| `billing.enabled` | Stripe integration | false |
| `billing.trial.enabled` | 7-day trial per NIP | false |
| `registration.nip.enabled` | NIP-based registration flow | false |
