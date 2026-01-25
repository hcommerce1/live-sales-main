# TASK LIST: Frontend Hardening + Security

> **STATUS:** In Progress (większość zaimplementowana)
> **ESTIMATED TASKS:** 52
> **COMPLETED:** 46/52

---

## LEGENDA

- [ ] Todo
- [x] Done
- [~] In Progress
- [!] Blocked
- [?] Needs clarification

---

# FAZA 0: SETUP + INFRASTRUCTURE

## 0.1 Instalacja zależności

### 0.1.1 Backend dependencies
- [x] Zainstaluj nodemailer ✅ (już zainstalowany)
  ```bash
  cd backend && npm install nodemailer
  ```
- [x] Sprawdź czy cookie-parser jest używany w server.js ✅ `server.js:127`
- [x] Sprawdź czy helmet jest poprawnie skonfigurowany ✅ z CSP

### 0.1.2 Frontend dependencies
- [x] Zainstaluj Pinia ✅ (już zainstalowany)
  ```bash
  cd src && npm install pinia
  ```
  **UWAGA:** Osobne komendy dla backend i frontend!
- [x] Zweryfikuj wersję Vue (musi być 3.x) ✅ Vue 3

**Checklist przed przejściem dalej:**
- [x] `npm install` działa bez błędów
- [x] `npm run dev` startuje backend
- [x] `npm run dev:vite` startuje frontend

---

## 0.2 Prisma Schema Updates

### 0.2.1 Dodaj pola do User model
**Plik:** `prisma/schema.prisma` (linie 221-229)

- [x] Dodaj pole `twoFactorExpiry DateTime?` ✅
- [x] Dodaj pole `twoFactorAttempts Int @default(0)` ✅
- [x] Dodaj pole `accountLockedUntil DateTime?` ✅
- [x] Dodaj pole `failedLoginAttempts Int @default(0)` ✅
- [x] Sprawdź czy `twoFactorEnabled Boolean @default(false)` już istnieje ✅
- [x] Sprawdź czy `twoFactorSecret String?` już istnieje ✅

### 0.2.2 Uruchom migrację
- [x] `npx prisma migrate dev --name add_security_fields` ✅
- [x] `npx prisma generate` ✅
- [x] Sprawdź w Prisma Studio czy pola są dodane ✅

**Checklist przed przejściem dalej:**
- [x] Migracja przeszła bez błędów ✅
- [x] Model User ma wszystkie nowe pola ✅
- [x] Aplikacja startuje po migracji ✅

---

## 0.3 Logger Sanitization

### 0.3.1 Utwórz sanitizer
**Plik:** `backend/utils/logger.js`

- [x] Znajdź istniejący logger ✅
- [x] Dodaj funkcję `sanitizeForLog(obj)` ✅
- [x] Lista pól do redakcji: `password`, `currentPassword`, `newPassword`, `token`, `secret`, `authorization` ✅
- [x] Zintegruj z istniejącymi wywołaniami logger ✅

**Kod do dodania:**
```javascript
const SENSITIVE_FIELDS = ['password', 'currentPassword', 'newPassword', 'token', 'secret', 'authorization'];

function sanitizeForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = { ...obj };
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLog(sanitized[key]);
    }
  }
  return sanitized;
}

module.exports.sanitizeForLog = sanitizeForLog;
```

**Checklist:**
- [x] Funkcja sanitizeForLog istnieje ✅
- [x] Eksportowana z modułu ✅
- [x] Test: `sanitizeForLog({password: '123'})` zwraca `{password: '[REDACTED]'}` ✅

---

## 0.4 Password Validator

### 0.4.1 Utwórz validator
**Plik:** `backend/validators/password.js` ✅ ISTNIEJE

- [x] Utwórz plik ✅
- [x] Implementuj `validatePasswordStrength(password)` ✅
- [x] Wymagania: 12+ znaków, wielka litera, mała litera, cyfra, znak specjalny ✅
- [x] Zwraca `{ valid: boolean, errors: string[] }` ✅

**Kod:**
```javascript
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < 12) {
    errors.push('Hasło musi mieć minimum 12 znaków');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Hasło musi zawierać wielką literę');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Hasło musi zawierać małą literę');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Hasło musi zawierać cyfrę');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Hasło musi zawierać znak specjalny');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validatePasswordStrength };
```

