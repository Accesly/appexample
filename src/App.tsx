import { Navigate, Route, Routes } from 'react-router-dom';
import { useBranding } from '@accesly/react';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './pages/Landing';
import { SignUp } from './pages/SignUp';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import { CreateWallet } from './pages/CreateWallet';
import { Wallet } from './pages/Wallet';
import { SendPayment } from './pages/SendPayment';
import { Swap } from './pages/Swap';
import { Fiat } from './pages/Fiat';
import { Recover } from './pages/Recover';
import { DevTools } from './pages/DevTools';
import { KitDemo } from './pages/KitDemo';

export function App() {
  // Phase 3: live branding tokens. The hook writes the appConfig colours to
  // document.documentElement as CSS vars; Tailwind picks them up wherever the
  // theme references --accesly-primary (etc.).
  useBranding();
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* QA: validate dashboard appConfig propagates to SDK hooks + kit. */}
        <Route path="/kit" element={<KitDemo />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignIn />} />
        {/* Google OAuth landing — Cognito Hosted UI redirige aquí con ?code=xxx. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Recovery v2 (Fase 1, 2026-06-15): wizard 3 pasos email→OTP→password. */}
        <Route path="/recover" element={<Recover />} />
        <Route
          path="/create-wallet"
          element={
            <AuthGuard>
              <CreateWallet />
            </AuthGuard>
          }
        />
        <Route
          path="/wallet"
          element={
            <AuthGuard>
              <Wallet />
            </AuthGuard>
          }
        />
        <Route
          path="/send"
          element={
            <AuthGuard>
              <SendPayment />
            </AuthGuard>
          }
        />
        <Route
          path="/swap"
          element={
            <AuthGuard>
              <Swap />
            </AuthGuard>
          }
        />
        <Route
          path="/fiat"
          element={
            <AuthGuard>
              <Fiat />
            </AuthGuard>
          }
        />
        {/* /dev-tools — flujos que en producción viven en el dashboard del developer,
            no en la UI del end-user. Expuestos aquí solo para QA local. */}
        <Route
          path="/dev-tools"
          element={
            <AuthGuard>
              <DevTools />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
