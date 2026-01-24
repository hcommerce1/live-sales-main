const { createApp } = Vue;

createApp({
    data() {
        return {
            currentPage: 'dashboard',
            searchQuery: '',
            expandedGroups: ['Podstawowe', 'Dane klienta', 'Magazyn'],
            editingName: false,
            accordionOpen: 'filters',
            showPreviewModal: false,
            deleteConfirm: null,
            scheduleValue: '15-minutes',

            config: {
                id: 'new',
                name: 'Nowy eksport',
                dataset: 'orders',
                selected_fields: [],
                filters: {
                    status: '',
                    date_from: '',
                    date_to: ''
                },
                sheets: {
                    sheet_url: '',
                    write_mode: 'append'
                },
                schedule_minutes: 15,
                status: 'active'
            },

            toast: {
                show: false,
                title: '',
                message: '',
                icon: ''
            },

            buyForm: {
                email: '',
                nip: '',
                phone: '',
                message: ''
            },

            sortable: null,
            sheetUrlValid: null,
            extractedSheetId: null,

            // Live stats
            currentTime: new Date(),
            lastSyncTime: new Date(Date.now() - 2 * 60 * 1000),
            uptime: 99.8,
            uptimeChart: null,

            // Server data
            exportsListServer: [],
            isLoading: false,

            // Configuration page
            baselinkerToken: '',
            showToken: false,
            tokenSaved: false,
            tokenSaveTimeout: null,
            userEmail: ''
        };
    },

    computed: {
        exportsList() {
            // Return server data if available, otherwise fallback to mock data
            if (this.exportsListServer.length > 0) {
                return this.exportsListServer;
            }
            return MOCK_DATA.exportsList.map(exp => ({
                ...exp,
                uptime: (99.5 + Math.random() * 0.5).toFixed(1)
            }));
        },

        activeExportsCount() {
            return this.exportsList.filter(e => e.status === 'active').length;
        },

        availableFields() {
            return this.config.dataset === 'orders'
                ? MOCK_DATA.fieldsOrders
                : MOCK_DATA.fieldsProducts;
        },

        sampleData() {
            return this.config.dataset === 'orders'
                ? MOCK_DATA.sampleOrders
                : MOCK_DATA.sampleProducts;
        },

        filteredGroups() {
            const groups = {};

            this.availableFields
                .filter(field => {
                    if (!this.searchQuery) return true;
                    const query = this.searchQuery.toLowerCase();
                    return field.label.toLowerCase().includes(query) ||
                           field.field_key.toLowerCase().includes(query);
                })
                .forEach(field => {
                    if (!groups[field.group]) {
                        groups[field.group] = [];
                    }
                    groups[field.group].push(field);
                });

            return Object.entries(groups).map(([name, fields]) => ({ name, fields }));
        },

        previewTableData() {
            let data = [...this.sampleData];

            if (this.config.dataset === 'orders' && this.config.filters.status) {
                data = data.filter(r => r.order_status_id === this.config.filters.status);
            }

            if (this.config.filters.date_from) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate >= this.config.filters.date_from;
                });
            }

            if (this.config.filters.date_to) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate <= this.config.filters.date_to;
                });
            }

            return data.slice(0, 5);
        },

        csvPreview() {
            if (this.config.selected_fields.length === 0) return '';

            const data = this.previewTableData;
            const headers = this.config.selected_fields.map(fieldKey => {
                const field = this.availableFields.find(f => f.field_key === fieldKey);
                return field ? field.label : fieldKey;
            });

            const lines = [headers.join(';')];

            data.forEach(record => {
                const row = this.config.selected_fields.map(fieldKey => {
                    const value = record[fieldKey] || '';
                    const escaped = String(value).replace(/"/g, '""');
                    return escaped.includes(';') ? `"${escaped}"` : escaped;
                });
                lines.push(row.join(';'));
            });

            return lines.join('\n');
        },

        recordCount() {
            let data = [...this.sampleData];

            if (this.config.dataset === 'orders' && this.config.filters.status) {
                data = data.filter(r => r.order_status_id === this.config.filters.status);
            }

            if (this.config.filters.date_from) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate >= this.config.filters.date_from;
                });
            }

            if (this.config.filters.date_to) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate <= this.config.filters.date_to;
                });
            }

            return data.length;
        },

        lastSyncText() {
            const diff = Math.floor((this.currentTime - this.lastSyncTime) / 1000);
            const minutes = Math.floor(diff / 60);
            const seconds = diff % 60;

            if (minutes === 0) {
                return `${seconds} sek temu`;
            }
            return `${minutes} min ${seconds} sek temu`;
        },

        ordersToday() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();

            if (hour < 7) {
                return Math.floor((hour * 60 + minute) / (7 * 60) * 30);
            }

            const minutesSince7 = (hour - 7) * 60 + minute;
            const totalMinutesAfter7 = 17 * 60;
            return 30 + Math.floor((minutesSince7 / totalMinutesAfter7) * 253);
        },

        runsToday() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            const totalMinutes = hour * 60 + minute;
            return Math.floor(totalMinutes / 5);
        }
    },

    methods: {
        // ========== Server Methods ==========

        async loadExportsFromServer() {
            try {
                this.isLoading = true;
                const exports = await window.LiveSalesAPI.exports.getAll();
                this.exportsListServer = exports.map(exp => ({
                    id: exp.id,
                    name: exp.name,
                    type: exp.dataset,
                    interval: exp.schedule_minutes,
                    sheets_tab: 'Sheet1',
                    status: exp.status || 'active',
                    last_run: exp.last_run || new Date().toISOString().slice(0, 19).replace('T', ' '),
                    uptime: (99.5 + Math.random() * 0.5).toFixed(1),
                    sheet_url: exp.sheets?.sheet_url || ''
                }));
            } catch (error) {
                console.error('Failed to load exports:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się załadować eksportów z serwera',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
            } finally {
                this.isLoading = false;
            }
        },

        async saveConfigToServer() {
            try {
                this.isLoading = true;
                const savedConfig = await window.LiveSalesAPI.exports.save(this.config);

                // Update exports list
                await this.loadExportsFromServer();

                this.showToast(
                    'Zapisano',
                    'Konfiguracja została zapisana pomyślnie na serwerze',
                    '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                );

                return savedConfig;
            } catch (error) {
                console.error('Failed to save config:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się zapisać konfiguracji: ' + error.message,
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
                throw error;
            } finally {
                this.isLoading = false;
            }
        },

        async deleteExportFromServer(exportId) {
            try {
                this.isLoading = true;
                await window.LiveSalesAPI.exports.delete(exportId);

                // Update exports list
                await this.loadExportsFromServer();

                this.deleteConfirm = null;
                this.showToast(
                    'Usunięto',
                    'Eksport został pomyślnie usunięty z serwera',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>'
                );
            } catch (error) {
                console.error('Failed to delete export:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się usunąć eksportu: ' + error.message,
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
            } finally {
                this.isLoading = false;
            }
        },

        async runExportOnServer() {
            if (this.config.id === 'new') {
                this.showToast(
                    'Informacja',
                    'Zapisz konfigurację przed uruchomieniem eksportu',
                    '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
                );
                return;
            }

            try {
                this.isLoading = true;
                this.lastSyncTime = new Date();

                const result = await window.LiveSalesAPI.exports.run(this.config.id);

                this.showToast(
                    'Sukces',
                    `Eksport zakończony! Zapisano ${result.recordCount} rekordów do Google Sheets`,
                    '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                );
            } catch (error) {
                console.error('Failed to run export:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się uruchomić eksportu: ' + error.message,
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
            } finally {
                this.isLoading = false;
            }
        },

        async toggleExportStatusOnServer(exp) {
            try {
                this.isLoading = true;
                await window.LiveSalesAPI.exports.toggle(exp.id);

                // Update exports list
                await this.loadExportsFromServer();
            } catch (error) {
                console.error('Failed to toggle export status:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się zmienić statusu eksportu: ' + error.message,
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
            } finally {
                this.isLoading = false;
            }
        },

        async loadExportFromServer(exportId) {
            try {
                this.isLoading = true;
                const exportConfig = await window.LiveSalesAPI.exports.get(exportId);

                this.config = {
                    id: exportConfig.id,
                    name: exportConfig.name,
                    dataset: exportConfig.dataset,
                    selected_fields: exportConfig.selected_fields || [],
                    filters: exportConfig.filters || { status: '', date_from: '', date_to: '' },
                    sheets: exportConfig.sheets || { sheet_url: '', write_mode: 'append' },
                    schedule_minutes: exportConfig.schedule_minutes || 15,
                    status: exportConfig.status || 'active'
                };

                const mins = this.config.schedule_minutes;
                if (mins === 0) {
                    this.scheduleValue = 'live';
                } else if (mins < 60) {
                    this.scheduleValue = `${mins}-minutes`;
                } else if (mins < 1440) {
                    this.scheduleValue = `${mins / 60}-hours`;
                } else {
                    this.scheduleValue = `${mins / 1440}-days`;
                }

                this.validateSheetUrl();
                this.currentPage = 'konfigurator';
                this.$nextTick(() => {
                    this.initSortable();
                });
            } catch (error) {
                console.error('Failed to load export:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się załadować eksportu: ' + error.message,
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
            } finally {
                this.isLoading = false;
            }
        },

        async validateSheetUrlOnServer() {
            const url = this.config.sheets.sheet_url;
            if (!url) {
                this.sheetUrlValid = null;
                this.extractedSheetId = null;
                return;
            }

            try {
                const result = await window.LiveSalesAPI.sheets.validate(url);
                this.sheetUrlValid = result.hasAccess;
                this.extractedSheetId = result.sheetId;

                if (!result.hasAccess) {
                    this.showToast(
                        'Uwaga',
                        'Brak dostępu do arkusza. Upewnij się, że udostępniłeś arkusz dla Service Account.',
                        '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
                    );
                }
            } catch (error) {
                this.sheetUrlValid = false;
                this.extractedSheetId = null;
                console.error('Sheet validation error:', error);
            }
        },

        // ========== Original Methods (adapted) ==========

        toggleGroup(groupName) {
            const index = this.expandedGroups.indexOf(groupName);
            if (index > -1) {
                this.expandedGroups.splice(index, 1);
            } else {
                this.expandedGroups.push(groupName);
            }
        },

        toggleAccordion(section) {
            this.accordionOpen = this.accordionOpen === section ? null : section;
        },

        isFieldSelected(fieldKey) {
            return this.config.selected_fields.includes(fieldKey);
        },

        handleFieldClick(field) {
            if (field.higher_plan) {
                this.currentPage = 'buy';
                this.scrollToForm();
            } else if (!this.isFieldSelected(field.field_key)) {
                this.addField(field.field_key);
            }
        },

        addField(fieldKey) {
            if (!this.isFieldSelected(fieldKey)) {
                this.config.selected_fields.push(fieldKey);
                this.$nextTick(() => {
                    this.initSortable();
                });
            }
        },

        removeField(fieldKey) {
            const index = this.config.selected_fields.indexOf(fieldKey);
            if (index > -1) {
                this.config.selected_fields.splice(index, 1);
            }
        },

        getFieldLabel(fieldKey) {
            const field = this.availableFields.find(f => f.field_key === fieldKey);
            return field ? field.label : fieldKey;
        },

        onDatasetChange() {
            this.config.selected_fields = [];
        },

        updateSchedule() {
            if (this.scheduleValue === 'live') {
                this.config.schedule_minutes = 0;
                return;
            }

            const [value, unit] = this.scheduleValue.split('-');
            if (unit === 'minutes') {
                this.config.schedule_minutes = parseInt(value);
            } else if (unit === 'hours') {
                this.config.schedule_minutes = parseInt(value) * 60;
            } else if (unit === 'days') {
                this.config.schedule_minutes = parseInt(value) * 1440;
            }
        },

        validateSheetUrl() {
            const url = this.config.sheets.sheet_url;
            if (!url) {
                this.sheetUrlValid = null;
                this.extractedSheetId = null;
                return;
            }

            // Support both formats:
            // 1. https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
            // 2. https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid={GID}
            // 3. https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit?gid={GID}#gid={GID}
            const pattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
            const match = url.match(pattern);

            if (match) {
                this.extractedSheetId = match[1];

                // Extract GID if present (try both ?gid= and #gid= formats)
                const gidMatch = url.match(/[?#]gid=(\d+)/);
                if (gidMatch) {
                    this.extractedSheetId += ` (Sheet ID: ${gidMatch[1]})`;
                }

                // Validate on server
                this.validateSheetUrlOnServer();
            } else {
                this.sheetUrlValid = false;
                this.extractedSheetId = null;
            }
        },

        async saveConfig() {
            // Save to server
            await this.saveConfigToServer();
        },

        createNewExport() {
            const newId = 'export-' + Date.now();
            this.config = {
                id: newId,
                name: 'Nowy eksport',
                dataset: 'orders',
                selected_fields: [],
                filters: { status: '', date_from: '', date_to: '' },
                sheets: { sheet_url: '', write_mode: 'append' },
                schedule_minutes: 15,
                status: 'active'
            };
            this.scheduleValue = '15-minutes';
            this.sheetUrlValid = null;
            this.extractedSheetId = null;
            this.currentPage = 'konfigurator';
            this.$nextTick(() => {
                this.initSortable();
            });
        },

        loadExport(exportId) {
            // Load from server
            this.loadExportFromServer(exportId);
        },

        confirmDelete(exportId) {
            this.deleteConfirm = exportId;
        },

        deleteExport(exportId) {
            // Delete from server
            this.deleteExportFromServer(exportId);
        },

        toggleExportStatus(exp) {
            // Toggle on server
            this.toggleExportStatusOnServer(exp);
        },

        runExport() {
            // Run on server
            this.runExportOnServer();
        },

        downloadCsv() {
            const blob = new Blob([this.csvPreview], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${this.config.name || 'export'}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        formatLastRun(dateStr) {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);

            if (diff < 60) return `${diff} sek temu`;
            if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
            if (diff < 86400) return `${Math.floor(diff / 3600)} godz temu`;
            return `${Math.floor(diff / 86400)} dni temu`;
        },

        showToast(title, message, icon) {
            this.toast = { show: true, title, message, icon };
            setTimeout(() => {
                this.toast.show = false;
            }, 3000);
        },

        formatNip() {
            let nip = this.buyForm.nip.replace(/\D/g, '');
            nip = nip.substring(0, 10);

            if (nip.length > 6) {
                this.buyForm.nip = nip.substring(0, 3) + '-' + nip.substring(3, 6) + '-' + nip.substring(6, 8) + '-' + nip.substring(8);
            } else if (nip.length > 3) {
                this.buyForm.nip = nip.substring(0, 3) + '-' + nip.substring(3);
            } else {
                this.buyForm.nip = nip;
            }
        },

        scrollToForm() {
            this.$nextTick(() => {
                const form = document.getElementById('contact-form');
                if (form) {
                    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        },

        async submitBuyForm() {
            const nipDigits = this.buyForm.nip.replace(/\D/g, '');
            if (nipDigits.length !== 10) {
                this.showToast(
                    'Błąd',
                    'NIP musi zawierać dokładnie 10 cyfr',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
                return;
            }

            try {
                await emailjs.send(
                    'service_cde8vm8',
                    'template_abtm78k',
                    {
                        email: this.buyForm.email,
                        nip: this.buyForm.nip,
                        phone: this.buyForm.phone,
                        message: this.buyForm.message || 'Brak wiadomości',
                        timestamp: new Date().toLocaleString('pl-PL', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        })
                    }
                );
            } catch (error) {
                console.error('Email error:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się wysłać formularza. Spróbuj ponownie.',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
                return;
            }

            this.showToast(
                'Wysłano',
                'Dziękujemy! Skontaktujemy się wkrótce.',
                '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
            );

            this.buyForm = { email: '', nip: '', phone: '', message: '' };
        },

        initSortable() {
            const el = document.getElementById('sortable-list');
            if (!el) return;

            if (this.sortable) {
                this.sortable.destroy();
            }

            this.sortable = Sortable.create(el, {
                handle: '.drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;

                    const item = this.config.selected_fields.splice(oldIndex, 1)[0];
                    this.config.selected_fields.splice(newIndex, 0, item);
                }
            });
        },

        initUptimeChart() {
            const canvas = document.getElementById('uptimeChart');
            if (!canvas) return;

            const data = [];
            for (let i = 0; i < 30; i++) {
                data.push(99.5 + Math.random() * 0.5);
            }

            const ctx = canvas.getContext('2d');

            if (this.uptimeChart) {
                this.uptimeChart.destroy();
            }

            this.uptimeChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array.from({length: 30}, (_, i) => `${i+1}`),
                    datasets: [{
                        label: 'Uptime %',
                        data: data,
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => `Uptime: ${context.parsed.y.toFixed(2)}%`
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 99,
                            max: 100,
                            ticks: {
                                callback: (value) => value + '%'
                            }
                        },
                        x: {
                            display: false
                        }
                    }
                }
            });
        },

        updateTime() {
            this.currentTime = new Date();
        },

        // ========== Configuration Methods ==========

        async onTokenChange() {
            // Clear previous timeout
            if (this.tokenSaveTimeout) {
                clearTimeout(this.tokenSaveTimeout);
            }

            // Auto-save after 1 second of no typing
            this.tokenSaveTimeout = setTimeout(async () => {
                await this.saveBaselinkerToken();
            }, 1000);
        },

        async saveBaselinkerToken() {
            if (!this.baselinkerToken || this.baselinkerToken.trim() === '') {
                return;
            }

            try {
                const response = await fetch('/api/user/baselinker-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                    },
                    body: JSON.stringify({
                        token: this.baselinkerToken
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to save token');
                }

                // Show success message
                this.tokenSaved = true;
                setTimeout(() => {
                    this.tokenSaved = false;
                }, 3000);
            } catch (error) {
                console.error('Error saving BaseLinker token:', error);
                this.showToast('Błąd', 'Nie udało się zapisać tokenu', 'error');
            }
        },

        async loadBaselinkerToken() {
            try {
                const response = await fetch('/api/user/baselinker-token', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.token) {
                        this.baselinkerToken = data.token;
                    }
                }
            } catch (error) {
                console.error('Error loading BaseLinker token:', error);
            }
        },

        async loadUserEmail() {
            try {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                this.userEmail = user.email || 'demo@example.com';
            } catch (error) {
                console.error('Error loading user email:', error);
                this.userEmail = 'demo@example.com';
            }
        },

        logout() {
            // Clear all auth data
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');

            // Redirect to login
            window.location.href = '/login.html';
        }
    },

    watch: {
        currentPage(newPage) {
            if (newPage === 'konfigurator') {
                this.$nextTick(() => {
                    this.initSortable();
                });
            } else if (newPage === 'dashboard') {
                this.$nextTick(() => {
                    this.initUptimeChart();
                });
            } else if (newPage === 'exports') {
                // Load exports when switching to exports page
                this.loadExportsFromServer();
            } else if (newPage === 'config') {
                // Load configuration data when switching to config page
                this.loadBaselinkerToken();
                this.loadUserEmail();
            }
        }
    },

    async mounted() {
        // Check authentication - redirect to login if not logged in
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const accessToken = localStorage.getItem('accessToken');
        if (!user || !accessToken) {
            window.location.href = '/login.html';
            return;
        }

        // Update time every second
        setInterval(() => {
            this.updateTime();
        }, 1000);

        // Init chart if on dashboard
        if (this.currentPage === 'dashboard') {
            this.$nextTick(() => {
                this.initUptimeChart();
            });
        }

        // Load exports from server
        await this.loadExportsFromServer();

        // Load user email for config page
        await this.loadUserEmail();

        // Check server health
        try {
            const health = await window.LiveSalesAPI.health();
            console.log('Server health:', health);
        } catch (error) {
            console.error('Server health check failed:', error);
            this.showToast(
                'Ostrzeżenie',
                'Nie można połączyć się z serwerem. Sprawdź czy backend jest uruchomiony.',
                '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
            );
        }

        // Auto-refresh exports every 5 minutes
        setInterval(() => {
            if (this.currentPage === 'exports' || this.currentPage === 'dashboard') {
                this.loadExportsFromServer();
            }
        }, 5 * 60 * 1000);
    }
}).mount('#app');
