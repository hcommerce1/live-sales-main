# BaseLinker API Reference

Pełna dokumentacja API BaseLinker dla projektu Live Sales. Zawiera wszystkie 67 endpointów z 11 kategorii.

## Spis treści

- [Autentykacja](#autentykacja)
- [Orders (16)](#orders)
- [Product catalog (14)](#product-catalog)
- [Courier shipments (11)](#courier-shipments)
- [Order returns (7)](#order-returns)
- [External storages (6)](#external-storages)
- [Inventory documents (3)](#inventory-documents)
- [Inventory purchase orders (3)](#inventory-purchase-orders)
- [Base Connect (3)](#base-connect)
- [Printouts (2)](#printouts)
- [Inventory suppliers (1)](#inventory-suppliers)
- [Inventory payers (1)](#inventory-payers)

---

## Autentykacja

**Endpoint:** `https://api.baselinker.com/connector.php`
**Metoda:** POST
**Nagłówek:** `X-BLToken: <token>`
**Limit:** 100 zapytań/min
**Format:** JSON (UTF-8)

### Generowanie tokenu
Token API generowany jest w panelu BaseLinker: **Account & other → My account → API section**

### Struktura zapytania
```
POST /connector.php
X-BLToken: <token>
Content-Type: application/x-www-form-urlencoded

method=<nazwa_metody>&parameters=<json_encoded>
```

### Przykład cURL
```bash
curl 'https://api.baselinker.com/connector.php' \
  -H 'X-BLToken: 1-23-ABC' \
  --data-raw 'method=getOrders&parameters=%7B%22date_from%22%3A+1407341754%7D'
```

---

## Orders

Endpointy do zarządzania zamówieniami, fakturami, paragonami i historią zdarzeń.

### getOrders

**Opis:** Pobiera zamówienia z menedżera zamówień BaseLinker. Maksymalnie 100 zamówień na raz.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | nie | ID zamówienia (pobiera tylko jedno) |
| date_confirmed_from | int | nie | Data potwierdzenia od (unix timestamp) |
| date_from | int | nie | Data utworzenia od (unix timestamp) |
| id_from | int | nie | ID zamówienia od którego pobierać kolejne |
| get_unconfirmed_orders | bool | nie | Pobierz też niepotwierdzone (domyślnie: false) |
| status_id | int | nie | Filtruj po statusie |
| filter_email | varchar(50) | nie | Filtruj po emailu |
| filter_order_source | varchar(20) | nie | Filtruj po źródle (ebay, amazon, allegro...) |
| filter_order_source_id | int | nie | ID źródła zamówienia |
| filter_shop_order_id | int | nie | ID zamówienia ze sklepu |
| include_custom_extra_fields | bool | nie | Pobierz dodatkowe pola |
| include_commission_data | bool | nie | Pobierz dane prowizji |
| include_connect_data | bool | nie | Pobierz dane Base Connect |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "orders": [{
    "order_id": 1630473,
    "shop_order_id": 2824,
    "external_order_id": "534534234",
    "order_source": "amazon",
    "order_source_id": 2598,
    "order_status_id": 6624,
    "date_add": 1407841161,
    "date_confirmed": 1407841256,
    "date_in_status": 1407841256,
    "confirmed": true,
    "user_login": "nick123",
    "currency": "GBP",
    "payment_method": "PayPal",
    "payment_method_cod": "0",
    "payment_done": "50",
    "user_comments": "User comment",
    "admin_comments": "Seller comments",
    "email": "test@test.com",
    "phone": "693123123",
    "delivery_method_id": 123,
    "delivery_method": "Expedited shipping",
    "delivery_price": 10,
    "delivery_package_module": "other",
    "delivery_package_nr": "0042348723648234",
    "delivery_fullname": "John Doe",
    "delivery_company": "Company",
    "delivery_address": "Long Str 12",
    "delivery_postcode": "E2 8HQ",
    "delivery_city": "London",
    "delivery_state": "",
    "delivery_country": "Great Britain",
    "delivery_country_code": "GB",
    "delivery_point_id": "",
    "delivery_point_name": "",
    "delivery_point_address": "",
    "delivery_point_postcode": "",
    "delivery_point_city": "",
    "invoice_fullname": "John Doe",
    "invoice_company": "Company",
    "invoice_nip": "GB8943245",
    "invoice_address": "Long Str 12",
    "invoice_postcode": "E2 8HQ",
    "invoice_city": "London",
    "invoice_state": "",
    "invoice_country": "Great Britain",
    "invoice_country_code": "GB",
    "want_invoice": "0",
    "extra_field_1": "",
    "extra_field_2": "",
    "custom_extra_fields": {
      "135": "B2B",
      "172": "1646913115"
    },
    "order_page": "https://klient.baselinker.com/1630473/4ceca0d940/",
    "pick_status": "1",
    "pack_status": "0",
    "commission": {
      "net": 12.5,
      "gross": 15.38,
      "currency": "USD"
    },
    "connect_data": {
      "connect_integration_id": 1,
      "connect_contractor_id": 34
    },
    "products": [{
      "storage": "shop",
      "storage_id": 1,
      "order_product_id": 154904741,
      "product_id": "5434",
      "variant_id": 52124,
      "name": "Harry Potter and the Chamber of Secrets",
      "attributes": "Colour: green",
      "sku": "LU4235",
      "ean": "1597368451236",
      "location": "A1-13-7",
      "warehouse_id": 123,
      "auction_id": "0",
      "price_brutto": 20.00,
      "tax_rate": 23,
      "quantity": 2,
      "weight": 1,
      "bundle_id": 0
    }]
  }]
}
```

**Przykład zapytania:**
```json
{
  "date_confirmed_from": 1407341754,
  "get_unconfirmed_orders": false
}
```

---

### getOrdersByEmail

**Opis:** Wyszukuje zamówienia po adresie email. Przydatne dla pluginów do klientów pocztowych.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| email | varchar(50) | tak | Adres email do wyszukania |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "orders": [{
    "order_id": "143476149",
    "order_status_id": "1051",
    "date_in_status": "1599752305",
    "date_add": "1599752305"
  }]
}
```

---

### getOrdersByPhone

**Opis:** Wyszukuje zamówienia po numerze telefonu. Przydatne dla systemów rozpoznawania dzwoniących.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| phone | varchar(50) | tak | Numer telefonu do wyszukania |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "orders": [{
    "order_id": 510297,
    "order_status_id": 6624,
    "delivery_fullname": "John Doe",
    "delivery_company": "Company Ltd.",
    "date_in_status": "1305049346",
    "date_add": "1305049346"
  }]
}
```

---

### getOrderStatusList

**Opis:** Pobiera listę statusów zamówień utworzonych przez użytkownika.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "statuses": [{
    "id": 1051,
    "name": "New orders",
    "name_for_customer": "Order accepted",
    "color": "#FF0000"
  }]
}
```

---

### getOrderSources

**Opis:** Pobiera źródła zamówień (sklepy, marketplace'y) z ich ID.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "sources": {
    "personal": {
      "0": "In person / by phone",
      "1621": "stationary shop"
    },
    "shop": {
      "8235": "Shop 1",
      "4626": "Shop 2"
    },
    "ebay": {
      "1522": "eBay Account 1"
    },
    "amazon": {
      "7245": "Amazon Account 1"
    }
  }
}
```

---

### getOrderExtraFields

**Opis:** Pobiera definicje dodatkowych pól zamówień.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extra_fields": [{
    "extra_field_id": 135,
    "name": "Client type",
    "editor_type": "radio",
    "options": ["B2B", "B2C"]
  }]
}
```

**Typy edytorów:** text, number, select, checkbox, radio, date, file

---

### getOrderPaymentsHistory

**Opis:** Pobiera historię płatności dla zamówienia, włącznie z zewnętrznym ID płatności.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | tak | ID zamówienia |
| show_full_history | bool | nie | Pełna historia (domyślnie: false) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "payments": [{
    "paid_before": "0.00",
    "paid_after": "55.00",
    "total_price": "82.97",
    "currency": "GBP",
    "external_payment_id": "189a1236-0aa9-21ee-15ab-8b0992243303",
    "date": "1515001701",
    "comment": ""
  }]
}
```

---

### getOrderPickPackHistory

**Opis:** Pobiera historię pick & pack dla zamówienia.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | tak | ID zamówienia |
| action_type | int | nie | Typ zdarzenia (1-17) |

**Typy zdarzeń:**
- 1-6: Picking (rezerwacja, start, cancel, in progress, finished, error)
- 7-12: Packing (rezerwacja, start, cancel, in progress, finished, error)
- 13-17: Zdjęcia (init, taken, deleted, save error, size error)

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "history": [{
    "action_type": 1,
    "profile_id": "John Doe",
    "station_id": 13465,
    "cart_id": 0,
    "entry_date": 1702905036
  }]
}
```

---

### getOrderTransactionData

**Opis:** Pobiera szczegóły transakcji dla zamówienia (szczególnie dla Amazon).

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | tak | ID zamówienia |
| include_complex_taxes | bool | nie | Szczegółowy rozkład podatków |
| include_amazon_data | bool | nie | Dane Amazon (domyślnie: true) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "currency": "USD",
  "fulfillment_shipments": [],
  "fulfillment_center_id": "WRO1",
  "marketplace_transaction_id": "zorp-test",
  "account_id": 23,
  "transaction_date": 1703097600,
  "order_items": [{
    "itemId": "BPCABS16949",
    "outerItemId": "pBPCABS16949",
    "shipping": {
      "netValue": 0,
      "taxValue": 0,
      "grossValue": 0,
      "currency": "USD",
      "taxes": [{"code": "GST", "value": 0, "rate": 0.05}]
    },
    "taxes": [{"code": "GST", "value": 2.5, "rate": 0.05}]
  }]
}
```

---

### getInvoices

**Opis:** Pobiera faktury z menedżera zamówień. Maksymalnie 100 faktur.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| invoice_id | int | nie | ID faktury |
| order_id | int | nie | ID zamówienia |
| date_from | int | nie | Data od (unix timestamp) |
| id_from | int | nie | ID faktury od której pobierać |
| series_id | int | nie | ID serii numeracji |
| get_external_invoices | bool | nie | Pomiń faktury z zewnętrznym plikiem |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "invoices": [{
    "invoice_id": 663197,
    "order_id": 5695322,
    "series_id": 15,
    "type": "normal",
    "number": "1/3/2016/shop",
    "sub_id": 1,
    "month": 3,
    "year": 2016,
    "postfix": "shop",
    "date_add": 1458161617,
    "date_sell": 1458161617,
    "date_pay_to": 0,
    "currency": "GBP",
    "total_price_brutto": 253,
    "total_price_netto": 205.691,
    "payment": "Cash on delivery",
    "additional_info": "",
    "invoice_fullname": "",
    "invoice_company": "Jane Doe COMPANY",
    "invoice_nip": "999281736",
    "invoice_address": "Long Str 12",
    "invoice_postcode": "E2 8HQ",
    "invoice_city": "London",
    "invoice_country": "Great Britain",
    "invoice_country_code": "GB",
    "seller": "John Doe\r\nCOMPANY GMBH\r\n...",
    "issuer": "",
    "correcting_to_invoice_id": 0,
    "correcting_reason": "",
    "correcting_items": false,
    "correcting_data": false,
    "external_invoice_number": "FV 101/03/2020",
    "external_id": 662864993,
    "items": [{
      "name": "Wristwatch ALBATROSS",
      "sku": "LU4235",
      "ean": "1234567890",
      "price_brutto": 99,
      "price_netto": 80.4878,
      "tax_rate": 23,
      "quantity": 1,
      "is_shipment": 0,
      "order_product_id": 12345
    }]
  }]
}
```

---

### getInvoiceFile

**Opis:** Pobiera plik faktury (PDF) w formacie base64.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| invoice_id | int | tak | ID faktury |
| get_external | bool | nie | Pobierz zewnętrzną fakturę (domyślnie: false) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "invoice": "data:4AAQSkZJRgABA[...]",
  "invoice_number": "FV 101/03/2023"
}
```

---

### getReceipts

**Opis:** Pobiera paragony. Maksymalnie 100 paragonów.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| series_id | int | nie | ID serii numeracji |
| id_from | int | nie | ID paragonu od którego pobierać |
| date_from | int | nie | Data od (unix timestamp) |
| date_to | int | nie | Data do (unix timestamp) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "receipts": [{
    "receipt_id": 15384,
    "series_id": 45051,
    "receipt_full_nr": "123/10/2018/P",
    "order_id": 1630473,
    "date_add": 1407841161,
    "payment_method": "PayPal",
    "nip": "",
    "products": [{
      "name": "Produkt",
      "price_brutto": 10,
      "tax_rate": 23,
      "quantity": 2,
      "sku": "",
      "ean": ""
    }]
  }]
}
```

---

### getReceipt

**Opis:** Pobiera pojedynczy paragon.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| receipt_id | int | nie | ID paragonu (lub order_id) |
| order_id | int | nie | ID zamówienia (lub receipt_id) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "receipt_id": 3857659,
  "series_id": 45051,
  "receipt_full_nr": "2/7/2020/P",
  "year": 2020,
  "month": 7,
  "sub_id": 2,
  "order_id": 143476260,
  "date_add": 1593971301,
  "payment_method": "",
  "nip": "",
  "currency": "PLN",
  "total_price_brutto": 141,
  "external_receipt_number": "",
  "items": [{
    "name": "Product 1",
    "sku": "sku1",
    "ean": "",
    "price_brutto": 20,
    "tax_rate": 23,
    "quantity": 7
  }]
}
```

---

### getNewReceipts

**Opis:** Pobiera paragony oczekujące na wydruk (dla integracji z drukarką fiskalną).

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| series_id | int | nie | ID serii numeracji |
| id_from | int | nie | ID od którego pobierać |

**Output Structure:** Taka sama jak getReceipts, ale w polu "orders" zamiast "receipts".

---

### getJournalList

**Opis:** Pobiera listę zdarzeń zamówień z ostatnich 3 dni. Wymaga aktywacji przez support.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| last_log_id | int | tak | ID logu od którego pobierać |
| logs_types | array | nie | Lista typów zdarzeń |
| order_id | int | nie | ID zamówienia |

**Typy zdarzeń:**
- 1: Utworzenie zamówienia
- 2: Pobranie DOF (potwierdzenie)
- 3: Płatność
- 4: Usunięcie zamówienia/faktury/paragonu
- 5: Scalenie zamówień
- 6: Podział zamówienia
- 7: Wystawienie faktury
- 8: Wystawienie paragonu
- 9: Utworzenie paczki
- 10: Usunięcie paczki
- 11: Edycja danych dostawy
- 12-14: Produkty (dodanie, edycja, usunięcie)
- 15: Dodanie kupującego do blacklisty
- 16: Edycja danych zamówienia
- 17: Kopiowanie zamówienia
- 18: Zmiana statusu
- 19-21: Faktury (usunięcie, usunięcie paragonu, edycja)

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "logs": [{
    "log_id": 456269,
    "log_type": 13,
    "order_id": 6911942,
    "object_id": 0,
    "date": 1516369287
  }]
}
```

---

### getSeries

**Opis:** Pobiera serie numeracji faktur i paragonów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "series": [{
    "id": "15",
    "type": "INVOICE",
    "name": "default",
    "format": "%N/%Y"
  }]
}
```

**Typy:** INVOICE, CORRECTION, RECEIPT

---

## Product catalog

Endpointy do zarządzania katalogiem produktów, cenami, stanami magazynowymi.

### getInventories

**Opis:** Pobiera listę katalogów (inwentarzy) dostępnych w magazynie BaseLinker.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "inventories": [{
    "inventory_id": 306,
    "name": "Default",
    "description": "Default catalog",
    "languages": ["en"],
    "default_language": "en",
    "price_groups": [105],
    "default_price_group": 105,
    "warehouses": ["bl_205", "shop_2334"],
    "default_warehouse": "bl_205",
    "reservations": false,
    "is_default": true
  }]
}
```

---

### getInventoryProductsList

**Opis:** Pobiera podstawowe dane produktów z katalogu. 1000 produktów na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |
| filter_id | int | nie | Filtruj po ID produktu |
| filter_category_id | int | nie | Filtruj po kategorii |
| filter_sku | varchar(50) | nie | Filtruj po SKU |
| filter_ean | varchar(32) | nie | Filtruj po EAN |
| filter_asin | varchar(50) | nie | Filtruj po ASIN |
| filter_name | varchar(200) | nie | Filtruj po nazwie |
| filter_price_from | float | nie | Cena minimalna |
| filter_price_to | float | nie | Cena maksymalna |
| filter_stock_from | int | nie | Stan minimalny |
| filter_stock_to | int | nie | Stan maksymalny |
| page | int | nie | Strona wyników |
| filter_sort | varchar(30) | nie | Sortowanie: "id [ASC\|DESC]" |
| include_variants | bool | nie | Dołącz warianty |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "products": {
    "2685": {
      "id": 2685,
      "sku": "PL53F",
      "ean": "63576363463",
      "asin": "B07EXAMPLE1",
      "name": "Nike PL35 shoes",
      "prices": {"105": 20.99, "106": 23.99},
      "stock": {"bl_206": 5, "bl_207": 7}
    }
  }
}
```

---

### getInventoryProductsData

**Opis:** Pobiera szczegółowe dane wybranych produktów.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |
| products | array | tak | Lista ID produktów |
| include_erp_units | bool | nie | Dołącz jednostki ERP |
| include_wms_units | bool | nie | Dołącz jednostki WMS |
| include_additional_eans | bool | nie | Dołącz dodatkowe EAN |
| include_suppliers | bool | nie | Dołącz dane dostawców |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "products": {
    "2685": {
      "is_bundle": false,
      "sku": "EPL-432",
      "ean": "983628103943",
      "asin": "B07EXAMPLE1",
      "tags": ["Summer", "Winter"],
      "tax_rate": 23,
      "weight": 0.25,
      "height": 0.3,
      "width": 0.2,
      "length": 0.05,
      "star": 2,
      "category_id": "3",
      "manufacturer_id": "7",
      "prices": {"105": 20.99, "106": 23.99},
      "stock": {"bl_206": 5, "bl_207": 7},
      "locations": {"bl_206": "A-5-2"},
      "text_fields": {
        "name": "Harry Potter and the Chamber of Secrets",
        "description": "Basic book description",
        "features": {"Cover": "Hardcover", "Pages": "300"},
        "name|de": "German name"
      },
      "average_cost": 120.98,
      "average_landed_cost": 1.2,
      "images": {
        "1": "http://upload.cdn.baselinker.com/products/23/484608.jpg"
      },
      "links": {
        "shop_23": {"product_id": 8, "variant_id": 3}
      },
      "variants": {
        "17": {
          "name": "Special edition",
          "sku": "AGH-41",
          "ean": "5697482359144",
          "asin": "B07VARIANT2",
          "prices": {"105": 22.99},
          "stock": {"bl_206": 3},
          "locations": {"bl_206": "A-5-2"}
        }
      }
    }
  }
}
```

---

### getInventoryProductsPrices

**Opis:** Pobiera ceny produktów. 1000 produktów na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "products": {
    "2685": {
      "prices": {"105": 20.99, "106": 23.99}
    },
    "2686": {
      "prices": {"105": 21.99},
      "variants": {
        "2687": {"105": 21.99, "106": 23.99}
      }
    }
  }
}
```

---

### getInventoryProductsStock

**Opis:** Pobiera stany magazynowe produktów. 1000 produktów na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "products": {
    "2685": {
      "product_id": 2685,
      "stock": {"bl_206": 5, "bl_207": 7},
      "reservations": {"bl_206": 0, "bl_207": 2}
    },
    "2686": {
      "product_id": 2686,
      "stock": {"bl_206": 5},
      "variants": {
        "2687": {"bl_206": 2, "bl_207": 4}
      }
    }
  }
}
```

---

### getInventoryCategories

**Opis:** Pobiera kategorie produktów dla katalogu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | nie | ID katalogu (pusty = wszystkie) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "categories": [{
    "category_id": 5,
    "name": "Products",
    "parent_id": 0
  }]
}
```

---

### getInventoryManufacturers

**Opis:** Pobiera producentów dla katalogu.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "manufacturers": [{
    "manufacturer_id": 7,
    "name": "Test manufacturer"
  }]
}
```

---

### getInventoryTags

**Opis:** Pobiera tagi produktów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "tags": [{"name": "Summer"}, {"name": "Winter"}]
}
```

---

### getInventoryPriceGroups

**Opis:** Pobiera grupy cenowe.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "price_groups": [{
    "price_group_id": 104,
    "name": "Default",
    "description": "Default price group",
    "currency": "EUR",
    "is_default": true
  }]
}
```

