# KONTEKST PROJEKTU: Live Sales

> **OSTATNIA AKTUALIZACJA:** 2026-01-24
> **STATUS:** W trakcie implementacji Frontend Hardening + Security

---

## 1. CEL APLIKACJI

**Live Sales** to aplikacja SaaS do automatycznego eksportu danych z BaseLinker do Google Sheets.

### Główne funkcje:
- Pobieranie zamówień/produktów z BaseLinker API
- Eksport do Google Sheets (scheduled lub manual)
- Multi-tenant (wiele firm na jednym systemie)
- Subscription billing via Stripe
- Feature gating (free/basic/pro plans)

---

## 2. STACK TECHNOLOGICZNY

### Backend
| Technologia | Wersja | Zastosowanie |
|-------------|--------|--------------|
| Node.js | 18-22.x | Runtime |
| Express | 4.21.x | HTTP framework |
| Prisma | 5.22.x | ORM (PostgreSQL) |
| argon2 | 0.41.x | Password hashing |
| jsonwebtoken | 9.0.x | JWT auth |
| winston | 3.17.x | Logging |
| zod | 3.23.x | Validation |
| nodemailer | TBD | Email (do dodania) |

### Frontend
| Technologia | Wersja | Zastosowanie |
|-------------|--------|--------------|
| Vue 3 | 3.5.x | UI framework |
| Vite | 6.0.x | Build tool |
| Pinia | TBD | State management (do dodania) |
| Tailwind CSS | inline | Styling |
| Chart.js | 4.4.x | Wykresy |

### Infrastruktura
| Serwis | Zastosowanie |
|--------|--------------|
| Render | Hosting (backend + static) |
| PostgreSQL | Baza danych |
| Redis | Rate limiting, cache |
| GitHub | Repo: hcommerce1/live-sales-main |

---

## 3. STRUKTURA PROJEKTU

```
live-sales-main/
├── backend/
│   ├── config/
│   │   └── export-fields.js      # Definicje pól eksportu per plan
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   ├── companyContext.js     # Multi-tenant context
│   │   ├── featureFlag.js        # Feature flags
│   │   └── featureGate.js        # Plan-based gating
│   ├── routes/
│   │   ├── auth.js               # Login/register/refresh/logout
│   │   ├── exports.js            # Export CRUD + run
│   │   ├── integrations.js       # BaseLinker token mgmt
│   │   ├── billing.js            # Stripe subscriptions
│   │   └── ...
│   ├── services/
│   │   ├── baselinker.js         # BaseLinker API client
│   │   ├── exportService.js      # Export logic
│   │   ├── companySecret.service.js  # Encrypted secrets
│   │   └── feature.service.js    # Feature checks
│   ├── utils/
│   │   ├── logger.js             # Winston logger
│   │   └── password.js           # argon2 wrapper
│   └── validators/
│       └── schemas.js            # Zod schemas
├── prisma/
│   └── schema.prisma             # Database schema
├── src/                          # Frontend
│   ├── api.js                    # API client
│   ├── App.vue                   # Main component (MONOLIT - do refaktoru)
│   ├── main.js                   # Vue app entry
│   ├── data.js                   # Mock data (do usunięcia)
│   └── components/
│       └── ExportWizard.vue      # Export configuration wizard
├── server.js                     # Express app entry
├── package.json
└── .env                          # Environment variables
```

---

## 4. KLUCZOWE WZORCE

### 4.1 Autentykacja
```
Flow: Login → JWT Access Token (15min) + Refresh Token (7 dni w httpOnly cookie)
```

- Access token w localStorage (krótkotrwały)
- Refresh token w httpOnly cookie (secure, sameSite=strict)
- Token rotation przy refresh
- Automatic refresh via API interceptor

### 4.2 Multi-tenancy
```
Header: X-Company-Id → companyContextMiddleware → req.company
```

- User może należeć do wielu firm
- Każdy request wymaga company context
- Dane są izolowane per company

### 4.3 Feature Gating
```
Plan: free/basic/pro → capabilities → UI shows/hides features
```

- Backend sprawdza plan przy każdej operacji
- Frontend pobiera capabilities i dostosowuje UI
- Locked features pokazują "upgrade" prompt

### 4.4 State Management (NOWE - Pinia)
```
Stores: auth, exports, integrations, company
App.vue: tylko template gate + render
```

---

## 5. AKTUALNE ZADANIE

### Frontend Hardening + Security (v2)

**Problem do rozwiązania:**
1. Auth flash - dane poprzedniego usera widoczne przez chwilę po logout
2. Brak 2FA
3. Brak zmiany hasła
4. Fake statystyki na dashboardzie
5. Monolit w App.vue - trudne do utrzymania