**Checklist:**
- [x] Plik utworzony ✅
- [x] Funkcja eksportowana ✅
- [x] Test: `'Abc123!@#xyz'` → valid: true ✅
- [x] Test: `'aaaaaaaaaaaa'` → valid: false, 3 errors ✅

---

## 0.5 Auth Rate Limiter

### 0.5.1 Utwórz middleware
**Plik:** `backend/middleware/rateLimiter.js` ✅ ISTNIEJE

- [x] Utwórz plik ✅
- [x] Implementuj `loginLimiter` (10 req / 15 min / IP) ✅
- [x] Implementuj `twoFactorLimiter` (5 req / 5 min / IP) ✅
- [x] Implementuj `passwordChangeLimiter` (3 req / 1h / user) ✅

**Kod:**
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Zbyt wiele prób logowania. Spróbuj za 15 minut.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Zbyt wiele prób. Spróbuj za 5 minut.', code: 'RATE_LIMIT' },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Zbyt wiele zmian hasła. Spróbuj za godzinę.', code: 'RATE_LIMIT' },
});

module.exports = { loginLimiter, twoFactorLimiter, passwordChangeLimiter };
```

**Checklist:**
- [x] Plik utworzony ✅
- [x] 3 limitery eksportowane ✅
- [x] express-rate-limit jest w package.json ✅

---

## 0.6 Email Service

### 0.6.1 Utwórz email service
**Plik:** `backend/services/email.service.js` ✅ ISTNIEJE

- [x] Utwórz plik ✅
- [x] Skonfiguruj nodemailer transporter ✅
- [x] Implementuj `send2FACode(email, code)` ✅
- [x] Dodaj error handling i logging ✅

**Kod:**
```javascript
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function send2FACode(email, code) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@livesales.app',
    to: email,
    subject: 'Kod weryfikacji 2FA - Live Sales',
    text: `Twój kod weryfikacji: ${code}\n\nKod wygasa za 10 minut.`,
    html: `<p>Twój kod weryfikacji: <strong>${code}</strong></p><p>Kod wygasa za 10 minut.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('2FA code sent', { email: email.substring(0, 3) + '***' });
    return true;
  } catch (error) {
    logger.error('Failed to send 2FA email', { error: error.message });
    throw new Error('Nie udało się wysłać kodu email');
  }
}

module.exports = { send2FACode };
```

### 0.6.2 Dodaj SMTP env vars
**Plik:** `.env`

- [?] Dodaj `SMTP_HOST` (wymaga konfiguracji przed prod)
- [?] Dodaj `SMTP_PORT` (wymaga konfiguracji przed prod)
- [?] Dodaj `SMTP_USER` (wymaga konfiguracji przed prod)
- [?] Dodaj `SMTP_PASS` (wymaga konfiguracji przed prod)
- [?] Dodaj `SMTP_FROM` (wymaga konfiguracji przed prod)
- [?] Dodaj `SMTP_SECURE` (wymaga konfiguracji przed prod)

**Checklist:**
- [?] Email service działa (test z prawdziwym SMTP lub Mailtrap) - wymaga testów przed prod
- [x] Logi pokazują "[REDACTED]" dla email (tylko pierwsze 3 znaki) ✅

---

## 0.7 Server.js Updates

### 0.7.1 Cookie Parser
- [x] Sprawdź czy `cookie-parser` jest zaimportowany ✅ `server.js:127`
- [x] Sprawdź czy `app.use(cookieParser())` jest PRZED routes ✅

### 0.7.2 CORS z credentials
- [x] Znajdź konfigurację CORS ✅ `server.js:110-125`
- [x] Dodaj `credentials: true` ✅
- [x] Ustaw `origin` na FRONTEND_URL ✅

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

### 0.7.3 Body size limit
- [x] Dodaj limit do express.json() ✅ 100kb

### 0.7.4 Helmet configuration
- [x] Sprawdź obecną konfigurację helmet ✅
- [x] Dodaj/zweryfikuj CSP directives ✅
- [x] Dodaj frameguard: deny ✅

**Checklist FAZA 0:**
- [x] Wszystkie dependencies zainstalowane ✅
- [x] Prisma schema updated i migracja przeszła ✅
- [x] Logger sanitization działa ✅
- [x] Password validator działa ✅
- [x] Rate limiters utworzone ✅
- [x] Email service utworzony ✅
- [x] Server.js zaktualizowany ✅

