# HIPERDETALNA LISTA ZADAŃ - Nowy System Eksportów

## STATUS: W TRAKCIE

---

## FAZA 1: KONFIGURACJA DATASETÓW

### 1.1 Utworzenie struktury folderów
- [ ] Utworzenie `backend/config/datasets/`
- [ ] Utworzenie `backend/services/export/`
- [ ] Utworzenie `backend/services/nbp/` (kursy walut)

### 1.2 Dataset: ZAMÓWIENIA (orders)
- [ ] `backend/config/datasets/orders.dataset.js`
  - [ ] Sekcja 1.1: Podstawowe (16 pól)
  - [ ] Sekcja 1.2: Dane klienta (2 pola)
  - [ ] Sekcja 1.3: Adres dostawy (8 pól)
  - [ ] Sekcja 1.4: Punkt odbioru (5 pól)
  - [ ] Sekcja 1.5: Dane do faktury (9 pól)
  - [ ] Sekcja 1.6: Płatność (6 pól)
  - [ ] Sekcja 1.7: Dostawa (5 pól)
  - [ ] Sekcja 1.8: Wartości zamówienia (6 pól)
  - [ ] Sekcja 1.9: Podsumowanie produktów (4 pola)
  - [ ] Sekcja 1.10: Przesyłki 1-5 (61 pól)
  - [ ] Sekcja 1.11: Dokument sprzedaży 1 (13 pól)
  - [ ] Sekcja 1.12: Dokument sprzedaży 2 (13 pól)
  - [ ] Sekcja 1.13: Przewalutowanie (10 pól)
  - [ ] Sekcja 1.14: Pola dodatkowe (dynamiczne)

### 1.3 Dataset: POZYCJE ZAMÓWIEŃ (order_items)
- [ ] `backend/config/datasets/order-items.dataset.js`
  - [ ] Sekcja 2.1: Kontekst zamówienia (8 pól)
  - [ ] Sekcja 2.2: Dane produktu (8 pól)
  - [ ] Sekcja 2.3: Ilość i ceny (5 pól)
  - [ ] Sekcja 2.4: Wartości pozycji (4 pola)
  - [ ] Sekcja 2.5: Dane z magazynu inv_ (13 pól)
  - [ ] Sekcja 2.6: Kalkulacje marży (3 pola)
  - [ ] Sekcja 2.7: Przewalutowanie (4 pola)

### 1.4 Dataset: ZWROTY (returns)
- [ ] `backend/config/datasets/returns.dataset.js`
  - [ ] Sekcja 3.1: Podstawowe (8 pól)
  - [ ] Sekcja 3.2: Dane klienta (3 pola)
  - [ ] Sekcja 3.3: Adres zwrotu (4 pola)
  - [ ] Sekcja 3.4: Wartości (4 pola)
  - [ ] Sekcja 3.5: Produkty zwrotu (3 pola)
  - [ ] Sekcja 3.6: Komentarze (2 pola)
  - [ ] Sekcja 3.7: Pola dodatkowe (dynamiczne)

### 1.5 Dataset: DOKUMENTY MAGAZYNOWE (warehouse_docs)
- [ ] `backend/config/datasets/warehouse-docs.dataset.js`
  - [ ] Sekcja 4.1: Podstawowe (6 pól)
  - [ ] Sekcja 4.2: Magazyn (3 pola)
  - [ ] Sekcja 4.3: Kontrahent (3 pola)
  - [ ] Sekcja 4.4: Wartości (4 pola)
  - [ ] Sekcja 4.5: Powiązania (3 pola)
  - [ ] Sekcja 4.6: Pozycje agregowane (2 pola)
  - [ ] Sekcja 4.7: Komentarze (1 pole)

