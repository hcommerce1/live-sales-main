<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { MOCK_DATA } from './data.js'
import { API } from './api.js'
import Sortable from 'sortablejs'
import Chart from 'chart.js/auto'
import emailjs from '@emailjs/browser'

// Export Wizard components
import ExportWizard from './components/ExportWizard.vue'

// Initialize EmailJS
emailjs.init("AJZSalcoaqOoF-Qxe")

// Auth state - MUST be checked before showing any content
const isAuthChecking = ref(true)
const isAuthenticated = ref(false)

// State
const currentPage = ref('dashboard')
const searchQuery = ref('')
const expandedGroups = ref(['Podstawowe', 'Dane klienta', 'Magazyn'])
const editingName = ref(false)
const accordionOpen = ref('filters')
const showPreviewModal = ref(false)
const deleteConfirm = ref(null)
const scheduleValue = ref('15-minutes')

const config = ref({
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
})

const toast = ref({
    show: false,
    title: '',
    message: '',
    icon: ''
})

const buyForm = ref({
    email: '',
    nip: '',
    phone: '',
    message: ''
})

let sortable = null
const sheetUrlValid = ref(null)
const extractedSheetId = ref(null)

// Live stats
const currentTime = ref(new Date())
const lastSyncTime = ref(new Date(Date.now() - 2 * 60 * 1000))
const uptime = ref(99.8)
let uptimeChart = null

// Server data
const exportsListServer = ref([])
const isLoading = ref(false)

// === Export Wizard State ===
const wizardEditingExportId = ref(null)  // null = new export, string = editing existing

// Configuration page
const baselinkerToken = ref('')
const showToken = ref(false)
const tokenSaved = ref(false)
let tokenSaveTimeout = null
const userEmail = ref('')

// === PR F3: Multi-company, Team, Billing ===
// Company state
const companies = ref([])
const company = ref(null)

// Team state
const teamMembers = ref([])
const teamInviteEmail = ref('')
const teamInviteRole = ref('member')
const teamInviteLoading = ref(false)

// Subscription & Billing state
const subscription = ref(null)
const plans = ref([])
const capabilities = ref(null)
const billingLoading = ref(false)
const hasStripeCustomer = ref(false) // Czy firma ma konto Stripe (może otwierać portal)

// Trial status
const trialStatus = ref(null)

// === Billing UI States (PR F3.1) ===

// Stała: statusy wymagające akcji płatniczej
const PAYMENT_ISSUE_STATUSES = ['past_due', 'incomplete', 'unpaid', 'incomplete_expired']

// Modal states
const showCancelConfirm = ref(false)
const showReactivateConfirm = ref(false)
const showTrialStartConfirm = ref(false)
const pendingPlanChange = ref(null) // { planId, interval, planName, price }

// Loading states per action (prevent double-clicks)
const cancelLoading = ref(false)
const reactivateLoading = ref(false)
const trialStartLoading = ref(false)
const checkoutLoading = ref(false)
const portalLoading = ref(false)

// Billing interval toggle
const selectedInterval = ref('monthly')

// Error handling with recovery (type + payload pattern)
const billingError = ref(null) // { message, action?: { type, ...payload } }

// Stripe return handling
const billingStatusChecking = ref(false)
const stripeRetryAbort = ref(null)
const showManualRefreshBanner = ref(false)

// Member role (for cancel/reactivate visibility)
const memberRole = ref(null)
const memberRoleLoading = ref(true) // MUSI być true na start - zapobiega flashowi przycisków

// Computed
const exportsList = computed(() => {
    // Return server data only - no more mock fallback
    return exportsListServer.value
})

const activeExportsCount = computed(() => {
    return exportsList.value.filter(e => e.status === 'active').length
})

const availableFields = computed(() => {
    return config.value.dataset === 'orders'
        ? MOCK_DATA.fieldsOrders
        : MOCK_DATA.fieldsProducts
})

const sampleData = computed(() => {
    return config.value.dataset === 'orders'
        ? MOCK_DATA.sampleOrders
        : MOCK_DATA.sampleProducts
})

// === Billing Banner Priority ===
// Priorytet: payment_issue > cancel_scheduled > manual_refresh
const activeBillingBanner = computed(() => {
    // Priorytet 1: Problem z płatnością (wymaga natychmiastowej akcji)
    if (subscription.value && PAYMENT_ISSUE_STATUSES.includes(subscription.value.status)) {
        return 'payment_issue'
    }

    // Priorytet 2: Anulowanie zaplanowane (info, ale ważne)
    if (subscription.value?.cancelAtPeriodEnd) {
        return 'cancel_scheduled'
    }

    // Priorytet 3: Manual refresh (fallback po timeout Stripe)
    if (showManualRefreshBanner.value) {
        return 'manual_refresh'
    }

    return null
})

const filteredGroups = computed(() => {
    const groups = {}

    availableFields.value
        .filter(field => {
            if (!searchQuery.value) return true
            const query = searchQuery.value.toLowerCase()
            return field.label.toLowerCase().includes(query) ||
                   field.field_key.toLowerCase().includes(query)
        })
        .forEach(field => {
            if (!groups[field.group]) {
                groups[field.group] = []
            }
            groups[field.group].push(field)
        })

    return Object.entries(groups).map(([name, fields]) => ({ name, fields }))
})

const previewTableData = computed(() => {
    let data = [...sampleData.value]

    if (config.value.dataset === 'orders' && config.value.filters.status) {
        data = data.filter(r => r.order_status_id === config.value.filters.status)
    }

    if (config.value.filters.date_from) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate >= config.value.filters.date_from
        })
    }

    if (config.value.filters.date_to) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate <= config.value.filters.date_to
        })
    }

    return data.slice(0, 5)
})

const csvPreview = computed(() => {
    if (config.value.selected_fields.length === 0) return ''

    const data = previewTableData.value
    const headers = config.value.selected_fields.map(fieldKey => {
        const field = availableFields.value.find(f => f.field_key === fieldKey)
        return field ? field.label : fieldKey
    })

    const lines = [headers.join(';')]

    data.forEach(record => {
        const row = config.value.selected_fields.map(fieldKey => {
            const value = record[fieldKey] || ''
            const escaped = String(value).replace(/"/g, '""')
            return escaped.includes(';') ? `"${escaped}"` : escaped
        })
        lines.push(row.join(';'))
    })

    return lines.join('\n')
})

const recordCount = computed(() => {
    let data = [...sampleData.value]

    if (config.value.dataset === 'orders' && config.value.filters.status) {
        data = data.filter(r => r.order_status_id === config.value.filters.status)
    }

    if (config.value.filters.date_from) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate >= config.value.filters.date_from
        })
    }

    if (config.value.filters.date_to) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate <= config.value.filters.date_to
        })
    }

    return data.length
})

const lastSyncText = computed(() => {
    const diff = Math.floor((currentTime.value - lastSyncTime.value) / 1000)
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60

    if (minutes === 0) {
        return `${seconds} sek temu`
    }
    return `${minutes} min ${seconds} sek temu`
})

const ordersToday = computed(() => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()

    if (hour < 7) {
        return Math.floor((hour * 60 + minute) / (7 * 60) * 30)
    }

    const minutesSince7 = (hour - 7) * 60 + minute
    const totalMinutesAfter7 = 17 * 60
    return 30 + Math.floor((minutesSince7 / totalMinutesAfter7) * 253)
})

const runsToday = computed(() => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const totalMinutes = hour * 60 + minute
    return Math.floor(totalMinutes / 5)
})

