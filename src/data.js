// Mock data dla Live Sales - BaseLinker → Sheets

export const MOCK_DATA = {
    // Pola dla zamówień
    fieldsOrders: [
        // Podstawowe
        { field_key: 'order_id', label: 'ID zamówienia', group: 'Podstawowe', higher_plan: false },
        { field_key: 'date_add', label: 'Data dodania', group: 'Podstawowe', higher_plan: false },
        { field_key: 'order_status_id', label: 'Status', group: 'Podstawowe', higher_plan: false },
        { field_key: 'total_price', label: 'Suma brutto', group: 'Podstawowe', higher_plan: false },
        { field_key: 'currency', label: 'Waluta', group: 'Podstawowe', higher_plan: false },
        { field_key: 'payment_method', label: 'Metoda płatności', group: 'Podstawowe', higher_plan: false },
        { field_key: 'delivery_method', label: 'Metoda dostawy', group: 'Podstawowe', higher_plan: false },

        // Dane klienta
        { field_key: 'email', label: 'Email', group: 'Dane klienta', higher_plan: false },
        { field_key: 'phone', label: 'Telefon', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_fullname', label: 'Imię i nazwisko (dostawa)', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_company', label: 'Firma (dostawa)', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_address', label: 'Adres (dostawa)', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_city', label: 'Miasto (dostawa)', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_postcode', label: 'Kod pocztowy (dostawa)', group: 'Dane klienta', higher_plan: false },
        { field_key: 'delivery_country', label: 'Kraj (dostawa)', group: 'Dane klienta', higher_plan: false },

        // Finansowe (PRO)
        { field_key: 'invoice_fullname', label: 'Dane do faktury - Nazwa', group: 'Finansowe', higher_plan: true },
        { field_key: 'invoice_nip', label: 'NIP', group: 'Finansowe', higher_plan: true },
        { field_key: 'invoice_address', label: 'Adres (faktura)', group: 'Finansowe', higher_plan: true },
        { field_key: 'invoice_city', label: 'Miasto (faktura)', group: 'Finansowe', higher_plan: true },
        { field_key: 'invoice_postcode', label: 'Kod pocztowy (faktura)', group: 'Finansowe', higher_plan: true },

        // Zaawansowane (PRO)
        { field_key: 'user_comments', label: 'Komentarz klienta', group: 'Zaawansowane', higher_plan: true },
        { field_key: 'admin_comments', label: 'Komentarz wewnętrzny', group: 'Zaawansowane', higher_plan: true },
    ],

    // Pola dla produktów
    fieldsProducts: [
        // Podstawowe
        { field_key: 'product_id', label: 'ID produktu', group: 'Podstawowe', higher_plan: false },
        { field_key: 'name', label: 'Nazwa produktu', group: 'Podstawowe', higher_plan: false },
        { field_key: 'ean', label: 'EAN', group: 'Podstawowe', higher_plan: false },
        { field_key: 'sku', label: 'SKU', group: 'Podstawowe', higher_plan: false },
        { field_key: 'quantity', label: 'Ilość', group: 'Podstawowe', higher_plan: false },
        { field_key: 'price_brutto', label: 'Cena brutto', group: 'Podstawowe', higher_plan: false },

        // Magazyn
        { field_key: 'stock', label: 'Stan magazynowy', group: 'Magazyn', higher_plan: false },
        { field_key: 'location', label: 'Lokalizacja', group: 'Magazyn', higher_plan: false },
        { field_key: 'weight', label: 'Waga (kg)', group: 'Magazyn', higher_plan: false },

        // Szczegóły (PRO)
        { field_key: 'manufacturer', label: 'Producent', group: 'Szczegóły', higher_plan: true },
        { field_key: 'category', label: 'Kategoria', group: 'Szczegóły', higher_plan: true },
        { field_key: 'description', label: 'Opis', group: 'Szczegóły', higher_plan: true },

        // Finansowe (PRO)
        { field_key: 'tax_rate', label: 'Stawka VAT', group: 'Finansowe', higher_plan: true },
        { field_key: 'purchase_price', label: 'Cena zakupu', group: 'Finansowe', higher_plan: true },
        { field_key: 'profit_margin', label: 'Marża (%)', group: 'Finansowe', higher_plan: true },
    ],

    // Przykładowe zamówienia
    sampleOrders: [
        {
            order_id: '1001',
            date_add: '2026-01-06 10:23:15',
            order_status_id: '234562',
            total_price: '299.99',
            currency: 'PLN',
            payment_method: 'Przelew',
            delivery_method: 'InPost Paczkomat',
            email: 'jan.kowalski@example.com',
            phone: '+48 123 456 789',
            delivery_fullname: 'Jan Kowalski',
            delivery_company: '',
            delivery_address: 'ul. Testowa 123',
            delivery_city: 'Warszawa',
            delivery_postcode: '00-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Jan Kowalski',
            invoice_nip: '1234567890',
            invoice_address: 'ul. Testowa 123',
            invoice_city: 'Warszawa',
            invoice_postcode: '00-001',
            user_comments: 'Proszę o szybką realizację',
            admin_comments: 'Priorytetowe'
        },
        {
            order_id: '1002',
            date_add: '2026-01-06 11:45:22',
            order_status_id: '234563',
            total_price: '149.50',
            currency: 'PLN',
            payment_method: 'PayU',
            delivery_method: 'Kurier DPD',
            email: 'anna.nowak@example.com',
            phone: '+48 987 654 321',
            delivery_fullname: 'Anna Nowak',
            delivery_company: 'Firma ABC Sp. z o.o.',
            delivery_address: 'al. Solidarności 45',
            delivery_city: 'Kraków',
            delivery_postcode: '30-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Firma ABC Sp. z o.o.',
            invoice_nip: '9876543210',
            invoice_address: 'al. Solidarności 45',
            invoice_city: 'Kraków',
            invoice_postcode: '30-001',
            user_comments: '',
            admin_comments: 'Standard'
        },
        {
            order_id: '1003',
            date_add: '2026-01-06 12:15:33',
            order_status_id: '234540',
            total_price: '89.99',
            currency: 'PLN',
            payment_method: 'Karta',
            delivery_method: 'Odbiór osobisty',
            email: 'piotr.wisniewski@example.com',
            phone: '+48 111 222 333',
            delivery_fullname: 'Piotr Wiśniewski',
            delivery_company: '',
            delivery_address: 'ul. Kwiatowa 7',
            delivery_city: 'Gdańsk',
            delivery_postcode: '80-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Piotr Wiśniewski',
            invoice_nip: '',
            invoice_address: 'ul. Kwiatowa 7',
            invoice_city: 'Gdańsk',
            invoice_postcode: '80-001',
            user_comments: 'Dziękuję!',
            admin_comments: ''
        },
        {
            order_id: '1004',
            date_add: '2026-01-06 13:30:44',
            order_status_id: '234564',
            total_price: '499.00',
            currency: 'PLN',
            payment_method: 'Przelew',
            delivery_method: 'InPost Kurier',
            email: 'maria.kowalczyk@example.com',
            phone: '+48 444 555 666',
            delivery_fullname: 'Maria Kowalczyk',
            delivery_company: '',
            delivery_address: 'ul. Polna 89',
            delivery_city: 'Poznań',
            delivery_postcode: '60-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Maria Kowalczyk',
            invoice_nip: '',
            invoice_address: 'ul. Polna 89',
            invoice_city: 'Poznań',
            invoice_postcode: '60-001',
            user_comments: '',
            admin_comments: 'Wysłane'
        },
        {
            order_id: '1005',
            date_add: '2026-01-06 14:20:55',
            order_status_id: '234562',
            total_price: '199.99',
            currency: 'PLN',
            payment_method: 'PayPal',
            delivery_method: 'Poczta Polska',
            email: 'tomasz.lewandowski@example.com',
            phone: '+48 777 888 999',
            delivery_fullname: 'Tomasz Lewandowski',
            delivery_company: '',
            delivery_address: 'ul. Słoneczna 15',
            delivery_city: 'Wrocław',
            delivery_postcode: '50-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Tomasz Lewandowski',
            invoice_nip: '5555555555',
            invoice_address: 'ul. Słoneczna 15',
            invoice_city: 'Wrocław',
            invoice_postcode: '50-001',
            user_comments: 'Proszę o paczkę ekologiczną',
            admin_comments: 'Notatka: klient VIP'
        },
        {
            order_id: '1006',
            date_add: '2026-01-06 15:10:11',
            order_status_id: '234540',
            total_price: '349.50',
            currency: 'PLN',
            payment_method: 'Karta',
            delivery_method: 'InPost Paczkomat',
            email: 'ewa.wojcik@example.com',
            phone: '+48 222 333 444',
            delivery_fullname: 'Ewa Wójcik',
            delivery_company: '',
            delivery_address: 'ul. Zielona 34',
            delivery_city: 'Łódź',
            delivery_postcode: '90-001',
            delivery_country: 'Polska',
            invoice_fullname: 'Ewa Wójcik',
            invoice_nip: '',
            invoice_address: 'ul. Zielona 34',
            delivery_city: 'Łódź',
            delivery_postcode: '90-001',
            user_comments: '',
            admin_comments: 'Nowe zamówienie'
        },
        // ... (additional sample orders) ...
    ],

    // Przykładowe produkty
    sampleProducts: [
        {
            product_id: '5001',
            name: 'Klawiatura mechaniczna RGB',
            ean: '5901234567890',
            sku: 'KB-RGB-001',
            quantity: '45',
            price_brutto: '299.00',
            stock: '45',
            location: 'A-12-3',
            weight: '0.85',
            manufacturer: 'TechPro',
            category: 'Komputery > Klawiatury',
            description: 'Profesjonalna klawiatura mechaniczna z podświetleniem RGB',
            tax_rate: '23',
            purchase_price: '180.00',
            profit_margin: '39.67'
        },
        // ... (additional sample products) ...
    ],

    // Lista eksportów
    exportsList: [
        {
            id: 'export-1',
            name: 'Zamówienia dzienne do Sheets',
            type: 'orders',
            interval: 15,
            sheets_tab: 'Sheet1',
            status: 'active',
            last_run: '2026-01-06 22:08:30',
            uptime: '99.8',
            sheet_url: 'https://docs.google.com/spreadsheets/d/1eakktbW8gttUOukkws3G7I2GBQo3DYzDdFls705pC5g/edit'
        },
        {
            id: 'export-2',
            name: 'Produkty - raport magazynowy',
            type: 'products',
            interval: 60,
            sheets_tab: 'Magazyn',
            status: 'active',
            last_run: '2026-01-06 21:45:00',
            uptime: '99.5',
            sheet_url: ''
        },
        {
            id: 'export-3',
            name: 'Zamówienia do pakowania',
            type: 'orders',
            interval: 5,
            sheets_tab: 'Pakowanie',
            status: 'paused',
            last_run: '2026-01-06 18:30:15',
            uptime: '98.9',
            sheet_url: ''
        }
    ]
};