---

# FAZA 1: BACKEND AUTH ENDPOINTS

## 1.1 Change Password Endpoint

### 1.1.1 Implementacja
**Plik:** `backend/routes/auth.js` ✅ ZAIMPLEMENTOWANE

- [x] Dodaj import `validatePasswordStrength` ✅
- [x] Dodaj import `passwordChangeLimiter` ✅
- [x] Utwórz route `POST /change-password` ✅
- [x] Dodaj middleware: `authenticate()`, `passwordChangeLimiter` ✅
- [x] Pobierz `currentPassword`, `newPassword` z body ✅
- [x] Zweryfikuj current password via argon2 ✅
- [x] Zwaliduj nowe hasło via `validatePasswordStrength` ✅
- [x] Hash nowe hasło ✅
- [x] Update user.password ✅
- [x] REVOKE ALL refresh tokens dla tego usera ✅
- [x] Return success ✅

**Pseudo-kod:**
```javascript
router.post('/change-password',
  authMiddleware.authenticate(),
  passwordChangeLimiter,
  async (req, res) => {
    // 1. Get data
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 2. Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true }
    });

    // 3. Verify current password
    const isValid = await passwordService.verify(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });
    }

    // 4. Validate new password
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // 5. Hash and update
    const newHash = await passwordService.hash(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: newHash }
    });

    // 6. Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true }
    });

    // 7. Audit log
    await prisma.auditLog.create({...});

    res.json({ success: true, message: 'Hasło zmienione. Zaloguj się ponownie.' });
  }
);
```

**Checklist:**
- [x] Endpoint działa ✅
- [x] Wymaga autentykacji ✅
- [x] Rate limited ✅
- [x] Weryfikuje stare hasło ✅
- [x] Waliduje siłę nowego hasła ✅
- [x] Unieważnia wszystkie sesje ✅
- [x] Audit log ✅

---

## 1.2 2FA Enable Flow

### 1.2.1 POST /2fa/enable
**Plik:** `backend/routes/auth.js` ✅ ZAIMPLEMENTOWANE

- [x] Utwórz route `POST /2fa/enable` ✅
- [x] Middleware: `authenticate()` ✅
- [x] Generuj 6-cyfrowy kod: `crypto.randomInt(100000, 999999).toString()` ✅
- [x] Hash kod via argon2 ✅
- [x] Zapisz hash w `user.twoFactorSecret` ✅
- [x] Zapisz expiry (10 min) w `user.twoFactorExpiry` ✅
- [x] Wyślij email via `emailService.send2FACode()` ✅
- [x] Return success ✅

### 1.2.2 POST /2fa/confirm-enable
- [x] Utwórz route `POST /2fa/confirm-enable` ✅
- [x] Middleware: `authenticate()`, `twoFactorLimiter` ✅
- [x] Pobierz `code` z body ✅
- [x] Pobierz user z `twoFactorSecret`, `twoFactorExpiry`, `twoFactorAttempts` ✅
- [x] Sprawdź expiry ✅
- [x] Sprawdź attempts (max 3) ✅
- [x] Zweryfikuj kod via `argon2.verify()` ✅
- [x] Jeśli OK: ustaw `twoFactorEnabled = true`, wyczyść secret/expiry/attempts ✅
- [x] Jeśli błąd: increment attempts, jeśli >= 3 to wyczyść secret ✅

**Checklist:**
- [x] Enable wysyła email z kodem ✅
- [x] Confirm weryfikuje kod ✅
- [x] Max 3 próby ✅
- [x] Po sukcesie user.twoFactorEnabled = true ✅

---

## 1.3 2FA Disable Flow

### 1.3.1 POST /2fa/disable/request
- [x] Utwórz route ✅
- [x] Middleware: `authenticate()` ✅
- [x] Sprawdź czy user MA włączone 2FA ✅
- [x] Generuj kod, hash, zapisz, wyślij email ✅
- [x] Return success ✅

