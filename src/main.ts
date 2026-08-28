import { createApp } from 'vue'
import App from './App.vue'
import { initializeTheme } from './composables/useTheme'
import './style.css'
import './opium.css'

initializeTheme()
createApp(App).mount('#app')
