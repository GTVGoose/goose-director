import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import MobileApp from './mobile/MobileApp.jsx'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/app.css'

// /m/* serves the Mini Nexus mobile surface (installable PWA); everything
// else is the desktop console. Same bundle, same server, same brain.
const isMobileSurface = window.location.pathname === '/m' || window.location.pathname.startsWith('/m/')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isMobileSurface ? <MobileApp /> : <App />}
  </React.StrictMode>
)
