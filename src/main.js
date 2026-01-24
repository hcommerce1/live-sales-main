import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'

// Create Pinia store
const pinia = createPinia()

// Create and mount Vue app
const app = createApp(App)
app.use(pinia)
app.mount('#app')

// Initial loader is removed by App.vue after auth check completes
// This ensures no flash of authenticated content before redirect
