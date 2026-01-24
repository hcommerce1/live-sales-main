# Live Sales - API Documentation

## Base URL

Development: `http://localhost:3000`
Production: `https://your-app.onrender.com`

## Authentication

Currently, no authentication is required. In production, consider adding API keys or OAuth.

---

## Endpoints

### Health Check

#### GET /health

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "uptime": 3600.5,
  "environment": "production"
}
```

---

## Exports API

### Get All Exports

#### GET /api/exports

Get list of all export configurations.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "export-1",
      "name": "Zamówienia dzienne",
      "dataset": "orders",
      "selected_fields": ["order_id", "email", "total_price"],
      "filters": {
        "status": "234562",
        "date_from": "",
        "date_to": ""
      },
      "sheets": {
        "sheet_url": "https://docs.google.com/spreadsheets/d/ABC123/edit",
        "write_mode": "append"
      },
      "schedule_minutes": 15,
      "status": "active",
      "last_run": "2026-01-10T11:45:00.000Z",
      "updatedAt": "2026-01-10T10:00:00.000Z"
    }
  ]
}
```

### Get Export by ID

#### GET /api/exports/:id

Get single export configuration.

**Parameters:**
- `id` (path) - Export ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "export-1",
    "name": "Zamówienia dzienne",
    ...
  }
}
```

### Create/Update Export

#### POST /api/exports

Create or update export configuration.

**Request Body:**
```json
{
  "id": "export-1",
  "name": "Zamówienia dzienne",
  "dataset": "orders",
  "selected_fields": ["order_id", "email", "total_price"],
  "filters": {
    "status": "234562",
    "date_from": "2026-01-01",
    "date_to": ""
  },
  "sheets": {
    "sheet_url": "https://docs.google.com/spreadsheets/d/ABC123/edit",
    "write_mode": "append"
  },
  "schedule_minutes": 15,
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "export-1",
    "name": "Zamówienia dzienne",
    ...
  }
}
```

### Delete Export

#### DELETE /api/exports/:id

Delete export configuration.

**Parameters:**
- `id` (path) - Export ID

**Response:**
```json
{
  "success": true,
  "message": "Export deleted successfully"
}
```

### Run Export

#### POST /api/exports/:id/run

Run export immediately (fetch data from BaseLinker and write to Google Sheets).

**Parameters:**
- `id` (path) - Export ID

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "recordCount": 150,
    "writeResult": {
      "success": true,
      "mode": "append",
      "rowsWritten": 150
    }
  }
}
```

### Toggle Export Status

#### POST /api/exports/:id/toggle

Toggle export status between `active` and `paused`.

**Parameters:**
- `id` (path) - Export ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "export-1",
    "status": "paused",
    ...
  }
}
```

### Get Export Stats

#### GET /api/exports/:id/stats

Get export statistics.

**Parameters:**
- `id` (path) - Export ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "export-1",
    "name": "Zamówienia dzienne",
    "status": "active",
    "last_run": "2026-01-10T11:45:00.000Z",
    "dataset": "orders",
    "field_count": 5,
    "schedule_minutes": 15,
    "isScheduled": true
  }
}
```

---

## BaseLinker API

### Get Orders

#### GET /api/baselinker/orders

Fetch orders from BaseLinker.

**Query Parameters:**
- `status` (optional) - Order status ID
- `date_from` (optional) - Date from (YYYY-MM-DD)
- `date_to` (optional) - Date to (YYYY-MM-DD)

**Example:**
```
GET /api/baselinker/orders?status=234562&date_from=2026-01-01
```

**Response:**
```json
{
  "success": true,
  "count": 25,
  "data": [
    {
      "order_id": 1001,
      "date_add": "2026-01-10 10:00:00",
      "order_status_id": "234562",
      "price": 299.99,
      "currency": "PLN",
      "email": "customer@example.com",
      ...
    }
  ]
}
```

### Get Products

#### GET /api/baselinker/products

Fetch products from BaseLinker inventory.

**Query Parameters:**
- `inventory_id` (optional) - Inventory ID (default: 35072)
- `category_id` (optional) - Category ID
- `ean` (optional) - EAN code
- `sku` (optional) - SKU code
- `name` (optional) - Product name (search)
- `page` (optional) - Page number (default: 1)

**Example:**
```
GET /api/baselinker/products?inventory_id=35072&page=1
```

