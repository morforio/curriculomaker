import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n.ts'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { PlansPage } from './features/billing/PlansPage.tsx'
import { BackgroundFx } from './features/motion/BackgroundFx.tsx'
import { MotionToggle } from './features/motion/MotionToggle.tsx'
import { LegalPage } from './legal/LegalPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackgroundFx />
    <MotionToggle />
    {/* Sem biblioteca de rotas (o servidor devolve o mesmo index.html para qualquer caminho). Termos e privacidade abrem sem login. */}
    {location.pathname === '/termos' ? (
      <LegalPage kind="terms" />
    ) : location.pathname === '/privacidade' ? (
      <LegalPage kind="privacy" />
    ) : (
      <AuthGate>{location.pathname === '/planos' ? <PlansPage /> : <App />}</AuthGate>
    )}
  </StrictMode>,
)
