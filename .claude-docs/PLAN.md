# PLAN: Frontend Hardening + Minimal Features (v2 - POPRAWIONY)

## Podsumowanie
Minimalne zmiany w frontendzie (bez przebudowy UI, bez vue-router) + niezbędne endpointy backendowe.
**KLUCZOWA ZMIANA**: Logika biznesowa w Pinia stores, App.vue tylko renderuje.

---

## KLUCZOWE DECYZJE (po review)

| Kwestia | Decyzja | Uzasadnienie |
|---------|---------|--------------|
| Stan aplikacji | **Pinia stores** | Nie monolit w App.vue - łatwiejsze $reset() przy logout |
| Token management | **Single-token** per integration | Prostsze, wystarczające dla MVP |
| 2FA disable | **2-step flow** (request + confirm) | Logicznie poprawne |
| runId | **crypto.randomUUID()** | Kryptograficznie bezpieczne |
| CSRF | **SameSite=Strict + Origin validation** | Bez csurf (zbyt skomplikowane dla SPA bez routera) |
| Login | **Komponent w App.vue** | Nie osobny login.html - spójne SPA |
| 2FA verification | **argon2.verify()** tylko | Nie mieszać z secureCompare |

---

## KOLEJNOŚĆ WDROŻENIA

### Faza 0: Pinia Setup + Security Infrastructure
### Faza 1: Backend (endpointy + security fixes)
### Faza 2: Frontend API client (credentials mode)
### Faza 3: Pinia Stores (auth, exports, integrations)
### Faza 4: App.vue refactor (gate + render only)
### Faza 5: Security tab + Dashboard cleanup
### Faza 6: Security Testing

---

## FAZA 0: PINIA SETUP + SECURITY INFRASTRUCTURE

### 0.0 Instalacja Pinia
```bash
npm install pinia
```

**Plik:** `src/main.js`
```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

### 0.1 Logger Sanitization
**Plik:** `backend/utils/logger.js`

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

// W każdym logger.info/error/warn użyj sanitizeForLog()
```

### 0.2 Password Validator
**Nowy plik:** `backend/validators/password.js`

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

### 0.3 Auth Rate Limiter
**Nowy plik:** `backend/middleware/authRateLimit.js`

```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 10, // max 10 prób logowania
  message: { error: 'Zbyt wiele prób logowania. Spróbuj za 15 minut.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minut
  max: 5, // max 5 prób weryfikacji 2FA
  message: { error: 'Zbyt wiele prób. Spróbuj za 5 minut.', code: 'RATE_LIMIT' },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 godzina
  max: 3,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Zbyt wiele zmian hasła. Spróbuj za godzinę.', code: 'RATE_LIMIT' },
});

module.exports = { loginLimiter, twoFactorLimiter, passwordChangeLimiter };
```

### 0.4 2FA Code Verification (argon2 only)
**UWAGA:** NIE używamy secureCompare dla 2FA - kody są hashowane przez argon2.

```javascript
// Backend: weryfikacja kodu 2FA
const argon2 = require('argon2');

async function verify2FACode(userId, providedCode) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorExpiry: true, twoFactorAttempts: true }
  });

  // Sprawdź expiry
  if (!user.twoFactorSecret || !user.twoFactorExpiry || user.twoFactorExpiry < new Date()) {
    throw new Error('Kod wygasł lub nie istnieje');
  }

  // Sprawdź próby
  if (user.twoFactorAttempts >= 3) {
    // Unieważnij kod
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null, twoFactorExpiry: null, twoFactorAttempts: 0 }
    });
    throw new Error('Zbyt wiele prób. Poproś o nowy kod.');
  }

  // Weryfikuj przez argon2 (constant-time wewnętrznie)
  const isValid = await argon2.verify(user.twoFactorSecret, providedCode);

  if (!isValid) {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorAttempts: { increment: 1 } }
    });
    throw new Error('Nieprawidłowy kod');
  }

  // Sukces - wyczyść
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorExpiry: null, twoFactorAttempts: 0 }
  });

  return true;
}
```

### 0.5 Prisma Schema Updates
**Plik:** `prisma/schema.prisma`

```prisma
model User {
  // ... istniejące pola ...

  // 2FA fields
  twoFactorEnabled   Boolean   @default(false)
  twoFactorSecret    String?   // hashed code
  twoFactorExpiry    DateTime?
  twoFactorAttempts  Int       @default(0)

  // Account lockout
  accountLockedUntil DateTime?
  failedLoginAttempts Int      @default(0)
}
```

Uruchom: `npx prisma migrate dev --name add_security_fields`

### 0.6 Body Size Limit
**Plik:** `server.js` (lub app setup)

```javascript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
```

### 0.7 Helmet Security Headers
**Plik:** `server.js`

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.API_URL || "http://localhost:3000"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
  frameguard: { action: 'deny' },
}));
```

### 0.8 Cookie Parser (dla httpOnly cookies)
**Plik:** `server.js`

```javascript
const cookieParser = require('cookie-parser');

// PRZED routes:
app.use(cookieParser());
```

**Weryfikacja:** cookie-parser jest już w package.json - wystarczy upewnić się że jest użyty.

### 0.9 CORS dla credentials
**Plik:** `server.js`

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // WAŻNE: pozwala na cookies
}));
```

---

## FAZA 1: BACKEND

### 1.0 Email Service Setup (WYMAGANE dla 2FA)
**Nowy plik:** `backend/services/email.service.js`

Brak istniejącego serwisu email - trzeba dodać od zera.

```javascript
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Konfiguracja przez env vars
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

**Wymagane zmienne .env:**
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@livesales.app
```

### 1.1 Auth routes - change password + 2FA
**Plik:** `backend/routes/auth.js`

```
POST /api/auth/change-password
  Body: { currentPassword, newPassword }
  Response: { success: true }
  Logika:
    1. verify current password
    2. validate new password (min 12 chars)
    3. hash new password
    4. update user.password
    5. REVOKE ALL refresh tokens for this user (wyloguj ze wszystkich sesji)
    6. Return success (frontend musi się przelogować)

POST /api/auth/2fa/enable
  Response: { success: true, message: "Kod wysłany na email" }
  Logika:
    1. generate 6-digit code
    2. hash code and save to user.twoFactorSecret with expiry (10 min)
    3. send email via email.service
    4. return success

POST /api/auth/2fa/confirm-enable
  Body: { code }
  Response: { success: true }
  Logika:
    1. verify code matches and not expired
    2. set user.twoFactorEnabled = true
    3. clear twoFactorSecret

POST /api/auth/2fa/disable/request
  Response: { success: true, message: "Kod wysłany na email" }
  Logika:
    1. generate 6-digit code
    2. hash and save to user.twoFactorSecret with expiry
    3. send email

POST /api/auth/2fa/disable/confirm
  Body: { code }
  Response: { success: true }
  Logika:
    1. verify code via argon2.verify (NIE secureCompare)
    2. set user.twoFactorEnabled = false
    3. clear twoFactorSecret

POST /api/auth/2fa/verify-login (dla login flow)
  Body: { code, tempToken }
  Response: { accessToken, refreshToken, user }
  Logika:
    1. verify tempToken (short-lived, 5 min)
    2. verify code matches
    3. issue full tokens
```

### 1.1b Login flow z 2FA
**Plik:** `backend/routes/auth.js` - modyfikacja POST /login

```javascript
// W POST /login, po weryfikacji hasła:
if (user.twoFactorEnabled) {
  // Generuj tempToken (krótki, 5 min)
  const tempToken = jwt.sign(
    { userId: user.id, purpose: '2fa-pending' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  // Generuj i wyślij kod 2FA
  const code = crypto.randomInt(100000, 999999).toString();
  const codeHash = await argon2.hash(code);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: codeHash,
      twoFactorExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 min
    }
  });

  await emailService.send2FACode(user.email, code);

  return res.json({
    requires2FA: true,
    tempToken,
    message: 'Kod wysłany na email'
  });
}
```

### 1.1c Modyfikacja login.html dla 2FA
**Plik:** `login.html`

Dodać drugi krok po otrzymaniu `requires2FA: true`:
```javascript
// Po otrzymaniu response z login:
if (response.requires2FA) {
  // Pokaż formularz kodu 2FA
  show2FAForm();
  tempToken = response.tempToken;
} else {
  // Normalny login - accessToken w response, refreshToken w cookie
  localStorage.setItem('accessToken', response.accessToken);
  // refreshToken jest automatycznie w httpOnly cookie
  redirect('/');
}

// Submit kodu 2FA:
async function verify2FA(code) {
  const response = await fetch('/api/auth/2fa/verify-login', {
    method: 'POST',
    credentials: 'include', // dla cookies
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, tempToken })
  });
  // ... handle response
}

// SECURITY: Zapobiegnij powrotowi do app przez "back" button po logout
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Strona była w bfcache - odśwież żeby sprawdzić auth
    window.location.reload();
  }
});
```
```

### 1.1d Backend - httpOnly cookies dla refresh token
**Plik:** `backend/routes/auth.js`

```javascript
// Helper function dla ustawiania refresh token cookie:
function setRefreshTokenCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dni
    path: '/api/auth' // tylko dla auth endpoints
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth'
  });
}

