import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Create and mount Vue app
const app = createApp(App)
app.mount('#app')

// Initial loader is removed by App.vue after auth check completes
// This ensures no flash of authenticated content before redirect
