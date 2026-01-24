// Validation Service - walidacje dla Live Sales V7
// Głównie: unikalne linki Google Sheets

class ValidationService {
    
    // Waliduj unikalność linku Google Sheets
    validateUniqueSheet(newSheetUrl, currentExportId, allExports) {
        if (!newSheetUrl || newSheetUrl.trim() === '') {
            return { valid: true }; // Pusty link - OK
        }
        
        const newIds = this.extractSheetIds(newSheetUrl);
        
        if (!newIds.sheetId) {
            return {
                valid: false,
                error: 'Nieprawidłowy URL Google Sheets'
            };
        }
        
        // Sprawdź czy ktoś już używa tego linku
        for (const exp of allExports) {
            // Pomiń aktualnie edytowany eksport
            if (exp.id === currentExportId) continue;
            
            if (!exp.sheets || !exp.sheets.sheet_url) continue;
            
            const existingIds = this.extractSheetIds(exp.sheets.sheet_url);
            
            // Sprawdź czy sheet_id + gid są identyczne
            if (newIds.sheetId === existingIds.sheetId && 
                newIds.gid === existingIds.gid) {
                return {
                    valid: false,
                    conflict: exp.name,
                    exportId: exp.id,
                    message: `Ten arkusz (zakładka ${newIds.gid}) jest już używany w eksporcie "${exp.name}"`
                };
            }
        }
        
        return { valid: true };
    }
    
    // Wyciągnij sheet_id i gid z URL
    extractSheetIds(url) {
        if (!url) return { sheetId: null, gid: '0' };
        
        // Format URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={GID}
        const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = url.match(/gid=([0-9]+)/);
        
        return {
            sheetId: sheetIdMatch ? sheetIdMatch[1] : null,
            gid: gidMatch ? gidMatch[1] : '0' // domyślnie zakładka 0
        };
    }
    
    // Waliduj format URL Google Sheets
    validateSheetUrl(url) {
        if (!url || url.trim() === '') {
            return { valid: true }; // Pusty - OK
        }
        
        const pattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
        
        if (!pattern.test(url)) {
            return {
                valid: false,
                error: 'Nieprawidłowy format URL. Powinien zaczynać się od: https://docs.google.com/spreadsheets/d/...'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj email
    validateEmail(email) {
        if (!email || email.trim() === '') {
            return { valid: false, error: 'Email nie może być pusty' };
        }
        
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!pattern.test(email)) {
            return {
                valid: false,
                error: 'Nieprawidłowy format email'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj NIP (10 cyfr)
    validateNIP(nip) {
        if (!nip) {
            return { valid: false, error: 'NIP nie może być pusty' };
        }
        
        const digits = nip.replace(/\D/g, '');
        
        if (digits.length !== 10) {
            return {
                valid: false,
                error: 'NIP musi zawierać dokładnie 10 cyfr'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj nazwę eksportu
    validateExportName(name) {
        if (!name || name.trim() === '') {
            return {
                valid: false,
                error: 'Nazwa eksportu nie może być pusta'
            };
        }
        
        if (name.length > 100) {
            return {
                valid: false,
                error: 'Nazwa eksportu nie może przekraczać 100 znaków'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj opis (krótki)
    validateShortDescription(desc) {
        if (!desc) return { valid: true }; // Opcjonalny
        
        if (desc.length > 100) {
            return {
                valid: false,
                error: 'Krótki opis nie może przekraczać 100 znaków'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj opis (pełny)
    validateFullDescription(desc) {
        if (!desc) return { valid: true }; // Opcjonalny
        
        if (desc.length > 1000) {
            return {
                valid: false,
                error: 'Pełny opis nie może przekraczać 1000 znaków'
            };
        }
        
        return { valid: true };
    }
    
    // Waliduj konfigurację eksportu
    validateExportConfig(config) {
        const errors = [];
        
        // Nazwa
        const nameValidation = this.validateExportName(config.name);
        if (!nameValidation.valid) {
            errors.push(nameValidation.error);
        }
        
        // Dataset
        if (!config.dataset || !['orders', 'order-items', 'products'].includes(config.dataset)) {
            errors.push('Nieprawidłowy dataset');
        }
        
        // Pola
        if (!config.selected_fields || config.selected_fields.length === 0) {
            errors.push('Wybierz co najmniej jedno pole');
        }
        
        // Google Sheets URL
        if (config.sheets && config.sheets.sheet_url) {
            const urlValidation = this.validateSheetUrl(config.sheets.sheet_url);
            if (!urlValidation.valid) {
                errors.push(urlValidation.error);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

// Export singleton
const validator = new ValidationService();
