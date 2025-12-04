import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { PreferencesProvider } from './context/PreferencesContext.jsx'

// Use HashRouter for GitHub Pages compatibility
// URLs will look like: http://localhost:5173/#/profile
// This works on GitHub Pages without additional configuration
createRoot(document.getElementById('root')).render(
  <HashRouter>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </HashRouter>
)