---

### getInventoryWarehouses

**Opis:** Pobiera magazyny dostępne w inwentarzu.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "warehouses": [{
    "warehouse_type": "bl",
    "warehouse_id": 205,
    "name": "Default",
    "description": "Default warehouse located in London",
    "stock_edition": true,
    "is_default": true
  }]
}
```

**Typy magazynów:** bl (BaseLinker), shop, warehouse

---

### getInventoryExtraFields

**Opis:** Pobiera dodatkowe pola produktów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extra_fields": [{
    "extra_field_id": 201,
    "name": "Short text field",
    "kind": 0,
    "editor_type": "text"
  }]
}
```

**kind:** 0 = krótkie pole (max 200 znaków), 1 = długie pole (tłumaczalne)

---

### getInventoryIntegrations

**Opis:** Pobiera integracje, dla których można nadpisywać wartości tekstowe.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "integrations": [{
    "ebay": {
      "langs": ["pl", "en", "de"],
      "accounts": {"301": "eBay account, ID 301"}
    },
    "amazon": {
      "langs": ["en", "de"],
      "accounts": {"402": "Amazon account, ID 402"}
    }
  }]
}
```

---

### getInventoryAvailableTextFieldKeys

**Opis:** Pobiera klucze pól tekstowych możliwych do nadpisania dla integracji.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| inventory_id | int | tak | ID katalogu |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "text_field_keys": {
    "name": "Product name (EN)",
    "description": "Description (EN)",
    "name|de|amazon_0": "Amazon - Product name (DE)",
    "name|de|amazon_123": "Amazon [Account 123] - Name (DE)"
  }
}
```