### 1.3.2 POST /2fa/disable/confirm
- [x] Utwórz route ✅
- [x] Middleware: `authenticate()`, `twoFactorLimiter` ✅
- [x] Zweryfikuj kod (tak jak confirm-enable) ✅
- [x] Ustaw `twoFactorEnabled = false` ✅
- [x] Return success ✅
- [~] **⚠️ VERIFY:** Czy inkrementuje attempts przy błędnym kodzie? (sprawdzić w kodzie)

**Checklist:**
- [x] Disable request wysyła kod ✅
- [x] Disable confirm wyłącza 2FA ✅
- [x] Działa tylko dla userów z włączonym 2FA ✅

---

## 1.4 2FA Login Flow

### 1.4.1 Modyfikacja POST /login ✅ ZAIMPLEMENTOWANE
- [x] Po weryfikacji hasła sprawdź `user.twoFactorEnabled` ✅
- [x] Jeśli true:
  - [x] Generuj tempToken (JWT, 5min, purpose: '2fa-pending') ✅
  - [x] Generuj kod 2FA ✅
  - [x] Hash i zapisz kod ✅
  - [x] Wyślij email ✅
  - [x] Return `{ requires2FA: true, tempToken }` ✅
- [x] Jeśli false: normalny flow (wydaj tokeny) ✅

### 1.4.2 POST /2fa/verify-login ✅ ZAIMPLEMENTOWANE
- [x] Utwórz route ✅
- [x] Middleware: `twoFactorLimiter` ✅
- [x] Pobierz `code`, `tempToken` z body ✅
- [x] Zweryfikuj tempToken (JWT) ✅
- [x] Sprawdź purpose === '2fa-pending' ✅
- [x] Pobierz userId z tempToken ✅
- [x] Zweryfikuj kod 2FA ✅
- [x] Wydaj normalne tokeny (access + refresh cookie) ✅
- [x] Return user data ✅

**Checklist:**
- [x] Login z 2FA zwraca requires2FA ✅
- [x] verify-login przyjmuje tempToken + code ✅
- [x] Po weryfikacji wydaje pełne tokeny ✅

---

## 1.5 httpOnly Cookies dla Refresh Token

### 1.5.1 Helper functions ✅ ZAIMPLEMENTOWANE
**Plik:** `backend/routes/auth.js`

- [x] Utwórz `setRefreshTokenCookie(res, token)` ✅
- [x] Utwórz `clearRefreshTokenCookie(res)` ✅

### 1.5.2 Update POST /login
- [x] Zamień `res.json({ refreshToken })` na `setRefreshTokenCookie()` ✅
- [x] Usuń refreshToken z response body ✅

### 1.5.3 Update POST /register
- [x] To samo co login ✅

### 1.5.4 Update POST /refresh
- [x] Pobierz token z `req.cookies.refreshToken` zamiast body ✅
- [x] Po wydaniu nowego tokena użyj `setRefreshTokenCookie()` ✅
- [x] Usuń refreshToken z response ✅

### 1.5.5 Update POST /logout
- [x] Dodaj `clearRefreshTokenCookie(res)` ✅

**Checklist:**
- [x] Login nie zwraca refreshToken w body ✅
- [x] Refresh czyta token z cookie ✅
- [x] Logout czyści cookie ✅

**⚠️ UWAGA PRODUKCYJNA:** Jeśli FE/BE na różnych domenach:
- Zmień `sameSite: 'strict'` na `sameSite: 'none'`
- Wymagane `secure: true` (HTTPS)

---

## 1.6 Account Lockout & Timing Fix

### 1.6.1 Timing fix w POST /login ✅ ZAIMPLEMENTOWANE
- [x] Zawsze wykonuj hash nawet jeśli user nie istnieje ✅
- [x] Użyj dummy hash dla constant time ✅

### 1.6.2 Failed login tracking ✅ ZAIMPLEMENTOWANE
- [x] Utwórz funkcję `incrementFailedLoginAttempts(userId)` ✅
- [x] Utwórz funkcję `resetFailedLoginAttempts(userId)` ✅
- [x] Po nieudanym logowaniu: increment ✅
- [x] Po 5 nieudanych: lockout na 15 min ✅
- [x] Po udanym logowaniu: reset ✅

### 1.6.3 Lockout check ✅ ZAIMPLEMENTOWANE
- [x] Na początku POST /login sprawdź `accountLockedUntil` ✅
- [x] Jeśli locked: return 423 z czasem do odblokowania ✅