// W POST /login (po wydaniu tokenów):
setRefreshTokenCookie(res, refreshToken);

res.json({
  message: 'Login successful',
  user: { id: user.id, email: user.email, role: user.role },
  accessToken, // tylko accessToken w body
  // refreshToken NIE w body - jest w cookie
});

// W POST /refresh:
// Pobierz refreshToken z cookie zamiast body:
const refreshToken = req.cookies.refreshToken;
if (!refreshToken) {
  return res.status(401).json({ error: 'No refresh token' });
}

// Po wydaniu nowych tokenów:
setRefreshTokenCookie(res, newRefreshToken);
res.json({ accessToken: newAccessToken });

// W POST /logout:
clearRefreshTokenCookie(res);
```

### 1.1e Account Enumeration Timing Fix
**Plik:** `backend/routes/auth.js` - w POST /login

```javascript
// PRZED weryfikacją hasła - zawsze wykonuj hash:
const user = await prisma.user.findUnique({
  where: { email: email.toLowerCase() },
  // ...
});

// Dummy hash dla constant time (jeśli user nie istnieje)
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';
const passwordToVerify = user?.password || DUMMY_HASH;
const isValidPassword = await passwordService.verify(password, passwordToVerify);

// Teraz sprawdź oba warunki razem:
if (!user || !isValidPassword) {
  // Log failed attempt
  if (user) {
    await incrementFailedLoginAttempts(user.id);
  }
  return res.status(401).json({
    error: 'Invalid credentials',
    code: 'INVALID_CREDENTIALS'
  });
}
```

### 1.1f Account Lockout Implementation
**Plik:** `backend/routes/auth.js`

```javascript
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minut

async function incrementFailedLoginAttempts(userId) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true }
  });

  if (user.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accountLockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
        failedLoginAttempts: 0
      }
    });
    logger.warn('Account locked due to failed attempts', { userId });
  }
}

async function resetFailedLoginAttempts(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0 }
  });
}

// Na początku POST /login - sprawdź lockout:
if (user?.accountLockedUntil && user.accountLockedUntil > new Date()) {
  const remainingMs = user.accountLockedUntil.getTime() - Date.now();
  const remainingMin = Math.ceil(remainingMs / 60000);
  return res.status(423).json({
    error: `Konto zablokowane. Spróbuj za ${remainingMin} minut.`,
    code: 'ACCOUNT_LOCKED'
  });
}

// Po udanym logowaniu:
await resetFailedLoginAttempts(user.id);
```

### 1.2 Exports - przyjmowanie runId
**Plik:** `backend/routes/exports.js` (linia ~277)

```diff
router.post('/:id/run', async (req, res) => {
  const exportId = req.params.id;
+ const { runId, trigger } = req.body || {};
  const userId = req.user?.id;

+ logger.info('Export run', { exportId, runId, trigger, userId });
  ...
});
```

### 1.3 Integrations - endpoint /status
**Plik:** `backend/routes/integrations.js`

```
GET /api/integrations/status
  Response: {
    success: true,
    data: {
      baselinker: { configured, connected, lastChecked, error? },
      googleSheets: { configured, connected, lastChecked, error? }
    }
  }
  Logika:
    - Sprawdź czy token istnieje (configured)
    - Wykonaj test API call (connected)
    - Zwróć error jeśli test failed