---

### getInventoryProductLogs

**Opis:** Pobiera historię zmian produktu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| product_id | int | tak | ID produktu |
| date_from | int | nie | Data od (unix timestamp) |
| date_to | int | nie | Data do (unix timestamp) |
| log_type | int | nie | Typ zdarzenia (1-10) |
| sort | varchar | nie | ASC lub DESC |
| page | int | nie | Strona wyników |

**Typy zdarzeń:**
1. Zmiana stanu
2. Zmiana ceny
3. Utworzenie produktu
4. Usunięcie produktu
5. Edycja pól tekstowych
6. Edycja lokalizacji
7. Edycja linków
8. Edycja galerii
9. Edycja wariantów
10. Edycja bundli

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "logs": [{
    "profile": "John Doe",
    "date": 1593077394,
    "entries": [
      {"type": 1, "from": 0, "to": 5, "info": "bl_205"},
      {"type": 2, "from": 0.00, "to": 6.99, "info": 105}
    ]
  }]
}
```

---

## Courier shipments

Endpointy do zarządzania przesyłkami kurierskimi.

### getCouriersList

**Opis:** Pobiera listę dostępnych kurierów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "couriers": [
    {"code": "dhl", "name": "DHL"},
    {"code": "dpd", "name": "DPD"},
    {"code": "inpostkurier", "name": "InPost"},
    {"code": "paczkomaty", "name": "Paczkomaty"}
  ]
}
```

