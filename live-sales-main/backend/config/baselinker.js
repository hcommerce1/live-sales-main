/**
 * Baselinker API Configuration
 *
 * API Documentation: https://api.baselinker.com/
 */

module.exports = {
  apiUrl: process.env.BASELINKER_API_URL || 'https://api.baselinker.com/connector.php',
  apiToken: process.env.BASELINKER_API_TOKEN,

  // Inventory IDs from OUR DATA.txt
  inventories: {
    main: 35072,
  },

  // Warehouse IDs from OUR DATA.txt
  warehouses: {
    kablowo_main: 'bl_56118',
    onninen: 'bl_67196',
    assmann: 'bl_76564',
    grodno: 'bl_81580',
    etrade: 'bl_82466',
    ntt: 'bl_82467',
    ab: 'bl_82468',
    ingremio: 'bl_82520',
    roter: 'bl_85198'
  },

  // Request timeout in milliseconds
  timeout: 30000,

  // Retry configuration
  retry: {
    maxRetries: 3,
    retryDelay: 1000, // ms
  }
};