// Methods
async function loadExportsFromServer() {
    try {
        isLoading.value = true
        const exports = await API.exports.getAll()
        exportsListServer.value = exports.map(exp => ({
            id: exp.id,
            name: exp.name,
            type: exp.dataset,
            interval: exp.schedule_minutes,
            sheets_tab: 'Sheet1',
            status: exp.status || 'active',
            last_run: exp.last_run || new Date().toISOString().slice(0, 19).replace('T', ' '),
            uptime: (99.5 + Math.random() * 0.5).toFixed(1),
            sheet_url: exp.sheets?.sheet_url || ''
        }))
    } catch (error) {
        console.error('Failed to load exports:', error)
        showToast(
            'Błąd',
            'Nie udało się załadować eksportów z serwera',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function saveConfigToServer() {
    try {
        isLoading.value = true
        const savedConfig = await API.exports.save(config.value)

        await loadExportsFromServer()

        showToast(
            'Zapisano',
            'Konfiguracja została zapisana pomyślnie na serwerze',
            '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        )

        return savedConfig
    } catch (error) {
        console.error('Failed to save config:', error)
        showToast(
            'Błąd',
            'Nie udało się zapisać konfiguracji: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        throw error
    } finally {
        isLoading.value = false
    }
}

async function deleteExportFromServer(exportId) {
    try {
        isLoading.value = true
        await API.exports.delete(exportId)

        await loadExportsFromServer()

        deleteConfirm.value = null
        showToast(
            'Usunięto',
            'Eksport został pomyślnie usunięty z serwera',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>'
        )
    } catch (error) {
        console.error('Failed to delete export:', error)
        showToast(
            'Błąd',
            'Nie udało się usunąć eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function runExportOnServer() {
    if (config.value.id === 'new') {
        showToast(
            'Informacja',
            'Zapisz konfigurację przed uruchomieniem eksportu',
            '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        )
        return
    }

    try {
        isLoading.value = true
        lastSyncTime.value = new Date()

        const result = await API.exports.run(config.value.id)

        showToast(
            'Sukces',
            `Eksport zakończony! Zapisano ${result.recordCount} rekordów do Google Sheets`,
            '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        )
    } catch (error) {
        console.error('Failed to run export:', error)
        showToast(
            'Błąd',
            'Nie udało się uruchomić eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function toggleExportStatusOnServer(exp) {
    try {
        isLoading.value = true
        await API.exports.toggle(exp.id)

        await loadExportsFromServer()
    } catch (error) {
        console.error('Failed to toggle export status:', error)
        showToast(
            'Błąd',
            'Nie udało się zmienić statusu eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function loadExportFromServer(exportId) {
    try {
        isLoading.value = true
        const exportConfig = await API.exports.get(exportId)

        config.value = {
            id: exportConfig.id,
            name: exportConfig.name,
            dataset: exportConfig.dataset,
            selected_fields: exportConfig.selected_fields || [],
            filters: exportConfig.filters || { status: '', date_from: '', date_to: '' },
            sheets: exportConfig.sheets || { sheet_url: '', write_mode: 'append' },
            schedule_minutes: exportConfig.schedule_minutes || 15,
            status: exportConfig.status || 'active'
        }

        const mins = config.value.schedule_minutes
        if (mins === 0) {
            scheduleValue.value = 'live'
        } else if (mins < 60) {
            scheduleValue.value = `${mins}-minutes`
        } else if (mins < 1440) {
            scheduleValue.value = `${mins / 60}-hours`
        } else {
            scheduleValue.value = `${mins / 1440}-days`
        }

        validateSheetUrl()
        currentPage.value = 'konfigurator'
        nextTick(() => {
            initSortable()
        })
    } catch (error) {
        console.error('Failed to load export:', error)
        showToast(
            'Błąd',
            'Nie udało się załadować eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function validateSheetUrlOnServer() {
    const url = config.value.sheets.sheet_url
    if (!url) {
        sheetUrlValid.value = null
        extractedSheetId.value = null
        return
    }

    try {
        const result = await API.sheets.validate(url)
        sheetUrlValid.value = result.hasAccess
        extractedSheetId.value = result.sheetId

        if (!result.hasAccess) {
            showToast(
                'Uwaga',
                'Brak dostępu do arkusza. Upewnij się, że udostępniłeś arkusz dla Service Account.',
                '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
            )
        }
    } catch (error) {
        sheetUrlValid.value = false
        extractedSheetId.value = null
        console.error('Sheet validation error:', error)
    }
}

function toggleGroup(groupName) {
    const index = expandedGroups.value.indexOf(groupName)
    if (index > -1) {
        expandedGroups.value.splice(index, 1)
    } else {
        expandedGroups.value.push(groupName)
    }
}

function toggleAccordion(section) {
    accordionOpen.value = accordionOpen.value === section ? null : section
}

function isFieldSelected(fieldKey) {
    return config.value.selected_fields.includes(fieldKey)
}

function handleFieldClick(field) {
    if (field.higher_plan) {
        currentPage.value = 'buy'
        scrollToForm()
    } else if (!isFieldSelected(field.field_key)) {
        addField(field.field_key)
    }
}

function addField(fieldKey) {
    if (!isFieldSelected(fieldKey)) {
        config.value.selected_fields.push(fieldKey)
        nextTick(() => {
            initSortable()
        })
    }
}

function removeField(fieldKey) {
    const index = config.value.selected_fields.indexOf(fieldKey)
    if (index > -1) {
        config.value.selected_fields.splice(index, 1)
    }
}

function getFieldLabel(fieldKey) {
    const field = availableFields.value.find(f => f.field_key === fieldKey)
    return field ? field.label : fieldKey
}

function onDatasetChange() {
    config.value.selected_fields = []
}

function updateSchedule() {
    if (scheduleValue.value === 'live') {
        config.value.schedule_minutes = 0
        return
    }

    const [value, unit] = scheduleValue.value.split('-')
    if (unit === 'minutes') {
        config.value.schedule_minutes = parseInt(value)
    } else if (unit === 'hours') {
        config.value.schedule_minutes = parseInt(value) * 60
    } else if (unit === 'days') {
        config.value.schedule_minutes = parseInt(value) * 1440
    }
}

function validateSheetUrl() {
    const url = config.value.sheets.sheet_url
    if (!url) {
        sheetUrlValid.value = null
        extractedSheetId.value = null
        return
    }

    const pattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    const match = url.match(pattern)

    if (match) {
        extractedSheetId.value = match[1]

        const gidMatch = url.match(/[?#]gid=(\d+)/)
        if (gidMatch) {
            extractedSheetId.value += ` (Sheet ID: ${gidMatch[1]})`
        }

        validateSheetUrlOnServer()
    } else {
        sheetUrlValid.value = false
        extractedSheetId.value = null
    }
}

async function saveConfig() {
    await saveConfigToServer()
}

function createNewExport() {
    // Open the new export wizard instead of old configurator
    wizardEditingExportId.value = null
    currentPage.value = 'wizard'
}

// Legacy function for old configurator (kept for backwards compatibility)
function createNewExportLegacy() {
    const newId = 'export-' + Date.now()
    config.value = {
        id: newId,
        name: 'Nowy eksport',
        dataset: 'orders',
        selected_fields: [],
        filters: { status: '', date_from: '', date_to: '' },
        sheets: { sheet_url: '', write_mode: 'append' },
        schedule_minutes: 15,
        status: 'active'
    }
    scheduleValue.value = '15-minutes'
    sheetUrlValid.value = null
    extractedSheetId.value = null
    currentPage.value = 'konfigurator'
    nextTick(() => {
        initSortable()
    })
}

function loadExport(exportId) {
    loadExportFromServer(exportId)
}

// === Export Wizard Handlers ===
async function handleWizardSave(exportConfig) {
    try {
        isLoading.value = true
        console.log('=== WIZARD SAVE START ===')

        // Check if this is a NEW export (not editing existing one)
        const isNewExport = !wizardEditingExportId.value
        console.log('isNewExport:', isNewExport, 'wizardEditingExportId:', wizardEditingExportId.value)

        // Transform wizard config to API format
        const apiConfig = {
            id: wizardEditingExportId.value || ('export-' + Date.now()),
            name: exportConfig.name,
            description: exportConfig.description || '',
            dataset: exportConfig.dataset,
            selected_fields: exportConfig.selectedFields,
            filters: exportConfig.filters,
            schedule_minutes: exportConfig.scheduleMinutes,
            status: 'active',
            sheets: exportConfig.sheets.map(sheet => ({
                sheet_url: sheet.sheet_url,
                write_mode: sheet.write_mode || 'replace'
            }))
        }
        console.log('apiConfig prepared:', JSON.stringify(apiConfig, null, 2))

        // Save via API
        console.log('Calling API.exports.save...')
        const saveResult = await API.exports.save(apiConfig)
        console.log('Save result:', saveResult)

        console.log('Calling loadExportsFromServer...')
        await loadExportsFromServer()
        console.log('loadExportsFromServer completed')

        // If this is a NEW export, run it immediately to populate data
        if (isNewExport) {
            console.log('=== AUTO-RUN: Starting first export run ===')
            console.log('Export ID for run:', apiConfig.id)

            showToast(
                'Zapisano',
                'Eksport zapisany. Trwa pierwsze uruchomienie...',
                '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>'
            )

            try {
                console.log('Calling API.exports.run with ID:', apiConfig.id)
                const result = await API.exports.run(apiConfig.id)
                console.log('=== AUTO-RUN SUCCESS ===', result)
                showToast(
                    'Sukces',
                    `Eksport uruchomiony! Zapisano ${result?.recordsWritten || 0} rekordów do arkusza.`,
                    '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                )
            } catch (runError) {
                console.error('=== AUTO-RUN FAILED ===', runError)
                showToast(
                    'Uwaga',
                    'Eksport zapisany, ale pierwsze uruchomienie nie powiodło się: ' + runError.message,
                    '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
                )
            }
        } else {
            console.log('=== EDITING EXISTING EXPORT - no auto-run ===')
            showToast(
                'Zapisano',
                'Eksport został zapisany pomyślnie',
                '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
            )
        }

        // Return to exports list
        console.log('=== WIZARD SAVE COMPLETE - returning to exports list ===')
        currentPage.value = 'exports'
        wizardEditingExportId.value = null
    } catch (error) {
        console.error('=== WIZARD SAVE FAILED ===', error)
        showToast(
            'Błąd',
            'Nie udało się zapisać eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

function handleWizardCancel() {
    // Return to exports list without saving
    currentPage.value = 'exports'
    wizardEditingExportId.value = null
}

async function handleWizardSaveDraft(draftConfig) {
    // Save as draft when user exits with some data selected
    try {
        const apiConfig = {
            id: 'draft-' + Date.now(),
            name: draftConfig.name || 'Szkic eksportu',
            description: draftConfig.description || '',
            dataset: draftConfig.dataset,
            selected_fields: draftConfig.selectedFields || [],
            filters: draftConfig.filters || { logic: 'AND', groups: [] },
            schedule_minutes: draftConfig.scheduleMinutes || 15,
            status: 'draft',
            sheets: draftConfig.sheets?.map(sheet => ({
                sheet_url: sheet.sheet_url || '',
                write_mode: sheet.write_mode || 'replace'
            })) || []
        }

        await API.exports.save(apiConfig)
        await loadExportsFromServer()

        showToast(
            'Szkic zapisany',
            'Eksport został zapisany jako szkic',
            '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        )
    } catch (error) {
        console.error('Failed to save draft:', error)
    }

    currentPage.value = 'exports'
    wizardEditingExportId.value = null
}

function editExportInWizard(exportId) {
    // Open wizard for editing existing export
    wizardEditingExportId.value = exportId
    currentPage.value = 'wizard'
}

function confirmDelete(exportId) {
    deleteConfirm.value = exportId
}

function deleteExport(exportId) {
    deleteExportFromServer(exportId)
}

function toggleExportStatus(exp) {
    toggleExportStatusOnServer(exp)
}

function runExport() {
    runExportOnServer()
}

function downloadCsv() {
    const blob = new Blob([csvPreview.value], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${config.value.name || 'export'}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

function formatLastRun(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return `${diff} sek temu`
    if (diff < 3600) return `${Math.floor(diff / 60)} min temu`
    if (diff < 86400) return `${Math.floor(diff / 3600)} godz temu`
    return `${Math.floor(diff / 86400)} dni temu`
}

function showToast(title, message, icon) {
    toast.value = { show: true, title, message, icon }
    setTimeout(() => {
        toast.value.show = false
    }, 3000)
}

function formatNip() {
    let nip = buyForm.value.nip.replace(/\D/g, '')
    nip = nip.substring(0, 10)

    if (nip.length > 6) {
        buyForm.value.nip = nip.substring(0, 3) + '-' + nip.substring(3, 6) + '-' + nip.substring(6, 8) + '-' + nip.substring(8)
    } else if (nip.length > 3) {
        buyForm.value.nip = nip.substring(0, 3) + '-' + nip.substring(3)
    } else {
        buyForm.value.nip = nip
    }
}

function scrollToForm() {
    nextTick(() => {
        const form = document.getElementById('contact-form')
        if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    })
}

async function submitBuyForm() {
    const nipDigits = buyForm.value.nip.replace(/\D/g, '')
    if (nipDigits.length !== 10) {
        showToast(
            'Błąd',
            'NIP musi zawierać dokładnie 10 cyfr',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        return
    }

    try {
        await emailjs.send(
            'service_cde8vm8',
            'template_abtm78k',
            {
                email: buyForm.value.email,
                nip: buyForm.value.nip,
                phone: buyForm.value.phone,
                message: buyForm.value.message || 'Brak wiadomości',
                timestamp: new Date().toLocaleString('pl-PL', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            }
        )
    } catch (error) {
        console.error('Email error:', error)
        showToast(
            'Błąd',
            'Nie udało się wysłać formularza. Spróbuj ponownie.',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        return
    }

    showToast(
        'Wysłano',
        'Dziękujemy! Skontaktujemy się wkrótce.',
        '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
    )

    buyForm.value = { email: '', nip: '', phone: '', message: '' }
}

function initSortable() {
    const el = document.getElementById('sortable-list')
    if (!el) return

    if (sortable) {
        sortable.destroy()
    }

    sortable = Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex

            const item = config.value.selected_fields.splice(oldIndex, 1)[0]
            config.value.selected_fields.splice(newIndex, 0, item)
        }
    })
}

function initUptimeChart() {
    const canvas = document.getElementById('uptimeChart')
    if (!canvas) return

    const data = []
    for (let i = 0; i < 30; i++) {
        data.push(99.5 + Math.random() * 0.5)
    }

    const ctx = canvas.getContext('2d')

    if (uptimeChart) {
        uptimeChart.destroy()
    }

    uptimeChart = new Chart(ctx, {
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
    })
}

function updateTime() {
    currentTime.value = new Date()
}

async function onTokenChange() {
    if (tokenSaveTimeout) {
        clearTimeout(tokenSaveTimeout)
    }

    tokenSaveTimeout = setTimeout(async () => {
        await saveBaselinkerToken()
    }, 1000)
}

async function saveBaselinkerToken() {
    if (!baselinkerToken.value || baselinkerToken.value.trim() === '') {
        return
    }

    try {
        // Use API.request to include X-Company-Id header automatically
        await API.request('/api/user/baselinker-token', {
            method: 'POST',
            body: JSON.stringify({
                token: baselinkerToken.value
            })
        })

        tokenSaved.value = true
        setTimeout(() => {
            tokenSaved.value = false
        }, 3000)
    } catch (error) {
        console.error('Error saving BaseLinker token:', error)
        showToast('Błąd', 'Nie udało się zapisać tokenu', 'error')
    }
}

async function loadBaselinkerToken() {
    try {
        // Use API.request to include X-Company-Id header automatically
        const data = await API.request('/api/user/baselinker-token')

        if (data.token) {
            baselinkerToken.value = data.token
        }
    } catch (error) {
        console.error('Error loading BaseLinker token:', error)
    }
}

async function loadUserEmail() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        userEmail.value = user.email || 'demo@example.com'
    } catch (error) {
        console.error('Error loading user email:', error)
        userEmail.value = 'demo@example.com'
    }
}

function logout() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    localStorage.removeItem('activeCompanyId')
    window.location.href = '/login.html'
}

// === PR F3: Company, Team, Billing Methods ===

// --- Company Methods ---
async function loadCompanies() {
    try {
        const result = await API.company.getMyCompanies()
        companies.value = result.companies || []

        // Set active company if not set
        const activeId = API.getActiveCompanyId()
        if (companies.value.length > 0) {
            if (!activeId || !companies.value.find(c => c.id === activeId)) {
                selectCompany(companies.value[0].id)
            } else {
                await loadCompanyDetails(activeId)
            }
        } else {
            // No companies yet - user needs to register one
            console.log('No companies found. User should register a company first.')
        }
    } catch (error) {
        console.error('Failed to load companies:', error)
        // Backend may not have company endpoints yet - this is expected during development
        companies.value = []
    }
}

async function loadCompanyDetails(companyId) {
    try {
        const result = await API.company.get(companyId)
        company.value = result.company
        subscription.value = result.subscription
    } catch (error) {
        console.error('Failed to load company details:', error)
    }
}

function selectCompany(companyId) {
    API.setActiveCompanyId(companyId)
    loadCompanyDetails(companyId)
    // Reload data for new company context
    loadExportsFromServer()
    loadTeamMembers()
    loadSubscription()
    loadCapabilities()
}

// --- Team Methods ---
async function loadTeamMembers() {
    try {
        const result = await API.team.getMembers()
        teamMembers.value = result.members || []
    } catch (error) {
        console.error('Failed to load team members:', error)
        teamMembers.value = []
    }
}

async function inviteTeamMember() {
    if (!API.getActiveCompanyId()) {
        showToast('Błąd', 'Najpierw zarejestruj lub wybierz firmę', '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
        return
    }

    if (!teamInviteEmail.value) {
        showToast('Błąd', 'Wprowadź adres email', '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
        return
    }

    try {
        teamInviteLoading.value = true
        await API.team.invite(teamInviteEmail.value, teamInviteRole.value)

        showToast('Sukces', `Zaproszenie wysłane do ${teamInviteEmail.value}`, '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')

        teamInviteEmail.value = ''
        teamInviteRole.value = 'member'
        await loadTeamMembers()
    } catch (error) {
        console.error('Failed to invite team member:', error)
        showToast('Błąd', error.message || 'Nie udało się wysłać zaproszenia', '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
    } finally {
        teamInviteLoading.value = false
    }
}

async function changeTeamMemberRole(memberId, newRole) {
    try {
        await API.team.changeRole(memberId, newRole)
        showToast('Sukces', 'Rola została zmieniona', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')
        await loadTeamMembers()
    } catch (error) {
        console.error('Failed to change role:', error)
        showToast('Błąd', error.message || 'Nie udało się zmienić roli', '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
    }
}

async function removeTeamMember(memberId) {
    if (!confirm('Czy na pewno chcesz usunąć tego członka zespołu?')) return

    try {
        await API.team.remove(memberId)
        showToast('Sukces', 'Członek zespołu został usunięty', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')
        await loadTeamMembers()
    } catch (error) {
        console.error('Failed to remove team member:', error)
        showToast('Błąd', error.message || 'Nie udało się usunąć członka zespołu', '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
    }
}

// --- Billing Methods ---
async function loadPlans() {
    try {
        const result = await API.billing.getPlans()
        plans.value = result.plans || []
    } catch (error) {
        console.error('Failed to load plans:', error)
        plans.value = []
    }
}

async function loadSubscription() {
    try {
        const result = await API.billing.getSubscription()
        subscription.value = result.subscription
        hasStripeCustomer.value = result.hasStripeCustomer || false
    } catch (error) {
        console.error('Failed to load subscription:', error)
        subscription.value = null
        hasStripeCustomer.value = false
    }
}

async function loadCapabilities() {
    try {
        const result = await API.features.getCapabilities()
        capabilities.value = result
    } catch (error) {
        console.error('Failed to load capabilities:', error)
        capabilities.value = null
    }
}

async function loadTrialStatus() {
    try {
        const result = await API.billing.getTrialStatus()
        trialStatus.value = result
    } catch (error) {
        console.error('Failed to load trial status:', error)
        trialStatus.value = null
    }
}

// === Billing Helpers ===

// Helper: normalizuj ID użytkownika (różne źródła mogą mieć różne nazwy pól)
function getUserId(userObj) {
    if (!userObj) return null
    return userObj.id || userObj.userId || userObj.user_id || null
}

// Helper: abortable sleep (nie tworzy wielu listenerów)
function sleepAbortable(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            return reject(new Error('Aborted'))
        }
        const timeout = setTimeout(resolve, ms)
        const onAbort = () => {
            clearTimeout(timeout)
            reject(new Error('Aborted'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

// Helper: jeden punkt zakończenia retry
function finishStripeCheck(showManualBanner = false) {
    billingStatusChecking.value = false
    stripeRetryAbort.value = null
    if (showManualBanner) {
        showManualRefreshBanner.value = true
    }
}

// Helper: bezpieczne usuwanie query params (zachowaj hash i inne params)
function cleanBillingParams() {
    const url = new URL(window.location.href)
    url.searchParams.delete('session_id')
    url.searchParams.delete('billing')
    window.history.replaceState({}, document.title, url.toString())
}

// Helper: bezpieczne odświeżanie danych billing (subscription krytyczny, reszta allSettled)
async function refreshBillingDataSafe() {
    // KRYTYCZNE: subscription musi się udać
    try {
        await loadSubscription()
    } catch (error) {
        console.error('Failed to load subscription:', error)
        setBillingError(
            'Nie udało się pobrać danych subskrypcji',
            { type: 'retry_refresh' }
        )
        return false
    }

    // BEST-EFFORT: capabilities i trial (nie blokują UI)
    const results = await Promise.allSettled([
        loadCapabilities(),
        loadTrialStatus()
    ])

    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
        console.warn('Partial billing data refresh failed:', failed)
    }

    return true
}

// Load member role for current user
async function loadMemberRole() {
    // Nie ustawiaj true tutaj - już jest true na start
    try {
        const result = await API.team.getMembers()
        const members = result.members || result.data || []
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        const currentUserId = getUserId(user)

        if (currentUserId && members) {
            const currentMember = members.find(m => {
                const memberId = getUserId(m) || getUserId(m.user)
                return memberId === currentUserId
            })
            memberRole.value = currentMember?.role || null
        }
    } catch (error) {
        console.error('Failed to load member role:', error)
        memberRole.value = null
    } finally {
        memberRoleLoading.value = false
    }
}

// === Billing Error Handling (type + payload pattern) ===
function setBillingError(message, action = null) {
    billingError.value = { message, action }
}

function clearBillingError() {
    billingError.value = null
}

// Dispatcher z walidacją dla recovery actions
function handleBillingErrorAction() {
    const action = billingError.value?.action
    if (!action) return

    clearBillingError()

    switch (action.type) {
        case 'retry_plan_change':
            // Walidacja: czy plan nadal istnieje?
            const plan = plans.value.find(p => p.id === action.planId)
            if (!plan) {
                setBillingError('Plan nie jest już dostępny. Odśwież stronę.')
                return
            }
            requestPlanChange(action.planId)
            break

        case 'retry_cancel':
            showCancelConfirm.value = true
            break

        case 'retry_reactivate':
            showReactivateConfirm.value = true
            break

        case 'retry_trial':
            showTrialStartConfirm.value = true
            break

        case 'retry_refresh':
            manualRefreshBilling()
            break

        case 'open_portal':
            openBillingPortal()
            break

        default:
            console.warn('Unknown billing error action:', action.type)
    }
}

// === Stripe Return Handling with Retry ===
async function handleStripeReturn() {
    const urlParams = new URLSearchParams(window.location.search)
    const sessionId = urlParams.get('session_id')
    const billingSuccess = urlParams.get('billing') === 'success'
    const billingCanceled = urlParams.get('billing') === 'canceled'

    if (!sessionId && !billingSuccess && !billingCanceled) return

    // Wyczyść tylko billing params (zachowaj inne np. utm_source)
    cleanBillingParams()

    if (billingCanceled) {
        showToast('Anulowano', 'Płatność została anulowana', '<svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>')
        return
    }

    // Abort poprzedniego retry jeśli istnieje (np. user wrócił 2x)
    stripeRetryAbort.value?.abort()

    // Utwórz nowy AbortController
    const controller = new AbortController()
    stripeRetryAbort.value = controller

    billingStatusChecking.value = true
    showManualRefreshBanner.value = false  // reset bannera
    currentPage.value = 'subscription'

    const maxRetries = 6
    const baseDelay = 2000  // łącznie ~42s max

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await sleepAbortable(baseDelay * attempt, controller.signal)
        } catch (e) {
            // Aborted - czyste wyjście bez side effects
            finishStripeCheck(false)
            return
        }

        // Drugie sprawdzenie po sleep (na wypadek abortu tuż przed)
        if (controller.signal.aborted) {
            finishStripeCheck(false)
            return
        }

        try {
            await loadSubscription()

            const sub = subscription.value
            if (!sub) continue  // Brak subskrypcji - kontynuuj retry

            // SUKCES: aktywny/trialing
            if (sub.status === 'active' || sub.status === 'trialing') {
                finishStripeCheck(false)
                showToast('Sukces', 'Płatność została przetworzona!', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')
                await refreshBillingDataSafe()
                return
            }

            // DECYZYJNY STAN: payment issue - zakończ retry, UI pokaże banner
            if (PAYMENT_ISSUE_STATUSES.includes(sub.status)) {
                finishStripeCheck(false)  // Bez manual banner - payment_issue ma priorytet
                return
            }

            // DECYZYJNY STAN: anulowana lub zaplanowane anulowanie
            if (sub.status === 'canceled' || sub.cancelAtPeriodEnd) {
                finishStripeCheck(false)  // Stabilny stan
                return
            }

            // Inny status (np. w trakcie 3DS) - kontynuuj retry
        } catch (error) {
            console.error(`Subscription check attempt ${attempt} failed:`, error)
            // Kontynuuj retry
        }
    }

    // Timeout - pokaż manual refresh banner TYLKO gdy nie mamy żadnego decyzyjnego stanu
    finishStripeCheck(true)
}

// === Manual Refresh Billing ===
async function manualRefreshBilling() {
    // Guard na double-click
    if (billingStatusChecking.value) return

    billingStatusChecking.value = true
    try {
        const success = await refreshBillingDataSafe()

        if (success) {
            const sub = subscription.value

            // Schowaj manual banner gdy mamy jakikolwiek "decyzyjny" stan
            const hasDecisiveState = sub && (
                PAYMENT_ISSUE_STATUSES.includes(sub.status) ||
                sub.cancelAtPeriodEnd ||
                ['active', 'trialing', 'canceled'].includes(sub.status)
            )

            if (hasDecisiveState) {
                showManualRefreshBanner.value = false

                // Toast tylko dla sukcesu
                if (sub.status === 'active' || sub.status === 'trialing') {
                    showToast('Sukces', 'Subskrypcja aktywna!', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')
                }
            }
        }
    } finally {
        billingStatusChecking.value = false
    }
}

// === Plan Change Modal Flow ===
function requestPlanChange(planId) {
    if (checkoutLoading.value) return

    const plan = plans.value.find(p => p.id === planId)
    if (!plan) return

    // Guard: nie otwieraj modala jeśli plan niedostępny dla interwału
    if (!isPlanAvailableForInterval(plan)) {
        console.warn('Plan not available for selected interval:', planId, selectedInterval.value)
        return
    }

    // Freeze values at request time
    const interval = selectedInterval.value
    const price = interval === 'monthly' ? plan.price?.monthly : plan.price?.yearly

    pendingPlanChange.value = {
        planId,
        interval,
        planName: plan.name || planId,
        price: price || '—'  // Nie powinno być '—' bo mamy guard, ale safety
    }
}

async function confirmPlanChange() {
    if (!pendingPlanChange.value || checkoutLoading.value) return

    const { planId, interval } = pendingPlanChange.value

    try {
        checkoutLoading.value = true
        clearBillingError()

        const result = await API.billing.checkout(planId, interval)

        if (result.url) {
            window.location.href = result.url
        }
    } catch (error) {
        console.error('Failed to create checkout:', error)
        pendingPlanChange.value = null
        setBillingError(
            error.message || 'Nie udało się utworzyć sesji płatności',
            { type: 'retry_plan_change', planId }
        )
    } finally {
        checkoutLoading.value = false
    }
}

function cancelPlanChange() {
    pendingPlanChange.value = null
}

// === Trial Flow ===
async function startTrial() {
    if (trialStartLoading.value) return

    try {
        trialStartLoading.value = true
        clearBillingError()

        await API.billing.startTrial()

        showTrialStartConfirm.value = false
        showToast('Sukces', 'Okres próbny został aktywowany!', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')

        // Refresh all billing data safely (subscription krytyczny, reszta best-effort)
        await refreshBillingDataSafe()
    } catch (error) {
        console.error('Failed to start trial:', error)
        showTrialStartConfirm.value = false

        // Handle "trial already used" gracefully
        if (error.message?.includes('TRIAL_ALREADY_USED') || error.message?.includes('już został wykorzystany')) {
            // Refresh to show current state
            await loadTrialStatus()
            // Don't show error if trial was used - just show the updated UI
        } else {
            setBillingError(
                error.message || 'Nie udało się uruchomić okresu próbnego',
                { type: 'retry_trial' }
            )
        }
    } finally {
        trialStartLoading.value = false
    }
}

// === Cancel Subscription ===
async function confirmCancelSubscription() {
    if (cancelLoading.value) return

    try {
        cancelLoading.value = true
        clearBillingError()

        await API.billing.cancel()

        showCancelConfirm.value = false
        showToast('Subskrypcja anulowana', 'Twoja subskrypcja zostanie anulowana na koniec okresu rozliczeniowego.', '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>')

        await refreshBillingDataSafe()
    } catch (error) {
        console.error('Failed to cancel subscription:', error)
        showCancelConfirm.value = false

        // Handle 403 gracefully - no retry action for permission errors
        if (error.status === 403 || error.message?.includes('403')) {
            setBillingError('Tylko właściciel firmy może anulować subskrypcję.')
        } else {
            setBillingError(
                error.message || 'Nie udało się anulować subskrypcji',
                { type: 'retry_cancel' }
            )
        }
    } finally {
        cancelLoading.value = false
    }
}

// === Reactivate Subscription ===
async function confirmReactivateSubscription() {
    if (reactivateLoading.value) return

    try {
        reactivateLoading.value = true
        clearBillingError()

        await API.billing.reactivate()

        showReactivateConfirm.value = false
        showToast('Sukces', 'Twoja subskrypcja została reaktywowana!', '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>')

        await refreshBillingDataSafe()
    } catch (error) {
        console.error('Failed to reactivate subscription:', error)
        showReactivateConfirm.value = false

        // Handle 403 gracefully - no retry action for permission errors
        if (error.status === 403 || error.message?.includes('403')) {
            setBillingError('Tylko właściciel firmy może reaktywować subskrypcję.')
        } else {
            setBillingError(
                error.message || 'Nie udało się reaktywować subskrypcji',
                { type: 'retry_reactivate' }
            )
        }
    } finally {
        reactivateLoading.value = false
    }
}

// === Open Billing Portal ===
async function openBillingPortal() {
    if (portalLoading.value) return

    try {
        portalLoading.value = true
        clearBillingError()

        const result = await API.billing.getPortal()

        if (result.url) {
            window.location.href = result.url
        }
    } catch (error) {
        console.error('Failed to open billing portal:', error)
        setBillingError(
            error.message || 'Nie udało się otworzyć portalu płatności',
            { type: 'open_portal' }
        )
    } finally {
        portalLoading.value = false
    }
}

// === Helper: Calculate savings percentage from backend data ===
function getSavingsPercent(plan) {
    const monthlyRaw = plan?.price?.monthlyRaw
    const yearlyRaw = plan?.price?.yearlyRaw

    // Null/undefined/zero guards
    if (!monthlyRaw || !yearlyRaw || monthlyRaw <= 0) return null

    const monthlyAnnual = monthlyRaw * 12
    if (monthlyAnnual <= yearlyRaw) return null

    return Math.round((1 - yearlyRaw / monthlyAnnual) * 100)
}

// === Helper: Check if plan is available for selected interval ===
function isPlanAvailableForInterval(plan) {
    if (!plan?.price) return false

    if (selectedInterval.value === 'monthly') {
        return typeof plan.price.monthlyRaw === 'number' && plan.price.monthlyRaw > 0
    } else {
        return typeof plan.price.yearlyRaw === 'number' && plan.price.yearlyRaw > 0
    }
}

// === Helper: Get price for selected interval ===
function getPlanPrice(plan) {
    if (!plan?.price) return '—'
    if (!isPlanAvailableForInterval(plan)) return 'Niedostępne'

    return selectedInterval.value === 'monthly'
        ? plan.price.monthly
        : plan.price.yearly
}

// === Helper: Get original yearly price (12 × monthly) for strikethrough display ===
function getOriginalYearlyPrice(plan) {
    const monthlyRaw = plan?.price?.monthlyRaw
    if (!monthlyRaw || monthlyRaw <= 0) return null

    const originalYearly = monthlyRaw * 12
    // Format as PLN
    return `${originalYearly} zł`
}

// === Helper: Calculate trial days remaining (null-safe) ===
function getTrialDaysRemaining() {
    if (!subscription.value?.trialEnd) return null
    const diff = new Date(subscription.value.trialEnd) - new Date()
    if (diff <= 0) return 0
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// === Helper: Check if any billing action is loading ===
function isAnyBillingLoading() {
    return billingLoading.value || cancelLoading.value || reactivateLoading.value ||
           trialStartLoading.value || checkoutLoading.value || billingStatusChecking.value ||
           portalLoading.value
}

function getRoleBadgeClass(role) {
    switch (role) {
        case 'owner': return 'bg-purple-100 text-purple-800'
        case 'admin': return 'bg-blue-100 text-blue-800'
        default: return 'bg-gray-100 text-gray-800'
    }
}

function getRoleLabel(role) {
    switch (role) {
        case 'owner': return 'Właściciel'
        case 'admin': return 'Administrator'
        default: return 'Członek'
    }
}

function getSubscriptionStatusLabel(status) {
    switch (status) {
        case 'active': return 'Aktywna'
        case 'trialing': return 'Okres próbny'
        case 'past_due': return 'Zaległości'
        case 'canceled': return 'Anulowana'
        case 'incomplete': return 'Płatność w toku'
        case 'incomplete_expired': return 'Płatność wygasła'
        case 'unpaid': return 'Nieopłacona'
        default: return status
    }
}

function getSubscriptionStatusClass(status) {
    switch (status) {
        case 'active': return 'bg-green-100 text-green-800'
        case 'trialing': return 'bg-blue-100 text-blue-800'
        case 'past_due': return 'bg-yellow-100 text-yellow-800'
        case 'incomplete':
        case 'incomplete_expired':
        case 'unpaid':
        case 'canceled': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-800'
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

// Watchers
watch(currentPage, (newPage) => {
    if (newPage === 'konfigurator') {
        nextTick(() => {
            initSortable()
        })
    } else if (newPage === 'dashboard') {
        nextTick(() => {
            initUptimeChart()
        })
    } else if (newPage === 'exports') {
        loadExportsFromServer()
    } else if (newPage === 'config') {
        loadBaselinkerToken()
        loadUserEmail()
    } else if (newPage === 'team') {
        loadTeamMembers()
    } else if (newPage === 'subscription') {
        clearBillingError()
        loadPlans()
        loadSubscription()
        loadCapabilities()
        loadTrialStatus()
        loadMemberRole()
    }
})

// Lifecycle
onMounted(async () => {
    // Check authentication FIRST - before showing any content
    isAuthChecking.value = true

    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        const accessToken = localStorage.getItem('accessToken')

        if (!user || !accessToken) {
            // No credentials - redirect to login
            window.location.href = '/login.html'
            return
        }

        // Verify token is still valid by checking with server
        try {
            const health = await API.health()
            console.log('Server health:', health)
        } catch (error) {
            console.error('Server health check failed:', error)
            // Don't block auth for health check failure
        }

        // Authentication successful
        isAuthenticated.value = true
        isAuthChecking.value = false

        // Remove initial HTML loader now that auth is confirmed
        const initialLoader = document.getElementById('initial-loader')
        if (initialLoader) {
            initialLoader.classList.add('fade-out')
            setTimeout(() => initialLoader.remove(), 300)
        }

    } catch (error) {
        console.error('Auth check failed:', error)
        window.location.href = '/login.html'
        return
    }

    // Update time every second
    setInterval(() => {
        updateTime()
    }, 1000)

    // Init chart if on dashboard
    if (currentPage.value === 'dashboard') {
        nextTick(() => {
            initUptimeChart()
        })
    }

    // Load companies (PR F3)
    await loadCompanies()

    // Load exports from server
    await loadExportsFromServer()

    // Load user email
    await loadUserEmail()

    // Load capabilities (PR F3)
    await loadCapabilities()

    // Handle Stripe return (PR F3.1) - check URL params for billing success/cancel
    await handleStripeReturn()

    // Auto-refresh exports every 5 minutes
    setInterval(() => {
        if (currentPage.value === 'exports' || currentPage.value === 'dashboard') {
            loadExportsFromServer()
        }
    }, 5 * 60 * 1000)
})

// Cleanup on unmount - abort any pending Stripe retry
onBeforeUnmount(() => {
    stripeRetryAbort.value?.abort()
})
</script>

<template>
    <div id="app" v-cloak>
        <!-- Auth Loading Screen - shows while checking authentication -->
        <div v-if="isAuthChecking" class="fixed inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center z-[100]">
            <div class="text-center">
                <div class="w-20 h-20 mx-auto mb-6">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="animate-pulse">
                        <rect fill="white" width="100" height="100" rx="20"/>
                        <text x="50" y="72" font-size="55" font-weight="bold" fill="#2563eb" text-anchor="middle" font-family="Arial, sans-serif">LS</text>
                    </svg>
                </div>
                <div class="flex items-center justify-center gap-3 text-white">
                    <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-lg font-medium">Weryfikacja sesji...</span>
                </div>
            </div>
        </div>

        <!-- Main App Content - only shown when authenticated -->
        <template v-if="isAuthenticated && !isAuthChecking">
            <!-- Sidebar -->
            <div class="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-50">
            <div class="p-6">
                <div class="flex items-center gap-3">
                    <!-- Logo SVG -->
                    <div class="w-12 h-12">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                            <rect fill="url(#grad1)" width="100" height="100" rx="20"/>
                            <text x="50" y="72" font-size="55" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">LS</text>
                        </svg>
                    </div>
                    <div>
                        <div class="font-bold text-base">Live Sales</div>
                        <div class="text-xs text-gray-500">No-Code dla e-commerce</div>
                    </div>
                </div>

                <!-- Company Selector (PR F3) -->
                <div v-if="companies.length > 0" class="mt-4">
                    <select
                        :value="API.getActiveCompanyId()"
                        @change="selectCompany($event.target.value)"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:border-blue-500 focus:outline-none"
                    >
                        <option v-for="c in companies" :key="c.id" :value="c.id">
                            {{ c.name }}
                        </option>
                    </select>
                </div>
            </div>

            <nav class="flex-1 px-3 space-y-1 sidebar-nav overflow-y-auto">
                <a href="#" @click.prevent="currentPage = 'dashboard'" :class="{'active': currentPage === 'dashboard'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                    </svg>
                    Dashboard
                </a>
                <a href="#" @click.prevent="currentPage = 'exports'" :class="{'active': currentPage === 'exports'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Automatyczne eksporty
                </a>

                <div class="mt-4 mb-2 px-3">
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Firma</span>
                </div>

                <a href="#" @click.prevent="currentPage = 'team'" :class="{'active': currentPage === 'team'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    Zespół
                </a>
                <a href="#" @click.prevent="currentPage = 'subscription'" :class="{'active': currentPage === 'subscription'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                    </svg>
                    Subskrypcja
                </a>

                <div class="mt-4 mb-2 px-3">
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ustawienia</span>
                </div>

                <a href="#" @click.prevent="currentPage = 'config'" :class="{'active': currentPage === 'config'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    Konfiguracja
                </a>
            </nav>

            <div class="p-4 border-t border-gray-200">
                <div class="flex items-center gap-3 px-3 py-2">
                    <div class="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center">
                        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">{{ userEmail.split('@')[0] }}</div>
                        <div class="text-xs text-gray-500">{{ userEmail }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main content -->
        <div class="ml-0 md:ml-64 min-h-screen">
            <!-- Dashboard -->
            <div v-if="currentPage === 'dashboard'" class="p-4 md:p-8">
                <h1 class="text-2xl md:text-3xl font-bold mb-2">Dashboard</h1>
                <p class="text-gray-600 mb-6 md:mb-8">Przegląd integracji i synchronizacji</p>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Integracja BaseLinker</div>
                                <div class="text-xs md:text-sm text-green-600">Połączone</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Status: <strong>OK</strong></p>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Google Sheets</div>
                                <div class="text-xs md:text-sm text-blue-600">Gotowe</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Arkuszy: <strong>3</strong></p>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Ostatnia synchronizacja</div>
                                <div class="text-xs md:text-sm text-purple-600">{{ lastSyncText }}</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Uruchomień dziś: <strong>{{ runsToday }}</strong></p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Szybkie akcje</h3>
                        <div class="space-y-3">
                            <button @click="createNewExport" class="w-full bg-blue-600 text-white px-4 py-2.5 md:py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                                Nowy eksport
                            </button>
                            <button @click="currentPage = 'exports'" class="w-full bg-gray-100 text-gray-700 px-4 py-2.5 md:py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                Lista eksportów
                            </button>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Statystyki</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl font-bold text-blue-600">{{ ordersToday }}</div>
                                <div class="text-xs md:text-sm text-gray-600 mt-1">Zamówień dziś</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl font-bold text-blue-600">{{ activeExportsCount }}</div>
                                <div class="text-xs md:text-sm text-gray-600 mt-1">Aktywne eksporty</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom row: Exports list + Uptime -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <!-- Exports list -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Ostatnie eksporty</h3>
                        <div class="space-y-2">
                            <div v-for="exp in exportsList.slice(0, 3)" :key="exp.id" class="flex items-center justify-between p-2 md:p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                <div class="flex-1 min-w-0">
                                    <div class="text-xs md:text-sm font-medium truncate">{{ exp.name }}</div>
                                    <div class="text-xs text-gray-500">{{ formatLastRun(exp.last_run) }}</div>
                                </div>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2" :class="exp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'">
                                    {{ exp.status === 'active' ? 'Aktywny' : 'Wstrzymany' }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Mini uptime chart -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-base md:text-lg font-semibold">Uptime</h3>
                            <span class="text-xl md:text-2xl font-bold text-green-600">{{ uptime }}%</span>
                        </div>
                        <canvas id="uptimeChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- Lista eksportów -->
            <div v-if="currentPage === 'exports'" class="p-4 md:p-8">
                <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-bold mb-2">Automatyczne eksporty</h1>
                        <p class="text-sm md:text-base text-gray-600">Zarządzaj konfiguracjami wydruków</p>
                    </div>
                    <button @click="createNewExport" class="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        Nowy eksport
                    </button>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table class="w-full min-w-[800px]">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Typ</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uptime</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ostatnie uruchomienie</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arkusz</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            <tr v-for="exp in exportsList" :key="exp.id" class="hover:bg-gray-50">
                                <td class="px-4 md:px-6 py-4">
                                    <div class="font-medium text-sm">{{ exp.name }}</div>
                                    <div class="text-xs text-gray-500">{{ exp.id }}</div>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" :class="exp.type === 'orders' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'">
                                        {{ exp.type === 'orders' ? 'Zamówienia' : 'Produkty' }}
                                    </span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <button @click="toggleExportStatus(exp)" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors" :class="exp.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'">
                                        {{ exp.status === 'active' ? 'Aktywny' : 'Wstrzymany' }}
                                    </button>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="text-sm font-medium text-green-600">{{ exp.uptime }}%</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="text-sm text-gray-600">{{ formatLastRun(exp.last_run) }}</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <a v-if="exp.sheet_url" :href="exp.sheet_url" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                        </svg>
                                        Otwórz
                                    </a>
                                    <span v-else class="text-xs text-gray-400">Brak</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <button @click="editExportInWizard(exp.id)" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                            </svg>
                                            Edytuj
                                        </button>
                                        <button @click="confirmDelete(exp.id)" class="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                            Usuń
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Chcę kupić -->
            <div v-if="currentPage === 'buy'" class="p-4 md:p-8">
                <div class="max-w-5xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Chcę kupić</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Wybierz plan i wypełnij formularz</p>

                    <!-- Cennik -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                        <!-- Darmowy -->
                        <div class="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
                            <h3 class="text-lg font-bold mb-2">Darmowy</h3>
                            <div class="text-3xl font-bold text-gray-600 mb-4">0 zł</div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Podstawowe pola</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Ograniczona częstotliwość</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Limit eksportów</span>
                                </li>
                            </ul>
                        </div>

                        <!-- Business -->
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg border-2 border-blue-300 p-6 relative">
                            <div class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">POPULARNE</div>
                            <h3 class="text-lg font-bold mb-2">Business</h3>
                            <div class="text-3xl font-bold text-blue-600 mb-4">69 zł <span class="text-sm text-gray-600">/mies</span></div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Do 10 eksportów</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Wszystko na żywo</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Wszystkie pola</span>
                                </li>
                            </ul>
                        </div>

                        <!-- PRO -->
                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-lg border-2 border-purple-300 p-6">
                            <h3 class="text-lg font-bold mb-2">PRO</h3>
                            <div class="text-3xl font-bold text-purple-600 mb-4">99 zł <span class="text-sm text-gray-600">/mies</span></div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Do 25 eksportów</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Live updates</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Nowe biznesowe pola</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <!-- Enterprise -->
                    <div class="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl shadow-xl p-6 mb-8">
                        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 class="text-2xl font-bold mb-2">Enterprise</h3>
                                <p class="text-gray-300">Indywidualnie dostosowane rozwiązanie dla Twojej firmy</p>
                            </div>
                            <button @click="scrollToForm" class="bg-white text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors">
                                Skontaktuj się
                            </button>
                        </div>
                    </div>

                    <!-- Jak działa - Video Section -->
                    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 md:p-8 border-2 border-indigo-200 mb-8">
                        <h3 class="text-xl md:text-2xl font-bold mb-4 text-center flex items-center justify-center gap-3">
                            <svg class="w-7 h-7 md:w-8 md:h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                Jak działa Live Sales?
                            </span>
                        </h3>
                        
                        <p class="text-center text-gray-700 mb-6 text-sm md:text-base">
                            Zobacz krótki filmik prezentujący możliwości Live Sales
                        </p>

                        <!-- Video Container -->
                        <div class="relative bg-white rounded-lg shadow-xl overflow-hidden mx-auto max-w-4xl" style="padding-bottom: 56.25%; /* 16:9 aspect ratio */">
                            <!-- Placeholder gdy nie ma filmiku -->
                            <div class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                <svg class="w-16 h-16 md:w-24 md:h-24 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                                <p class="text-gray-500 text-base md:text-lg font-medium mb-2">Filmik wkrótce dostępny</p>
                                <p class="text-gray-400 text-xs md:text-sm">Video tutorial będzie tutaj</p>
                            </div>

                            <!-- 
                            ═══════════════════════════════════════════════════════════════
                            JAK DODAĆ FILMIK:
                            ═══════════════════════════════════════════════════════════════
                            
                            1. Usuń cały <div> z placeholderem powyżej (od "Placeholder" do </div>)
                            
                            2. Wklej jeden z poniższych kodów:
                            
                            ───────────────────────────────────────────────────────────────
                            YOUTUBE:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://www.youtube.com/embed/TWOJ_VIDEO_ID?rel=0" 
                                title="Live Sales Tutorial" 
                                frameborder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowfullscreen>
                            </iframe>
                            
                            Przykład z prawdziwym ID:
                            src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"
                                                        └─────────┘
                                                        Twoje Video ID
                            
                            ───────────────────────────────────────────────────────────────
                            VIMEO:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://player.vimeo.com/video/TWOJ_VIDEO_ID?title=0&byline=0&portrait=0" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                allow="autoplay; fullscreen; picture-in-picture" 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            LOOM:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://www.loom.com/embed/TWOJ_VIDEO_ID" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                webkitallowfullscreen 
                                mozallowfullscreen 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            WISTIA:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full wistia_embed" 
                                src="https://fast.wistia.net/embed/iframe/TWOJ_VIDEO_ID" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            WŁASNY SERWER (MP4):
                            ───────────────────────────────────────────────────────────────
                            <video 
                                class="absolute inset-0 w-full h-full" 
                                controls 
                                poster="https://twoja-domena.pl/thumbnail.jpg">
                                <source src="https://twoja-domena.pl/video.mp4" type="video/mp4">
                                Twoja przeglądarka nie obsługuje video.
                            </video>
                            
                            ═══════════════════════════════════════════════════════════════
                            -->
                        </div>

                        <!-- Video Features -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-6">
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">~2 min</div>
                                <div class="text-gray-600 text-xs md:text-sm">Szybki tutorial</div>
                            </div>
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">Krok po kroku</div>
                                <div class="text-gray-600 text-xs md:text-sm">Łatwa konfiguracja</div>
                            </div>
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">5 minut</div>
                                <div class="text-gray-600 text-xs md:text-sm">I już działa!</div>
                            </div>
                        </div>
                    </div>

                    <!-- Roadmap -->
                    <div class="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-6 mb-8">
                        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            Plany rozwoju - ta sama cena!
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Wysyłka HTTP/FTP plików</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Integracja Slack</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>WhatsApp, Telegram, Messenger</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Microsoft Teams</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Wysyłka emailowa</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>AI Raporty i podsumowania</span>
                            </div>
                        </div>
                    </div>

                    <!-- Formularz -->
                    <div id="contact-form" class="bg-white rounded-xl shadow-lg border border-gray-200 p-6 md:p-8">
                        <h2 class="text-xl md:text-2xl font-bold mb-6">Formularz kontaktowy</h2>
                        <form @submit.prevent="submitBuyForm" class="space-y-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                                <input v-model="buyForm.email" type="email" required class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">NIP firmy *</label>
                                <input v-model="buyForm.nip" @input="formatNip" type="text" required maxlength="13" placeholder="123-456-78-90" class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                                <p class="text-xs text-gray-500 mt-1">Format: xxx-xxx-xx-xx</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Numer telefonu *</label>
                                <input v-model="buyForm.phone" type="tel" required pattern="[0-9]{9,11}" placeholder="123456789" class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Dodatkowe informacje</label>
                                <textarea v-model="buyForm.message" rows="4" placeholder="Opisz swoje potrzeby..." class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"></textarea>
                            </div>

                            <button type="submit" class="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                </svg>
                                Wyślij zapytanie
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- KONFIGURACJA -->
            <div v-if="currentPage === 'config'" class="p-4 md:p-8">
                <div class="max-w-3xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Konfiguracja</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Zarządzaj tokenem BaseLinker i ustawieniami konta</p>

                    <!-- BaseLinker Token Card -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <div class="flex items-start gap-4 mb-6">
                            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold mb-1">Token BaseLinker</h2>
                                <p class="text-sm text-gray-600">Token potrzebny do synchronizacji danych z BaseLinker</p>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Token API
                                </label>
                                <div class="relative">
                                    <input
                                        v-model="baselinkerToken"
                                        :type="showToken ? 'text' : 'password'"
                                        @input="onTokenChange"
                                        placeholder="Wklej tutaj swój token BaseLinker"
                                        class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 pr-24 focus:border-blue-500 focus:outline-none transition-colors font-mono text-sm"
                                    >
                                    <button
                                        @click="showToken = !showToken"
                                        type="button"
                                        class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                                    >
                                        <svg v-if="!showToken" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                                        </svg>
                                    </button>
                                </div>
                                <p class="text-xs text-gray-500 mt-2">
                                    Token jest szyfrowany za pomocą AES-256-GCM i bezpiecznie przechowywany dla Twojego konta
                                </p>
                            </div>

                            <div v-if="tokenSaved" class="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                Token został zapisany automatycznie
                            </div>

                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div class="flex gap-3">
                                    <svg class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <div class="text-sm text-blue-800">
                                        <p class="font-medium mb-1">Jak znaleźć token BaseLinker?</p>
                                        <ol class="list-decimal list-inside space-y-1 text-blue-700">
                                            <li>Zaloguj się do BaseLinker</li>
                                            <li>Przejdź do: Integracje → API</li>
                                            <li>Skopiuj token API</li>
                                            <li>Wklej token w pole powyżej</li>
                                        </ol>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Account Settings Card -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div class="flex items-start gap-4 mb-6">
                            <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold mb-1">Ustawienia konta</h2>
                                <p class="text-sm text-gray-600">Zarządzaj swoim kontem i ustawieniami bezpieczeństwa</p>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between py-3 border-b border-gray-200">
                                <div>
                                    <p class="font-medium text-gray-900">Email</p>
                                    <p class="text-sm text-gray-600">{{ userEmail }}</p>
                                </div>
                            </div>

                            <div class="flex items-center justify-between py-3">
                                <div>
                                    <p class="font-medium text-gray-900">Wyloguj się</p>
                                    <p class="text-sm text-gray-600">Zakończ bieżącą sesję</p>
                                </div>
                                <button
                                    @click="logout"
                                    class="px-4 py-2 border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm"
                                >
                                    Wyloguj
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ZESPÓŁ (PR F3) -->
            <div v-if="currentPage === 'team'" class="p-4 md:p-8">
                <div class="max-w-4xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Zespół</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Zarządzaj członkami zespołu i uprawnieniami</p>

                    <!-- Invite Form -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <h2 class="text-lg font-semibold mb-4">Zaproś nowego członka</h2>
                        <div class="flex flex-col md:flex-row gap-4">
                            <div class="flex-1">
                                <input
                                    v-model="teamInviteEmail"
                                    type="email"
                                    placeholder="Adres email"
                                    class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
                                >
                            </div>
                            <div class="w-full md:w-48">
                                <select
                                    v-model="teamInviteRole"
                                    class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors bg-white"
                                >
                                    <option value="member">Członek</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            <button
                                @click="inviteTeamMember"
                                :disabled="teamInviteLoading"
                                class="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <svg v-if="teamInviteLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                                Zaproś
                            </button>
                        </div>
                    </div>

                    <!-- Team Members List -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div class="px-6 py-4 border-b border-gray-200">
                            <h2 class="text-lg font-semibold">Członkowie zespołu ({{ teamMembers.length }})</h2>
                        </div>

                        <div v-if="teamMembers.length === 0" class="p-8 text-center text-gray-500">
                            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                            <p>Brak członków zespołu</p>
                        </div>

                        <div v-else class="divide-y divide-gray-200">
                            <div v-for="member in teamMembers" :key="member.id" class="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-medium">
                                        {{ member.user?.email?.charAt(0).toUpperCase() || '?' }}
                                    </div>
                                    <div>
                                        <p class="font-medium text-gray-900">{{ member.user?.email || 'Oczekuje' }}</p>
                                        <p class="text-sm text-gray-500">Dołączył: {{ formatDate(member.joinedAt || member.invitedAt) }}</p>
                                    </div>
                                </div>

                                <div class="flex items-center gap-4">
                                    <span :class="getRoleBadgeClass(member.role)" class="px-3 py-1 rounded-full text-xs font-medium">
                                        {{ getRoleLabel(member.role) }}
                                    </span>

                                    <div v-if="member.role !== 'owner'" class="flex items-center gap-2">
                                        <select
                                            :value="member.role"
                                            @change="changeTeamMemberRole(member.id, $event.target.value)"
                                            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none bg-white"
                                        >
                                            <option value="member">Członek</option>
                                            <option value="admin">Administrator</option>
                                        </select>

                                        <button
                                            @click="removeTeamMember(member.id)"
                                            class="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Usuń członka"
                                        >
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SUBSKRYPCJA (PR F3.1 - Enhanced) -->
            <div v-if="currentPage === 'subscription'" class="p-4 md:p-8">
                <div class="max-w-5xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Subskrypcja</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Zarządzaj planem i płatnościami</p>

                    <!-- ERROR BOX - najwyższy priorytet, ZAWSZE widoczny gdy jest błąd -->
                    <div v-if="billingError" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div class="flex items-start gap-3">
                            <svg class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <div class="flex-1">
                                <p class="text-red-800 font-medium">{{ billingError.message }}</p>
                            </div>
                            <button v-if="billingError.action"
                                    @click="handleBillingErrorAction"
                                    class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
                                Spróbuj ponownie
                            </button>
                            <button @click="clearBillingError" class="p-2 text-red-600 hover:bg-red-100 rounded">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Billing Status Checking Overlay - NIE blokuje error box -->
                    <div v-if="billingStatusChecking && !billingError" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                        <svg class="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span class="text-blue-800 font-medium">Aktualizuję status płatności...</span>
                    </div>

                    <!-- Trial Eligibility Banner -->
                    <div v-if="trialStatus?.eligibleForTrial && !subscription"
                         class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-8 text-white">
                        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div>
                                <h3 class="text-xl font-bold mb-2">Wypróbuj Plan Pro za darmo!</h3>
                                <p class="text-blue-100 mb-3">7 dni pełnego dostępu do wszystkich funkcji bez zobowiązań.</p>
                                <ul class="text-sm text-blue-100 space-y-1">
                                    <li class="flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                        Do 25 eksportów
                                    </li>
                                    <li class="flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                        Wszystkie integracje
                                    </li>
                                    <li class="flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                        Priorytetowe wsparcie
                                    </li>
                                </ul>
                            </div>
                            <button @click="showTrialStartConfirm = true"
                                    :disabled="trialStartLoading || isAnyBillingLoading()"
                                    class="bg-white text-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                                <svg v-if="trialStartLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                Rozpocznij okres próbny
                            </button>
                        </div>
                    </div>

                    <!-- Trial Already Used Notice -->
                    <div v-else-if="trialStatus?.trialStatus?.trialUsed && !subscription"
                         class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                        <p class="text-gray-600 text-sm">
                            Okres próbny został już wykorzystany dla tego NIP.
                            <span v-if="trialStatus?.trialStatus?.trialUsedAt" class="text-gray-500">
                                ({{ formatDate(trialStatus.trialStatus.trialUsedAt) }})
                            </span>
                        </p>
                    </div>

                    <!-- Payment Issue Banner (past_due, incomplete, unpaid, incomplete_expired) -->
                    <div v-if="activeBillingBanner === 'payment_issue'"
                         class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                        <div class="flex items-start gap-3">
                            <svg class="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <div class="flex-1">
                                <h4 class="text-yellow-800 font-medium">Problem z płatnością</h4>
                                <p class="text-yellow-700 text-sm mt-1">
                                    Ostatnia płatność nie powiodła się. Zaktualizuj metodę płatności, aby uniknąć przerwy w usłudze.
                                </p>
                                <button @click="openBillingPortal"
                                        :disabled="portalLoading"
                                        class="mt-3 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-200 transition-colors inline-flex items-center gap-2 disabled:opacity-50">
                                    <svg v-if="portalLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                                    </svg>
                                    Zaktualizuj metodę płatności
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Cancel Scheduled Banner -->
                    <div v-else-if="activeBillingBanner === 'cancel_scheduled'"
                         class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <div class="flex items-start gap-3">
                            <svg class="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <div class="flex-1">
                                <h4 class="font-medium text-blue-800">Subskrypcja zostanie anulowana</h4>
                                <p class="text-sm text-blue-700 mt-1">
                                    Po {{ formatDate(subscription?.currentPeriodEnd) }} konto przejdzie na plan Darmowy.
                                </p>
                            </div>
                            <button v-if="!memberRoleLoading && memberRole === 'owner'"
                                    @click="showReactivateConfirm = true"
                                    :disabled="reactivateLoading"
                                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0 text-sm font-medium">
                                {{ reactivateLoading ? 'Reaktywuję...' : 'Reaktywuj' }}
                            </button>
                        </div>
                    </div>

                    <!-- Manual Refresh Banner - po timeout Stripe -->
                    <div v-else-if="activeBillingBanner === 'manual_refresh'"
                         class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                        <div class="flex items-start gap-3">
                            <svg class="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <div class="flex-1">
                                <h4 class="font-medium text-yellow-800">Przetwarzanie płatności</h4>
                                <p class="text-sm text-yellow-700 mt-1">
                                    Płatność może być nadal przetwarzana. Kliknij przycisk poniżej, aby sprawdzić status.
                                </p>
                            </div>
                            <button @click="manualRefreshBilling"
                                    :disabled="billingStatusChecking"
                                    class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex-shrink-0 text-sm font-medium">
                                {{ billingStatusChecking ? 'Sprawdzanie...' : 'Sprawdź status' }}
                            </button>
                        </div>
                    </div>

                    <!-- Current Subscription -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                        <h2 class="text-lg font-semibold mb-4">Twoja subskrypcja</h2>

                        <div v-if="subscription" class="space-y-4">
                            <div class="flex items-center justify-between py-3 border-b border-gray-200">
                                <div>
                                    <p class="font-medium text-gray-900">Plan</p>
                                    <p class="text-sm text-gray-600">{{ subscription.planId ? subscription.planId.charAt(0).toUpperCase() + subscription.planId.slice(1) : 'Free' }}</p>
                                </div>
                                <span :class="getSubscriptionStatusClass(subscription.status)" class="px-3 py-1 rounded-full text-sm font-medium">
                                    {{ getSubscriptionStatusLabel(subscription.status) }}
                                </span>
                            </div>

                            <div v-if="subscription.status === 'trialing' && subscription.trialEnd" class="flex items-center justify-between py-3 border-b border-gray-200">
                                <div>
                                    <p class="font-medium text-gray-900">Okres próbny kończy się</p>
                                    <p class="text-sm text-gray-600">{{ formatDate(subscription.trialEnd) }}</p>
                                </div>
                                <span v-if="getTrialDaysRemaining() !== null" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                    {{ getTrialDaysRemaining() }} dni
                                </span>
                            </div>

                            <div v-if="subscription.currentPeriodEnd && subscription.status !== 'trialing'" class="flex items-center justify-between py-3 border-b border-gray-200">
                                <div>
                                    <p class="font-medium text-gray-900">{{ subscription.cancelAtPeriodEnd ? 'Dostęp do' : 'Następne odnowienie' }}</p>
                                    <p class="text-sm text-gray-600">{{ formatDate(subscription.currentPeriodEnd) }}</p>
                                </div>
                            </div>

                            <!-- Cancel At Period End Warning -->
                            <div v-if="subscription.cancelAtPeriodEnd" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <div class="flex items-start gap-3">
                                    <svg class="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                    </svg>
                                    <div>
                                        <p class="text-yellow-800 font-medium">Subskrypcja zostanie anulowana</p>
                                        <p class="text-yellow-700 text-sm mt-1">
                                            Po {{ formatDate(subscription.currentPeriodEnd) }} konto przejdzie na plan Darmowy.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Action Buttons -->
                            <div class="pt-4 flex flex-wrap gap-3">
                                <!-- Przycisk portalu - tylko gdy ma konto Stripe (dokonał płatności) -->
                                <button
                                    v-if="hasStripeCustomer"
                                    @click="openBillingPortal"
                                    :disabled="portalLoading || isAnyBillingLoading()"
                                    class="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    <svg v-if="portalLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                    Zarządzaj płatnościami
                                </button>

                                <!-- Cancel button - owner only, not for trialing, not already canceling -->
                                <button
                                    v-if="!memberRoleLoading && memberRole === 'owner' && !subscription.cancelAtPeriodEnd && subscription.status !== 'trialing' && subscription.status !== 'canceled'"
                                    @click="showCancelConfirm = true"
                                    :disabled="isAnyBillingLoading()"
                                    class="text-red-600 hover:text-red-700 px-4 py-3 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50"
                                >
                                    Anuluj subskrypcję
                                </button>

                                <!-- Reactivate button - owner only, when cancelAtPeriodEnd -->
                                <button
                                    v-if="!memberRoleLoading && memberRole === 'owner' && subscription.cancelAtPeriodEnd"
                                    @click="showReactivateConfirm = true"
                                    :disabled="isAnyBillingLoading()"
                                    class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    <svg v-if="reactivateLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    Reaktywuj subskrypcję
                                </button>

                                <!-- Info for non-owners -->
                                <p v-if="!memberRoleLoading && memberRole && memberRole !== 'owner'"
                                   class="text-sm text-gray-500 italic py-3">
                                    Tylko właściciel firmy może zarządzać subskrypcją.
                                </p>
                            </div>
                        </div>

                        <div v-else class="text-center py-8 text-gray-500">
                            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                            </svg>
                            <p>Brak aktywnej subskrypcji</p>
                            <p class="text-sm mt-1">Wybierz plan poniżej, aby rozpocząć</p>
                        </div>
                    </div>

                    <!-- Billing Interval Toggle -->
                    <div class="flex justify-center mb-6">
                        <div class="inline-flex bg-gray-100 rounded-lg p-1">
                            <button @click="selectedInterval = 'monthly'"
                                    :class="selectedInterval === 'monthly' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'"
                                    class="px-4 py-2 rounded-md text-sm font-medium transition-all">
                                Miesięcznie
                            </button>
                            <button @click="selectedInterval = 'yearly'"
                                    :class="selectedInterval === 'yearly' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'"
                                    class="px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2">
                                Rocznie
                                <span v-if="plans.length > 0 && getSavingsPercent(plans.find(p => p.id === 'pro'))"
                                      class="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                                    -{{ getSavingsPercent(plans.find(p => p.id === 'pro')) }}%
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- Plans -->
                    <h2 class="text-xl font-semibold mb-4">Dostępne plany</h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div v-for="plan in plans" :key="plan.id"
                             class="bg-white rounded-xl shadow-sm border-2 p-6 flex flex-col"
                             :class="plan.id === subscription?.planId ? 'border-blue-500' : 'border-gray-200'">
                            <div v-if="plan.id === subscription?.planId" class="text-xs text-blue-600 font-medium mb-2">AKTUALNY PLAN</div>
                            <h3 class="text-lg font-bold mb-2">{{ plan.name }}</h3>
                            <!-- Przekreślona cena oryginalna (przy rocznym) -->
                            <div v-if="selectedInterval === 'yearly' && plan.price?.yearlyRaw > 0 && getSavingsPercent(plan)" class="mb-1">
                                <span class="text-lg text-gray-400 line-through">{{ getOriginalYearlyPrice(plan) }}</span>
                            </div>
                            <div class="text-3xl font-bold mb-1" :class="plan.price?.monthlyRaw === 0 ? 'text-gray-600' : 'text-blue-600'">
                                {{ getPlanPrice(plan) }}
                                <span v-if="plan.price?.monthlyRaw > 0" class="text-sm text-gray-600">/{{ selectedInterval === 'monthly' ? 'mies' : 'rok' }}</span>
                            </div>
                            <p v-if="selectedInterval === 'yearly' && plan.price?.yearlyRaw > 0 && getSavingsPercent(plan)"
                               class="text-sm text-green-600 mb-4">
                                Oszczędzasz {{ getSavingsPercent(plan) }}% rocznie
                            </p>
                            <div v-else class="mb-4"></div>

                            <ul class="text-sm space-y-2 mb-6 flex-1">
                                <li v-for="(value, feature) in plan.features" :key="feature" class="flex items-start gap-2">
                                    <svg v-if="value === true || (typeof value === 'number' && value > 0)" class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <svg v-else class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>{{ feature.replace(/\./g, ' ').replace(/_/g, ' ') }}: {{ typeof value === 'boolean' ? (value ? 'Tak' : 'Nie') : value }}</span>
                                </li>
                            </ul>

                            <button
                                v-if="plan.id !== 'free' && plan.id !== subscription?.planId"
                                @click="requestPlanChange(plan.id)"
                                :disabled="isAnyBillingLoading() || !isPlanAvailableForInterval(plan)"
                                :title="!isPlanAvailableForInterval(plan) ? 'Niedostępne w tym interwale rozliczeniowym' : ''"
                                class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {{ !isPlanAvailableForInterval(plan) ? 'Niedostępne' : (subscription?.planId && subscription.planId !== 'free' ? 'Zmień plan' : 'Wybierz plan') }}
                            </button>
                            <div v-else-if="plan.id === subscription?.planId" class="w-full bg-gray-100 text-gray-600 px-6 py-3 rounded-lg text-center font-medium">
                                Twój plan
                            </div>
                            <div v-else class="w-full bg-gray-50 text-gray-500 px-6 py-3 rounded-lg text-center font-medium">
                                Plan darmowy
                            </div>
                        </div>
                    </div>

                    <!-- Capabilities -->
                    <div v-if="capabilities?.limits" class="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 class="text-lg font-semibold mb-4">Twoje limity</h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div v-if="capabilities.limits.exports" class="p-4 bg-gray-50 rounded-lg">
                                <p class="text-sm text-gray-600">Eksporty</p>
                                <p class="text-xl font-bold">{{ capabilities.limits.exports.used || 0 }} / {{ capabilities.limits.exports.max || 0 }}</p>
                                <div class="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-blue-600 rounded-full transition-all"
                                         :style="{ width: `${capabilities.limits.exports.max ? Math.min(100, ((capabilities.limits.exports.used || 0) / capabilities.limits.exports.max) * 100) : 0}%` }"></div>
                                </div>
                            </div>
                            <div v-if="capabilities.limits.teamMembers" class="p-4 bg-gray-50 rounded-lg">
                                <p class="text-sm text-gray-600">Członkowie zespołu</p>
                                <p class="text-xl font-bold">{{ capabilities.limits.teamMembers.used || 0 }} / {{ capabilities.limits.teamMembers.max || 0 }}</p>
                                <div class="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-blue-600 rounded-full transition-all"
                                         :style="{ width: `${capabilities.limits.teamMembers.max ? Math.min(100, ((capabilities.limits.teamMembers.used || 0) / capabilities.limits.teamMembers.max) * 100) : 0}%` }"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- EXPORT WIZARD (NEW) - Modal overlay -->
            <ExportWizard
                v-if="currentPage === 'wizard'"
                :export-id="wizardEditingExportId"
                :existing-exports="exportsListServer"
                @save="handleWizardSave"
                @save-draft="handleWizardSaveDraft"
                @cancel="handleWizardCancel"
            />

            <!-- KONFIGURATOR (LEGACY) -->
            <div v-if="currentPage === 'konfigurator'" class="flex flex-col min-h-screen">
                <!-- Top bar -->
                <div class="bg-white border-b border-gray-200 px-4 md:px-6 py-4 sticky top-0 z-10 shadow-sm">
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <!-- Editable name -->
                        <div class="flex items-center gap-3 w-full md:w-auto">
                            <input v-if="editingName" v-model="config.name" @blur="editingName = false" @keyup.enter="editingName = false" type="text" class="text-lg font-medium border-2 border-blue-500 rounded-lg px-4 py-2 w-full md:w-96 focus:outline-none" autofocus>
                            <div v-else class="flex items-center gap-2">
                                <span class="text-lg font-medium">{{ config.name }}</span>
                                <button @click="editingName = true" class="text-gray-400 hover:text-gray-600 transition-colors">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <div class="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                            <!-- Dataset toggle -->
                            <div class="inline-flex rounded-lg border-2 border-gray-300 p-1 bg-gray-50">
                                <button @click="config.dataset = 'orders'; onDatasetChange()" :class="config.dataset === 'orders' ? 'bg-white shadow-sm border border-gray-200' : ''" class="flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                                    </svg>
                                    Zamówienia
                                </button>
                                <button @click="config.dataset = 'products'; onDatasetChange()" :class="config.dataset === 'products' ? 'bg-white shadow-sm border border-gray-200' : ''" class="flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                    </svg>
                                    Produkty
                                </button>
                            </div>

                            <!-- Schedule -->
                            <select v-model="scheduleValue" @change="updateSchedule" class="border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors bg-white">
                                <option value="live">⚡ Na żywo · PRO</option>
                                <option value="5-minutes">Co 5 minut</option>
                                <option value="15-minutes">Co 15 minut</option>
                                <option value="30-minutes">Co 30 minut</option>
                                <option value="1-hours">Co godzinę</option>
                                <option value="6-hours">Co 6 godzin</option>
                                <option value="12-hours">Co 12 godzin</option>
                                <option value="1-days">Raz dziennie</option>
                            </select>

                            <button @click="runExport" class="bg-blue-100 text-blue-700 px-4 md:px-5 py-2.5 rounded-lg hover:bg-blue-200 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span class="hidden md:inline">Uruchom teraz</span>
                            </button>

                            <button @click="saveConfig" class="bg-blue-600 text-white px-4 md:px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                                </svg>
                                Zapisz
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 4 panele -->
                <div class="flex-1 p-4 md:p-6 overflow-hidden">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 h-full">
                        <!-- Panel A: Dostępne pola -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <h3 class="text-base md:text-lg font-semibold mb-3">Dostępne pola</h3>
                                
                                <div class="relative mb-3">
                                    <input v-model="searchQuery" type="text" placeholder="Szukaj pola..." class="w-full border-2 border-gray-300 rounded-lg px-10 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                    <svg class="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                </div>

                                <div class="space-y-2">
                                    <div v-for="group in filteredGroups" :key="group.name" class="border-b border-gray-200 pb-2">
                                        <button @click="toggleGroup(group.name)" class="w-full flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 transition-colors">
                                            <span class="font-medium text-sm">{{ group.name }}</span>
                                            <svg class="w-5 h-5 transition-transform" :class="expandedGroups.includes(group.name) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                                            </svg>
                                        </button>
                                        
                                        <div v-if="expandedGroups.includes(group.name)" class="ml-2 mt-1 space-y-1">
                                            <div v-for="field in group.fields" :key="field.field_key" 
                                                 @click="handleFieldClick(field)"
                                                 :class="isFieldSelected(field.field_key) ? 'field-disabled' : 'hover:bg-blue-50 cursor-pointer'"
                                                 class="flex items-center justify-between py-2 px-3 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                                <div class="flex items-center gap-2 flex-1">
                                                    <svg v-if="isFieldSelected(field.field_key)" class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                    <svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                    <span class="text-sm">{{ field.label }}</span>
                                                </div>
                                                <span v-if="field.higher_plan" @click.stop="currentPage = 'buy'" class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-amber-200">PRO</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel B: Wybrane pola -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h3 class="text-base md:text-lg font-semibold">Wybrane pola ({{ config.selected_fields.length }})</h3>
                                </div>

                                <div v-if="config.selected_fields.length === 0" class="text-center py-12 text-gray-400">
                                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                                    </svg>
                                    <p class="text-sm">Nie wybrano żadnych pól</p>
                                    <p class="text-xs mt-1">Kliknij pola po lewej aby dodać</p>
                                </div>

                                <div id="sortable-list" v-else class="space-y-2">
                                    <div v-for="fieldKey in config.selected_fields" :key="fieldKey" :data-id="fieldKey"
                                         class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors">
                                        <svg class="drag-handle w-5 h-5 text-gray-400 cursor-move flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
                                        </svg>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-medium truncate">{{ getFieldLabel(fieldKey) }}</div>
                                            <div class="text-xs text-gray-500 truncate">{{ fieldKey }}</div>
                                        </div>
                                        <button @click="removeField(fieldKey)" class="text-red-500 hover:text-red-700 transition-colors flex-shrink-0">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel C: Konfiguracja -->
                        <div class="md:col-span-3 overflow-y-auto space-y-4">
                            <!-- Filtry Accordion -->
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <button @click="toggleAccordion('filters')" class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <h4 class="font-semibold text-sm flex items-center gap-2">
                                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                                        </svg>
                                        Filtry
                                    </h4>
                                    <svg class="w-5 h-5 transition-transform" :class="accordionOpen === 'filters' ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                
                                <div :class="accordionOpen === 'filters' ? 'open' : ''" class="accordion-content">
                                    <div class="p-4 space-y-4 border-t border-gray-200">
                                        <div v-if="config.dataset === 'orders'">
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Status zamówienia</label>
                                            <select v-model="config.filters.status" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                                <option value="">Wszystkie statusy</option>
                                                <option value="234540">Nowe</option>
                                                <option value="234562">Opłacone</option>
                                                <option value="234563">W realizacji</option>
                                                <option value="234564">Wysłane</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Data od</label>
                                            <input v-model="config.filters.date_from" type="date" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Data do</label>
                                            <input v-model="config.filters.date_to" type="date" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Google Sheets Accordion -->
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <button @click="toggleAccordion('sheets')" class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <h4 class="font-semibold text-sm flex items-center gap-2">
                                        <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                        </svg>
                                        Google Sheets
                                    </h4>
                                    <svg class="w-5 h-5 transition-transform" :class="accordionOpen === 'sheets' ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                
                                <div :class="accordionOpen === 'sheets' ? 'open' : ''" class="accordion-content">
                                    <div class="p-4 space-y-4 border-t border-gray-200">
                                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                                            <p class="font-semibold mb-2 flex items-center gap-2">
                                                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                </svg>
                                                Udostępnij arkusz do edycji dla:
                                            </p>
                                            <code class="block bg-white px-3 py-2 rounded border border-blue-200 text-blue-800 font-mono text-xs break-all select-all">live-sales-worker@livesales-483523.iam.gserviceaccount.com</code>
                                            <p class="text-xs text-gray-600 mt-2">Skopiuj powyższy email, otwórz swój arkusz Google Sheets → kliknij "Udostępnij" → wklej email → wybierz "Edytor" → Gotowe!</p>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">URL arkusza</label>
                                            <input v-model="config.sheets.sheet_url" @blur="validateSheetUrl" type="text" placeholder="https://docs.google.com/spreadsheets/d/..." class="w-full border-2 rounded-lg px-4 py-2.5 text-sm focus:outline-none bg-white" :class="sheetUrlValid === false ? 'border-red-500' : sheetUrlValid === true ? 'border-green-500' : 'border-gray-300'">
                                            <p v-if="sheetUrlValid === false" class="text-xs text-red-600 mt-1">Nieprawidłowy URL Google Sheets</p>
                                            <p v-if="extractedSheetId" class="text-xs text-green-600 mt-1">Sheet ID: {{ extractedSheetId }}</p>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Tryb zapisu</label>
                                            <select v-model="config.sheets.write_mode" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                                <option value="append">Dopisz na górze (Insert Top)</option>
                                                <option value="replace">Zastąp wszystko (Replace)</option>
                                            </select>
                                            <p class="text-xs text-gray-500 mt-2">
                                                <strong>Dopisz na górze:</strong> Nowe dane są zawsze dodawane NA POCZĄTKU arkusza (zaraz po headerze). Stare dane schodzą w dół. Najnowsze dane zawsze na górze! Idealne gdy chcesz gromadzić historię z najnowszymi danymi na wierzchu.<br>
                                                <strong>Zastąp:</strong> Arkusz jest czyszczony całkowicie i zapisywane są tylko dane spełniające aktualny filtr. Idealne do raportów "do spakowania" gdzie potrzebujesz tylko aktualne dane.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel D: Preview -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h3 class="text-base md:text-lg font-semibold">Podgląd danych</h3>
                                    <span class="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
                                        {{ recordCount }} rekordów
                                    </span>
                                </div>

                                <div class="space-y-3">
                                    <button @click="showPreviewModal = true" :disabled="config.selected_fields.length === 0" class="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm md:text-base">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                        Podgląd tabeli
                                    </button>

                                    <button @click="downloadCsv" :disabled="config.selected_fields.length === 0" class="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm md:text-base">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                        </svg>
                                        Pobierz CSV
                                    </button>
                                </div>

                                <div v-if="config.selected_fields.length === 0" class="mt-6 text-center py-12 text-gray-400">
                                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                    </svg>
                                    <p class="text-sm">Wybierz pola aby zobaczyć podgląd</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Preview Modal -->
        <div v-if="showPreviewModal" @click.self="showPreviewModal = false" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div class="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
                    <h3 class="text-xl md:text-2xl font-bold">Podgląd danych (max 5 rekordów)</h3>
                    <button @click="showPreviewModal = false" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg class="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="p-4 md:p-6 overflow-auto flex-1">
                    <div class="overflow-x-auto">
                        <table class="w-full border-collapse">
                            <thead>
                                <tr class="bg-gradient-to-r from-blue-50 to-blue-100">
                                    <th v-for="fieldKey in config.selected_fields" :key="fieldKey" class="border-2 border-blue-200 px-3 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-gray-700 whitespace-nowrap">
                                        {{ getFieldLabel(fieldKey) }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(record, idx) in previewTableData" :key="idx" :class="idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'" class="hover:bg-blue-50 transition-colors">
                                    <td v-for="fieldKey in config.selected_fields" :key="fieldKey" class="border border-gray-300 px-3 md:px-4 py-2 text-xs md:text-sm whitespace-nowrap">
                                        {{ record[fieldKey] || '-' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div v-if="deleteConfirm" @click.self="deleteConfirm = null" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <h3 class="text-xl font-bold mb-4">Potwierdź usunięcie</h3>
                <p class="text-gray-600 mb-6">Czy na pewno chcesz usunąć ten eksport? Tej operacji nie można cofnąć.</p>
                <div class="flex gap-3">
                    <button @click="deleteConfirm = null" class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium">
                        Anuluj
                    </button>
                    <button @click="deleteExport(deleteConfirm)" class="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium">
                        Usuń
                    </button>
                </div>
            </div>
        </div>

        <!-- Cancel Subscription Confirmation Modal -->
        <div v-if="showCancelConfirm" @click.self="showCancelConfirm = false" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900">Anulowanie subskrypcji</h3>
                </div>

                <div class="mb-6 space-y-3">
                    <p class="text-gray-600">Czy na pewno chcesz anulować subskrypcję?</p>
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p class="text-sm text-yellow-800 font-medium">Co się stanie:</p>
                        <ul class="text-sm text-yellow-700 mt-2 space-y-1">
                            <li>• Zachowasz dostęp do końca okresu rozliczeniowego</li>
                            <li>• Po tym czasie konto przejdzie na plan Darmowy</li>
                            <li>• Możesz reaktywować przed końcem okresu</li>
                        </ul>
                    </div>
                    <p v-if="subscription?.currentPeriodEnd" class="text-sm text-gray-500">
                        Dostęp do {{ formatDate(subscription.currentPeriodEnd) }}
                    </p>
                </div>

                <div class="flex gap-3">
                    <button @click="showCancelConfirm = false"
                            :disabled="cancelLoading"
                            class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50">
                        Nie, zachowaj
                    </button>
                    <button @click="confirmCancelSubscription"
                            :disabled="cancelLoading"
                            class="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        <svg v-if="cancelLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Tak, anuluj
                    </button>
                </div>
            </div>
        </div>

        <!-- Reactivate Subscription Confirmation Modal -->
        <div v-if="showReactivateConfirm" @click.self="showReactivateConfirm = false" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900">Reaktywacja subskrypcji</h3>
                </div>

                <div class="mb-6">
                    <p class="text-gray-600 mb-3">Czy chcesz reaktywować subskrypcję?</p>
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p class="text-sm text-green-800 font-medium">Co się stanie:</p>
                        <ul class="text-sm text-green-700 mt-2 space-y-1">
                            <li>• Subskrypcja zostanie wznowiona</li>
                            <li>• Następna płatność będzie naliczona zgodnie z harmonogramem</li>
                            <li>• Zachowasz wszystkie funkcje planu</li>
                        </ul>
                    </div>
                </div>

                <div class="flex gap-3">
                    <button @click="showReactivateConfirm = false"
                            :disabled="reactivateLoading"
                            class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50">
                        Anuluj
                    </button>
                    <button @click="confirmReactivateSubscription"
                            :disabled="reactivateLoading"
                            class="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        <svg v-if="reactivateLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Reaktywuj
                    </button>
                </div>
            </div>
        </div>

        <!-- Trial Start Confirmation Modal -->
        <div v-if="showTrialStartConfirm" @click.self="showTrialStartConfirm = false" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900">Rozpocznij okres próbny</h3>
                </div>

                <div class="mb-6">
                    <p class="text-gray-600 mb-3">Otrzymasz 7 dni pełnego dostępu do planu Pro.</p>
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p class="text-sm text-blue-800 font-medium">Co obejmuje okres próbny:</p>
                        <ul class="text-sm text-blue-700 mt-2 space-y-1">
                            <li>• Do 25 eksportów</li>
                            <li>• Harmonogram co 1 minutę</li>
                            <li>• Wszystkie integracje</li>
                            <li>• Do 10 członków zespołu</li>
                        </ul>
                    </div>
                    <p class="text-sm text-gray-500 mt-3">
                        Po zakończeniu okresu próbnego konto przejdzie na plan Darmowy, chyba że wybierzesz płatny plan.
                    </p>
                </div>

                <div class="flex gap-3">
                    <button @click="showTrialStartConfirm = false"
                            :disabled="trialStartLoading"
                            class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50">
                        Anuluj
                    </button>
                    <button @click="startTrial"
                            :disabled="trialStartLoading"
                            class="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        <svg v-if="trialStartLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Rozpocznij
                    </button>
                </div>
            </div>
        </div>

        <!-- Plan Change Confirmation Modal -->
        <div v-if="pendingPlanChange" @click.self="cancelPlanChange" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold text-gray-900">Zmiana planu</h3>
                </div>

                <div class="mb-6 space-y-4">
                    <div class="flex items-center justify-between py-2 border-b border-gray-200">
                        <span class="text-gray-600">Aktualny plan</span>
                        <span class="font-medium">{{ subscription?.planId ? subscription.planId.charAt(0).toUpperCase() + subscription.planId.slice(1) : 'Free' }}</span>
                    </div>
                    <div class="flex items-center justify-between py-2 border-b border-gray-200">
                        <span class="text-gray-600">Nowy plan</span>
                        <span class="font-medium text-blue-600">{{ pendingPlanChange.planName }}</span>
                    </div>
                    <div class="flex items-center justify-between py-2 border-b border-gray-200">
                        <span class="text-gray-600">Cena</span>
                        <span class="font-medium">{{ pendingPlanChange.price }}/{{ pendingPlanChange.interval === 'monthly' ? 'mies' : 'rok' }}</span>
                    </div>
                    <p class="text-sm text-gray-500">
                        Zostaniesz przekierowany do Stripe, aby dokończyć płatność.
                    </p>
                </div>

                <div class="flex gap-3">
                    <button @click="cancelPlanChange"
                            :disabled="checkoutLoading"
                            class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50">
                        Anuluj
                    </button>
                    <button @click="confirmPlanChange"
                            :disabled="checkoutLoading"
                            class="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        <svg v-if="checkoutLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Kontynuuj do płatności
                    </button>
                </div>
            </div>
        </div>

            <!-- Toast (prawy dolny róg) -->
            <div v-if="toast.show" class="fixed bottom-4 right-4 bg-white border-2 border-gray-200 rounded-xl shadow-2xl p-4 max-w-sm z-50 animate-slide-in">
                <div class="flex items-start gap-3">
                    <div v-html="toast.icon" class="w-6 h-6 flex-shrink-0"></div>
                    <div class="flex-1">
                        <div class="font-semibold text-sm">{{ toast.title }}</div>
                        <div class="text-xs text-gray-600">{{ toast.message }}</div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.drag-handle { cursor: move; }
.sortable-ghost { opacity: 0.4; background: #e5e7eb; }
.field-disabled { opacity: 0.4; cursor: not-allowed !important; }

.accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
}
.accordion-content.open { max-height: 800px; }

.modal-backdrop { backdrop-filter: blur(4px); }
</style>
