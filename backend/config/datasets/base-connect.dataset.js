/**
 * Base Connect Dataset
 *
 * Kontrahenci B2B z integracji Base Connect.
 * Dane pobierane przez getConnectIntegrations + getConnectIntegrationContractors.
 */

module.exports = {
  id: 'base_connect',
  name: 'Base Connect (B2B)',
  description: 'Kontrahenci B2B z integracji Base Connect',
  icon: 'handshake',
  category: 'b2b',

  // Wymaga wyboru integracji
  requiresIntegration: true,

  // Filtry dostępne dla użytkownika
  filters: [],

  // Grupy pól
  fieldGroups: [
    // INTEGRACJA
    {
      id: 'integration',
      label: 'Integracja',
      fields: [
        { key: 'connect_integration_id', label: 'ID integracji', type: 'number', description: 'ID integracji Base Connect' },
        { key: 'integration_name', label: 'Nazwa integracji', type: 'string', description: 'Nazwa integracji' },
        { key: 'integration_type', label: 'Typ integracji', type: 'string', description: 'own lub connected' }
      ]
    },

    // KONTRAHENT
    {
      id: 'contractor',
      label: 'Kontrahent',
      fields: [
        { key: 'connect_contractor_id', label: 'ID kontrahenta', type: 'number', description: 'ID kontrahenta Base Connect' },
        { key: 'contractor_name', label: 'Nazwa kontrahenta', type: 'string', description: 'Nazwa firmy kontrahenta' }
      ]
    },

    // DANE KREDYTU KUPIECKIEGO
    {
      id: 'credit',
      label: 'Kredyt kupiecki',
      fields: [
        { key: 'credit_limit', label: 'Limit kredytu', type: 'number', description: 'Limit kredytu kupieckiego' },
        { key: 'credit_used', label: 'Wykorzystany kredyt', type: 'number', description: 'Wykorzystana kwota kredytu' },
        { key: 'credit_available', label: 'Dostępny kredyt', type: 'number', description: 'Pozostała kwota kredytu' },
        { key: 'credit_currency', label: 'Waluta kredytu', type: 'string', description: 'Waluta kredytu kupieckiego' }
      ]
    },

    // USTAWIENIA KONTRAHENTA
    {
      id: 'settings',
      label: 'Ustawienia',
      fields: [
        { key: 'settings_json', label: 'Ustawienia (JSON)', type: 'json', description: 'Pełne ustawienia kontrahenta w JSON' }
      ]
    }
  ],

  // Domyślne pola
  defaultFields: [
    'connect_integration_id',
    'integration_name',
    'connect_contractor_id',
    'contractor_name',
    'credit_limit',
    'credit_available'
  ]
};
