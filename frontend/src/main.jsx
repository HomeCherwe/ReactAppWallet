import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { PreferencesProvider } from './context/PreferencesContext.jsx'

// Use HashRouter for GitHub Pages and Capacitor compatibility
// URLs will look like: http://localhost:5173/#/profile
// This works on GitHub Pages and Capacitor without additional configuration
createRoot(document.getElementById('root')).render(
  <HashRouter>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </HashRouter>
)

// Ховаємо Capacitor SplashScreen після того як React змонтувався
// try/catch потрібен щоб не ламати звичайну веб-версію
try {
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide()
  })
} catch {
  // Не в Capacitor — ігноруємо
}
