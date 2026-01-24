# Live Sales - BaseLinker → Google Sheets Automation

Aplikacja do automatycznego eksportowania danych z BaseLinker do Google Sheets z możliwością konfiguracji pól, filtrów i harmonogramów.

## 🚀 Funkcje

✅ **Integracja z BaseLinker API**
- Pobieranie zamówień z filtrami (status, data)
- Pobieranie produktów z magazynów
- Wsparcie dla wszystkich magazynów (Kablowo, Onninen, Assmann, itp.)

✅ **Eksport do Google Sheets**
- Automatyczny zapis danych do arkuszy Google
- Dwa tryby zapisu: "Insert at Top" (najnowsze na górze) i "Replace" (zastąp wszystko)
- Walidacja dostępu do arkuszy

✅ **Scheduler (Harmonogram)**
- Automatyczne uruchamianie eksportów
- Konfigurowalne interwały (od 5 minut do raz dziennie)
- Tryb "live" - tylko manualne uruchamianie

✅ **Frontend Vue.js**
- Intuicyjny konfigurator z drag & drop
- Podgląd danych przed eksportem
- Zarządzanie wieloma eksportami
- Dashboard z live statystykami

## 📋 Wymagania

- Node.js 18+ (zalecane 18.18.0)
- Konto BaseLinker z tokenem API
- Konto Google Cloud Platform z Service Account dla Google Sheets API
- (Opcjonalnie) Konto Render.com dla deploymentu

## 🛠️ Instalacja Lokalna

### 1. Klonuj repozytorium
```bash
cd live-sales-v7
```

### 2. Zainstaluj zależności
```bash
npm install
```

### 3. Skonfiguruj zmienne środowiskowe

Skopiuj plik `.env.example` do `.env`:
```bash
cp .env.example .env
```

Edytuj `.env` i uzupełnij:
```env
# Server
PORT=3000
NODE_ENV=development

# BaseLinker API
BASELINKER_API_TOKEN=twój-token-z-baselinker
BASELINKER_API_URL=https://api.baselinker.com/connector.php

# Google Sheets API
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@projekt.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\ntwój-klucz\n-----END PRIVATE KEY-----

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
```

### 4. Konfiguracja Google Service Account

Szczegółowe instrukcje znajdują się w [README-DEPLOYMENT.md](./README-DEPLOYMENT.md), sekcja "Konfiguracja Google Service Account".

W skrócie:
1. Utwórz projekt w Google Cloud Console
2. Włącz Google Sheets API
3. Utwórz Service Account
4. Wygeneruj klucz JSON
5. Skopiuj `client_email` i `private_key` do `.env`

### 5. Uruchom aplikację

**Tryb deweloperski (z auto-reload):**
```bash
npm run dev
```

**Tryb produkcyjny:**
```bash
npm start
```

Aplikacja będzie dostępna pod adresem: `http://localhost:3000`

## 📁 Struktura Projektu

```
live-sales-v7/
├── backend/                    # Backend Node.js
│   ├── config/                # Konfiguracja
│   │   ├── baselinker.js     # Config BaseLinker API
│   │   └── googleSheets.js   # Config Google Sheets API
│   ├── routes/                # API Routes
│   │   ├── api.js            # Główne trasy API
│   │   ├── baselinker.js     # Trasy BaseLinker
│   │   ├── sheets.js         # Trasy Google Sheets
│   │   └── exports.js        # Trasy eksportów
│   ├── services/              # Serwisy biznesowe
│   │   ├── baselinkerService.js  # Integracja BaseLinker
│   │   ├── googleSheetsService.js # Integracja Google Sheets
│   │   └── exportService.js      # Zarządzanie eksportami
│   ├── scheduler/             # Scheduler (cron jobs)
│   │   └── index.js          # Harmonogram eksportów
│   └── utils/                 # Narzędzia
│       └── logger.js         # System logowania
├── frontend/                  # Frontend Vue.js
│   ├── index.html            # Główny plik HTML
│   ├── data.js               # Mock data + definicje pól
│   ├── frontend-api.js       # Client API dla backendu
│   └── app-backend.js        # Główna aplikacja Vue
├── logs/                      # Logi aplikacji
├── server.js                  # Główny plik serwera
├── package.json              # Zależności NPM
├── .env.example              # Przykładowa konfiguracja
├── render.yaml               # Config dla Render.com
└── README-DEPLOYMENT.md      # Instrukcje deploymentu
```

## 🔌 API Endpoints

