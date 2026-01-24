# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Live Sales is a B2B SaaS application that automates data export from BaseLinker (Polish e-commerce platform) to Google Sheets. It features multi-tenant company support, Stripe billing, team collaboration, and scheduled background exports.

**Tech Stack:** Node.js/Express backend + Vue 3/Vite frontend, PostgreSQL (Prisma ORM), Redis (optional), JWT auth with Argon2id passwords, AES-256-GCM encryption for secrets.

## Development Commands

```bash
# Install dependencies
npm install

# Development (backend with nodemon auto-reload)
npm run dev

# Development (Vite frontend dev server - port 5173)
npm run dev:vite

# Production build (frontend to dist/)
npm run build

# Start production server
npm start

# Tests
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm test -- --testPathPattern=feature-flags  # Filter by pattern

# Database migrations
npx prisma migrate dev     # Create and apply migration
npx prisma generate        # Regenerate Prisma client
npx prisma studio          # Visual database browser
```

## Architecture

### Request Flow
```
Request → HTTPS redirect (prod) → Helmet → CORS → Cookie Parser → Rate Limiter →
JSON Parser → Auth Middleware → Company Context → Feature Gate → Route Handler → Response
```

### Key Directories
- `backend/routes/` - Express API routes (auth, exports, billing, team, company, etc.)
- `backend/services/` - Business logic layer (exportService, baselinkerService, googleSheetsService, stripe.service, team.service, etc.)
- `backend/middleware/` - Auth (JWT), company context injection, rate limiting, feature gating, resource ownership
- `backend/config/` - Plans definition (`plans.js`), feature flags (`feature-flags.config.js`)
- `backend/utils/` - Crypto (AES-256-GCM), password hashing (Argon2id), logger (Winston with secret masking)
- `src/` - Vue 3 frontend (Vite build)
- `frontend/` - Legacy frontend (deprecated, still used for login.html)
- `prisma/schema.prisma` - Database schema

### Multi-Tenancy Model
- `Company` is the primary tenant with NIP (Polish tax ID) as unique identifier
- `CompanyMember` links users to companies with roles (owner, admin, member)
- `CompanySecret` stores encrypted API tokens per company
- Exports can belong to either a user (legacy) or company (new)
- `companyContext.js` middleware injects `req.company` and `req.memberRole`

### NIP Validation
`backend/services/nip/` provides company lookup via GUS BIR1 API with manual fallback. NIP format: 10 digits with checksum validation (weights: 6,5,7,2,3,4,5,6,7). Used during company registration to fetch official company name, address, REGON, KRS.

### Feature Flags
Configured in `backend/config/feature-flags.config.js`. Resolution priority:
1. Redis per-company override: `ff:{flagName}:{companyId}`
2. Redis global override: `ff:{flagName}:global`
3. Deterministic rollout by percentage
4. Default from config

Key flags: `company.enabled`, `billing.enabled`, `billing.trial.enabled`, `features.gating.enabled`

### Subscription Plans
Defined in `backend/config/plans.js`. Prices in grosze (1/100 PLN) to avoid floating point issues.
- **Free:** 1 export, 60-min minimum schedule, orders only, 1 team member
- **Basic (69 PLN):** 10 exports, 5-min schedule, orders+products, 3 members
- **Pro (99 PLN):** 25 exports, 1-min schedule, all features (returns, invoices), 10 members, API access

**Trial:** 7 days, grants Pro plan access. Tracked via `trialUsedAt` per NIP (one trial per company, never reset).

## Key Patterns

### Encryption
All sensitive tokens encrypted with AES-256-GCM via `backend/utils/crypto.js`. Format: `iv:tag:ciphertext` (hex). Use `encrypt()`/`decrypt()` functions.

### Authentication
- Access token: 15 min (Authorization header)
- Refresh token: 7 days (httpOnly cookie, rotated on refresh)
- Session timeout: 30 min inactivity (tracked via `lastActivityAt`)

### Database Patterns
- Soft delete via `deletedAt` timestamp on Company
- JSON fields for filters and selectedFields on Export
- Trial tracking: `trialUsedAt` set once per NIP, never reset
- Stripe webhooks use persist-first pattern via `StripeWebhookEvent` model

### Error Response Format
```json
{ "error": { "message": "...", "code": "...", "status": 400 } }
```

## Important Conventions

- Polish language in customer-facing text and documentation
- Zod schemas for input validation in `backend/validators/schemas.js`
- Audit logging via `security-audit.service.js` for sensitive operations
- Winston logging with automatic secret masking to `logs/`
- Feature gates checked before plan-restricted operations
- Resource ownership validated via `resourceOwnership.js` middleware

## Environment Variables

Critical variables (see `.env.example` for full list):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - 64-char hex, generate with `openssl rand -hex 32`
- `ENCRYPTION_KEY` - AES-256-GCM master key
- `PASSWORD_PEPPER` - Additional password security
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` - Google Sheets API
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Billing
- `REDIS_URL` - Optional, falls back to in-memory

## API Routes Structure

- `/api/auth` - Public: register, login, refresh, logout
- `/api/exports` - Protected: CRUD, run, toggle, stats
- `/api/baselinker` - Protected: orders, products, statuses, inventories
- `/api/sheets` - Protected: validate, write, read
- `/api/company` - Mixed: lookup/register public, rest protected
- `/api/team` - Protected: invite, accept, remove, role management
- `/api/billing` - Mixed: webhook public (signature verified), rest protected
- `/api/features` - Auth inside routes
- `/health` - Public health check

## Git Commit Guidelines

### Commit Message Format
```
<type>: <short description>

<optional body with details>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Types
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring without behavior change
- `docs` - Documentation only
- `style` - Formatting, whitespace
- `test` - Adding/updating tests
- `chore` - Build, dependencies, config

### Commit Workflow
```bash
# 1. Check status
git status

# 2. Check recent commits for style reference
git log --oneline -5

# 3. Stage and commit
git add -A
git commit -m "$(cat <<'EOF'
fix: short description here

Optional longer explanation of changes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# 4. Handle remote conflicts if needed
git pull --rebase

# 5. Push to GitHub
git push
```

### Working Directory
Main project path: `live-sales-v7/` (relative to repo root)
Full path on dev machine: `c:\Users\huber\OneDrive\Pulpit\VS CODE\live-sales-v24\live-sales-v23\live-sales-v23\live-sales-v21\live-sales-v21\live-sales-v7`
