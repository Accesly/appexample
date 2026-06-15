import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './pages/Landing';
import { SignUp } from './pages/SignUp';
import { SignIn } from './pages/SignIn';
import { CreateWallet } from './pages/CreateWallet';
import { Wallet } from './pages/Wallet';
import { SendPayment } from './pages/SendPayment';
import { RecoverPlaceholder } from './pages/RecoverPlaceholder';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignIn />} />
        {/* Recovery v1 (ZK email) removida con @accesly/core 1.0.0-pre.0.
            La nueva (OTP-email + password de Cognito) llega en 1.0.0 final
            como `recovery` namespace. Ver Plan_Final_v1.md §5. */}
        <Route path="/recover" element={<RecoverPlaceholder />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
