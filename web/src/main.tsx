import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n.ts'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { PlansPage } from './features/billing/PlansPage.tsx'
import { BackgroundFx } from './features/motion/BackgroundFx.tsx'
import { MotionToggle } from './features/motion/MotionToggle.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackgroundFx />
    <MotionToggle />
    <AuthGate>
      {/* Sem biblioteca de rotas: o site tem duas telas. /planos (o servidor devolve o mesmo index.html para qualquer caminho) e o editor. */}
      {location.pathname === '/planos' ? <PlansPage /> : <App />}
    </AuthGate>
  </StrictMode>,
)
