/**
 * Dataset: BASE CONNECT (base_connect)
 *
 * Kontrahenci z integracji Base Connect.
 * Jeden wiersz = jeden kontrahent.
 *
 * API: getConnectIntegrationContractors
 */

module.exports = {
  id: 'base_connect',
  label: 'Base Connect',
  description: 'Kontrahenci z integracji Base Connect',
  icon: 'users',

  primaryQuery: 'getConnectIntegrationContractors',
  enrichments: ['credit'],

  // Wymaga wyboru integracji
  requiresIntegration: true,

  fieldGroups: [
    // 9.1 PODSTAWOWE
    {
      id: 'basic',
      label: 'Podstawowe',
      fields: [
        { key: 'contractor_id', label: 'ID kontrahenta', type: 'number', description: 'Unikalny identyfikator' },
        { key: 'integration_id', label: 'ID integracji', type: 'number', description: 'Do której integracji należy' },
        { key: 'external_id', label: 'Zewnętrzne ID', type: 'text', description: 'ID w systemie zewnętrznym' }
      ]
    },

    // 9.2 DANE FIRMY
    {
      id: 'company',
      label: 'Dane firmy',
      fields: [
        { key: 'name', label: 'Nazwa', type: 'text', description: 'Nazwa firmy/kontrahenta' },
        { key: 'nip', label: 'NIP', type: 'text', description: 'Numer NIP' },
        { key: 'regon', label: 'REGON', type: 'text', description: 'Numer REGON' },
        { key: 'krs', label: 'KRS', type: 'text', description: 'Numer KRS' },
        { key: 'email', label: 'Email', type: 'text', description: 'Email główny' },
        { key: 'phone', label: 'Telefon', type: 'text', description: 'Telefon główny' },
        { key: 'website', label: 'Strona www', type: 'text', description: 'Adres strony internetowej' }
      ]
    },

    // 9.3 ADRES
    {
      id: 'address',
      label: 'Adres',
      fields: [
        { key: 'address', label: 'Adres', type: 'text', description: 'Ulica i numer' },
        { key: 'city', label: 'Miasto', type: 'text', description: 'Miasto' },
        { key: 'postcode', label: 'Kod pocztowy', type: 'text', description: 'Kod pocztowy' },
        { key: 'country', label: 'Kraj', type: 'text', description: 'Nazwa kraju' },
        { key: 'country_code', label: 'Kod kraju', type: 'text', description: 'Kod ISO kraju' }
      ]
    },

    // 9.4 WARUNKI HANDLOWE
    {
      id: 'terms',
      label: 'Warunki handlowe',
      fields: [
        { key: 'payment_term_days', label: 'Termin płatności', type: 'number', description: 'Dni na zapłatę' },
        { key: 'credit_limit', label: 'Limit kredytowy', type: 'number', description: 'Maksymalne zadłużenie' },
        { key: 'currency', label: 'Waluta', type: 'text', description: 'Domyślna waluta rozliczeń' },
        { key: 'price_group', label: 'Grupa cenowa', type: 'text', description: 'Przypisana grupa cenowa' },
        { key: 'discount_percent', label: 'Rabat %', type: 'number', description: 'Stały rabat procentowy' }
      ]
    },

    // 9.5 KONTAKT
    {
      id: 'contact',
      label: 'Kontakt',
      fields: [
        { key: 'contact_person', label: 'Osoba kontaktowa', type: 'text', description: 'Imię i nazwisko' },
        { key: 'contact_email', label: 'Email kontaktowy', type: 'text', description: 'Email do kontaktu' },
        { key: 'contact_phone', label: 'Telefon kontaktowy', type: 'text', description: 'Telefon do kontaktu' }
      ]
    },

    // 9.6 DANE KREDYTOWE
    {
      id: 'credit',
      label: 'Dane kredytowe',
      enrichment: 'credit',
      fields: [
        { key: 'credit_current_debt', label: 'Aktualne zadłużenie', type: 'number', description: 'Ile kontrahent jest winien', enrichment: 'credit' },
        { key: 'credit_overdue', label: 'Przeterminowane', type: 'number', description: 'Kwota przeterminowana', enrichment: 'credit' },
        { key: 'credit_available', label: 'Dostępny kredyt', type: 'number', description: 'Ile jeszcze może zamówić', enrichment: 'credit' },
        { key: 'orders_total_value', label: 'Suma zamówień', type: 'number', description: 'Łączna wartość wszystkich zamówień', enrichment: 'credit' },
        { key: 'orders_count', label: 'Liczba zamówień', type: 'number', description: 'Ile zamówień złożył', enrichment: 'credit' },
        { key: 'last_order_date', label: 'Ostatnie zamówienie', type: 'datetime', description: 'Data ostatniego zamówienia', enrichment: 'credit' }
      ]
    }
  ]
};
