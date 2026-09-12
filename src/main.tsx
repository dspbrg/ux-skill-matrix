import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './dspbrg-theme.css'
import './styles.css'
import './coa-theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
