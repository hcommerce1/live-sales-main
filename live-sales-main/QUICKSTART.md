# 🚀 Quick Start Guide - Live Sales

Ten przewodnik pozwoli Ci uruchomić Live Sales w 5 minut!

## Krok 1: Zainstaluj zależności

```bash
npm install
```

## Krok 2: Utwórz plik `.env`

Skopiuj przykładowy plik:
```bash
cp .env.example .env
```

## Krok 3: Skonfiguruj `.env`

Edytuj plik `.env` i uzupełnij 3 najważniejsze wartości:

```env
# 1. Token z BaseLinker (pobierz z: BaseLinker → Ustawienia → Integracje → API)
BASELINKER_API_TOKEN=5004221-5013195-GBT19RBZAAJG4AKIFRAG9547IT7X7QV6L4K47L40RC5TDX64NZ852KP2VYL4E65B

# 2. Email Service Account z Google Cloud
GOOGLE_SERVICE_ACCOUNT_EMAIL=live-sales-worker@twoj-projekt.iam.gserviceaccount.com

# 3. Private Key z Google Cloud (plik JSON → pole "private_key")
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQ...cały klucz...\n-----END PRIVATE KEY-----
```

### Jak zdobyć Google Service Account? (2 minuty)

1. Przejdź do: https://console.cloud.google.com
2. Utwórz nowy projekt (lub wybierz istniejący)
3. W menu → "APIs & Services" → "Enable APIs and Services"
4. Wyszukaj "Google Sheets API" i kliknij "Enable"
5. W menu → "APIs & Services" → "Credentials"
6. Kliknij "Create Credentials" → "Service Account"
7. Wypełnij nazwę (np. "live-sales-worker") i kliknij "Create"
8. Pomiń role i kliknij "Done"
9. Kliknij na utworzony Service Account
10. Zakładka "Keys" → "Add Key" → "Create new key" → wybierz "JSON"
11. Pobierz plik JSON
12. Otwórz plik JSON i skopiuj:
    - `client_email` → do `GOOGLE_SERVICE_ACCOUNT_EMAIL`
    - `private_key` → do `GOOGLE_PRIVATE_KEY` (WAŻNE: zachowaj `\n`)

## Krok 4: Uruchom aplikację

```bash
npm start
```

Lub w trybie deweloperskim (auto-reload):
```bash
npm run dev
```

## Krok 5: Otwórz w przeglądarce

```
http://localhost:3000
```

## Krok 6: Utwórz pierwszy eksport

1. Kliknij **"Nowy eksport"**
2. Wybierz **"Zamówienia"**
3. Dodaj kilka pól (np. "ID zamówienia", "Email", "Suma brutto")
4. W sekcji **"Google Sheets"**:
   - Otwórz Google Sheets i utwórz nowy arkusz
   - Kliknij **"Udostępnij"** w arkuszu
   - Wklej email: `live-sales-worker@twoj-projekt.iam.gserviceaccount.com`
   - Wybierz uprawnienia **"Edytor"** i kliknij "Wyślij"
   - Skopiuj URL arkusza i wklej do konfiguracji
5. Kliknij **"Zapisz"**
6. Kliknij **"Uruchom teraz"**

## ✅ Gotowe!

Twoje dane z BaseLinker powinny być teraz w Google Sheets! 🎉

## 📌 Następne kroki

- **Dashboard**: Zobacz statystyki i ostatnie uruchomienia
- **Automatyczne eksporty**: Ustaw harmonogram (np. co 15 minut)
- **Filtry**: Eksportuj tylko wybrane zamówienia (np. status "Opłacone")
- **Wiele eksportów**: Twórz różne konfiguracje dla różnych celów

## 🆘 Problemy?

### Backend nie startuje?
```bash
# Sprawdź czy port 3000 jest wolny
npx kill-port 3000

# Sprawdź logi
cat logs/error.log
```

### "Google Sheets API not initialized"?
- Upewnij się, że `GOOGLE_PRIVATE_KEY` zawiera `\n` (np. `-----BEGIN PRIVATE KEY-----\nMIIE...`)
- Skopiuj cały klucz z pliku JSON (od `-----BEGIN` do `-----END PRIVATE KEY-----`)

### "Baselinker API Error"?
- Sprawdź czy token API jest prawidłowy w BaseLinker → Ustawienia → Integracje → API

### "Invalid Google Sheets URL"?
- URL musi mieć format: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`

### Brak dostępu do arkusza?
- Upewnij się, że udostępniłeś arkusz dla Service Account email
- Sprawdź czy wybrałeś uprawnienia "Edytor" (nie "Czytelnik")

## 🚢 Deploy na Render?

Zobacz szczegóły w [README-DEPLOYMENT.md](./README-DEPLOYMENT.md)

---

**Miłej pracy z Live Sales!** 💪