### 1.6 Dataset: PRODUKTY KATALOG (products_catalog)
- [ ] `backend/config/datasets/products-catalog.dataset.js`
  - [ ] Sekcja 5.1: Identyfikatory (4 pola)
  - [ ] Sekcja 5.2: Podstawowe (4 pola)
  - [ ] Sekcja 5.3: Klasyfikacja (5 pól)
  - [ ] Sekcja 5.4: Ceny (6 pól)
  - [ ] Sekcja 5.5: Stany magazynowe (6 pól)
  - [ ] Sekcja 5.6: Wymiary i waga (4 pola)
  - [ ] Sekcja 5.7: Media (2 pola)
  - [ ] Sekcja 5.8: Lokalizacja (1 pole)
  - [ ] Sekcja 5.9: Warianty (2 pola)
  - [ ] Sekcja 5.10: Ceny grupowe (dynamiczne)
  - [ ] Sekcja 5.11: Pola tekstowe (dynamiczne)

### 1.7 Dataset: PRODUKTY ZEWNĘTRZNE (products_external)
- [ ] `backend/config/datasets/products-external.dataset.js`
  - [ ] Sekcja 6.1: Identyfikatory (5 pól)
  - [ ] Sekcja 6.2: Podstawowe (4 pola)
  - [ ] Sekcja 6.3: Ceny (3 pola)
  - [ ] Sekcja 6.4: Dostępność (3 pola)
  - [ ] Sekcja 6.5: Wymiary (4 pola)

### 1.8 Dataset: ZAKUPY TOWARU (purchase_orders)
- [ ] `backend/config/datasets/purchase-orders.dataset.js`
  - [ ] Sekcja 7.1: Podstawowe (4 pola)
  - [ ] Sekcja 7.2: Daty (4 pola)
  - [ ] Sekcja 7.3: Dostawca (6 pól)
  - [ ] Sekcja 7.4: Magazyn docelowy (3 pola)
  - [ ] Sekcja 7.5: Wartości (5 pól)
  - [ ] Sekcja 7.6: Realizacja (3 pola)
  - [ ] Sekcja 7.7: Komentarze (1 pole)

### 1.9 Dataset: PRZESYŁKI (shipments)
- [ ] `backend/config/datasets/shipments.dataset.js`
  - [ ] Sekcja 8.1: Podstawowe (6 pól)
  - [ ] Sekcja 8.2: Daty (3 pola)
  - [ ] Sekcja 8.3: Status (4 pola)
  - [ ] Sekcja 8.4: Parametry przesyłki (6 pól)
  - [ ] Sekcja 8.5: Adres doręczenia (7 pól)
  - [ ] Sekcja 8.6: Punkt odbioru (3 pola)
  - [ ] Sekcja 8.7: Tracking (4 pola)
  - [ ] Sekcja 8.8: Dokumenty (4 pola)

### 1.10 Dataset: BASE CONNECT (base_connect)
- [ ] `backend/config/datasets/base-connect.dataset.js`
  - [ ] Sekcja 9.1: Podstawowe (3 pola)
  - [ ] Sekcja 9.2: Dane firmy (7 pól)
  - [ ] Sekcja 9.3: Adres (5 pól)
  - [ ] Sekcja 9.4: Warunki handlowe (5 pól)
  - [ ] Sekcja 9.5: Kontakt (3 pola)
  - [ ] Sekcja 9.6: Dane kredytowe (6 pól)

### 1.11 Index datasetów
- [ ] `backend/config/datasets/index.js` - eksport wszystkich datasetów

---

## FAZA 2: SERWIS NBP (KURSY WALUT)

### 2.1 Serwis pobierania kursów
- [ ] `backend/services/nbp/nbp.service.js`
  - [ ] Funkcja `fetchExchangeRate(currency, date)` - pojedynczy kurs
  - [ ] Funkcja `fetchAllRates(date)` - wszystkie waluty na dzień
  - [ ] Funkcja `getHistoricalRate(currency, date)` - z cache lub API
  - [ ] Cache w pamięci/Redis dla kursów