---

### getCourierAccounts

**Opis:** Pobiera konta połączone z danym kurierem.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "accounts": [
    {"id": 60, "name": "London Branch"},
    {"id": 251, "name": "Manchester Branch"}
  ]
}
```

---

### getCourierServices

**Opis:** Pobiera dodatkowe usługi kurierskie. Używane tylko dla X-press, BrokerSystem, Wysyłam z Allegro, ErliPRO.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |
| order_id | int | tak | ID zamówienia |
| account_id | int | nie | ID konta kuriera |
| fields | array | tak | Pola jak w createPackage |
| packages | array | tak | Paczki jak w createPackage |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "services": {
    "5127": "NextDay 10-14 (1400 15.02.2017)",
    "5128": "NextDay 14-17 (1700 15.02.2017)"
  }
}
```

---

### getCourierFields

**Opis:** Pobiera pola formularza do tworzenia przesyłki dla danego kuriera.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "multi_packages": false,
  "fields": [{
    "id": "courier",
    "name": "Courier",
    "type": "select",
    "desc": "",
    "options": {"2": "KEX", "4": "GLS", "5": "FedEx"},
    "show_field": {},
    "value": "",
    "function": ""
  }],
  "package_fields": [{
    "id": "weight",
    "name": "Weight",
    "type": "text"
  }]
}
```

---

### getOrderPackages

**Opis:** Pobiera przesyłki utworzone dla zamówienia.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | tak | ID zamówienia |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "packages": [{
    "package_id": 7323858,
    "courier_package_nr": "0000081265020U",
    "courier_inner_number": "33893480912",
    "courier_code": "DPD",
    "courier_other_name": "",
    "account_id": "58381",
    "tracking_status_date": "1511796910",
    "tracking_delivery_days": "0",
    "tracking_status": "4",
    "package_type": 0,
    "tracking_url": "https://...",
    "is_return": false
  }]
}
```