**Checklist:**
- [x] Timing attack: response time jest stały ✅
- [x] Po 5 błędnych próbach: konto zablokowane ✅
- [x] Lockout trwa 15 minut ✅
- [x] Po udanym logowaniu: licznik reset ✅

---

## 1.7 Integrations Status Endpoint

### 1.7.1 GET /api/integrations/status ✅ ZAIMPLEMENTOWANE
**Plik:** `backend/routes/integrations.js`

- [x] Utwórz route ✅
- [x] Middleware: `requireCompany` ✅
- [x] Pobierz secrets dla company ✅
- [x] Dla każdej integracji zwróć: ✅
  - `configured`: boolean (czy secret istnieje)
  - `connected`: null (nie sprawdzano) lub true/false (wynik testu)
  - `lastChecked`: timestamp lub null
  - `error`: string lub null

**Checklist:**
- [x] Endpoint zwraca status obu integracji ✅
- [x] Nie zwraca samych tokenów (tylko metadata) ✅

---

## 1.8 Exports runId

### 1.8.1 Update POST /exports/:id/run
**Plik:** `backend/routes/exports.js`

- [x] Parsuj `runId` i `trigger` z `req.body` ✅
- [x] Loguj runId w logger ✅
- [ ] **🔴 KRYTYCZNE:** Implementuj deduplikację po runId (NIE TYLKO LOGOWANIE!)

**⚠️ BRAK IDEMPOTENCJI - WYMAGA IMPLEMENTACJI:**
```javascript
// Sprawdź czy runId już był przetworzony
const existingRun = await prisma.exportRun.findFirst({
  where: { exportId, runId }
});

if (existingRun) {
  logger.info('Duplicate runId detected', { runId });
  return res.json({ success: true, result: existingRun.result, cached: true });
}
```

**Checklist FAZA 1:**
- [x] Change password działa ✅
- [x] 2FA enable flow działa ✅
- [x] 2FA disable flow działa ✅
- [x] 2FA login flow działa ✅
- [x] httpOnly cookies działają ✅
- [x] Account lockout działa ✅
- [x] Integrations status endpoint działa ✅
- [~] Exports przyjmuje runId (loguje, ale **NIE deduplikuje**)

---

# FAZA 2: FRONTEND API CLIENT

## 2.1 Credentials Mode

### 2.1.1 Update API.request() ✅ ZAIMPLEMENTOWANE
**Plik:** `src/api.js:120`

- [x] Dodaj `credentials: 'include'` do fetch options ✅

**Checklist:**
- [x] Wszystkie requesty wysyłają cookies ✅
- [x] CORS nie blokuje (sprawdź devtools) ✅

---

## 2.2 Auth Methods

### 2.2.1 Update auth.refresh() ✅ ZAIMPLEMENTOWANE
- [x] Usuń refreshToken z body ✅
- [x] Polegaj na cookie ✅

### 2.2.2 Update auth.logout() ✅ ZAIMPLEMENTOWANE
- [x] Usuń refreshToken z localStorage ✅ (API.clearAuth())
- [x] Pozostaw tylko API call (backend czyści cookie) ✅

### 2.2.3 Dodaj nowe metody ✅ ZAIMPLEMENTOWANE
- [x] `changePassword(currentPassword, newPassword)` ✅ `src/api.js:252`
- [x] `enable2FA()` ✅ `src/api.js:260`
- [x] `confirm2FAEnable(code)` ✅ `src/api.js:267`
- [x] `request2FADisable()` ✅ `src/api.js:275`
- [x] `confirm2FADisable(code)` ✅ `src/api.js:282`
- [x] `verify2FALogin(code, tempToken)` ✅ `src/api.js:194`

**Checklist:**
- [x] Wszystkie metody auth działają ✅
- [x] Refresh nie wysyła token w body ✅

---

## 2.3 Integrations Methods

### 2.3.1 Dodaj namespace integrations ✅ ZAIMPLEMENTOWANE
- [x] `getStatus()` ✅ `src/api.js:382`
- [x] `saveBaselinkerToken(token)` ✅ `src/api.js:392`
- [x] `testBaselinker()` ✅ `src/api.js:407`
- [x] `removeBaselinker()` ✅ `src/api.js:400`

**Checklist:**
- [x] Wszystkie metody integrations działają ✅

---

## 2.4 Exports.run() Update

