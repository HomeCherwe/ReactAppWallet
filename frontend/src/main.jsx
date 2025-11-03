import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'

// Use HashRouter for GitHub Pages compatibility (works without server config)
// URLs will look like: https://username.github.io/repo/#/profile
createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