**Statusy śledzenia:**
- 0: Unknown
- 1: Label created
- 2: Shipped
- 3: Not delivered
- 4: Out for delivery
- 5: Delivered
- 6: Return
- 7: Aviso
- 8: Waiting at point
- 9: Lost
- 10: Canceled
- 11: On the way

---

### getPackageDetails

**Opis:** Pobiera szczegółowe informacje o paczce.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| package_id | int | tak | ID paczki |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "package_details": [{
    "weight": 30.52,
    "weight_unit": "kg",
    "length": 10.12,
    "width": 12,
    "height": 15.4,
    "size_unit": "cm",
    "size_template": "",
    "is_custom": false,
    "cod_value": 500.54,
    "cod_currency": "PLN",
    "insurance_value": 116.41,
    "insurance_currency": "EUR",
    "cost_value": 5.12,
    "cost_currency": "USD",
    "type": "package",
    "pickup_date": 0
  }]
}
```

---

### getCourierPackagesStatusHistory

**Opis:** Pobiera historię statusów przesyłek. Maksymalnie 100 paczek.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| package_ids | array | tak | Lista ID paczek |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "packages_history": {
    "7323859": [{
      "tracking_status_date": "1513764000",
      "courier_status_code": "030103",
      "tracking_status": "1"
    }]
  }
}
```

---

### getLabel

**Opis:** Pobiera etykietę wysyłkową (list przewozowy).

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |
| package_id | int | nie | ID paczki (lub package_number) |
| package_number | varchar(40) | nie | Numer przesyłki (lub package_id) |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extension": "pdf",
  "label": "JVBERi0xLjQK[...base64...]"
}
```

---

### getProtocol

**Opis:** Pobiera protokół odbioru paczek.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |
| package_ids | array | nie | Lista ID paczek |
| package_numbers | array | nie | Lista numerów przesyłek |
| account_id | int | tak | ID konta kuriera |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extension": "pdf",
  "protocol": "JVBERi0xLjQK[...base64...]"
}
```

---

### getCourierDocument

**Opis:** Pobiera dokument kurierski (np. manifest).

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |
| document_type | varchar(10) | tak | Typ: "manifest" |
| account_id | int | tak | ID konta kuriera |
| package_ids | array | nie | Lista ID paczek |
| package_numbers | array | nie | Lista numerów przesyłek |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extension": "pdf",
  "document": "JVBERi0xLjQK[...base64...]"
}
```

---

### getRequestParcelPickupFields

**Opis:** Pobiera dodatkowe pola dla żądania odbioru paczek.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| courier_code | varchar(20) | tak | Kod kuriera |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "fields": [{
    "id": "pickup_date",
    "name": "Data nadania",
    "type": "date"
  }]
}
```

---

## Order returns

Endpointy do zarządzania zwrotami zamówień.

### getOrderReturns

