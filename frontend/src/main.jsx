import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { PreferencesProvider } from './context/PreferencesContext.jsx'

// Use BrowserRouter for clean URLs (without #)
// For production on GitHub Pages, you may need to use HashRouter instead
// URLs will look like: http://localhost:5173/profile (instead of /#/profile)
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </BrowserRouter>
)
