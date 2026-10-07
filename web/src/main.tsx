import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n.ts'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { BackgroundFx } from './features/motion/BackgroundFx.tsx'
import { MotionToggle } from './features/motion/MotionToggle.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackgroundFx />
    <MotionToggle />
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