### 2.2 Model bazy danych
- [ ] Migracja Prisma: model `ExchangeRate`
  - [ ] `id`, `currency`, `rate`, `date`, `fetchedAt`
  - [ ] Unikalny index na (currency, date)

### 2.3 Cron job
- [ ] `backend/jobs/fetch-exchange-rates.job.js`
  - [ ] Codzienny cron (np. 8:00)
  - [ ] Pobieranie wszystkich walut z tabeli A NBP
  - [ ] Zapis do bazy

---

## FAZA 3: SERWISY BASELINKER - NOWE METODY

### 3.1 Metody zamówień
- [ ] `getOrderReturns(token, filters)` - lista zwrotów
- [ ] `getOrderReturnExtraFields(token)` - pola dodatkowe zwrotów
- [ ] `getOrderPackages(orderId)` - paczki zamówienia (rozszerzone)

### 3.2 Metody magazynowe
- [ ] `getInventoryDocuments(token, filters)` - dokumenty WZ/PZ/RW/PW/BO
- [ ] `getInventoryDocumentItems(token, documentId)` - pozycje dokumentu
- [ ] `getInventoryPurchaseOrders(token, filters)` - zamówienia zakupu
- [ ] `getInventoryPurchaseOrderItems(token, orderId)` - pozycje PO

### 3.3 Metody zewnętrzne
- [ ] `getExternalStorageProductsList(token, storageId, filters)` - produkty zewnętrzne
- [ ] `getExternalStorageProductsData(token, storageId, productIds)` - dane produktów

### 3.4 Metody Base Connect
- [ ] `getConnectIntegrationContractors(token, integrationId, filters)` - kontrahenci
- [ ] `getConnectContractorCreditHistory(token, contractorId)` - historia kredytowa

### 3.5 Metody metadanych (initial queries)
- [ ] `getInventoryWarehouses(token)` - magazyny
- [ ] `getInventoryAvailableTextFieldKeys(token, inventoryId)` - klucze pól tekstowych
- [ ] `getOrderReturnStatusList(token)` - statusy zwrotów
- [ ] `getOrderReturnReasonsList(token)` - powody zwrotów
- [ ] `getInventoryDocumentSeries(token)` - serie dokumentów

---

## FAZA 4: PIPELINE EKSPORTU

### 4.1 Główny pipeline
- [ ] `backend/services/export/ExportPipeline.js`
  - [ ] Klasa `ExportPipeline`
  - [ ] Metoda `execute(config)` - główna metoda
  - [ ] Metoda `fetchPrimaryData()` - pobieranie głównych danych
  - [ ] Metoda `applyEnrichments()` - wzbogacanie danych
  - [ ] Metoda `transform()` - transformacja do formatu wyjściowego

### 4.2 Fetcher dla każdego datasetu
- [ ] `backend/services/export/fetchers/orders.fetcher.js`
- [ ] `backend/services/export/fetchers/order-items.fetcher.js`
- [ ] `backend/services/export/fetchers/returns.fetcher.js`
- [ ] `backend/services/export/fetchers/warehouse-docs.fetcher.js`
- [ ] `backend/services/export/fetchers/products-catalog.fetcher.js`
- [ ] `backend/services/export/fetchers/products-external.fetcher.js`
- [ ] `backend/services/export/fetchers/purchase-orders.fetcher.js`
- [ ] `backend/services/export/fetchers/shipments.fetcher.js`
- [ ] `backend/services/export/fetchers/base-connect.fetcher.js`

### 4.3 Enrichery (wzbogacanie danych)
- [ ] `backend/services/export/enrichers/packages.enricher.js` - przesyłki dla zamówień
- [ ] `backend/services/export/enrichers/documents.enricher.js` - dokumenty sprzedaży
- [ ] `backend/services/export/enrichers/inventory.enricher.js` - dane magazynowe
- [ ] `backend/services/export/enrichers/currency.enricher.js` - przewalutowanie

