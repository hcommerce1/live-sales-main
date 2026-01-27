/**
 * BaseLinker Client Unit Tests
 *
 * Tests for 16 new API methods in BaseLinkerClient:
 * - 6 Courier Shipments methods
 * - 10 Orders Extended methods
 */

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    status: 'ready',
  }));
});

// Mock logger
jest.mock('../../backend/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock axios
jest.mock('axios');
const axios = require('axios');

const { BaseLinkerClient } = require('../../backend/services/baselinker/BaseLinkerClientFactory');

// Helper to create a client with mocked responses
function createClient() {
  return new BaseLinkerClient('test-token-123', 'company-test-id');
}

function mockApiSuccess(data) {
  axios.post.mockResolvedValueOnce({
    data: { status: 'SUCCESS', ...data },
  });
}

function mockApiError(errorCode, errorMessage) {
  axios.post.mockResolvedValueOnce({
    data: {
      status: 'ERROR',
      error_code: errorCode,
      error_message: errorMessage,
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// Courier Shipments
// ============================================

describe('BaseLinkerClient - Courier Shipments', () => {
  describe('getCouriersList', () => {
    test('should return list of couriers', async () => {
      const client = createClient();
      mockApiSuccess({
        couriers: [
          { code: 'dpd', name: 'DPD' },
          { code: 'inpost', name: 'InPost' },
        ],
      });

      const result = await client.getCouriersList();

      expect(result).toEqual([
        { code: 'dpd', name: 'DPD' },
        { code: 'inpost', name: 'InPost' },
      ]);
    });

    test('should return empty array when no couriers', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getCouriersList();
      expect(result).toEqual([]);
    });

    test('should throw AUTH_ERROR on invalid token', async () => {
      const client = createClient();
      mockApiError('ERROR_INVALID_TOKEN', 'Invalid token');

      await expect(client.getCouriersList()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getCourierAccounts', () => {
    test('should return courier accounts', async () => {
      const client = createClient();
      mockApiSuccess({
        accounts: [{ id: 1, name: 'Main DPD Account' }],
      });

      const result = await client.getCourierAccounts('dpd');

      expect(result).toEqual([{ id: 1, name: 'Main DPD Account' }]);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should return empty array when no accounts', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getCourierAccounts('unknown');
      expect(result).toEqual([]);
    });

    test('should pass courier_code parameter', async () => {
      const client = createClient();
      mockApiSuccess({ accounts: [] });

      await client.getCourierAccounts('inpost');

      const callArgs = axios.post.mock.calls[0];
      const params = callArgs[1];
      expect(params.get('parameters')).toContain('"courier_code":"inpost"');
    });
  });

  describe('getOrderPackages', () => {
    test('should return order packages', async () => {
      const client = createClient();
      const mockPackages = [
        { package_id: 100, courier_code: 'dpd', tracking_url: 'https://track.dpd.com/123' },
      ];
      mockApiSuccess({ packages: mockPackages });

      const result = await client.getOrderPackages(12345);

      expect(result).toEqual(mockPackages);
    });

    test('should return empty array when no packages', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrderPackages(99999);
      expect(result).toEqual([]);
    });

    test('should pass order_id parameter', async () => {
      const client = createClient();
      mockApiSuccess({ packages: [] });

      await client.getOrderPackages(12345);

      const callArgs = axios.post.mock.calls[0];
      const params = callArgs[1];
      expect(params.get('parameters')).toContain('"order_id":12345');
    });
  });

  describe('getPackageDetails', () => {
    test('should return package details', async () => {
      const client = createClient();
      const mockDetails = { weight: 2.5, weight_unit: 'kg', length: 30, width: 20, height: 10 };
      mockApiSuccess({ package_details: mockDetails });

      const result = await client.getPackageDetails(100);

      expect(result).toEqual(mockDetails);
    });

    test('should return empty object when no details', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getPackageDetails(999);
      expect(result).toEqual({});
    });
  });

  describe('getCourierPackagesStatusHistory', () => {
    test('should return status history for packages', async () => {
      const client = createClient();
      const mockHistory = {
        '100': [{ tracking_status_date: 1700000000, courier_status_code: 'DELIVERED', tracking_status: 5 }],
      };
      mockApiSuccess({ packages_history: mockHistory });

      const result = await client.getCourierPackagesStatusHistory([100]);

      expect(result).toEqual(mockHistory);
    });

    test('should return empty object when no history', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getCourierPackagesStatusHistory([100]);
      expect(result).toEqual({});
    });

    test('should throw error when more than 100 package IDs', async () => {
      const client = createClient();
      const ids = Array.from({ length: 101 }, (_, i) => i + 1);

      await expect(client.getCourierPackagesStatusHistory(ids)).rejects.toThrow(
        'Maximum 100 package IDs allowed per request'
      );
    });

    test('should pass package_ids parameter', async () => {
      const client = createClient();
      mockApiSuccess({ packages_history: {} });

      await client.getCourierPackagesStatusHistory([10, 20, 30]);

      const callArgs = axios.post.mock.calls[0];
      const params = callArgs[1];
      expect(params.get('parameters')).toContain('"package_ids":[10,20,30]');
    });
  });

  describe('getCourierServices', () => {
    test('should return courier services', async () => {
      const client = createClient();
      const mockServices = { standard: { name: 'Standard', price: 15.99 } };
      mockApiSuccess({ services: mockServices });

      const result = await client.getCourierServices('dpd', 12345, { size: 'M' }, [{ weight: 1 }], 5);

      expect(result).toEqual(mockServices);
    });

    test('should return empty object when no services', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getCourierServices('dpd', 12345, {}, []);
      expect(result).toEqual({});
    });

    test('should omit undefined accountId', async () => {
      const client = createClient();
      mockApiSuccess({ services: {} });

      await client.getCourierServices('dpd', 12345, {}, []);

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams).not.toHaveProperty('account_id');
    });
  });
});

// ============================================
// Orders Extended
// ============================================

describe('BaseLinkerClient - Orders Extended', () => {
  describe('getJournalList', () => {
    test('should return journal logs', async () => {
      const client = createClient();
      const mockLogs = [
        { id: 1, order_id: 100, log_type: 1, date: 1700000000 },
      ];
      mockApiSuccess({ logs: mockLogs });

      const result = await client.getJournalList();

      expect(result).toEqual(mockLogs);
    });

    test('should return empty array when no logs', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getJournalList();
      expect(result).toEqual([]);
    });

    test('should pass filter parameters', async () => {
      const client = createClient();
      mockApiSuccess({ logs: [] });

      await client.getJournalList({ last_log_id: 500, order_id: 100 });

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.last_log_id).toBe(500);
      expect(parsedParams.order_id).toBe(100);
    });

    test('should omit undefined filters', async () => {
      const client = createClient();
      mockApiSuccess({ logs: [] });

      await client.getJournalList({});

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams).toEqual({});
    });
  });

  describe('getOrderExtraFields', () => {
    test('should return extra field definitions', async () => {
      const client = createClient();
      const mockFields = { '1': { name: 'Custom Field', editor_type: 'text' } };
      mockApiSuccess({ extra_fields: mockFields });

      const result = await client.getOrderExtraFields();

      expect(result).toEqual(mockFields);
    });

    test('should return empty object when no fields', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrderExtraFields();
      expect(result).toEqual({});
    });
  });

  describe('getOrderTransactionData', () => {
    test('should return transaction data without status field', async () => {
      const client = createClient();
      mockApiSuccess({
        currency: 'PLN',
        marketplace_transaction_id: 'ABC123',
        transaction_date: 1700000000,
      });

      const result = await client.getOrderTransactionData(12345);

      expect(result).toHaveProperty('currency', 'PLN');
      expect(result).toHaveProperty('marketplace_transaction_id', 'ABC123');
      expect(result).not.toHaveProperty('status');
    });

    test('should pass options to parameters', async () => {
      const client = createClient();
      mockApiSuccess({ currency: 'PLN' });

      await client.getOrderTransactionData(12345, {
        include_complex_taxes: true,
        include_amazon_data: true,
      });

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.include_complex_taxes).toBe(true);
      expect(parsedParams.include_amazon_data).toBe(true);
      expect(parsedParams.order_id).toBe(12345);
    });

    test('should throw AUTH_ERROR on invalid token', async () => {
      const client = createClient();
      mockApiError('ERROR_INVALID_TOKEN', 'Invalid token');

      await expect(client.getOrderTransactionData(12345)).rejects.toThrow('Authentication failed');
    });
  });

  describe('getOrdersByEmail', () => {
    test('should return orders matching email', async () => {
      const client = createClient();
      const mockOrders = [
        { order_id: 100, order_status_id: 5, delivery_fullname: 'Jan Kowalski' },
      ];
      mockApiSuccess({ orders: mockOrders });

      const result = await client.getOrdersByEmail('jan@example.com');

      expect(result).toEqual(mockOrders);
    });

    test('should return empty array when no orders found', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrdersByEmail('nobody@example.com');
      expect(result).toEqual([]);
    });

    test('should pass email parameter', async () => {
      const client = createClient();
      mockApiSuccess({ orders: [] });

      await client.getOrdersByEmail('test@example.com');

      const callArgs = axios.post.mock.calls[0];
      const params = callArgs[1];
      expect(params.get('parameters')).toContain('"email":"test@example.com"');
    });
  });

  describe('getOrdersByPhone', () => {
    test('should return orders matching phone', async () => {
      const client = createClient();
      const mockOrders = [{ order_id: 200, delivery_fullname: 'Anna Nowak' }];
      mockApiSuccess({ orders: mockOrders });

      const result = await client.getOrdersByPhone('+48123456789');

      expect(result).toEqual(mockOrders);
    });

    test('should return empty array when no orders found', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrdersByPhone('+48000000000');
      expect(result).toEqual([]);
    });
  });

  describe('getOrderPaymentsHistory', () => {
    test('should return payment history', async () => {
      const client = createClient();
      const mockPayments = [
        { paid_before: 100, paid_after: 0, currency: 'PLN', date: 1700000000 },
      ];
      mockApiSuccess({ payments: mockPayments });

      const result = await client.getOrderPaymentsHistory(12345);

      expect(result).toEqual(mockPayments);
    });

    test('should return empty array when no payments', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrderPaymentsHistory(12345);
      expect(result).toEqual([]);
    });

    test('should pass show_full_history parameter', async () => {
      const client = createClient();
      mockApiSuccess({ payments: [] });

      await client.getOrderPaymentsHistory(12345, true);

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.show_full_history).toBe(true);
      expect(parsedParams.order_id).toBe(12345);
    });
  });

  describe('getOrderPickPackHistory', () => {
    test('should return pick-pack history', async () => {
      const client = createClient();
      const mockHistory = [
        { action_type: 1, profile_id: 10, entry_date: 1700000000 },
      ];
      mockApiSuccess({ history: mockHistory });

      const result = await client.getOrderPickPackHistory(12345);

      expect(result).toEqual(mockHistory);
    });

    test('should return empty array when no history', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getOrderPickPackHistory(12345);
      expect(result).toEqual([]);
    });

    test('should omit undefined actionType', async () => {
      const client = createClient();
      mockApiSuccess({ history: [] });

      await client.getOrderPickPackHistory(12345);

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams).not.toHaveProperty('action_type');
      expect(parsedParams.order_id).toBe(12345);
    });

    test('should pass actionType when provided', async () => {
      const client = createClient();
      mockApiSuccess({ history: [] });

      await client.getOrderPickPackHistory(12345, 3);

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.action_type).toBe(3);
    });
  });

  describe('getNewReceipts', () => {
    test('should return new receipts', async () => {
      const client = createClient();
      const mockReceipts = [
        { receipt_id: 1, order_id: 100, receipt_full_nr: 'PAR/001/2026' },
      ];
      mockApiSuccess({ orders: mockReceipts });

      const result = await client.getNewReceipts();

      expect(result).toEqual(mockReceipts);
    });

    test('should return empty array when no new receipts', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getNewReceipts();
      expect(result).toEqual([]);
    });

    test('should pass filters', async () => {
      const client = createClient();
      mockApiSuccess({ orders: [] });

      await client.getNewReceipts({ series_id: 5, id_from: 100 });

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.series_id).toBe(5);
      expect(parsedParams.id_from).toBe(100);
    });
  });

  describe('getReceipts', () => {
    test('should return receipts', async () => {
      const client = createClient();
      const mockReceipts = [
        { receipt_id: 1, series_id: 2, receipt_full_nr: 'PAR/001/2026' },
      ];
      mockApiSuccess({ receipts: mockReceipts });

      const result = await client.getReceipts();

      expect(result).toEqual(mockReceipts);
    });

    test('should return empty array when no receipts', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getReceipts();
      expect(result).toEqual([]);
    });

    test('should pass date filters', async () => {
      const client = createClient();
      mockApiSuccess({ receipts: [] });

      await client.getReceipts({ date_from: 1700000000, date_to: 1700100000 });

      const callArgs = axios.post.mock.calls[0];
      const parsedParams = JSON.parse(callArgs[1].get('parameters'));
      expect(parsedParams.date_from).toBe(1700000000);
      expect(parsedParams.date_to).toBe(1700100000);
    });
  });

  describe('getSeries', () => {
    test('should return numbering series', async () => {
      const client = createClient();
      const mockSeries = [
        { id: 1, type: 'INVOICE', name: 'FV', format: 'FV/{NR}/{M}/{Y}' },
        { id: 2, type: 'RECEIPT', name: 'PAR', format: 'PAR/{NR}/{M}/{Y}' },
      ];
      mockApiSuccess({ series: mockSeries });

      const result = await client.getSeries();

      expect(result).toEqual(mockSeries);
    });

    test('should return empty array when no series', async () => {
      const client = createClient();
      mockApiSuccess({});

      const result = await client.getSeries();
      expect(result).toEqual([]);
    });

    test('should throw AUTH_ERROR on invalid token', async () => {
      const client = createClient();
      mockApiError('ERROR_INVALID_TOKEN', 'Invalid token');

      await expect(client.getSeries()).rejects.toThrow('Authentication failed');
    });
  });
});