**Opis:** Pobiera zwroty zamówień. Maksymalnie 100 zwrotów.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | nie | ID zamówienia źródłowego |
| return_id | int | nie | ID zwrotu |
| date_from | int | nie | Data od (unix timestamp) |
| id_from | int | nie | ID zwrotu od którego pobierać |
| status_id | int | nie | Filtruj po statusie |
| filter_order_return_source | varchar(20) | nie | Filtruj po źródle |
| filter_order_return_source_id | int | nie | ID źródła |
| include_custom_extra_fields | bool | nie | Dołącz dodatkowe pola |
| include_connect_data | bool | nie | Dołącz dane Base Connect |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "returns": [{
    "return_id": 1022,
    "order_id": 12422,
    "shop_order_id": -1,
    "external_order_id": "",
    "reference_number": "",
    "order_return_source": "personal",
    "order_return_source_id": 0,
    "status_id": "1006",
    "date_add": 1705569412,
    "date_in_status": 1706650702,
    "user_login": "nick1",
    "currency": "PLN",
    "refunded": "0.00",
    "email": "test@test.com",
    "phone": "693123123",
    "delivery_price": 0,
    "delivery_fullname": "",
    "delivery_company": "",
    "delivery_address": "",
    "delivery_postcode": "",
    "delivery_city": "",
    "delivery_state": "",
    "delivery_country": "",
    "delivery_country_code": "",
    "extra_field_1": "",
    "extra_field_2": "",
    "admin_comments": "",
    "delivery_package_module": "",
    "delivery_package_nr": "",
    "connect_data": {
      "connect_integration_id": 1,
      "connect_contractor_id": 34
    },
    "products": [{
      "order_return_product_id": 2216,
      "storage": "db",
      "storage_id": 2,
      "product_id": "13",
      "variant_id": "0",
      "name": "Harry Potter",
      "sku": "24366",
      "ean": "",
      "location": "",
      "warehouse_id": 2,
      "auction_id": "0",
      "attributes": "",
      "price_brutto": 50,
      "tax_rate": 23,
      "quantity": 2,
      "weight": 0.26,
      "bundle_id": 0,
      "status_id": 1001,
      "return_reason_id": 1020
    }],
    "refund_account_number": "",
    "refund_iban": "",
    "refund_swift": "",
    "fulfillment_status": 0
  }]
}
```

---

### getOrderReturnStatusList

**Opis:** Pobiera statusy zwrotów utworzone przez użytkownika.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "statuses": [{
    "id": 1051,
    "name": "New orders",
    "name_for_customer": "Order accepted",
    "color": "#FF0000"
  }]
}
```

---

### getOrderReturnReasonsList

**Opis:** Pobiera powody zwrotów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "return_reasons": [
    {"return_reason_id": 1001, "name": "None"},
    {"return_reason_id": 1002, "name": "Purchase mistake"},
    {"return_reason_id": 1003, "name": "Problem during transport"},
    {"return_reason_id": 1004, "name": "Delay in shipment"},
    {"return_reason_id": 1005, "name": "Damaged goods"}
  ]
}
```

---

### getOrderReturnProductStatuses

**Opis:** Pobiera statusy produktów w zwrotach.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "order_return_product_statuses": [
    {"status_id": 1001, "name": "None"},
    {"status_id": 1002, "name": "Accepted"},
    {"status_id": 1003, "name": "Damaged"}
  ]
}
```

---

### getOrderReturnExtraFields

**Opis:** Pobiera dodatkowe pola zwrotów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "extra_fields": [{
    "extra_field_id": 135,
    "name": "Client type",
    "editor_type": "radio",
    "options": ["B2B", "B2C"]
  }]
}
```

---

### getOrderReturnPaymentsHistory

**Opis:** Pobiera historię płatności zwrotu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| return_id | int | tak | ID zwrotu |
| show_full_history | bool | nie | Pełna historia |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "payments": [{
    "paid_before": "0.00",
    "paid_after": "55.00",
    "total_price": "82.97",
    "currency": "GBP",
    "external_payment_id": "189a1236-0aa9-21ee-15ab-8b0992243303",
    "date": "1515001701"
  }]
}
```

---

### getOrderReturnJournalList

**Opis:** Pobiera dziennik zdarzeń zwrotów z ostatnich 3 dni.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| last_log_id | int | tak | ID logu od którego pobierać |
| logs_types | array | nie | Lista typów zdarzeń |
| return_id | int | nie | ID zwrotu |

**Typy zdarzeń:**
1. Utworzenie zwrotu
2. Akceptacja zwrotu
3. Zakończenie zwrotu
4. Anulowanie zwrotu
5. Zwrot pieniędzy
6. Edycja danych dostawy
7-9. Produkty (dodanie, edycja, usunięcie)
10. Edycja danych zwrotu
11. Zmiana statusu zwrotu
12. Zmiana statusu produktu

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "logs": [{
    "log_id": 456269,
    "log_type": 7,
    "return_id": 1102,
    "object_id": 0,
    "date": 1516369287
  }]
}
```

---

## External storages

Endpointy do pobierania danych z zewnętrznych magazynów (sklepy, hurtownie).

### getExternalStoragesList

**Opis:** Pobiera listę zewnętrznych magazynów dostępnych przez API.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storages": [{
    "storage_id": "shop_2444",
    "name": "Online store",
    "methods": [
      "getExternalStorageCategories",
      "getExternalStorageProductsData",
      "getExternalStorageProductsList",
      "getExternalStorageProductsPrices",
      "getExternalStorageProductsQuantity"
    ]
  }]
}
```

---

### getExternalStorageCategories

**Opis:** Pobiera kategorie z zewnętrznego magazynu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| storage_id | varchar(30) | tak | ID magazynu (np. "shop_2445") |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storage_id": "shop_2445",
  "categories": [{
    "category_id": 235,
    "name": "Shoes",
    "parent_id": 0
  }]
}
```

---

### getExternalStorageProductsList

**Opis:** Pobiera listę produktów z zewnętrznego magazynu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| storage_id | varchar(30) | tak | ID magazynu |
| filter_category_id | varchar(30) | nie | ID kategorii |
| filter_sort | varchar(30) | nie | Sortowanie |
| filter_id | varchar(30) | nie | ID produktu |
| filter_sku | varchar(32) | nie | SKU |
| filter_ean | varchar(32) | nie | EAN |
| filter_asin | varchar(50) | nie | ASIN |
| filter_name | varchar(100) | nie | Nazwa |
| filter_price_from | float | nie | Cena minimalna |
| filter_price_to | float | nie | Cena maksymalna |
| filter_quantity_from | int | nie | Stan minimalny |
| filter_quantity_to | int | nie | Stan maksymalny |
| filter_available | int | nie | Tylko dostępne (1) lub nie (0) |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storage_id": "shop_2445",
  "products": [{
    "product_id": "2546",
    "sku": "PL53F",
    "ean": "63576363463",
    "asin": "B07EXAMPLE3",
    "name": "Nike PL35 shoes",
    "quantity": 5,
    "price_brutto": 254.55
  }]
}
```

