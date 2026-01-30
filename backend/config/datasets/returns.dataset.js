/**
 * Dataset: ZWROTY (returns)
 *
 * Lista zwrotów z danymi o konkretnym zwrocie.
 * Jeden wiersz = jeden zwrot.
 *
 * API: getOrderReturns
 */

module.exports = {
  id: 'returns',
  label: 'Zwroty',
  description: 'Lista zwrotów z danymi o konkretnym zwrocie',
  icon: 'refresh-cw',

  primaryQuery: 'getOrderReturns',
  enrichments: [],

  fieldGroups: [
    // 3.1 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'return_id', label: 'ID zwrotu', type: 'number', description: 'Unikalny identyfikator zwrotu' },
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Zamówienie, którego dotyczy zwrot' },
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Kiedy zarejestrowano zwrot' },
        { key: 'return_status_id', label: 'ID statusu', type: 'number', description: 'Identyfikator statusu zwrotu' },
        { key: 'return_status_name', label: 'Status', type: 'text', description: 'Nazwa statusu (np. "Nowy", "Przyjęty", "Zwrócono pieniądze")', computed: true },
        { key: 'return_reason_id', label: 'ID powodu', type: 'number', description: 'Identyfikator przyczyny zwrotu' },
        { key: 'return_reason_name', label: 'Powód zwrotu', type: 'text', description: 'Opis przyczyny (np. "Towar uszkodzony", "Niezgodny z opisem")', computed: true },
        { key: 'refund_reason', label: 'Opis powodu', type: 'text', description: 'Szczegółowy opis podany przez klienta' }
      ]
    },

    // 3.2 DANE KLIENTA
    {
      id: 'customer',
      label: 'Dane klienta',
      fields: [
        { key: 'email', label: 'Email', type: 'text', description: 'Adres email klienta' },
        { key: 'phone', label: 'Telefon', type: 'text', description: 'Numer telefonu klienta' },
        { key: 'client_name', label: 'Imię i nazwisko', type: 'text', description: 'Pełne dane klienta' }
      ]
    },

    // 3.3 ADRES ZWROTU
    {
      id: 'return_address',
      label: 'Adres zwrotu',
      fields: [
        { key: 'return_address', label: 'Adres', type: 'text', description: 'Adres, z którego wysłano zwrot' },
        { key: 'return_city', label: 'Miasto', type: 'text', description: 'Miasto nadania zwrotu' },
        { key: 'return_postcode', label: 'Kod pocztowy', type: 'text', description: 'Kod pocztowy' },
        { key: 'return_country_code', label: 'Kod kraju', type: 'text', description: 'Kraj nadania' }
      ]
    },

    // 3.4 WARTOŚCI
    {
      id: 'values',
      label: 'Wartości',
      fields: [
        { key: 'refund_value', label: 'Wartość do zwrotu', type: 'number', description: 'Kwota do zwrócenia klientowi' },
        { key: 'refund_done', label: 'Zwrócono', type: 'number', description: 'Kwota już zwrócona' },
        { key: 'refund_remaining', label: 'Pozostało do zwrotu', type: 'number', description: 'Ile jeszcze do zwrócenia', computed: true },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Waluta zwrotu' }
      ]
    },

    // 3.5 PRODUKTY ZWROTU (AGREGOWANE)
    {
      id: 'products_summary',
      label: 'Produkty zwrotu',
      fields: [
        { key: 'products_count', label: 'Liczba pozycji', type: 'number', description: 'Ile produktów w zwrocie', computed: true },
        { key: 'products_quantity', label: 'Łączna ilość', type: 'number', description: 'Suma sztuk do zwrotu', computed: true },
        { key: 'products_names', label: 'Nazwy produktów', type: 'text', description: 'Lista nazw oddzielona przecinkiem', computed: true }
      ]
    },

    // 3.6 KOMENTARZE
    {
      id: 'comments',
      label: 'Komentarze',
      fields: [
        { key: 'admin_comments', label: 'Komentarz wewnętrzny', type: 'text', description: 'Notatki obsługi' },
        { key: 'user_comments', label: 'Komentarz klienta', type: 'text', description: 'Uwagi klienta' }
      ]
    },

    // 3.7 POLA DODATKOWE (DYNAMICZNE)
    {
      id: 'extra_fields',
      label: 'Pola dodatkowe',
      dynamic: true,
      source: 'getOrderReturnExtraFields',
      fields: []
    }
  ]
};