### Exports Management
- `GET /api/exports` - Pobierz wszystkie eksporty
- `GET /api/exports/:id` - Pobierz eksport po ID
- `POST /api/exports` - Utwórz/zaktualizuj eksport
- `DELETE /api/exports/:id` - Usuń eksport
- `POST /api/exports/:id/run` - Uruchom eksport
- `POST /api/exports/:id/toggle` - Przełącz status (active/paused)
- `GET /api/exports/:id/stats` - Pobierz statystyki eksportu

### BaseLinker Integration
- `GET /api/baselinker/orders` - Pobierz zamówienia
- `GET /api/baselinker/products` - Pobierz produkty
- `GET /api/baselinker/order-statuses` - Pobierz statusy zamówień
- `GET /api/baselinker/inventories` - Pobierz magazyny

### Google Sheets Integration
- `POST /api/sheets/validate` - Waliduj URL arkusza
- `POST /api/sheets/write` - Zapisz dane do arkusza
- `GET /api/sheets/read` - Odczytaj dane z arkusza

### Health Check
- `GET /health` - Sprawdź status aplikacji

## 🎯 Użycie

### 1. Utwórz nowy eksport
1. Kliknij "Nowy eksport" w dashboardzie
2. Wybierz typ danych: Zamówienia lub Produkty
3. Dodaj pola do eksportu (drag & drop do zmiany kolejności)
4. Skonfiguruj filtry (opcjonalnie)
5. Podaj URL arkusza Google Sheets
6. Wybierz tryb zapisu i częstotliwość
7. Kliknij "Zapisz"

### 2. Udostępnij arkusz Google Sheets
**WAŻNE:** Musisz udostępnić arkusz dla Service Account:
1. Otwórz arkusz Google Sheets
2. Kliknij "Udostępnij"
3. Wklej email Service Account (z `.env`)
4. Wybierz uprawnienia "Edytor"
5. Kliknij "Wyślij"

### 3. Uruchom eksport
- **Ręcznie:** Kliknij "Uruchom teraz" w konfiguratorze
- **Automatycznie:** Eksport będzie uruchamiany zgodnie z harmonogramem

### 4. Monitoruj eksporty
- Dashboard pokazuje ostatnie uruchomienia
- Lista eksportów pokazuje status i uptime
- Logi znajdują się w folderze `logs/`

## 🚢 Deployment na Render

Szczegółowe instrukcje znajdują się w [README-DEPLOYMENT.md](./README-DEPLOYMENT.md).

Szybki start:
1. Push kodu na GitHub
2. Połącz repozytorium z Render.com
3. Ustaw zmienne środowiskowe w panelu Render
4. Deploy!

## 🐛 Troubleshooting

### Problem: "Google Sheets API not initialized"
**Rozwiązanie:** Sprawdź czy `GOOGLE_PRIVATE_KEY` w `.env` zawiera `\n` (znaki nowej linii) i jest prawidłowo sformatowany.

### Problem: "Baselinker API Error"
**Rozwiązanie:**
- Sprawdź czy token API jest prawidłowy
- Sprawdź limity API w BaseLinker

### Problem: Aplikacja nie łączy się z backendem
**Rozwiązanie:**
- Upewnij się, że backend jest uruchomiony (`npm start`)
- Sprawdź logi w konsoli przeglądarki
- Sprawdź czy port 3000 nie jest zajęty

### Problem: Brak dostępu do arkusza Google Sheets
**Rozwiązanie:**
- Upewnij się, że udostępniłeś arkusz dla Service Account
- Sprawdź czy email Service Account jest prawidłowy
- Sprawdź czy arkusz nie jest w trybie "tylko odczyt"

## 📊 Monitoring

### Logi
Logi aplikacji znajdują się w folderze `logs/`:
- `combined.log` - wszystkie logi
- `error.log` - tylko błędy

### Health Check
Sprawdź status aplikacji:
```bash
curl http://localhost:3000/health
```

## 🔒 Bezpieczeństwo

- **Nigdy** nie commituj pliku `.env` do repozytorium
- Trzymaj tokeny API i klucze prywatne w bezpiecznym miejscu
- Używaj HTTPS w produkcji
- Regularnie rotuj klucze API

## 📄 Licencja

ISC

## 💬 Wsparcie

Jeśli masz pytania lub problemy:
1. Sprawdź [README-DEPLOYMENT.md](./README-DEPLOYMENT.md)
2. Przejrzyj logi w `logs/`
3. Sprawdź dokumentację API:
   - [BaseLinker API](https://api.baselinker.com/)
   - [Google Sheets API](https://developers.google.com/sheets/api)

---

**Powodzenia z Live Sales!** 🚀
