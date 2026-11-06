import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { initTheme } from '@/lib/theme'
import { installErrorLog } from '@/lib/errorLogInstall'
import { installViewportVars } from '@/lib/visualViewport'
import App from './App'

initTheme()
installErrorLog()
installViewportVars()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
