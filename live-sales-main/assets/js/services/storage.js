// Storage Manager - zarządzanie localStorage z limitami i walidacją
// Live Sales V7

class StorageManager {
    constructor() {
        this.prefix = 'livesales_';
        this.maxSizeBytes = 5 * 1024 * 1024; // 5MB limit (bezpieczny dla Safari)
    }
    
    // Pobierz dane
    get(key) {
        try {
            const fullKey = this.prefix + key;
            const item = localStorage.getItem(fullKey);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Storage get error:', error);
            return null;
        }
    }
    
    // Zapisz dane
    set(key, value) {
        try {
            const fullKey = this.prefix + key;
            const jsonString = JSON.stringify(value);
            
            // Sprawdź limit rozmiaru
            const currentSize = this.getCurrentSize();
            const newItemSize = new Blob([jsonString]).size;
            
            if (currentSize + newItemSize > this.maxSizeBytes) {
                console.warn('Storage quota warning: approaching limit');
                this.showQuotaWarning();
                return false;
            }
            
            localStorage.setItem(fullKey, jsonString);
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.error('Storage quota exceeded!');
                this.handleQuotaExceeded();
            } else {
                console.error('Storage set error:', error);
            }
            return false;
        }
    }
    
    // Usuń dane
    remove(key) {
        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
    
    // Wyczyść wszystko
    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }
    
    // Pobierz aktualny rozmiar storage
    getCurrentSize() {
        let total = 0;
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                const item = localStorage.getItem(key);
                total += new Blob([item]).size;
            }
        });
        
        return total;
    }
    
    // Sprawdź procent wykorzystania
    getUsagePercent() {
        const current = this.getCurrentSize();
        return Math.round((current / this.maxSizeBytes) * 100);
    }
    
    // Wyświetl ostrzeżenie o limicie
    showQuotaWarning() {
        const percent = this.getUsagePercent();
        if (percent > 80) {
            console.warn(`Storage usage: ${percent}% - Consider cleaning old data`);
        }
    }
    
    // Obsłuż przekroczenie limitu
    handleQuotaExceeded() {
        alert('Pamięć przeglądarki jest pełna! Usuń stare eksporty lub wyczyść dane.');
    }
    
    // Eksportuj wszystkie dane (backup)
    exportAll() {
        const data = {};
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                const shortKey = key.replace(this.prefix, '');
                data[shortKey] = this.get(shortKey);
            }
        });
        
        return data;
    }
    
    // Importuj dane (restore)
    importAll(data) {
        try {
            Object.keys(data).forEach(key => {
                this.set(key, data[key]);
            });
            return true;
        } catch (error) {
            console.error('Storage import error:', error);
            return false;
        }
    }
}

// Export singleton
const storage = new StorageManager();
