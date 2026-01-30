/**
 * Order Items Fetcher
 *
 * Pobiera pozycje zamówień - rozwija products[] do osobnych wierszy.
 * Dataset: order_items
 *
 * Każdy produkt z zamówienia staje się osobnym wierszem z kontekstem zamówienia.
 */

const BaseFetcher = require('./BaseFetcher');
const logger = require('../../../utils/logger');

class OrderItemsFetcher extends BaseFetcher {
  constructor() {
    super('order_items');
  }

  /**
   * Pobiera pozycje zamówień (rozwinięte produkty)
   * @param {string} token - Token BaseLinker
   * @param {Object} filters - Filtry
   * @param {Object} options - Opcje
   * @returns {Promise<Object[]>}
   */
  async fetch(token, filters = {}, options = {}) {
    this.logFetchStart({ filters });

    const client = this.getBaseLinkerClient(token);
    const apiFilters = this.convertFilters(filters);

    // Pobierz zamówienia z paginacją
    const orders = await this.fetchAllPages(async (lastOrderId) => {
      const params = {
        ...apiFilters,
        get_unconfirmed_orders: !filters.confirmedOnly
      };

      if (lastOrderId) {
        params.order_id = lastOrderId;
      }

      const response = await client.getOrders(params);

      if (!response || !response.orders) {
        return { data: [], nextPageToken: null };
      }

      const ordersArray = Object.values(response.orders);

      const nextPageToken = ordersArray.length === 100
        ? ordersArray[ordersArray.length - 1].order_id
        : null;

      return {
        data: ordersArray,
        nextPageToken
      };
    });

    // Rozwiń produkty do osobnych wierszy
    const orderItems = this.expandProductsToItems(orders);

    this.logFetchComplete(orderItems.length);

    return orderItems;
  }

  /**
   * Rozwija tablice products[] do osobnych wierszy
   * @param {Object[]} orders - Lista zamówień
   * @returns {Object[]} - Lista pozycji (jeden wiersz per produkt)
   */
  expandProductsToItems(orders) {
    const items = [];

    for (const order of orders) {
      const products = order.products || [];

      if (products.length === 0) {
        // Zamówienie bez produktów - pomijamy lub dodajemy pusty wiersz
        continue;
      }

      for (const product of products) {
        items.push(this.createOrderItem(order, product));
      }
    }

    return items;
  }

  /**
   * Tworzy rekord pozycji zamówienia
   * @param {Object} order - Zamówienie
   * @param {Object} product - Produkt z zamówienia
   * @returns {Object}
   */
  createOrderItem(order, product) {
    // Oblicz wartości pozycji
    const quantity = Number(product.quantity) || 0;
    const priceBrutto = Number(product.price_brutto) || 0;
    const taxRate = Number(product.tax_rate) || 23;
    const priceNetto = priceBrutto / (1 + taxRate / 100);
    const weight = Number(product.weight) || 0;

    const lineTotalBrutto = priceBrutto * quantity;
    const lineTotalNetto = priceNetto * quantity;
    const lineTaxValue = lineTotalBrutto - lineTotalNetto;
    const lineWeight = weight * quantity;

    return {
      // Kontekst zamówienia
      order_id: order.order_id,
      order_source: order.order_source || '',
      order_status_id: order.order_status_id,
      date_confirmed: order.date_confirmed,
      email: order.email || '',
      delivery_country_code: order.delivery_country_code || '',
      currency: order.currency || 'PLN',

      // Dane produktu
      product_id: product.product_id || '',
      variant_id: product.variant_id || '',
      name: product.name || '',
      sku: product.sku || '',
      ean: product.ean || '',
      location: product.location || '',
      auction_id: product.auction_id || '',
      attributes: product.attributes || '',

      // Ilość i ceny
      quantity: quantity,
      price_brutto: Math.round(priceBrutto * 100) / 100,
      price_netto: Math.round(priceNetto * 100) / 100,
      tax_rate: taxRate,
      weight: weight,

      // Wartości pozycji
      line_total_brutto: Math.round(lineTotalBrutto * 100) / 100,
      line_total_netto: Math.round(lineTotalNetto * 100) / 100,
      line_tax_value: Math.round(lineTaxValue * 100) / 100,
      line_weight: Math.round(lineWeight * 1000) / 1000,

      // Placeholder dla danych z magazynu (wypełni enricher)
      inv_name: null,
      inv_sku: null,
      inv_ean: null,
      inv_manufacturer: null,
      inv_category: null,
      inv_purchase_price_brutto: null,
      inv_purchase_price_netto: null,
      inv_tax_rate: null,
      inv_weight: null,
      inv_stock: null,
      inv_reserved: null,
      inv_available: null,
      inv_average_cost: null,

      // Placeholder dla marży (wymaga danych z magazynu)
      margin_per_unit: null,
      margin_total: null,
      margin_percent: null,

      // Oryginalny produkt (do enrichment)
      _originalProduct: product,
      _originalOrder: {
        order_id: order.order_id,
        currency: order.currency,
        date_confirmed: order.date_confirmed
      }
    };
  }
}

module.exports = OrderItemsFetcher;