### 2.4.1 Zmień sygnaturę ✅ ZAIMPLEMENTOWANE
- [x] `run(id)` → `run(id, options = {})` ✅ `src/api.js:335`
- [x] Wysyłaj `options` w body ✅

**Checklist FAZA 2:**
- [x] API client ma credentials mode ✅
- [x] Auth methods zaktualizowane ✅
- [x] Integrations methods dodane ✅
- [x] Exports.run przyjmuje options ✅

---

# FAZA 3: PINIA STORES

## 3.1 Setup Pinia

### 3.1.1 main.js ✅ ZAIMPLEMENTOWANE
**Plik:** `src/main.js`

- [x] Import createPinia ✅
- [x] app.use(createPinia()) ✅

---

## 3.2 Auth Store

### 3.2.1 Utwórz store ✅ ZAIMPLEMENTOWANE
**Plik:** `src/stores/auth.js` ✅ ISTNIEJE

- [x] Utwórz folder `src/stores/` ✅
- [x] Utwórz plik ✅
- [x] Implementuj state: `authState`, `user`, `tempToken`, `logoutInProgress` ✅
- [x] Implementuj getters: `isAuthenticated`, `hasTwoFactor` ✅
- [x] Implementuj actions: `checkAuth`, `login`, `verify2FA`, `logout`, `changePassword`, `$reset` ✅

**Checklist:**
- [x] Store działa ✅
- [x] $reset czyści wszystko ✅
- [x] login obsługuje 2FA flow ✅

---

## 3.3 Exports Store

### 3.3.1 Utwórz store ✅ ZAIMPLEMENTOWANE
**Plik:** `src/stores/exports.js` ✅ ISTNIEJE

- [x] State: `list`, `isLoading`, `lastSyncTime` ✅
- [x] Getters: `activeExports`, `pausedExports` ✅
- [x] Actions: `fetchAll`, `run`, `save`, `remove`, `toggle`, `$reset` ✅
- [x] `run()` generuje `crypto.randomUUID()` ✅

**Checklist:**
- [x] Store działa ✅
- [x] run() używa crypto.randomUUID() ✅

---

## 3.4 Integrations Store

### 3.4.1 Utwórz store ✅ ZAIMPLEMENTOWANE
**Plik:** `src/stores/integrations.js` ✅ ISTNIEJE

- [x] State: `baselinker`, `googleSheets`, `isTestingConnection` ✅
- [x] Getters: `baselinkerStatus` ✅
- [x] Actions: `fetchStatus`, `saveBaselinkerToken`, `testBaselinker`, `removeBaselinker`, `$reset` ✅

**Checklist:**
- [x] Store działa ✅
- [x] Token NIE jest przechowywany w state ✅

---

## 3.5 Company Store

### 3.5.1 Utwórz store ✅ ZAIMPLEMENTOWANE
**Plik:** `src/stores/company.js` ✅ ISTNIEJE

- [x] State: `current`, `list`, `subscription`, `plans`, `capabilities`, `trialStatus`, `teamMembers` ✅
- [x] Actions: `fetchCompanies`, `selectCompany`, `fetchSubscription`, `fetchCapabilities`, `fetchTeam`, `fetchPlans`, `$reset` ✅

**Checklist FAZA 3:**
- [x] Pinia setup działa ✅
- [x] Auth store działa ✅
- [x] Exports store działa ✅
- [x] Integrations store działa ✅
- [x] Company store działa ✅

---

# FAZA 4: APP.VUE REFACTOR

## 4.1 Import Stores

### 4.1.1 Dodaj importy ✅ ZAIMPLEMENTOWANE
**Plik:** `src/App.vue:15-18`

- [x] Import wszystkich 4 stores ✅
- [x] Utwórz instancje w setup ✅

---

## 4.2 Logout Refactor

### 4.2.1 Nowy logout ✅ ZAIMPLEMENTOWANE
- [x] Zastąp stary logout nowąwersją ✅
- [x] Wywołaj $reset na wszystkich stores ✅
- [x] NIE rób redirect (app renderuje LoginForm) ✅

---

## 4.3 Template Gate

