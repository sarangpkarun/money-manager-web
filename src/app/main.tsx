import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { initTheme } from '@/lib/theme'
import { installErrorLog } from '@/lib/errorLogInstall'
import App from './App'

initTheme()
installErrorLog()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
