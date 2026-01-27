/**
 * BaseLinker Routes Unit Tests
 *
 * Tests for 16 new API route handlers:
 * - 6 Courier Shipments endpoints
 * - 10 Orders Extended endpoints
 *
 * Each endpoint tests: happy path, validation error, server error
 */

const express = require('express');
const request = require('supertest');

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock feature flag middleware (always pass)
jest.mock('../../backend/middleware/featureFlag', () => ({
  featureFlagMiddleware: () => (req, res, next) => next(),
}));

// Mock company context middleware
jest.mock('../../backend/middleware/companyContext', () => ({
  companyContextMiddleware: (req, res, next) => {
    req.company = { id: 'test-company-id', name: 'Test Company' };
    req.memberRole = 'owner';
    next();
  },
  requireCompany: (req, res, next) => next(),
}));

// Mock BaseLinker client
const mockClient = {
  getCouriersList: jest.fn(),
  getCourierAccounts: jest.fn(),
  getOrderPackages: jest.fn(),
  getPackageDetails: jest.fn(),
  getCourierPackagesStatusHistory: jest.fn(),
  getCourierServices: jest.fn(),
  getJournalList: jest.fn(),
  getOrderExtraFields: jest.fn(),
  getOrderTransactionData: jest.fn(),
  getOrdersByEmail: jest.fn(),
  getOrdersByPhone: jest.fn(),
  getOrderPaymentsHistory: jest.fn(),
  getOrderPickPackHistory: jest.fn(),
  getNewReceipts: jest.fn(),
  getReceipts: jest.fn(),
  getSeries: jest.fn(),
};

jest.mock('../../backend/services/baselinker', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
}));

// Mock companySecret.service for /status route
jest.mock('../../backend/services/companySecret.service', () => ({
  getSecret: jest.fn(),
  hasSecret: jest.fn().mockResolvedValue(true),
  SECRET_TYPES: { BASELINKER_TOKEN: 'BASELINKER_TOKEN' },
}));

const baselinkerRouter = require('../../backend/routes/baselinker');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/baselinker', baselinkerRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// Courier Shipments
// ============================================