---

### getExternalStorageProductsData

**Opis:** Pobiera szczegółowe dane produktów z zewnętrznego magazynu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| storage_id | varchar(30) | tak | ID magazynu |
| products | array | tak | Lista ID produktów |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storage_id": "shop_2445",
  "products": {
    "524": {
      "product_id": 524,
      "sku": null,
      "ean": "6115181635",
      "asin": "B07EXAMPLE1",
      "name": "Adidas SG53 shoes",
      "quantity": "0",
      "price_netto": "902.48",
      "price_brutto": "1110.05",
      "price_wholesale_netto": "0",
      "tax_rate": "23",
      "category_id": "26356",
      "weight": "3.2",
      "description": "product description",
      "description_extra1": "",
      "description_extra2": "",
      "man_name": "0",
      "images": ["http://upload.cdn.baselinker.com/products/23/484608.jpg"],
      "features": {"Material": "Poliester", "Laces lgth": "70cm"},
      "variants": [{
        "variant_id": "17",
        "name": "size 41",
        "price": "0",
        "quantity": "4",
        "sku": "AGH-41",
        "ean": "5697482359144",
        "asin": "B07VARIANT1"
      }]
    }
  }
}
```

---

### getExternalStorageProductsPrices

**Opis:** Pobiera ceny produktów z zewnętrznego magazynu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| storage_id | varchar(30) | tak | ID magazynu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storage_id": "shop_2445",
  "products": [{
    "product_id": "2546",
    "price": 199.90,
    "variants": [{"variant_id": "7231", "price": 189.90}]
  }]
}
```

---

### getExternalStorageProductsQuantity

**Opis:** Pobiera stany magazynowe z zewnętrznego magazynu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| storage_id | varchar(30) | tak | ID magazynu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "storage_id": "shop_2445",
  "products": [{
    "product_id": "2546",
    "quantity": 30,
    "variants": [{"variant_id": "7231", "quantity": 14}]
  }]
}
```

---

## Inventory documents

Endpointy do zarządzania dokumentami magazynowymi.

### getInventoryDocuments

**Opis:** Pobiera dokumenty magazynowe. Paginacja, 100 dokumentów na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| filter_document_id | int | nie | ID dokumentu |
| filter_document_type | int | nie | Typ dokumentu (0-5) |
| filter_document_status | int | nie | Status: 0=Draft, 1=Confirmed |
| filter_date_from | int | nie | Data od (unix timestamp) |
| filter_date_to | int | nie | Data do (unix timestamp) |
| filter_warehouse_id | int | nie | ID magazynu |
| page | int | nie | Strona wyników |

**Typy dokumentów:**
- 0: GR (Goods Received)
- 1: IGR (Internal Goods Received)
- 2: GI (Goods Issue)
- 3: IGI (Internal Goods Issue)
- 4: IT (Internal Transfer)
- 5: OB (Opening Balance)

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "documents": [{
    "document_id": 101,
    "document_type": 1,
    "document_status": 1,
    "direction": 0,
    "document_series_id": 3,
    "full_number": "GRN/0001/09/2023",
    "date_created": 1693471200,
    "date_confirmed": 1693478400,
    "warehouse_id": 205,
    "warehouse_id2": 0,
    "items_count": 3,
    "total_quantity": 50,
    "total_price": 1080.00
  }]
}
```

---

### getInventoryDocumentItems

**Opis:** Pobiera pozycje dokumentu magazynowego. 100 pozycji na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| document_id | int | tak | ID dokumentu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "items": [{
    "document_id": 101,
    "item_id": 5001,
    "position": 1,
    "product_id": 2685,
    "product_name": "Lenovo X1 Notebook",
    "product_ean": "1234567890123",
    "product_sku": "LEN-X1",
    "quantity": 10,
    "price": 90.50,
    "total_price": 905.00,
    "inventory_id": 307,
    "location_name": "A-2-1",
    "expiry_date": "0000-00-00",
    "batch": "",
    "serial_no": ""
  }]
}
```

---

### getInventoryDocumentSeries

**Opis:** Pobiera serie numeracji dokumentów magazynowych.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "document_series": [{
    "document_series_id": 3,
    "name": "GRN",
    "document_type": 1,
    "warehouse_id": 205,
    "format": "%N/%M/%Y/GR"
  }]
}
```

---

## Inventory purchase orders

Endpointy do zarządzania zamówieniami zakupu.

### getInventoryPurchaseOrders

**Opis:** Pobiera zamówienia zakupu. 100 dokumentów na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| warehouse_id | int | nie | ID magazynu |
| supplier_id | int | nie | ID dostawcy |
| series_id | int | nie | ID serii numeracji |
| date_from | int | nie | Data od (unix timestamp) |
| date_to | int | nie | Data do (unix timestamp) |
| filter_document_number | varchar(50) | nie | Filtruj po numerze |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "purchase_orders": [{
    "id": 1234,
    "name": "Monthly Stock Order",
    "series_id": 15,
    "document_number": "PZ/2021/12/31",
    "date_created": 1640908800,
    "date_sent": 1640908800,
    "date_received": 1641254400,
    "date_completed": null,
    "warehouse_id": 1,
    "supplier_id": 5,
    "payer_id": 3,
    "currency": "EUR",
    "total_quantity": 100,
    "completed_total_quantity": 50,
    "total_cost": 1000.00,
    "completed_total_cost": 500.00,
    "items_count": 5,
    "completed_items_count": 3,
    "cost_invoice_no": "FV/2021/12/123",
    "notes": "Monthly stock delivery",
    "status": 2
  }]
}
```

**Statusy:** 0=draft, 1=sent, 2=received, 3=completed, 4=completed partially, 5=canceled

---

### getInventoryPurchaseOrderItems

**Opis:** Pobiera pozycje zamówienia zakupu. 100 pozycji na stronę.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| order_id | int | tak | ID zamówienia zakupu |
| page | int | nie | Strona wyników |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "items": [{
    "item_id": 1,
    "product_id": 5432,
    "position": 1,
    "product_name": "Test Product 1",
    "product_sku": "TP-001",
    "product_ean": "5901234123457",
    "supplier_code": "SUP-001",
    "quantity": 5,
    "completed_quantity": 3,
    "item_cost": 10.99,
    "location": "A-1-2",
    "batch": "LOT2021",
    "expiry_date": "2023-12-31",
    "serial_no": "SN20211231001",
    "comments": ""
  }]
}
```

