import { Navigate, Route, Routes } from 'react-router-dom';
import { useBranding } from '@accesly/react';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './pages/Landing';
import { SignUp } from './pages/SignUp';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import { Recover } from './pages/Recover';
import { CreateWallet } from './pages/CreateWallet';
import { Wallet } from './pages/Wallet';
import { Swap } from './pages/Swap';
import { History } from './pages/History';

export function App() {
  // Phase 3: live branding tokens — el SDK pinta CSS vars del dashboard al
  // documentElement; Tailwind las consume vía `var(--accesly-primary)`.
  useBranding();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
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
          path="/swap"
          element={
            <AuthGuard>
              <Swap />
            </AuthGuard>
          }
        />
        <Route
          path="/history"
          element={
            <AuthGuard>
              <History />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