```

---

## FAZA 2: FRONTEND API CLIENT

**Plik:** `src/api.js`

### 2.0 Request z credentials (dla httpOnly cookies)
```javascript
// Zmień domyślne opcje fetch:
async request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // WAŻNE: wysyła cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  // ...
}
```

### 2.1 Zmiana exports.run()
```javascript
async run(id, options = {}) {
  const response = await API.request(`/api/exports/${id}/run`, {
    method: 'POST',
    body: JSON.stringify(options), // { runId, trigger }
  });
  return response.result;
}
```

### 2.2 Zmiany w auth namespace
```javascript
auth: {
  // ... istniejące metody ...

  // ZMIANA: refresh() nie wysyła token w body (jest w cookie)
  async refresh() {
    const response = await API.request('/api/auth/refresh', {
      method: 'POST',
    });
    if (response.accessToken) {
      localStorage.setItem('accessToken', response.accessToken);
    }
    return response;
  },

  // ZMIANA: logout via API (backend czyści cookie)
  async logout() {
    try {
      await API.request('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignoruj */ }
    localStorage.removeItem('accessToken');
  },

  // NOWE:
  async changePassword(currentPassword, newPassword) {
    return API.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // 2FA Enable (2-step)
  async enable2FA() {
    return API.request('/api/auth/2fa/enable', { method: 'POST' });
  },

  async confirm2FAEnable(code) {
    return API.request('/api/auth/2fa/confirm-enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  // 2FA Disable (2-step) - POPRAWKA: dwa osobne endpointy
  async request2FADisable() {
    return API.request('/api/auth/2fa/disable/request', { method: 'POST' });
  },

  async confirm2FADisable(code) {
    return API.request('/api/auth/2fa/disable/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  // 2FA Login verification
  async verify2FALogin(code, tempToken) {
    return API.request('/api/auth/2fa/verify-login', {
      method: 'POST',
      body: JSON.stringify({ code, tempToken }),
    });
  },
}
```

### 2.3 Nowy namespace: integrations
```javascript
integrations: {
  async getStatus() {
    return API.request('/api/integrations/status');
  },
  async saveBaselinkerToken(token) {
    return API.request('/api/integrations/baselinker', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },
  async testBaselinker() {
    return API.request('/api/integrations/baselinker/test', { method: 'POST' });
  },
  async removeBaselinker() {
    return API.request('/api/integrations/baselinker', { method: 'DELETE' });
  },
}
```

---

## FAZA 3: PINIA STORES

### 3.1 Auth Store
**Nowy plik:** `src/stores/auth.js`

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import API from '../api'

export const useAuthStore = defineStore('auth', () => {
  // State
  const authState = ref('CHECKING') // 'CHECKING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | '2FA_REQUIRED'
  const user = ref(null)
  const tempToken = ref(null) // dla 2FA flow
  const logoutInProgress = ref(false)

  // Getters
  const isAuthenticated = computed(() => authState.value === 'AUTHENTICATED')
  const hasTwoFactor = computed(() => user.value?.twoFactorEnabled || false)

  // Actions
  async function checkAuth() {
    authState.value = 'CHECKING'
    try {
      const userData = await API.auth.getCurrentUser()
      user.value = userData
      authState.value = 'AUTHENTICATED'
      return true
    } catch (error) {
      user.value = null
      authState.value = 'UNAUTHENTICATED'
      localStorage.removeItem('accessToken')
      return false
    }
  }

  async function login(email, password) {
    const response = await API.auth.login(email, password)

    if (response.requires2FA) {
      tempToken.value = response.tempToken
      authState.value = '2FA_REQUIRED'
      return { requires2FA: true }
    }

    localStorage.setItem('accessToken', response.accessToken)
    user.value = response.user
    authState.value = 'AUTHENTICATED'
    return { success: true }
  }

  async function verify2FA(code) {
    const response = await API.auth.verify2FALogin(code, tempToken.value)
    localStorage.setItem('accessToken', response.accessToken)
    user.value = response.user
    tempToken.value = null
    authState.value = 'AUTHENTICATED'
    return { success: true }
  }

  async function logout() {
    if (logoutInProgress.value) return
    logoutInProgress.value = true

    // 1. Natychmiast ukryj dane
    authState.value = 'CHECKING'

    // 2. API logout (ignoruj błędy)
    try {
      await API.auth.logout()
    } catch (e) { /* ignoruj */ }

    // 3. Reset state
    $reset()

    // 4. Wyczyść localStorage
    localStorage.removeItem('accessToken')

    logoutInProgress.value = false
  }

  async function changePassword(currentPassword, newPassword) {
    await API.auth.changePassword(currentPassword, newPassword)
    // Backend unieważnia wszystkie sesje - wymuszamy logout
    await logout()
  }

  function $reset() {
    authState.value = 'UNAUTHENTICATED'
    user.value = null
    tempToken.value = null
    logoutInProgress.value = false
  }

  return {
    // State
    authState,
    user,
    tempToken,
    // Getters
    isAuthenticated,
    hasTwoFactor,
    // Actions
    checkAuth,
    login,
    verify2FA,
    logout,
    changePassword,
    $reset,
  }
})
```

### 3.2 Exports Store
**Nowy plik:** `src/stores/exports.js`

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import API from '../api'

export const useExportsStore = defineStore('exports', () => {
  // State
  const list = ref([])
  const isLoading = ref(false)
  const lastSyncTime = ref(null)

  // Getters
  const activeExports = computed(() => list.value.filter(e => e.status === 'active'))
  const pausedExports = computed(() => list.value.filter(e => e.status === 'paused'))

  // Actions
  async function fetchAll() {
    isLoading.value = true
    try {
      const response = await API.exports.getAll()
      list.value = response.data || []
    } finally {
      isLoading.value = false
    }
  }

  async function run(exportId) {
    const runId = crypto.randomUUID() // POPRAWKA: kryptograficznie bezpieczne
    isLoading.value = true
    try {
      const result = await API.exports.run(exportId, { runId, trigger: 'manual' })
      lastSyncTime.value = new Date()
      await fetchAll() // Zawsze odśwież listę
      return result
    } finally {
      isLoading.value = false
    }
  }

  async function save(exportConfig) {
    const result = await API.exports.save(exportConfig)
    await fetchAll()
    return result
  }

  async function remove(exportId) {
    await API.exports.delete(exportId)
    await fetchAll()
  }

  async function toggle(exportId) {
    await API.exports.toggle(exportId)
    await fetchAll()
  }

  function $reset() {
    list.value = []
    isLoading.value = false
    lastSyncTime.value = null
  }

  return {
    list,
    isLoading,
    lastSyncTime,
    activeExports,
    pausedExports,
    fetchAll,
    run,
    save,
    remove,
    toggle,
    $reset,
  }
})
```

### 3.3 Integrations Store
**Nowy plik:** `src/stores/integrations.js`

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import API from '../api'

export const useIntegrationsStore = defineStore('integrations', () => {
  // State - SINGLE TOKEN per integration (decyzja: prostsze dla MVP)
  const baselinker = ref({
    configured: false,
    connected: null, // null = nie sprawdzano, true/false = wynik testu
    lastChecked: null,
    error: null
  })
  const googleSheets = ref({
    configured: false,
    connected: null,
    lastChecked: null
  })
  const isTestingConnection = ref(false)

  // Getters
  const baselinkerStatus = computed(() => {
    if (!baselinker.value.configured) return { text: 'Nieskonfigurowane', class: 'text-gray-500' }
    if (baselinker.value.connected === true) return { text: 'Połączone', class: 'text-green-600' }
    if (baselinker.value.connected === false) return { text: 'Błąd: ' + (baselinker.value.error || 'Brak połączenia'), class: 'text-red-600' }
    return { text: 'Skonfigurowane (nie testowane)', class: 'text-blue-600' }
  })

  // Actions
  async function fetchStatus() {
    try {
      const response = await API.integrations.getStatus()
      baselinker.value = response.data.baselinker || baselinker.value
      googleSheets.value = response.data.googleSheets || googleSheets.value
    } catch (error) {
      console.error('Failed to fetch integrations status:', error)
    }
  }

  async function saveBaselinkerToken(token) {
    // Token NIE jest przechowywany w stanie - tylko wysyłany do API
    await API.integrations.saveBaselinkerToken(token)
    await fetchStatus()
  }

  async function testBaselinker() {
    isTestingConnection.value = true
    try {
      const result = await API.integrations.testBaselinker()
      baselinker.value.connected = result.data.connected
      baselinker.value.error = result.data.error || null
      baselinker.value.lastChecked = new Date().toISOString()
      return result.data
    } finally {
      isTestingConnection.value = false
    }
  }

  async function removeBaselinker() {
    await API.integrations.removeBaselinker()
    baselinker.value = {
      configured: false,
      connected: null,
      lastChecked: null,
      error: null
    }
  }

  function $reset() {
    baselinker.value = { configured: false, connected: null, lastChecked: null, error: null }
    googleSheets.value = { configured: false, connected: null, lastChecked: null }
    isTestingConnection.value = false
  }

  return {
    baselinker,
    googleSheets,
    isTestingConnection,
    baselinkerStatus,
    fetchStatus,
    saveBaselinkerToken,
    testBaselinker,
    removeBaselinker,
    $reset,
  }
})
```

### 3.4 Company Store (billing + team)
**Nowy plik:** `src/stores/company.js`

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import API from '../api'

export const useCompanyStore = defineStore('company', () => {
  // State
  const current = ref(null)
  const list = ref([])
  const subscription = ref(null)
  const plans = ref([])
  const capabilities = ref(null)
  const trialStatus = ref(null)
  const teamMembers = ref([])

  // Actions
  async function fetchCompanies() {
    const response = await API.company.list()
    list.value = response.data || []
    if (list.value.length > 0 && !current.value) {
      current.value = list.value[0]
    }
  }

  async function selectCompany(company) {
    current.value = company
    API.setCompanyId(company.id)
    // Refetch company-specific data
    await Promise.all([
      fetchSubscription(),
      fetchCapabilities(),
      fetchTeam()
    ])
  }

  async function fetchSubscription() {
    if (!current.value) return
    try {
      const response = await API.billing.getSubscription()
      subscription.value = response.data
    } catch (e) {
      subscription.value = null
    }
  }

  async function fetchCapabilities() {
    if (!current.value) return
    try {
      const response = await API.features.getCapabilities()
      capabilities.value = response.data
    } catch (e) {
      capabilities.value = null
    }
  }

  async function fetchTeam() {
    if (!current.value) return
    try {
      const response = await API.team.getMembers()
      teamMembers.value = response.data || []
    } catch (e) {
      teamMembers.value = []
    }
  }

  async function fetchPlans() {
    const response = await API.billing.getPlans()
    plans.value = response.data || []
  }

  function $reset() {
    current.value = null
    list.value = []
    subscription.value = null
    plans.value = []
    capabilities.value = null
    trialStatus.value = null
    teamMembers.value = []
  }

  return {
    current,
    list,
    subscription,
    plans,
    capabilities,
    trialStatus,
    teamMembers,
    fetchCompanies,
    selectCompany,
    fetchSubscription,
    fetchCapabilities,
    fetchTeam,
    fetchPlans,
    $reset,
  }
})
```

---

## FAZA 4: APP.VUE REFACTOR

### 4.1 Import stores
**Plik:** `src/App.vue`

```javascript
import { useAuthStore } from './stores/auth'
import { useExportsStore } from './stores/exports'
import { useIntegrationsStore } from './stores/integrations'
import { useCompanyStore } from './stores/company'

const authStore = useAuthStore()
const exportsStore = useExportsStore()
const integrationsStore = useIntegrationsStore()
const companyStore = useCompanyStore()
```

### 4.2 Logout - teraz prosty (Pinia robi $reset)
```javascript
async function logout() {
  await authStore.logout()

  // Reset wszystkich stores
  exportsStore.$reset()
  integrationsStore.$reset()
  companyStore.$reset()

  // App.vue nie robi redirect - renderuje LoginForm gdy UNAUTHENTICATED
}
```

### 4.3 Template gate (BEZ login.html - login jako komponent)
```vue
<template>
  <!-- CHECKING -->
  <div v-if="authStore.authState === 'CHECKING'" class="fixed inset-0 flex items-center justify-center bg-white">
    <span class="text-gray-500">Weryfikacja sesji...</span>
  </div>

  <!-- LOGIN / 2FA -->
  <LoginForm
    v-else-if="authStore.authState === 'UNAUTHENTICATED' || authStore.authState === '2FA_REQUIRED'"
    :show2FA="authStore.authState === '2FA_REQUIRED'"
  />

  <!-- AUTHENTICATED - cała aplikacja -->
  <template v-else-if="authStore.authState === 'AUTHENTICATED'">
    <!-- istniejący layout aplikacji -->
  </template>
</template>
```

### 4.4 LoginForm Component
**Nowy plik:** `src/components/LoginForm.vue`

```vue
<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  show2FA: Boolean
})

const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const twoFactorCode = ref('')
const error = ref('')
const isLoading = ref(false)

async function handleLogin() {
  error.value = ''
  isLoading.value = true
  try {
    const result = await authStore.login(email.value, password.value)
    if (result.requires2FA) {
      // UI automatycznie przełączy się na formularz 2FA
      // bo authState zmieni się na '2FA_REQUIRED'
    }
  } catch (e) {
    error.value = e.message || 'Błąd logowania'
  } finally {
    isLoading.value = false
  }
}

async function handle2FA() {
  error.value = ''
  isLoading.value = true
  try {
    await authStore.verify2FA(twoFactorCode.value)
    // authState zmieni się na 'AUTHENTICATED'
  } catch (e) {
    error.value = e.message || 'Nieprawidłowy kod'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
      <!-- Login form -->
      <form v-if="!show2FA" @submit.prevent="handleLogin">
        <h2 class="text-2xl font-bold mb-6">Zaloguj się</h2>
        <!-- email, password inputs -->
        <div v-if="error" class="text-red-600 mb-4">{{ error }}</div>
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Logowanie...' : 'Zaloguj' }}
        </button>
      </form>

      <!-- 2FA form -->
      <form v-else @submit.prevent="handle2FA">
        <h2 class="text-2xl font-bold mb-6">Weryfikacja 2FA</h2>
        <p class="text-gray-600 mb-4">Kod został wysłany na Twój email</p>
        <input v-model="twoFactorCode" placeholder="Kod 6-cyfrowy" maxlength="6" />
        <div v-if="error" class="text-red-600 mb-4">{{ error }}</div>
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Weryfikacja...' : 'Potwierdź' }}
        </button>
      </form>
    </div>
  </div>
</template>
```

### 4.5 onMounted - inicjalizacja via stores
```javascript
onMounted(async () => {
  const isAuth = await authStore.checkAuth()
  if (!isAuth) return // Renderuje LoginForm

  // Załaduj dane company-specific
  await companyStore.fetchCompanies()
  if (companyStore.current) {
    await Promise.all([
      exportsStore.fetchAll(),
      integrationsStore.fetchStatus(),
      companyStore.fetchSubscription(),
    ])
  }
})
```

---

## FAZA 4: INTEGRATIONS + SECURITY

**Plik:** `src/App.vue`

### 4.1 Nowy stan integracji
```javascript
const integrations = ref({
  baselinker: { configured: false, connected: null, lastChecked: null, error: null },
  googleSheets: { configured: false, connected: null, lastChecked: null }
})
const integrationTestLoading = ref(false)
```

### 4.2 Funkcje integracji
```javascript
async function loadIntegrationsStatus() {
  try {
    const result = await API.integrations.getStatus()
    integrations.value = result.data
  } catch (error) {
    console.error('Failed to load integrations:', error)
  }
}

async function saveBaselinkerToken() {
  if (!baselinkerToken.value?.trim()) return
  try {
    await API.integrations.saveBaselinkerToken(baselinkerToken.value)
    baselinkerToken.value = '' // CZYŚĆ input po sukcesie!
    tokenSaved.value = true
    await loadIntegrationsStatus()
    await loadExportsFromServer()
    setTimeout(() => tokenSaved.value = false, 3000)
  } catch (error) {
    showToast('Błąd', error.message || 'Nieprawidłowy token', '...')
  }
}

async function testBaselinkerConnection() {
  integrationTestLoading.value = true
  try {
    const result = await API.integrations.testBaselinker()
    integrations.value.baselinker.connected = result.data.connected
    integrations.value.baselinker.error = result.data.error || null
    showToast(result.data.connected ? 'Sukces' : 'Błąd',
              result.data.connected ? 'Połączenie działa' : result.data.error, '...')
  } catch (error) {
    integrations.value.baselinker.connected = false
  } finally {
    integrationTestLoading.value = false
  }
}

async function removeBaselinkerToken() {
  if (!confirm('Czy na pewno chcesz usunąć integrację BaseLinker?')) return
  try {
    await API.integrations.removeBaselinker()
    await loadIntegrationsStatus()
    showToast('Usunięto', 'Integracja usunięta', '...')
  } catch (error) {
    showToast('Błąd', error.message, '...')
  }
}
```

### 4.3 Computed dla statusu
```javascript
const baselinkerStatus = computed(() => {
  const bl = integrations.value?.baselinker
  if (!bl?.configured) return { text: 'Nieskonfigurowane', class: 'text-gray-500' }
  if (bl.connected === true) return { text: 'Połączone', class: 'text-green-600' }
  if (bl.connected === false) return { text: 'Błąd: ' + (bl.error || 'Brak połączenia'), class: 'text-red-600' }
  return { text: 'Skonfigurowane', class: 'text-blue-600' }
})
```

### 4.4 Security tab - stan
```javascript
const securitySection = ref('password') // 'password' | '2fa'
const passwordForm = ref({ current: '', newPassword: '', confirmPassword: '' })
const passwordChangeLoading = ref(false)
const twoFactorPending = ref(false)
const twoFactorCode = ref('')
const twoFactorLoading = ref(false)
const hasTwoFactor = computed(() => sessionUser.value?.twoFactorEnabled || false)
```

### 4.5 Security tab - funkcje
```javascript
async function changePassword() {
  if (passwordForm.value.newPassword.length < 12) {
    showToast('Błąd', 'Hasło musi mieć minimum 12 znaków', '...')
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    showToast('Błąd', 'Hasła nie są zgodne', '...')
    return
  }

  passwordChangeLoading.value = true
  try {
    await API.auth.changePassword(passwordForm.value.current, passwordForm.value.newPassword)
    // Po zmianie hasła backend unieważnia wszystkie sesje
    // Musimy się przelogować
    showToast('Sukces', 'Hasło zmienione. Za chwilę nastąpi wylogowanie...', '...')
    setTimeout(() => {
      logout() // Wyloguj ze wszystkich sesji
    }, 2000)
  } catch (error) {
    showToast('Błąd', error.message || 'Nie udało się zmienić hasła', '...')
  } finally {
    passwordChangeLoading.value = false
  }
}

async function enableTwoFactor() {
  twoFactorLoading.value = true
  try {
    await API.auth.enable2FA()
    twoFactorPending.value = true
    showToast('Info', 'Kod wysłany na email', '...')
  } catch (error) {
    showToast('Błąd', error.message, '...')
  } finally {
    twoFactorLoading.value = false
  }
}

async function confirmTwoFactor() {
  if (!twoFactorCode.value || twoFactorCode.value.length !== 6) {
    showToast('Błąd', 'Wprowadź 6-cyfrowy kod', '...')
    return
  }
  twoFactorLoading.value = true
  try {
    await API.auth.confirm2FA(twoFactorCode.value)
    twoFactorPending.value = false
    twoFactorCode.value = ''
    sessionUser.value.twoFactorEnabled = true
    showToast('Sukces', '2FA włączone', '...')
  } catch (error) {
    showToast('Błąd', error.message, '...')
  } finally {
    twoFactorLoading.value = false
  }
}

async function disableTwoFactor() {
  if (!confirm('Czy na pewno chcesz wyłączyć 2FA?')) return
  twoFactorLoading.value = true
  try {
    await API.auth.disable2FA()
    sessionUser.value.twoFactorEnabled = false
    showToast('Info', '2FA wyłączone', '...')
  } catch (error) {
    showToast('Błąd', error.message, '...')
  } finally {
    twoFactorLoading.value = false
  }
}
```

### 4.6 Security Tab Component
**Nowy plik:** `src/components/SecurityTab.vue`

```vue
<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import API from '../api'

const authStore = useAuthStore()

// Password change
const passwordForm = ref({ current: '', newPassword: '', confirmPassword: '' })
const passwordLoading = ref(false)
const passwordErrors = ref([])

// 2FA
const twoFactorStep = ref('idle') // 'idle' | 'pending-enable' | 'pending-disable'
const twoFactorCode = ref('')
const twoFactorLoading = ref(false)

const hasTwoFactor = computed(() => authStore.user?.twoFactorEnabled || false)

function validatePassword() {
  const errors = []
  const p = passwordForm.value.newPassword
  if (p.length < 12) errors.push('Minimum 12 znaków')
  if (!/[A-Z]/.test(p)) errors.push('Wymagana wielka litera')
  if (!/[a-z]/.test(p)) errors.push('Wymagana mała litera')
  if (!/[0-9]/.test(p)) errors.push('Wymagana cyfra')
  if (!/[^A-Za-z0-9]/.test(p)) errors.push('Wymagany znak specjalny')
  if (p !== passwordForm.value.confirmPassword) errors.push('Hasła nie są zgodne')
  return errors
}

async function changePassword() {
  passwordErrors.value = validatePassword()
  if (passwordErrors.value.length > 0) return

  passwordLoading.value = true
  try {
    await authStore.changePassword(
      passwordForm.value.current,
      passwordForm.value.newPassword
    )
    // changePassword() w store wywołuje logout
  } catch (error) {
    passwordErrors.value = [error.message || 'Nie udało się zmienić hasła']
  } finally {
    passwordLoading.value = false
  }
}

async function startEnable2FA() {
  twoFactorLoading.value = true
  try {
    await API.auth.enable2FA()
    twoFactorStep.value = 'pending-enable'
  } catch (error) {
    alert(error.message)
  } finally {
    twoFactorLoading.value = false
  }
}

async function confirmEnable2FA() {
  if (twoFactorCode.value.length !== 6) return
  twoFactorLoading.value = true
  try {
    await API.auth.confirm2FAEnable(twoFactorCode.value)
    authStore.user.twoFactorEnabled = true
    twoFactorStep.value = 'idle'
    twoFactorCode.value = ''
  } catch (error) {
    alert(error.message)
  } finally {
    twoFactorLoading.value = false
  }
}

async function startDisable2FA() {
  twoFactorLoading.value = true
  try {
    await API.auth.request2FADisable()
    twoFactorStep.value = 'pending-disable'
  } catch (error) {
    alert(error.message)
  } finally {
    twoFactorLoading.value = false
  }
}

async function confirmDisable2FA() {
  if (twoFactorCode.value.length !== 6) return
  twoFactorLoading.value = true
  try {
    await API.auth.confirm2FADisable(twoFactorCode.value)
    authStore.user.twoFactorEnabled = false
    twoFactorStep.value = 'idle'
    twoFactorCode.value = ''
  } catch (error) {
    alert(error.message)
  } finally {
    twoFactorLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Password Change Section -->
    <div class="bg-white rounded-lg p-6 shadow">
      <h3 class="text-lg font-semibold mb-4">Zmiana hasła</h3>
      <form @submit.prevent="changePassword" class="space-y-4">
        <input v-model="passwordForm.current" type="password" placeholder="Aktualne hasło" />
        <input v-model="passwordForm.newPassword" type="password" placeholder="Nowe hasło (min 12 znaków)" />
        <input v-model="passwordForm.confirmPassword" type="password" placeholder="Potwierdź nowe hasło" />
        <div v-if="passwordErrors.length" class="text-red-600 text-sm">
          <p v-for="err in passwordErrors" :key="err">{{ err }}</p>
        </div>
        <button type="submit" :disabled="passwordLoading">
          {{ passwordLoading ? 'Zmieniam...' : 'Zmień hasło' }}
        </button>
        <p class="text-sm text-gray-500">Po zmianie hasła nastąpi wylogowanie ze wszystkich urządzeń.</p>
      </form>
    </div>

    <!-- 2FA Section -->
    <div class="bg-white rounded-lg p-6 shadow">
      <h3 class="text-lg font-semibold mb-4">Weryfikacja dwuetapowa (2FA)</h3>

      <!-- 2FA disabled -->
      <div v-if="!hasTwoFactor && twoFactorStep === 'idle'">
        <p class="text-gray-600 mb-4">2FA nie jest włączone. Włącz dla dodatkowego bezpieczeństwa.</p>
        <button @click="startEnable2FA" :disabled="twoFactorLoading">
          {{ twoFactorLoading ? 'Wysyłanie...' : 'Włącz 2FA' }}
        </button>
      </div>

      <!-- Pending enable -->
      <div v-else-if="twoFactorStep === 'pending-enable'">
        <p class="text-gray-600 mb-4">Kod został wysłany na Twój email. Wprowadź go poniżej.</p>
        <input v-model="twoFactorCode" placeholder="Kod 6-cyfrowy" maxlength="6" />
        <button @click="confirmEnable2FA" :disabled="twoFactorLoading || twoFactorCode.length !== 6">
          {{ twoFactorLoading ? 'Weryfikacja...' : 'Potwierdź' }}
        </button>
      </div>

      <!-- 2FA enabled -->
      <div v-else-if="hasTwoFactor && twoFactorStep === 'idle'">
        <p class="text-green-600 mb-4">✓ 2FA jest włączone</p>
        <button @click="startDisable2FA" :disabled="twoFactorLoading" class="text-red-600">
          {{ twoFactorLoading ? 'Wysyłanie...' : 'Wyłącz 2FA' }}
        </button>
      </div>

      <!-- Pending disable -->
      <div v-else-if="twoFactorStep === 'pending-disable'">
        <p class="text-gray-600 mb-4">Kod weryfikacyjny został wysłany na email. Wprowadź go aby wyłączyć 2FA.</p>
        <input v-model="twoFactorCode" placeholder="Kod 6-cyfrowy" maxlength="6" />
        <button @click="confirmDisable2FA" :disabled="twoFactorLoading || twoFactorCode.length !== 6">
          {{ twoFactorLoading ? 'Weryfikacja...' : 'Potwierdź wyłączenie' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

---

## FAZA 5: DASHBOARD CLEANUP + EXPORTS

**Plik:** `src/App.vue`

### 5.1 Usunąć fake statystyki
```diff
- const uptime = ref(99.8)
- const ordersToday = computed(() => { ... fake calculation ... })
- const runsToday = computed(() => { ... fake calculation ... })
```

### 5.2 W template dashboard - usunąć sekcje:
- "Uptime" z fake wykresem i 99.8%
- "Zamówień dziś" z fake liczbą
- "Uruchomień dziś" z fake liczbą

Zostawić:
- Status integracji (z prawdziwego API)
- Ostatnia synchronizacja (jeśli jest lastSyncTime)
- Lista ostatnich eksportów (z API)
- Szybkie akcje (Nowy eksport, Lista eksportów)

### 5.3 Exports - runId
**UWAGA:** runId generowany w stores/exports.js via `crypto.randomUUID()` (kryptograficznie bezpieczne).

**Plik:** `src/components/ExportWizard.vue` - po zapisie eksportu:
```javascript
import { useExportsStore } from '../stores/exports'

const exportsStore = useExportsStore()

async function saveAndRun() {
  try {
    await exportsStore.save(exportConfig.value)
    if (autoRun.value) {
      await exportsStore.run(exportConfig.value.id)
    }
    showToast('Sukces', 'Eksport zapisany')
  } catch (error) {
    showToast('Błąd', error.message)
  }
}
```

**Plik:** `src/stores/exports.js` - już zawiera:
```javascript
async function run(exportId) {
  const runId = crypto.randomUUID() // Kryptograficznie bezpieczne UUID v4
  // ... rest of implementation
}
```

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiany |
|------|--------|
| `backend/routes/auth.js` | +4 endpointy (change-password, 2FA enable/confirm/disable) |
| `backend/routes/exports.js` | Przyjmowanie runId w req.body |
| `backend/routes/integrations.js` | +1 endpoint GET /status |
| `src/api.js` | exports.run z body, auth.* methods, integrations.* namespace |
| `src/App.vue` | Auth gate, logout sequence, security tab, dashboard cleanup, runId |
| `src/components/ExportWizard.vue` | runId przy auto-run po save |

---

## WERYFIKACJA (TEST PLAN)

### Test 1: Auth flash (KRYTYCZNY)
1. Zaloguj jako user1@test.com
2. Poczekaj na załadowanie eksportów
3. Kliknij "Wyloguj"
4. **OCZEKIWANE**: Natychmiast loader → redirect do login
5. **NIEDOPUSZCZALNE**: Widać dane user1 po kliknięciu logout

### Test 2: Logout → Login inny user
1. User A logout
2. User B login
3. **OCZEKIWANE**: User B widzi TYLKO swoje dane, NIGDY flash danych A

### Test 3: Security - zmiana hasła
1. Przejdź do Konfiguracja → Bezpieczeństwo
2. Wpisz aktualne hasło + nowe (min 12 znaków) + confirm
3. Kliknij "Zmień hasło"
4. **OCZEKIWANE**: Toast "Sukces", pola wyczyszczone

### Test 4: Security - 2FA
1. Kliknij "Włącz 2FA"
2. Sprawdź email - powinien przyjść kod
3. Wpisz kod, kliknij "Potwierdź"
4. **OCZEKIWANE**: Status zmienia się na "2FA włączone"

### Test 5: Integrations status
1. Przejdź do Konfiguracja
2. Sprawdź status BaseLinker
3. Kliknij "Test połączenia"
4. **OCZEKIWANE**: Status "Połączone" (zielone) lub "Błąd: ..." (czerwone)

### Test 6: Export runId
1. Uruchom eksport ręcznie
2. Sprawdź w Network: POST /api/exports/:id/run ma body { runId: "uuid", trigger: "manual" }
3. **OCZEKIWANE**: runId jest unikalnym UUID

### Test 7: Dashboard cleanup
1. Otwórz dashboard
2. **OCZEKIWANE**: Brak fake "99.8% uptime", brak fake "ordersToday", brak fake "runsToday"
3. Widoczne tylko rzeczywiste dane z API

---

## UWAGI

1. **Kolejność jest ważna** - najpierw backend, potem frontend
2. **Auth gate to priorytet** - bez tego reszta nie ma sensu
3. **Testuj logout często** - to najczęstszy wektor wycieku danych między użytkownikami
4. **2FA w backendzie** - wymaga funkcji wysyłania emaili (sprawdź czy jest nodemailer/sendgrid)

---

## SECURITY ANALYSIS (Runda 1)

### KRYTYCZNE PROBLEMY DO NAPRAWIENIA:

#### 1. 🔴 Token Storage - XSS Vulnerability
**Problem:** Tokeny w localStorage są dostępne dla JavaScript, więc XSS = przejęcie sesji.
**Rozwiązanie:**
- Użyj httpOnly cookies dla refresh token
- Access token może być w pamięci (ref) lub krótkotrwały w localStorage
- Backend musi wysyłać Set-Cookie z flagami: `httpOnly`, `secure`, `sameSite=strict`

```javascript
// Backend - po login/refresh:
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dni
  path: '/api/auth'
});
```

#### 2. 🔴 2FA Code Brute Force
**Problem:** 6-digit code = 1 milion kombinacji. Bez rate limit można złamać w minuty.
**Rozwiązanie:**
- Max 3 próby weryfikacji kodu
- Po 3 nieudanych: unieważnij kod i wymagaj ponownego wysłania
- Lockout konta na 15 min po 5 nieudanych próbach logowania
- Dodaj delay po każdej nieudanej próbie (exponential backoff)

```javascript
// Backend:
const MAX_2FA_ATTEMPTS = 3;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 min

// W user model dodaj:
// twoFactorAttempts: Int
// accountLockedUntil: DateTime?
```

#### 3. ✅ Timing Attack na weryfikację kodu 2FA
**Problem:** `if (code === storedCode)` - różny czas odpowiedzi zdradza czy kod jest "bliski"
**Rozwiązanie:** Używamy argon2.verify() który ma wbudowane constant-time comparison.
**Status:** ROZWIĄZANE przez użycie argon2 hash dla kodów 2FA.

#### 4. 🟠 Password Change - brak walidacji siły hasła
**Problem:** "min 12 znaków" to za mało - "aaaaaaaaaaaa" przejdzie
**Rozwiązanie:**
```javascript
function validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 12) errors.push('Minimum 12 znaków');
  if (!/[A-Z]/.test(password)) errors.push('Wymagana wielka litera');
  if (!/[a-z]/.test(password)) errors.push('Wymagana mała litera');
  if (!/[0-9]/.test(password)) errors.push('Wymagana cyfra');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Wymagany znak specjalny');
  return errors;
}
```

#### 5. 🟠 Rate Limiting na endpointach auth
**Problem:** Brak widocznego rate limit na login, change-password, 2FA endpoints
**Rozwiązanie:** Dodaj dedykowane limity

```javascript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 prób na IP
  message: { error: 'Zbyt wiele prób. Spróbuj za 15 minut.' }
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 3, // 3 zmiany hasła na godzinę
  keyGenerator: (req) => req.user.id // per user, nie per IP
});
```

#### 6. 🟠 TempToken dla 2FA - zbyt długi czas życia
**Problem:** 5 minut to dużo - atakujący może przechwycić tempToken
**Rozwiązanie:**
- Zmniejsz do 2 minut
- Powiąż tempToken z IP i User-Agent
- Unieważnij po pierwszym użyciu

```javascript
const tempToken = jwt.sign(
  {
    userId: user.id,
    purpose: '2fa-pending',
    ip: req.ip,
    ua: crypto.createHash('sha256').update(req.get('user-agent') || '').digest('hex')
  },
  process.env.JWT_SECRET,
  { expiresIn: '2m' }
);
```

#### 7. 🟡 Error Messages - Information Leakage
**Problem:** Różne komunikaty dla "user not found" vs "wrong password" = enumeracja użytkowników
**Status:** ✅ Już poprawnie zaimplementowane w auth.js (generic "Invalid credentials")

#### 8. 🟡 Logout - Race Condition
**Problem:** Jeśli użytkownik kliknie logout wielokrotnie lub podczas ładowania, mogą być wyścigi
**Rozwiązanie:**

```javascript
let logoutInProgress = false

async function logout() {
  if (logoutInProgress) return
  logoutInProgress = true

  // ... reszta kodu logout
}
```

#### 9. 🟡 2FA Disable - wymaga aktywnego kodu
**Problem:** Jak wyłączyć 2FA jeśli nie masz dostępu do email?
**Rozwiązanie:**
- Backup codes generowane przy włączeniu 2FA
- Recovery przez support z weryfikacją tożsamości

```javascript
// Przy włączaniu 2FA generuj 10 backup codes:
const backupCodes = Array.from({ length: 10 }, () =>
  crypto.randomBytes(4).toString('hex').toUpperCase()
);
// Hash i zapisz w DB
```

#### 10. 🟡 Session Data Persistence
**Problem:** Po logout dane mogą być w cache przeglądarki (bfcache)
**Rozwiązanie:**

```javascript
// Po logout, przed redirect:
window.history.replaceState(null, '', '/login.html')

// W login.html - zapobiegnij powrotowi do app przez "back":
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload()
  }
})
```

---

## SECURITY ANALYSIS (Runda 2) - Głębsza analiza

#### 11. 🟠 CSRF na POST endpoints
**Problem:** POST /api/auth/change-password może być wywołany z obcej strony
**Rozwiązanie:** SameSite=Strict + Origin validation (BEZ csurf - zbyt skomplikowane dla SPA)

```javascript
// Middleware do walidacji Origin (dla wrażliwych endpointów)
function validateOrigin(req, res, next) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173'];

  // Dla requests bez Origin (same-origin) sprawdź Referer
  if (!origin && !referer) {
    return next(); // Same-origin request
  }

  const checkOrigin = origin || new URL(referer).origin;
  if (!allowedOrigins.includes(checkOrigin)) {
    logger.warn('CSRF: Invalid origin', { origin: checkOrigin, ip: req.ip });
    return res.status(403).json({ error: 'Invalid origin' });
  }

  next();
}

// Użyj na wrażliwych routes:
router.post('/change-password', validateOrigin, ...);
router.post('/2fa/*', validateOrigin, ...);
```

**Uzasadnienie:** SameSite=Strict już blokuje większość CSRF. Origin validation to dodatkowa warstwa bez kompleksowości csurf.

#### 12. 🔴 Refresh Token Reuse Detection
**Problem:** Jeśli atakujący przechwyci refresh token i użyje go, oryginalna sesja nie wie
**Rozwiązanie:** Token rotation z wykrywaniem reuse

```javascript
// Przy refresh - jeśli token już był użyty (revoked=true ale ktoś próbuje):
if (storedToken.revoked) {
  // Ktoś próbuje użyć starego tokenu = możliwy atak
  // Unieważnij WSZYSTKIE tokeny tego użytkownika
  await prisma.refreshToken.updateMany({
    where: { userId: storedToken.userId },
    data: { revoked: true }
  });

  logger.warn('SECURITY: Refresh token reuse detected', {
    userId: storedToken.userId,
    ip: req.ip
  });

  return res.status(401).json({ error: 'Session invalidated' });
}
```

#### 13. 🟠 Email 2FA - Man in the Middle
**Problem:** Email nie jest szyfrowany end-to-end, kod może być przechwycony
**Rozwiązanie:**
- Dodaj informację o czasie i IP do emaila
- Krótki czas życia kodu (już mamy 10 min, rozważ 5 min)
- W przyszłości: TOTP (Google Authenticator) jako bezpieczniejsza alternatywa

#### 14. 🟠 JWT Secret Management
**Problem:** Jeśli JWT_SECRET jest słaby lub wycieknie = game over
**Rozwiązanie:**
- Minimum 256 bitów entropii
- Osobny secret dla access i refresh tokenów
- Rozważ asymetryczne klucze (RS256)

```javascript
// Sprawdź długość secret przy starcie:
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```

#### 15. 🟠 Audit Log Enhancement
**Problem:** Obecny audit log może nie wychwycić wszystkich security events
**Rozwiązanie:** Dodaj logi dla:
- Password change attempts (success/fail)
- 2FA enable/disable
- Multiple failed login attempts
- Token refresh anomalies
- API access from new IP/device

#### 16. 🟡 API Response Sanitization
**Problem:** Czy API responses nie zwracają za dużo danych?
**Status:** Sprawdzić selekty w Prisma queries
**Przykład dobrej praktyki:**
```javascript
// DOBRZE:
select: { id: true, email: true, role: true }

// ŹLE:
// bez select = zwraca wszystko włącznie z password hash
```

---

## ZAKTUALIZOWANY PLAN Z POPRAWKAMI SECURITY

### Backend - dodatkowe zmiany:

1. **Zmień storage refresh token na httpOnly cookie**
   - Pliki: `backend/routes/auth.js`, `backend/middleware/auth.js`

2. **Dodaj rate limiting na auth endpoints**
   - Plik: `backend/routes/auth.js`
   - Nowy middleware: `backend/middleware/authRateLimit.js`

3. **Dodaj brute force protection dla 2FA**
   - Modyfikacja: user model (twoFactorAttempts, accountLockedUntil)
   - Plik: `backend/routes/auth.js`

4. **Timing-safe comparison dla 2FA**
   - Plik: `backend/routes/auth.js`

5. **Refresh token reuse detection**
   - Plik: `backend/routes/auth.js` (endpoint /refresh)

6. **Password strength validation**
   - Nowy plik: `backend/validators/password.js`
   - Modyfikacja: `backend/routes/auth.js`

7. **TempToken binding do IP/UA**
   - Plik: `backend/routes/auth.js`

### Frontend - dodatkowe zmiany:

1. **Logout race condition protection**
   - Plik: `src/App.vue`

2. **bfcache prevention**
   - Pliki: `src/App.vue`, `login.html`

3. **Refresh token handling via cookie**
   - Plik: `src/api.js` - usuń refreshToken z localStorage
   - Zmień refresh request na credentials: 'include'

---

## ZAKTUALIZOWANA LISTA PLIKÓW

| Plik | Zmiany |
|------|--------|
| **BACKEND** | |
| `backend/services/email.service.js` | NOWY - wysyłanie emaili 2FA |
| `backend/validators/password.js` | NOWY - walidacja siły hasła |
| `backend/middleware/authRateLimit.js` | NOWY - rate limiting dla auth |
| `backend/middleware/validateOrigin.js` | NOWY - CSRF protection via Origin |
| `backend/routes/auth.js` | +7 endpointów, httpOnly cookies, brute force, 2FA flow |
| `backend/routes/exports.js` | Przyjmowanie runId w req.body |
| `backend/routes/integrations.js` | +1 endpoint GET /status |
| `prisma/schema.prisma` | +pola: twoFactorAttempts, accountLockedUntil, twoFactorExpiry, failedLoginAttempts |
| `server.js` | Pinia-ready CORS, cookie-parser, body limit |
| **FRONTEND** | |
| `src/main.js` | Pinia setup |
| `src/stores/auth.js` | NOWY - auth state, login, logout, 2FA |
| `src/stores/exports.js` | NOWY - exports list, run, CRUD |
| `src/stores/integrations.js` | NOWY - baselinker status, token mgmt |
| `src/stores/company.js` | NOWY - company, subscription, team |
| `src/api.js` | credentials: 'include', auth.*, integrations.* |
| `src/App.vue` | REFACTOR - gate tylko, logika w stores |
| `src/components/LoginForm.vue` | NOWY - login + 2FA form |
| `src/components/SecurityTab.vue` | NOWY - change password + 2FA toggle |
| **USUNIĘTE** | |
| `login.html` | USUNIĘTY - login jako komponent w App.vue |

---

## SECURITY TEST PLAN

### Test S1: Brute Force 2FA
1. Włącz 2FA dla użytkownika
2. Spróbuj zalogować się 4 razy z błędnym kodem
3. **OCZEKIWANE**: Konto zablokowane, nowy kod wymagany

### Test S2: Refresh Token Reuse
1. Zaloguj się, zapisz refresh token
2. Wykonaj refresh (dostaniesz nowy token)
3. Użyj STAREGO refresh token
4. **OCZEKIWANE**: Wszystkie sesje unieważnione, wymuszony logout

### Test S3: XSS Token Theft (z httpOnly cookies)
1. Wstrzyknij XSS: `<script>fetch('/steal?t='+localStorage.getItem('refreshToken'))</script>`
2. **OCZEKIWANE**: Brak refreshToken w localStorage (jest w httpOnly cookie)

### Test S4: CSRF Change Password
1. Na obcej stronie utwórz formularz POST do /api/auth/change-password
2. **OCZEKIWANE**: Request odrzucony (Invalid origin) - SameSite + Origin validation

### Test S5: Timing Attack 2FA
1. Mierz czas odpowiedzi dla różnych kodów
2. **OCZEKIWANE**: Czasy identyczne (argon2.verify ma constant-time wewnętrznie)

### Test S6: Rate Limiting
1. Wyślij 15 requestów login w 1 minutę
2. **OCZEKIWANE**: Request 11+ odrzucony z 429 Too Many Requests

### Test S7: Password Strength
1. Spróbuj ustawić hasło "aaaaaaaaaaaa" (12 znaków, ale słabe)
2. **OCZEKIWANE**: Odrzucone - brak wielkich liter, cyfr, znaków specjalnych

### Test S8: TempToken IP Binding
1. Uzyskaj tempToken z IP A
2. Spróbuj użyć tempToken z IP B
3. **OCZEKIWANE**: Token odrzucony

---

## SECURITY ANALYSIS (Runda 3) - Edge Cases & Deployment

#### 17. 🔴 Password w logach
**Problem:** `logger.error('Login failed', { email: req.body.email })` - co jeśli password jest w body?
**Rozwiązanie:** Sanitizacja logów

```javascript
// utils/logger.js - dodaj sanitizer:
const SENSITIVE_FIELDS = ['password', 'currentPassword', 'newPassword', 'token', 'secret'];

function sanitizeLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = { ...obj };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeLog(sanitized[key]);
    }
  }
  return sanitized;
}
```

#### 18. 🔴 Database Connection String Exposure
**Problem:** Prisma może logować connection string przy błędach
**Rozwiązanie:**
```javascript
// Sprawdź czy DATABASE_URL nie jest logowany
// W produkcji: set DEBUG='' (wyłącz debug Prisma)
```

#### 19. 🟠 Concurrent Session Limit
**Problem:** Jeden user może mieć nieskończoną liczbę aktywnych sesji
**Rozwiązanie:**
```javascript
// Przy wydawaniu nowego refresh token:
const activeSessions = await prisma.refreshToken.count({
  where: { userId: user.id, revoked: false, expiresAt: { gt: new Date() } }
});

const MAX_SESSIONS = 5;
if (activeSessions >= MAX_SESSIONS) {
  // Unieważnij najstarszą sesję
  const oldest = await prisma.refreshToken.findFirst({
    where: { userId: user.id, revoked: false },
    orderBy: { createdAt: 'asc' }
  });
  if (oldest) {
    await prisma.refreshToken.update({
      where: { id: oldest.id },
      data: { revoked: true }
    });
  }
}
```

#### 20. 🟠 Export Data Access Control
**Problem:** Czy user może uruchomić/modyfikować eksport innego usera?
**Status:** Sprawdzić companyId filtering w exports routes
**Rozwiązanie:** Każdy endpoint musi weryfikować ownership

```javascript
// W każdym route exports:
const exportConfig = exportService.getExport(req.params.id);
if (!exportConfig || exportConfig.companyId !== req.company.id) {
  return res.status(404).json({ error: 'Export not found' });
}
```

#### 21. 🟠 Integration Token Encryption at Rest
**Problem:** BaseLinker token w DB - czy jest zaszyfrowany?
**Status:** companySecret.service używa encryption
**Weryfikacja:** Upewnij się że encryption key jest w env, nie w kodzie

#### 22. 🟡 HTTP Headers Security
**Problem:** Brakujące security headers
**Rozwiązanie:** helmet() już jest w package.json, sprawdź konfigurację:

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // tailwind
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.baselinker.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

#### 23. 🟡 API Versioning
**Problem:** Brak wersjonowania API = trudne security patches
**Rozwiązanie:** Na przyszłość - /api/v1/, /api/v2/

#### 24. 🟡 Error Stack Traces
**Problem:** W development mode stack traces mogą wyciec do klienta
**Status:** Już zaimplementowane sprawdzanie NODE_ENV
**Weryfikacja:** Upewnij się że na produkcji NODE_ENV=production

#### 25. 🟡 Password Reset Flow (brakuje w planie)
**Problem:** Nie ma możliwości resetowania zapomnianego hasła
**Rozwiązanie:** Dodać w przyszłej iteracji:
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- Token wysyłany emailem, ważny 1h

---

## SECURITY ANALYSIS (Runda 4) - Attack Vectors

#### 26. 🔴 Account Enumeration via Timing
**Problem:** Hasło jest hashowane tylko jeśli user istnieje - różnica czasu
**Rozwiązanie:**

```javascript
// Zawsze wykonuj operację hash nawet jeśli user nie istnieje:
const user = await prisma.user.findUnique({ where: { email } });

// Dummy hash jeśli user nie istnieje (constant time)
const passwordToVerify = user?.password || '$argon2id$v=19$m=65536,t=3,p=4$dummy';
const isValidPassword = await passwordService.verify(password, passwordToVerify);

if (!user || !isValidPassword) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
```

#### 27. 🟠 Session Fixation
**Problem:** Czy po login generowany jest nowy session ID?
**Status:** JWT tokeny są generowane po login - OK
**Weryfikacja:** Upewnij się że nie ma shared state przed/po login

#### 28. 🟠 Clickjacking
**Problem:** Aplikacja może być osadzona w iframe na złośliwej stronie
**Rozwiązanie:** helmet() X-Frame-Options: DENY (sprawdź konfigurację)

#### 29. 🟡 Open Redirect
**Problem:** Jeśli login.html ma ?redirect= parameter
**Weryfikacja:** Sprawdź czy redirect URLs są walidowane

```javascript
// DOBRZE:
const allowedRedirects = ['/', '/dashboard', '/exports'];
const redirect = req.query.redirect;
if (allowedRedirects.includes(redirect)) {
  window.location.href = redirect;
}

// ŹLE:
window.location.href = req.query.redirect; // może być //evil.com
```

#### 30. 🟡 Denial of Service via Large Payload
**Problem:** POST body może być bardzo duży
**Rozwiązanie:**

```javascript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
```

---

## IMPLEMENTATION STATUS (AKTUALIZACJA)

> **Stan:** Większość infrastruktury jest już zaimplementowana. Poniżej podsumowanie.

### ✅ ZAIMPLEMENTOWANE (zweryfikowane w kodzie):

| Element | Lokalizacja | Status |
|---------|-------------|--------|
| Cookie-parser | `server.js:127` | ✅ `app.use(cookieParser())` przed routes |
| CORS z credentials | `server.js:110-125` | ✅ `credentials: true`, dynamic origin |
| Trust proxy | `server.js:44-57` | ✅ Obsługa x-forwarded-proto dla Render |
| Rate limiters | `backend/middleware/rateLimiter.js` | ✅ loginLimiter, twoFactorLimiter, passwordChangeLimiter |
| Rate limiters podpięte | `backend/routes/auth.js` | ✅ Middleware na login, 2FA, change-password |
| 2FA pola w DB | `prisma/schema.prisma:221-229` | ✅ twoFactorSecret, twoFactorExpiry, twoFactorAttempts, accountLockedUntil |
| Email service | `backend/services/email.service.js` | ✅ Nodemailer z send2FACode() |
| Password validator | `backend/validators/password.js` | ✅ 12+ znaków, uppercase, lowercase, digit, special |
| httpOnly cookies | `backend/routes/auth.js` | ✅ setRefreshTokenCookie() z sameSite: strict |
| Pinia stores | `src/stores/` | ✅ auth.js, exports.js, integrations.js, company.js |
| LoginForm component | `src/components/LoginForm.vue` | ✅ Z obsługą 2FA flow |
| API credentials mode | `src/api.js:120` | ✅ `credentials: 'include'` |
| Auth gate w App.vue | `src/App.vue` | ✅ Renderowanie na podstawie authStore.authState |
| Logout reset | `src/stores/auth.js:107-125` | ✅ Natychmiast CHECKING, potem $reset() |

### ⚠️ WYMAGA WERYFIKACJI / POPRAWEK:

| Element | Problem | Rozwiązanie |
|---------|---------|-------------|
| **Exports runId deduplikacja** | Backend tylko LOGUJE runId, nie deduplikuje | Dodać sprawdzenie: jeśli runId już wykonany → zwróć poprzedni wynik |
| **SameSite cookie cross-domain** | `sameSite: strict` może blokować cookies cross-site | Jeśli FE/BE na różnych domenach: `sameSite: 'none'` + `secure: true` |
| **npm install** | Błędna komenda w planie | Backend: `npm i nodemailer`, Frontend: `npm i pinia` (osobno!) |
| **2FA attempts w disable flow** | Potencjalnie brak inkrementacji attempts | Zweryfikować w auth.js: /2fa/disable/confirm inkrementuje attempts |

---

## CRITICAL VERIFICATIONS (KRYTYCZNE WERYFIKACJE)

> Na podstawie code review - muszą być spełnione przed deployem na produkcję.

### 1. Backend: CORS + Cookies

**Sprawdź w `server.js`:**
```javascript
// MUSI BYĆ:
cors({ origin: FRONTEND_URL, credentials: true })
cookieParser() // PRZED routes
app.set('trust proxy', 1) // jeśli reverse proxy (Render)
```

**Test:**
1. Po `POST /api/auth/login` w odpowiedzi: `Set-Cookie: refreshToken=...; HttpOnly; ...`
2. W przeglądarce cookie widoczna w DevTools (Application → Cookies)
3. `POST /api/auth/refresh` działa BEZ tokena w body

### 2. Backend: Account Enumeration Prevention

**Sprawdź w `backend/routes/auth.js`:**
- Ten sam status i tekst dla "user nie istnieje" i "złe hasło"
- Timing: dummy hash wykonywany nawet gdy user nie istnieje
- Lockout działa tylko gdy user istnieje (ale bez ujawniania tego faktu)

**Test:**
- Czas odpowiedzi dla istniejącego i nieistniejącego usera powinien być podobny (±100ms)

### 3. Backend: 2FA Field Naming

**UWAGA:** `twoFactorSecret` to HASH kodu email, NIE sekret TOTP!

**Wymagania:**
- W DB przechowywany jest `argon2.hash(kod)`, nie plaintext
- Po `confirm-enable` / `confirm-disable` hash jest czyszczony (NULL)
- Nie mylić z TOTP secret (które by było base32)

### 4. Backend: 2FA Attempts w disable flow

**Sprawdź czy WSZYSTKIE endpointy 2FA inkrementują attempts:**
- `/2fa/confirm-enable` - ✅ powinno być
- `/2fa/disable/confirm` - ⚠️ ZWERYFIKOWAĆ
- `/2fa/verify-login` - ✅ powinno być

**Logika:**
- attempts++ na błędny kod
- limit 3 → wyczyść kod, wymuś re-request

### 5. Backend: Exports runId Deduplikacja

**KRYTYCZNE:** Samo logowanie runId nic nie daje!

**Wymagana logika w `POST /exports/:id/run`:**
```javascript
// Sprawdź czy runId już był przetworzony
const existingRun = await prisma.exportRun.findFirst({
  where: { exportId, runId }
});

if (existingRun) {
  logger.info('Duplicate runId detected, returning cached result', { runId });
  return res.json({ success: true, result: existingRun.result, cached: true });
}

// ... wykonaj eksport ...

// Zapisz wynik z runId
await prisma.exportRun.create({
  data: { exportId, runId, result, ... }
});
```

### 6. Frontend: Auth Gate Defense in Depth

**Sprawdź w `src/App.vue`:**
- Komponenty z danymi (Exports, Company, Billing) NIE renderują się przed `authState === 'AUTHENTICATED'`
- Lub: mają wewnętrzny warunek na początku

### 7. Frontend: Logout Reset ALL

**Sprawdź czy logout resetuje WSZYSTKO:**
```javascript
// W logout() lub callsite:
authStore.logout()     // → CHECKING, potem $reset()
exportsStore.$reset()
integrationsStore.$reset()
companyStore.$reset()
API.clearAuth()        // localStorage + Authorization header
```

**Test krytyczny:**
User A → logout → login User B → **ZERO flash danych User A**

### 8. Frontend: 2FA Login Token Handling

**Sprawdź w `src/api.js` i `src/stores/auth.js`:**
- Po `/login` z `requires2FA` **NIE** zapisuj `accessToken`
- Dopiero po `/2fa/verify-login` zapisuj `accessToken`

### 9. Frontend: credentials: 'include' nie nadpisywane

**Sprawdź w `src/api.js`:**
```javascript
const config = {
  headers,
  credentials: 'include', // WAŻNE: musi być PRZED ...options
  ...options,             // Może nadpisać credentials!
};
```

**Poprawka (jeśli potrzebna):**
```javascript
const config = {
  ...options,
  credentials: 'include', // ZAWSZE na końcu lub zabezpieczone
};
```

---

## PRODUCTION DEPLOYMENT REQUIREMENTS

> **KRYTYCZNE** - bez tych ustawień aplikacja nie będzie działać poprawnie w produkcji!

### Environment Variables (Backend)

```env
# WYMAGANE
NODE_ENV=production
FRONTEND_URL=https://app.livesales.pl  # Dokładna domena FE
DATABASE_URL=postgresql://...

# JWT - wygeneruj: openssl rand -hex 32
JWT_ACCESS_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<64-char-hex>

# Encryption
ENCRYPTION_KEY=<32-char-key>

# SMTP dla 2FA
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@livesales.pl
SMTP_SECURE=false  # true dla port 465
```

### Cookie Configuration

```javascript
// W auth.js - cookie ustawienia dla produkcji:
res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // TRUE w prod
  sameSite: 'strict', // lub 'lax' jeśli cross-subdomain
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth'
});
```

### Reverse Proxy (Render, Heroku, etc.)

```javascript
// W server.js - PRZED middleware:
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
```

### CORS dla różnych domen

```javascript
// Jeśli FE i BE na RÓŻNYCH domenach:
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  // ... rest
}));

// Cookie musi mieć:
sameSite: 'none',  // UWAGA: wymaga secure: true
secure: true
```

### Checklist przed deployem

- [ ] `NODE_ENV=production` ustawione
- [ ] `FRONTEND_URL` ustawiony dokładnie (bez trailing slash)
- [ ] `trust proxy` włączony (jeśli reverse proxy)
- [ ] SMTP działa (test wysłania emaila)
- [ ] Cookie `secure: true` w produkcji
- [ ] Helmet CSP pozwala na FRONTEND_URL w connectSrc

---

## E2E TEST PLAN (15 minut, bez debugowania)

### Test 1: Login bez 2FA
1. `POST /login` → Set-Cookie refreshToken + accessToken w body
2. App: AUTHENTICATED, widać dane
3. ✅ PASS / ❌ FAIL

### Test 2: Refresh
1. `POST /refresh` bez body
2. Dostaje nowy accessToken
3. ✅ PASS / ❌ FAIL

### Test 3: Enable 2FA
1. `POST /2fa/enable` → mail przychodzi
2. `POST /2fa/confirm-enable` z kodem → twoFactorEnabled=true
3. ✅ PASS / ❌ FAIL

### Test 4: Logout
1. `POST /logout` → cookie znika
2. App: UNAUTHENTICATED
3. ✅ PASS / ❌ FAIL

### Test 5: Login z 2FA
1. `POST /login` → requires2FA + tempToken (BEZ Set-Cookie refresh)
2. `POST /2fa/verify-login` z kodem → Set-Cookie refreshToken + accessToken
3. App: AUTHENTICATED
4. ✅ PASS / ❌ FAIL

### Test 6: Disable 2FA
1. `POST /2fa/disable/request` → mail
2. `POST /2fa/disable/confirm` z kodem → twoFactorEnabled=false
3. ✅ PASS / ❌ FAIL

### Test 7: Exports runId
1. FE run export → body `{runId, trigger}`
2. Backend loguje runId
3. (Opcjonalnie) Ten sam runId → zwraca cached result
4. ✅ PASS / ❌ FAIL

### Test 8: Auth Flash Prevention
1. User A login → widzi swoje dane
2. User A logout → natychmiast loader
3. User B login → widzi TYLKO swoje dane
4. **ZERO flash danych User A**
5. ✅ PASS / ❌ FAIL

---

## FINAL SECURITY CHECKLIST (ZAKTUALIZOWANY)

### MUST HAVE (blokery wdrożenia):
- [x] httpOnly cookies dla refresh token (✅ zaimplementowane)
- [x] Rate limiting na auth endpoints (✅ loginLimiter, twoFactorLimiter, passwordChangeLimiter)
- [x] Brute force protection dla 2FA (✅ max 3 próby, twoFactorAttempts)
- [x] 2FA codes hashed via argon2 (✅ constant-time verification)
- [x] Password strength validation (✅ 12+ chars, uppercase, lowercase, digit, special)
- [x] Refresh token reuse detection (✅ w auth.js)
- [x] Log sanitization (✅ w logger.js)
- [x] Account enumeration timing fix (✅ dummy hash)
- [ ] **Exports runId deduplikacja** (⚠️ WYMAGA IMPLEMENTACJI)

### SHOULD HAVE (przed produkcją):
- [x] Security headers via helmet (✅ skonfigurowane)
- [x] Explicit JSON body size limit (✅ 100kb)
- [x] Pinia stores z $reset() dla clean logout (✅ wszystkie stores)
- [ ] Export ownership verification (sprawdzić companyId filtering)
- [ ] SameSite cookie dla cross-domain (jeśli dotyczy)

### NICE TO HAVE (future iterations):
- [ ] Password reset flow
- [ ] TOTP 2FA (Google Authenticator)
- [ ] Backup codes dla 2FA
- [ ] Session management UI (lista aktywnych sesji)
- [ ] Concurrent session limit (max 5)