**Rozwiązanie:**
1. Pinia stores z $reset() przy logout
2. 2FA via email (2-step flow)
3. Security tab z password change
4. Usunięcie fake danych
5. Login jako komponent (nie osobna strona)

---

## 6. SECURITY REQUIREMENTS

### MUST HAVE:
- [x] httpOnly cookies dla refresh token
- [ ] Rate limiting na auth endpoints
- [ ] Brute force protection dla 2FA (max 3 próby)
- [ ] 2FA codes via argon2 hash
- [ ] Password strength (12+ chars, mixed)
- [ ] Refresh token reuse detection
- [ ] Log sanitization
- [ ] Account enumeration timing fix

### Kluczowe decyzje:
| Kwestia | Decyzja |
|---------|---------|
| CSRF | SameSite=Strict + Origin validation (nie csurf) |
| 2FA | Email codes (nie TOTP) |
| Token storage | Access=localStorage, Refresh=httpOnly cookie |
| Login | Komponent w App.vue (nie osobna strona) |

---

## 7. API ENDPOINTS

### Auth
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | /api/auth/login | ✅ Exists |
| POST | /api/auth/register | ✅ Exists |
| POST | /api/auth/refresh | ✅ Exists (needs cookie update) |
| POST | /api/auth/logout | ✅ Exists |
| GET | /api/auth/me | ✅ Exists |
| POST | /api/auth/change-password | ❌ TODO |
| POST | /api/auth/2fa/enable | ❌ TODO |
| POST | /api/auth/2fa/confirm-enable | ❌ TODO |
| POST | /api/auth/2fa/disable/request | ❌ TODO |
| POST | /api/auth/2fa/disable/confirm | ❌ TODO |
| POST | /api/auth/2fa/verify-login | ❌ TODO |

### Exports
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | /api/exports | ✅ Exists |
| GET | /api/exports/:id | ✅ Exists |
| POST | /api/exports | ✅ Exists |
| DELETE | /api/exports/:id | ✅ Exists |
| POST | /api/exports/:id/run | ✅ Exists (needs runId) |
| POST | /api/exports/:id/toggle | ✅ Exists |

### Integrations
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | /api/integrations | ✅ Exists |
| GET | /api/integrations/baselinker | ✅ Exists |
| POST | /api/integrations/baselinker | ✅ Exists |
| DELETE | /api/integrations/baselinker | ✅ Exists |
| POST | /api/integrations/baselinker/test | ✅ Exists |
| GET | /api/integrations/status | ❌ TODO |

---

## 8. DATABASE SCHEMA (kluczowe modele)

```prisma
model User {
  id                  String    @id @default(uuid())
  email               String    @unique
  password            String
  role                String    @default("user")
  isActive            Boolean   @default(true)
  twoFactorEnabled    Boolean   @default(false)
  twoFactorSecret     String?   // hashed code
  twoFactorExpiry     DateTime?
  twoFactorAttempts   Int       @default(0)
  accountLockedUntil  DateTime?
  failedLoginAttempts Int       @default(0)
  // ... relations
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  revoked   Boolean  @default(false)
  // ... relations
}

model Company {
  id   String @id @default(uuid())
  name String
  // ... relations
}

model CompanySecret {
  id         String   @id @default(uuid())
  companyId  String
  secretType String   // 'BASELINKER_TOKEN', 'GOOGLE_CREDENTIALS'
  value      String   // encrypted
  // ... relations
}
```

---

## 9. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=minimum-32-characters-random-string
JWT_REFRESH_SECRET=another-32-char-string (optional, can use same)

# Frontend
FRONTEND_URL=http://localhost:5173

# Email (do dodania)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@livesales.app

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 10. CONVENTIONS

### Naming
- Files: camelCase.js, PascalCase.vue
- Routes: kebab-case (/api/auth/change-password)
- DB tables: PascalCase (User, RefreshToken)
- DB fields: camelCase (twoFactorEnabled)

### Error responses
```json
{
  "success": false,
  "error": "Human readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {} // optional, dev only
}
```

### Success responses
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

---

## 11. CURRENT BLOCKERS

1. **Brak nodemailer** - wymagany dla 2FA
2. **Brak Pinia** - wymagany dla state management
3. **Schema migration** - nowe pola dla 2FA i lockout

---

## 12. QUICK COMMANDS

```bash
# Dev
npm run dev          # Backend (nodemon)
npm run dev:vite     # Frontend (vite)

# Database
npx prisma migrate dev --name <name>
npx prisma generate
npx prisma studio    # GUI

# Build
npm run build        # Vite build

# Test
npm test
```

---

## 13. CHANGELOG

| Data | Zmiana |
|------|--------|
| 2026-01-24 | Utworzono dokumentację, plan hardening v2 |
| ... | ... |
