import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WalletProvider } from './providers/WalletProvider'
import App from './App'
import './index.css'

/** Empty basename at site root — `basename="/"` breaks some path matches. */
const rawBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const routerBasename = rawBase && rawBase !== '/' ? rawBase : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <WalletProvider>
        <App />
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
)
