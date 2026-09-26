import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installErrorReporter } from './lib/errorReporter'
import { forgetGymWhenAccountChanges } from './lib/adminCaches'
import ErrorBoundary from './components/ErrorBoundary'

// Crashes are filed in client_errors (0095) — see errorReporter.ts.
installErrorReporter('admin')
// A new account never inherits the last one's gym — see adminCaches.ts.
forgetGymWhenAccountChanges()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