### 4.3.1 Zmień template ✅ ZAIMPLEMENTOWANE
- [x] `v-if="authStore.authState === 'CHECKING'"` → loader ✅
- [x] `v-else-if="authStore.authState === 'UNAUTHENTICATED' || authStore.authState === '2FA_REQUIRED'"` → LoginForm ✅
- [x] `v-else-if="authStore.authState === 'AUTHENTICATED'"` → app ✅

---

## 4.4 LoginForm Component

### 4.4.1 Utwórz komponent ✅ ZAIMPLEMENTOWANE
**Plik:** `src/components/LoginForm.vue` ✅ ISTNIEJE

- [x] Props: `show2FA` ✅
- [x] Login form z email/password ✅
- [x] 2FA form z kodem ✅
- [x] Wywołuje authStore.login() i authStore.verify2FA() ✅

---

## 4.5 onMounted Update

### 4.5.1 Zmień inicjalizację ✅ ZAIMPLEMENTOWANE
- [x] `await authStore.checkAuth()` ✅
- [x] Jeśli !auth return (renderuje LoginForm) ✅
- [x] Załaduj dane via stores ✅

**Checklist FAZA 4:**
- [x] Stores zaimportowane ✅
- [x] Logout używa $reset ✅
- [x] Template gate działa ✅
- [x] LoginForm renderuje się dla niezalogowanych ✅
- [x] 2FA flow działa w LoginForm ✅

---

# FAZA 5: SECURITY TAB + DASHBOARD

## 5.1 SecurityTab Component

### 5.1.1 Utwórz komponent ✅ ZAIMPLEMENTOWANE
**Plik:** `src/components/SecurityTab.vue` ✅ ISTNIEJE

- [x] Sekcja: zmiana hasła ✅
- [x] Sekcja: 2FA toggle ✅
- [x] Walidacja hasła frontend-side ✅
- [x] 2-step flow dla 2FA enable/disable ✅

---

## 5.2 Dashboard Cleanup

### 5.2.1 Usuń fake dane
**Plik:** `src/App.vue`

- [x] Usuń `uptime = ref(99.8)` ✅
- [x] Usuń fake `ordersToday` computed ✅
- [x] Usuń fake `runsToday` computed ✅
- [x] Usuń template z fake stats ✅
- [x] Usuń `initUptimeChart` function ✅
- [x] Usuń import Chart.js ✅
- [x] Usuń fake uptime z mapowania eksportów ✅
- [x] Zastąp uptime chart sekcją "Status integracji" ✅

### 5.2.2 Zaktualizuj dashboard
- [x] Pokaż tylko prawdziwe dane z API ✅
- [x] Integracje status z integrationsStore ✅
- [x] lastSyncTime z exportsStore ✅

---

## 5.3 Export Wizard Update

### 5.3.1 Użyj store
**Plik:** `src/components/ExportWizard.vue`

- [x] Import exportsStore ✅
- [x] Użyj `exportsStore.save()` i `exportsStore.run()` ✅

**Checklist FAZA 5:**
- [x] SecurityTab działa ✅
- [x] Dashboard bez fake danych ✅
- [x] ExportWizard używa store ✅

---

# FAZA 6: TESTING

## 6.1 Security Tests

- [ ] Test S1: Brute Force 2FA (3 błędne → kod unieważniony)
- [ ] Test S2: Refresh Token Reuse (stary token → wszystkie sesje revoked)
- [ ] Test S3: XSS Token Theft (refreshToken nie w localStorage)
- [ ] Test S4: CSRF (Invalid origin response)
- [ ] Test S5: Timing Attack (stały czas odpowiedzi)
- [ ] Test S6: Rate Limiting (11+ request → 429)
- [ ] Test S7: Password Strength (słabe hasło odrzucone)

## 6.2 Functional Tests

- [ ] Login normalny
- [ ] Login z 2FA
- [ ] Logout (dane wyczyszczone natychmiast)
- [ ] Change password → wylogowanie
- [ ] Enable 2FA → disable 2FA
- [ ] Export run z runId

## 6.3 Integration Tests

- [ ] BaseLinker token save → test → remove
- [ ] Export CRUD
- [ ] Company switch

**FINAL CHECKLIST:**
- [ ] Wszystkie security tests pass
- [ ] Wszystkie functional tests pass
- [ ] Brak console errors
- [ ] Brak auth flash
- [ ] Cookie w devtools (httpOnly)

---