describe('Courier Shipments Routes', () => {
  describe('GET /api/baselinker/couriers', () => {
    test('should return couriers list', async () => {
      const app = createApp();
      mockClient.getCouriersList.mockResolvedValue([
        { code: 'dpd', name: 'DPD' },
        { code: 'inpost', name: 'InPost' },
      ]);

      const res = await request(app).get('/api/baselinker/couriers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data).toHaveLength(2);
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getCouriersList.mockRejectedValue(new Error('API timeout'));

      const res = await request(app).get('/api/baselinker/couriers');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('API timeout');
    });
  });

  describe('GET /api/baselinker/couriers/:code/accounts', () => {
    test('should return courier accounts', async () => {
      const app = createApp();
      mockClient.getCourierAccounts.mockResolvedValue([
        { id: 1, name: 'Main Account' },
      ]);

      const res = await request(app).get('/api/baselinker/couriers/dpd/accounts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getCourierAccounts.mockRejectedValue(new Error('Network error'));

      const res = await request(app).get('/api/baselinker/couriers/dpd/accounts');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/couriers/:code/services', () => {
    test('should return courier services', async () => {
      const app = createApp();
      mockClient.getCourierServices.mockResolvedValue({
        standard: { name: 'Standard', price: 15.99 },
      });

      const res = await request(app)
        .get('/api/baselinker/couriers/dpd/services')
        .query({
          order_id: '12345',
          fields: JSON.stringify({ size: 'M' }),
          packages: JSON.stringify([{ weight: 1 }]),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('standard');
    });

    test('should return 400 on missing required params', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/couriers/dpd/services');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 400 on invalid JSON in fields', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/baselinker/couriers/dpd/services')
        .query({
          order_id: '12345',
          fields: 'not-json',
          packages: 'not-json',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/packages/status-history', () => {
    test('should return packages status history', async () => {
      const app = createApp();
      mockClient.getCourierPackagesStatusHistory.mockResolvedValue({
        '100': [{ tracking_status: 5 }],
      });

      const res = await request(app)
        .get('/api/baselinker/packages/status-history')
        .query({ ids: '100,200' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('100');
    });

    test('should return 400 when ids missing', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/packages/status-history');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 400 when ids are not valid', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/baselinker/packages/status-history')
        .query({ ids: 'abc,def' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/packages/:id/details', () => {
    test('should return package details', async () => {
      const app = createApp();
      mockClient.getPackageDetails.mockResolvedValue({
        weight: 2.5,
        weight_unit: 'kg',
      });

      const res = await request(app).get('/api/baselinker/packages/100/details');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weight).toBe(2.5);
    });

    test('should return 400 for non-numeric package ID', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/packages/abc/details');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getPackageDetails.mockRejectedValue(new Error('Not found'));

      const res = await request(app).get('/api/baselinker/packages/100/details');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/order/:id/packages', () => {
    test('should return order packages', async () => {
      const app = createApp();
      mockClient.getOrderPackages.mockResolvedValue([
        { package_id: 100, courier_code: 'dpd' },
      ]);

      const res = await request(app).get('/api/baselinker/order/12345/packages');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should return 400 for non-numeric order ID', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/order/abc/packages');

      expect(res.status).toBe(400);
    });
  });
});

// ============================================
// Orders Extended
// ============================================

describe('Orders Extended Routes', () => {
  describe('GET /api/baselinker/order/:id/transaction', () => {
    test('should return transaction data', async () => {
      const app = createApp();
      mockClient.getOrderTransactionData.mockResolvedValue({
        currency: 'PLN',
        marketplace_transaction_id: 'ABC123',
      });

      const res = await request(app).get('/api/baselinker/order/12345/transaction');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('PLN');
    });

    test('should pass query options', async () => {
      const app = createApp();
      mockClient.getOrderTransactionData.mockResolvedValue({});

      await request(app)
        .get('/api/baselinker/order/12345/transaction')
        .query({ include_complex_taxes: 'true', include_amazon_data: 'true' });

      expect(mockClient.getOrderTransactionData).toHaveBeenCalledWith(
        12345,
        { include_complex_taxes: true, include_amazon_data: true }
      );
    });

    test('should return 400 for non-numeric order ID', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/order/abc/transaction');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/order/:id/payments-history', () => {
    test('should return payments history', async () => {
      const app = createApp();
      mockClient.getOrderPaymentsHistory.mockResolvedValue([
        { paid_before: 100, currency: 'PLN' },
      ]);

      const res = await request(app).get('/api/baselinker/order/12345/payments-history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should pass show_full_history flag', async () => {
      const app = createApp();
      mockClient.getOrderPaymentsHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/baselinker/order/12345/payments-history')
        .query({ show_full_history: 'true' });

      expect(mockClient.getOrderPaymentsHistory).toHaveBeenCalledWith(12345, true);
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getOrderPaymentsHistory.mockRejectedValue(new Error('Server error'));

      const res = await request(app).get('/api/baselinker/order/12345/payments-history');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/order/:id/pick-pack-history', () => {
    test('should return pick-pack history', async () => {
      const app = createApp();
      mockClient.getOrderPickPackHistory.mockResolvedValue([
        { action_type: 1, entry_date: 1700000000 },
      ]);

      const res = await request(app).get('/api/baselinker/order/12345/pick-pack-history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should pass action_type filter', async () => {
      const app = createApp();
      mockClient.getOrderPickPackHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/baselinker/order/12345/pick-pack-history')
        .query({ action_type: '3' });

      expect(mockClient.getOrderPickPackHistory).toHaveBeenCalledWith(12345, 3);
    });

    test('should return 400 for non-numeric order ID', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/order/abc/pick-pack-history');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/orders/by-email', () => {
    test('should return orders by email', async () => {
      const app = createApp();
      mockClient.getOrdersByEmail.mockResolvedValue([
        { order_id: 100, delivery_fullname: 'Jan Kowalski' },
      ]);

      const res = await request(app)
        .get('/api/baselinker/orders/by-email')
        .query({ email: 'jan@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should return 400 when email missing', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/orders/by-email');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 400 for invalid email', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/baselinker/orders/by-email')
        .query({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/orders/by-phone', () => {
    test('should return orders by phone', async () => {
      const app = createApp();
      mockClient.getOrdersByPhone.mockResolvedValue([
        { order_id: 200, delivery_fullname: 'Anna Nowak' },
      ]);

      const res = await request(app)
        .get('/api/baselinker/orders/by-phone')
        .query({ phone: '+48123456789' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should return 400 when phone missing', async () => {
      const app = createApp();

      const res = await request(app).get('/api/baselinker/orders/by-phone');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 400 for too short phone', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/baselinker/orders/by-phone')
        .query({ phone: '12' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/journal', () => {
    test('should return journal logs', async () => {
      const app = createApp();
      mockClient.getJournalList.mockResolvedValue([
        { id: 1, order_id: 100, log_type: 1 },
      ]);

      const res = await request(app).get('/api/baselinker/journal');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should pass query filters', async () => {
      const app = createApp();
      mockClient.getJournalList.mockResolvedValue([]);

      await request(app)
        .get('/api/baselinker/journal')
        .query({ last_log_id: '500', order_id: '100' });

      expect(mockClient.getJournalList).toHaveBeenCalledWith({
        last_log_id: 500,
        order_id: 100,
        logs_types: undefined,
      });
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getJournalList.mockRejectedValue(new Error('Service error'));

      const res = await request(app).get('/api/baselinker/journal');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/order-extra-fields', () => {
    test('should return extra field definitions', async () => {
      const app = createApp();
      mockClient.getOrderExtraFields.mockResolvedValue({
        '1': { name: 'Custom', editor_type: 'text' },
      });

      const res = await request(app).get('/api/baselinker/order-extra-fields');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('1');
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getOrderExtraFields.mockRejectedValue(new Error('Timeout'));

      const res = await request(app).get('/api/baselinker/order-extra-fields');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/baselinker/receipts/new', () => {
    test('should return new receipts', async () => {
      const app = createApp();
      mockClient.getNewReceipts.mockResolvedValue([
        { receipt_id: 1, order_id: 100 },
      ]);

      const res = await request(app).get('/api/baselinker/receipts/new');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should pass query filters', async () => {
      const app = createApp();
      mockClient.getNewReceipts.mockResolvedValue([]);

      await request(app)
        .get('/api/baselinker/receipts/new')
        .query({ series_id: '5', id_from: '100' });

      expect(mockClient.getNewReceipts).toHaveBeenCalledWith({
        series_id: 5,
        id_from: 100,
      });
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getNewReceipts.mockRejectedValue(new Error('API error'));

      const res = await request(app).get('/api/baselinker/receipts/new');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/baselinker/receipts', () => {
    test('should return receipts', async () => {
      const app = createApp();
      mockClient.getReceipts.mockResolvedValue([
        { receipt_id: 1, series_id: 2 },
      ]);

      const res = await request(app).get('/api/baselinker/receipts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    test('should pass date filters', async () => {
      const app = createApp();
      mockClient.getReceipts.mockResolvedValue([]);

      await request(app)
        .get('/api/baselinker/receipts')
        .query({ date_from: '1700000000', date_to: '1700100000' });

      expect(mockClient.getReceipts).toHaveBeenCalledWith({
        series_id: undefined,
        id_from: undefined,
        date_from: 1700000000,
        date_to: 1700100000,
      });
    });

    test('should return 400 for invalid date_from', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/baselinker/receipts')
        .query({ date_from: 'not-a-timestamp' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/baselinker/series', () => {
    test('should return numbering series', async () => {
      const app = createApp();
      mockClient.getSeries.mockResolvedValue([
        { id: 1, type: 'INVOICE', name: 'FV' },
        { id: 2, type: 'RECEIPT', name: 'PAR' },
      ]);

      const res = await request(app).get('/api/baselinker/series');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    test('should handle server error', async () => {
      const app = createApp();
      mockClient.getSeries.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/api/baselinker/series');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