---

### getInventoryPurchaseOrderSeries

**Opis:** Pobiera serie numeracji zamówień zakupu.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| warehouse_id | int | nie | Filtruj po magazynie |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "series": [{
    "series_id": 15,
    "name": "PSO",
    "warehouse_id": 1,
    "format": "%N/%M/%Y/PSO"
  }]
}
```

---

## Base Connect

Endpointy do zarządzania integracjami B2B (Base Connect).

### getConnectIntegrations

**Opis:** Pobiera listę integracji Base Connect na koncie.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "integrations": {
    "own_integrations": [{
      "connect_integration_id": 1,
      "name": "Integration name",
      "settings": []
    }],
    "connected_integrations": [{
      "connect_integration_id": 2,
      "name": "Connected integration name",
      "settings": []
    }]
  }
}
```

---

### getConnectIntegrationContractors

**Opis:** Pobiera kontrahentów połączonych z integracją Base Connect.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| connect_integration_id | int | tak | ID integracji |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "contractors": {
    "1": {
      "connect_contractor_id": 1,
      "name": "Contractor name",
      "credit_data": {},
      "settings": []
    }
  }
}
```

---

### getConnectContractorCreditHistory

**Opis:** Pobiera historię kredytu kupieckiego kontrahenta.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| connect_contractor_id | int | tak | ID kontrahenta |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "credit_data": [{
    "credit_entry_id": 1,
    "date_add": "1716296890",
    "description": "First trade credit charge",
    "currency": "PLN",
    "type": "payment",
    "amount": "100.00",
    "is_accepted": "1"
  }]
}
```

**Typy:** charge, payment
**Status:** 0=waiting, 1=active

---

## Printouts

Endpointy do szablonów wydruków.

### getOrderPrintoutTemplates

**Opis:** Pobiera szablony wydruków zamówień.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "printouts": [{
    "printout_id": 1,
    "name": "Order printout",
    "file_format": "PDF",
    "language": "en"
  }]
}
```

---

### getInventoryPrintoutTemplates

**Opis:** Pobiera szablony wydruków produktów.

**Input Parameters:** Brak

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "printouts": [{
    "printout_id": 1,
    "name": "Inventory printout",
    "file_format": "PDF"
  }]
}
```

---

## Inventory suppliers

### getInventorySuppliers

**Opis:** Pobiera listę dostawców.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| filter_id | int | nie | ID dostawcy |
| filter_name | varchar(40) | nie | Filtruj po nazwie |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "suppliers": [{
    "supplier_id": 1,
    "name": "Supplier Ltd",
    "address": "123 Main Street",
    "postcode": "12-345",
    "city": "London",
    "phone": "+44123456789",
    "email": "contact@supplier.com",
    "email_copy_to": "manager@supplier.com",
    "currency": "GBP"
  }]
}
```

---

## Inventory payers

### getInventoryPayers

**Opis:** Pobiera listę płatników.

**Input Parameters:**

| Parametr | Typ | Wymagany | Opis |
|----------|-----|----------|------|
| filter_id | int | nie | ID płatnika |
| filter_name | varchar(40) | nie | Filtruj po nazwie |

**Output Structure:**

```json
{
  "status": "SUCCESS",
  "payers": [{
    "payer_id": 1,
    "name": "Company Ltd",
    "address": "123 Main Street",
    "postcode": "12-345",
    "city": "London",
    "tax_no": "GB123456789"
  }]
}
```

---

## Kody błędów

Każde API może zwrócić błąd w formacie:

```json
{
  "status": "ERROR",
  "error_code": "ERROR_CODE",
  "error_message": "Human readable error message"
}
```

### Typowe kody błędów:
- `ERROR_INVALID_TOKEN` - Nieprawidłowy token API
- `ERROR_INVALID_METHOD` - Nieznana metoda API
- `ERROR_INVALID_PARAMETERS` - Błędne parametry
- `ERROR_RATE_LIMIT_EXCEEDED` - Przekroczono limit zapytań (100/min)
- `ERROR_EMPTY_REQUIRED_FIELDS` - Brak wymaganych pól
- `ERROR_ORDER_NOT_FOUND` - Zamówienie nie istnieje
- `ERROR_PRODUCT_NOT_FOUND` - Produkt nie istnieje

---

## Typy danych

### Formaty dat
- **Unix timestamp** - liczba sekund od 1970-01-01 00:00:00 UTC
- **Date string** - format YYYY-MM-DD (ISO 8601)

### Typy magazynów (warehouse_id format)
- `bl_123` - Magazyn BaseLinker
- `shop_123` - Magazyn sklepu
- `warehouse_123` - Magazyn hurtowni

### Stawki VAT (tax_rate)
- `0-100` - Standardowa stawka procentowa
- `-1` - Zwolniony z VAT (EXPT/ZW)
- `-0.02` - Adnotacja "NP"
- `-0.03` - Odwrotne obciążenie VAT (OO)

---

*Dokumentacja wygenerowana na podstawie oficjalnej dokumentacji BaseLinker API.*
*Ostatnia aktualizacja API: 2025-10-21*
