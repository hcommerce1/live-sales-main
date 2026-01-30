/**
 * Dataset: PRZESYŁKI (shipments)
 *
 * Lista przesyłek z tracking i dokumentami.
 * Jeden wiersz = jedna przesyłka.
 *
 * API: getOrderPackages + getCourierPackagesStatusHistory
 */

module.exports = {
  id: 'shipments',
  label: 'Przesyłki',
  description: 'Lista przesyłek z tracking i dokumentami',
  icon: 'send',

  primaryQuery: 'getOrderPackages',
  enrichments: ['tracking', 'labels'],

  fieldGroups: [
    // 8.1 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'package_id', label: 'ID przesyłki', type: 'number', description: 'Unikalny identyfikator paczki' },
        { key: 'order_id', label: 'ID zamówienia', type: 'number', description: 'Zamówienie, do którego należy' },
        { key: 'courier_code', label: 'Kod kuriera', type: 'text', description: 'Kod integracji (inpost, dpd, dhl, etc.)' },
        { key: 'courier_name', label: 'Nazwa kuriera', type: 'text', description: 'Pełna nazwa firmy kurierskiej', computed: true },
        { key: 'tracking_number', label: 'Numer śledzenia', type: 'text', description: 'Numer do śledzenia przesyłki' },
        { key: 'tracking_url', label: 'Link śledzenia', type: 'text', description: 'URL do strony śledzenia', computed: true }
      ]
    },

    // 8.2 DATY
    {
      id: 'dates',
      label: 'Daty',
      fields: [
        { key: 'date_add', label: 'Data utworzenia', type: 'datetime', description: 'Kiedy utworzono przesyłkę' },
        { key: 'date_sent', label: 'Data nadania', type: 'datetime', description: 'Kiedy przesyłka została nadana' },
        { key: 'date_delivered', label: 'Data doręczenia', type: 'datetime', description: 'Kiedy doręczono (jeśli doręczona)' }
      ]
    },

    // 8.3 STATUS
    {
      id: 'status',
      label: 'Status',
      fields: [
        { key: 'status', label: 'Status', type: 'text', description: 'Aktualny status przesyłki' },
        { key: 'status_code', label: 'Kod statusu', type: 'text', description: 'Kod statusu kuriera' },
        { key: 'is_delivered', label: 'Doręczona', type: 'boolean', description: 'Czy przesyłka została doręczona' },
        { key: 'is_return', label: 'Zwrot', type: 'boolean', description: 'Czy to przesyłka zwrotna' }
      ]
    },

    // 8.4 PARAMETRY PRZESYŁKI
    {
      id: 'package_params',
      label: 'Parametry przesyłki',
      fields: [
        { key: 'weight', label: 'Waga (kg)', type: 'number', description: 'Waga przesyłki' },
        { key: 'size_x', label: 'Wymiar X (cm)', type: 'number', description: 'Długość' },
        { key: 'size_y', label: 'Wymiar Y (cm)', type: 'number', description: 'Szerokość' },
        { key: 'size_z', label: 'Wymiar Z (cm)', type: 'number', description: 'Wysokość' },
        { key: 'cod_value', label: 'Pobranie', type: 'number', description: 'Kwota pobrania (jeśli COD)' },
        { key: 'insurance_value', label: 'Ubezpieczenie', type: 'number', description: 'Wartość ubezpieczenia' }
      ]
    },

    // 8.5 ADRES DORĘCZENIA
    {
      id: 'receiver_address',
      label: 'Adres doręczenia',
      fields: [
        { key: 'receiver_name', label: 'Odbiorca', type: 'text', description: 'Imię i nazwisko odbiorcy' },
        { key: 'receiver_address', label: 'Adres', type: 'text', description: 'Adres doręczenia' },
        { key: 'receiver_city', label: 'Miasto', type: 'text', description: 'Miasto' },
        { key: 'receiver_postcode', label: 'Kod pocztowy', type: 'text', description: 'Kod pocztowy' },
        { key: 'receiver_country', label: 'Kraj', type: 'text', description: 'Kraj' },
        { key: 'receiver_phone', label: 'Telefon', type: 'text', description: 'Telefon odbiorcy' },
        { key: 'receiver_email', label: 'Email', type: 'text', description: 'Email odbiorcy' }
      ]
    },

    // 8.6 PUNKT ODBIORU
    {
      id: 'pickup_point',
      label: 'Punkt odbioru',
      fields: [
        { key: 'pickup_point_id', label: 'ID punktu', type: 'text', description: 'Identyfikator punktu (np. paczkomat)' },
        { key: 'pickup_point_name', label: 'Nazwa punktu', type: 'text', description: 'Nazwa punktu odbioru' },
        { key: 'pickup_point_address', label: 'Adres punktu', type: 'text', description: 'Pełny adres punktu' }
      ]
    },

    // 8.7 TRACKING
    {
      id: 'tracking',
      label: 'Tracking',
      enrichment: 'tracking',
      fields: [
        { key: 'tracking_last_status', label: 'Ostatni status', type: 'text', description: 'Najnowszy status z trackingu', enrichment: 'tracking' },
        { key: 'tracking_last_date', label: 'Data ostatniego statusu', type: 'datetime', description: 'Kiedy wystąpił ostatni status', enrichment: 'tracking' },
        { key: 'tracking_last_location', label: 'Ostatnia lokalizacja', type: 'text', description: 'Gdzie ostatnio była paczka', enrichment: 'tracking' },
        { key: 'tracking_events_count', label: 'Liczba zdarzeń', type: 'number', description: 'Ile zdarzeń w historii', enrichment: 'tracking' }
      ]
    },

    // 8.8 DOKUMENTY
    {
      id: 'documents',
      label: 'Dokumenty',
      enrichment: 'labels',
      fields: [
        { key: 'has_label', label: 'Ma etykietę', type: 'boolean', description: 'Czy wygenerowano etykietę', enrichment: 'labels' },
        { key: 'label_url', label: 'URL etykiety', type: 'text', description: 'Link do pobrania etykiety PDF', enrichment: 'labels' },
        { key: 'has_protocol', label: 'Ma protokół', type: 'boolean', description: 'Czy jest protokół nadania', enrichment: 'labels' },
        { key: 'protocol_url', label: 'URL protokołu', type: 'text', description: 'Link do protokołu', enrichment: 'labels' }
      ]
    }
  ]
};