### 4.4 Transformer
- [ ] `backend/services/export/DataTransformer.js`
  - [ ] Mapowanie pól do kolumn
  - [ ] Obsługa własnych nagłówków
  - [ ] Obsługa pól customowych (formuły)
  - [ ] Obsługa pustych pól

---

## FAZA 5: API ENDPOINTS

### 5.1 Endpoint definicji pól
- [ ] `GET /api/exports/field-definitions`
  - [ ] Zwraca wszystkie datasety z polami
  - [ ] Pobiera dynamiczne pola (extra fields) z BaseLinker
  - [ ] Grupuje pola według kategorii
  - [ ] Dodaje opisy (tooltips) do każdego pola

### 5.2 Endpoint metadanych
- [ ] `GET /api/exports/metadata`
  - [ ] Lista statusów zamówień
  - [ ] Lista źródeł zamówień
  - [ ] Lista magazynów
  - [ ] Lista integracji

### 5.3 Endpoint eksportu
- [ ] `POST /api/exports/run/:id`
  - [ ] Uruchomienie eksportu przez pipeline
  - [ ] Obsługa wszystkich datasetów

---

## FAZA 6: FRONTEND

### 6.1 Aktualizacja ExportWizard
- [ ] Obsługa nowej struktury datasetów
- [ ] Wyświetlanie pól według kategorii
- [ ] Tooltips z opisami pól
- [ ] Dynamiczne pola dodatkowe

### 6.2 Nowe komponenty
- [ ] Komponent `FieldTooltip.vue` - ikona (i) z opisem
- [ ] Komponent `CustomFieldEditor.vue` - edytor pól customowych
- [ ] Komponent `EmptyFieldButton.vue` - dodawanie pustych kolumn

### 6.3 Ustawienia eksportu
- [ ] Sekcja przewalutowania
  - [ ] Toggle włącz/wyłącz
  - [ ] Wybór waluty docelowej
  - [ ] Wybór daty kursu (4 opcje)

---

## FAZA 7: TESTY

### 7.1 Testy jednostkowe
- [ ] Testy dla każdego datasetu
- [ ] Testy enricherów
- [ ] Testy transformera
- [ ] Testy serwisu NBP

### 7.2 Testy integracyjne
- [ ] Test pełnego eksportu zamówień
- [ ] Test eksportu z przewalutowaniem
- [ ] Test eksportu z polami customowymi

---

## FAZA 8: MIGRACJA I CLEANUP

### 8.1 Usunięcie starego kodu
- [ ] Backup starego `export-fields.js`
- [ ] Usunięcie lub archiwizacja starego `exportService.js`

### 8.2 Migracja bazy
- [ ] Oznaczenie starych eksportów jako `legacy: true`
- [ ] Wyświetlenie komunikatu użytkownikom o konieczności rekonfiguracji

---

## PRIORYTETY

**KRYTYCZNE (rozpocząć natychmiast):**
1. Faza 1.2 - Dataset zamówień
2. Faza 4.1 - Pipeline eksportu
3. Faza 5.1 - Endpoint definicji pól

**WYSOKIE:**
4. Faza 1.3 - Dataset pozycji zamówień
5. Faza 2 - Serwis NBP
6. Faza 4.3 - Enrichery

**ŚREDNIE:**
7. Pozostałe datasety (Faza 1.4-1.10)
8. Faza 3 - Nowe metody BaseLinker
9. Faza 6 - Frontend

**NISKIE:**
10. Faza 7 - Testy
11. Faza 8 - Migracja

---

## NOTATKI

- Wszystkie pola w planie FREE (podział planów później)
- Stała liczba kolumn - gwarancja dla każdego wiersza
- Pola dynamiczne ładowane z API przy starcie wizarda
- Przewalutowanie opcjonalne (wszystko albo nic)