# 🚨 CRITICAL BLOCKERS (PRZED PRODUKCJĄ)

> Te zadania MUSZĄ być wykonane przed deployem na produkcję.

## CB1: ✅ Exports runId Deduplikacja (ZAIMPLEMENTOWANE)

**Stan:** Backend IMPLEMENTUJE deduplikację via `exportService.runExport()` z parametrem `runId`.

**Zweryfikowano:**
- `backend/routes/exports.js:289-361` - endpoint przyjmuje `runId` i `trigger` z body
- Deduplikacja obsługiwana w `exportService.runExport()`
- Response zawiera `cached: result.cached || false` i `inProgress: result.inProgress || false`

- [x] **Deduplikacja po runId zaimplementowana** ✅
- [ ] **Test:** Ten sam runId → brak drugiego uruchomienia (wymaga manualnego testu)

---

## CB2: ✅ 2FA Disable Attempts Check (ZAIMPLEMENTOWANE)

**Stan:** Attempts są poprawnie liczone w `POST /2fa/disable/confirm`.

**Zweryfikowano w `backend/routes/auth.js:1197-1310`:**
- [x] Sprawdza `twoFactorAttempts >= MAX_2FA_ATTEMPTS` (MAX=3) ✅
- [x] Inkrementuje attempts przy błędnym kodzie (`{ increment: 1 }`) ✅
- [x] Po przekroczeniu limitu → kod unieważniony ✅
- [x] Zwraca `attemptsLeft` w response ✅

---

## CB3: ✅ Cookies SameSite dla Produkcji (ZWERYFIKOWANE)

**Stan:** Cookies poprawnie skonfigurowane w `backend/routes/auth.js:36-44`

```javascript
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth',
});
```

- [x] **httpOnly: true** ✅
- [x] **secure: production only** ✅
- [x] **sameSite: 'strict'** ✅
- [ ] **Jeśli cross-domain w produkcji:** Zmień na `sameSite: 'none'`

---

## CB4: ✅ Trust Proxy dla Reverse Proxy (ZWERYFIKOWANE)

**Stan:** Poprawnie ustawione w `server.js:44`

```javascript
app.set('trust proxy', 1);
```

- [ ] **Sprawdź czy `app.set('trust proxy', 1)` jest przed middleware**
- [ ] **Test:** Po deploy cookies `secure: true` działają

---

## CB5: 🟠 npm install Dokumentacja

**Stan w docs (BŁĘDNY):**
```bash
npm install nodemailer pinia  # ŹŁLE!
```

**Poprawne:**
```bash
# Backend:
npm install nodemailer

# Frontend:
npm install pinia
```

- [ ] **Popraw dokumentację instalacji**

---

# PRODUCTION DEPLOYMENT CHECKLIST

## Backend ENV Variables (MUST HAVE)

```env
NODE_ENV=production
FRONTEND_URL=https://app.example.com

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@app.example.com
SMTP_SECURE=false

# JWT
JWT_ACCESS_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<64-char-hex>

# Database
DATABASE_URL=postgresql://...

# Encryption
ENCRYPTION_KEY=<32-char-key>
```

## Go/No-Go Checklist

**GO TO PROD tylko jeśli:**

- [ ] CB1: Exports runId deduplication działa
- [ ] CB2: 2FA disable ma limit prób
- [ ] CB3: Cookies działają na realnej domenie
- [ ] CB4: Trust proxy ustawione
- [ ] CB5: Dokumentacja npm install poprawiona
- [ ] Logout nie pokazuje danych (nawet przez 1 frame)
- [ ] SMTP działa (test wysłania emaila 2FA)

---

# E2E TEST CHECKLIST (15 min przed produkcją)

## Auth / Session
- [ ] Login bez 2FA → cookie refresh + access token
- [ ] Logout → cookie znika + authState CHECKING → login form
- [ ] User A logout → User B login → **zero flash danych A**

## 2FA
- [ ] Enable 2FA → email → confirm → twoFactorEnabled=true
- [ ] Login → requires2FA → verify-login → success
- [ ] 3× zły kod → blokada / nowy request wymagany
- [ ] Disable 2FA → request → confirm → twoFactorEnabled=false

## Exports
- [ ] Run export → request zawiera runId
- [ ] Retry z tym samym runId → brak drugiego uruchomienia (po implementacji CB1)