**Response:**
```json
{
  "success": true,
  "count": 50,
  "data": [
    {
      "product_id": 5001,
      "name": "Klawiatura RGB",
      "ean": "5901234567890",
      "sku": "KB-RGB-001",
      "quantity": 45,
      ...
    }
  ]
}
```

### Get Order Statuses

#### GET /api/baselinker/order-statuses

Get available order statuses from BaseLinker.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "234540",
      "name": "Nowe"
    },
    {
      "id": "234562",
      "name": "Opłacone"
    }
  ]
}
```

### Get Inventories

#### GET /api/baselinker/inventories

Get available inventories from BaseLinker.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "inventory_id": 35072,
      "name": "Kablowo main inventory"
    }
  ]
}
```

---

## Google Sheets API

### Validate Sheet URL

#### POST /api/sheets/validate

Validate Google Sheets URL and check if service account has access.

**Request Body:**
```json
{
  "sheetUrl": "https://docs.google.com/spreadsheets/d/ABC123/edit"
}
```

**Response:**
```json
{
  "success": true,
  "sheetId": "ABC123",
  "hasAccess": true
}
```

### Write Data to Sheet

#### POST /api/sheets/write

Write data to Google Sheets.

**Request Body:**
```json
{
  "sheetUrl": "https://docs.google.com/spreadsheets/d/ABC123/edit",
  "headers": ["ID", "Email", "Total"],
  "data": [
    ["1001", "customer@example.com", "299.99"],
    ["1002", "another@example.com", "149.50"]
  ],
  "writeMode": "append"
}
```

**Write Modes:**
- `append` - Insert new rows at the top (after header). Old data moves down.
- `replace` - Clear sheet and write new data.

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "mode": "append",
    "rowsWritten": 2
  }
}
```

### Read Data from Sheet

#### GET /api/sheets/read

Read data from Google Sheets.

**Query Parameters:**
- `sheetUrl` (required) - Google Sheets URL
- `range` (optional) - Range to read (default: A:Z)

**Example:**
```
GET /api/sheets/read?sheetUrl=https://docs.google.com/spreadsheets/d/ABC123/edit&range=A1:C10
```

**Response:**
```json
{
  "success": true,
  "data": [
    ["ID", "Email", "Total"],
    ["1001", "customer@example.com", "299.99"],
    ["1002", "another@example.com", "149.50"]
  ]
}
```

---

## Error Responses

All endpoints return error responses in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limits

Currently, no rate limits are implemented. Consider adding rate limiting in production to prevent abuse.

Recommended limits:
- General API: 100 requests/minute
- Export runs: 10 requests/minute
- BaseLinker proxy: 60 requests/minute (to respect BaseLinker's limits)

---

## Examples

### JavaScript (Fetch API)

```javascript
// Get all exports
const exports = await fetch('http://localhost:3000/api/exports')
  .then(r => r.json());

// Create new export
const newExport = await fetch('http://localhost:3000/api/exports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'my-export',
    name: 'My Export',
    dataset: 'orders',
    selected_fields: ['order_id', 'email'],
    filters: {},
    sheets: {
      sheet_url: 'https://docs.google.com/spreadsheets/d/ABC/edit',
      write_mode: 'append'
    },
    schedule_minutes: 30,
    status: 'active'
  })
}).then(r => r.json());

// Run export
const result = await fetch('http://localhost:3000/api/exports/my-export/run', {
  method: 'POST'
}).then(r => r.json());
```

### cURL

```bash
# Get all exports
curl http://localhost:3000/api/exports

# Create export
curl -X POST http://localhost:3000/api/exports \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-export",
    "name": "Test Export",
    "dataset": "orders",
    "selected_fields": ["order_id"],
    "filters": {},
    "sheets": {
      "sheet_url": "https://docs.google.com/spreadsheets/d/ABC/edit",
      "write_mode": "append"
    },
    "schedule_minutes": 15,
    "status": "active"
  }'

# Run export
curl -X POST http://localhost:3000/api/exports/test-export/run

# Get BaseLinker orders
curl "http://localhost:3000/api/baselinker/orders?status=234562"
```

---

## WebSocket Support (Future)

Currently, all communication is via REST API. Future versions may include WebSocket support for:
- Real-time export progress updates
- Live notifications when scheduled exports run
- Real-time dashboard updates

---

## Changelog

### v1.0.0 (2026-01-10)
- Initial API release
- Export management endpoints
- BaseLinker integration
- Google Sheets integration
- Scheduler functionality

---

**Need help?** Check [README.md](./README.md) or [README-DEPLOYMENT.md](./README-DEPLOYMENT.md)
