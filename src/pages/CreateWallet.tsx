import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly, useWalletStatus } from '@accesly/react';
import { formatError } from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { WalletStatusBadge } from '../components/WalletStatusBadge';

type Phase = 'idle' | 'creating' | 'success';

/**
 * /create-wallet — registra (o recupera) el Smart Account del user.
 *
 * Toda la plumbing histórica (registerPasskey + HKDF + PBKDF2 + Shamir) vive
 * dentro de `wallet.bootstrap` en el SDK. El status on-chain se streamea via
 * `useWalletStatus` (SSE + backoff inteligente — sin setInterval).
 */
export function CreateWallet() {
  const { auth, wallet } = useAccesly();
  const navigate = useNavigate();
  const walletStatus = useWalletStatus();

  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Si el user ya tiene wallet on-chain, salta a /wallet.
  useEffect(() => {
    if (phase === 'idle' && walletStatus.status === 'on-chain') {
      navigate('/wallet', { replace: true });
    }
  }, [walletStatus.status, phase, navigate]);

  // Tras crear exitosamente y confirmarse on-chain, redirige.
  useEffect(() => {
    if (phase === 'success' && walletStatus.status === 'on-chain') {
      const id = setTimeout(() => navigate('/wallet'), 1000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [phase, walletStatus.status, navigate]);

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.username) {
      setError('No hay sesión activa.');
      return;
    }
    setError(null);
    setPhase('creating');
    try {
      await wallet.bootstrap({ email: auth.username, password });
      setPhase('success');
      setPassword('');
      // El status hook detectará on-chain y nos llevará a /wallet.
    } catch (err) {
      setError(formatError(err));
      setPhase('idle');
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Crea tu wallet Stellar</h1>
      <p className="accesly-hint mb-6">
        Registramos un passkey (Touch ID, Face ID, Windows Hello) y desplegamos
        un Smart Account en Stellar testnet. Si ya tenés wallet asociada a tu
        cuenta, la recuperamos sin re-deployar.
      </p>

      <div className="accesly-card p-6 space-y-5">
        {phase !== 'success' && (
          <form onSubmit={handleBootstrap} className="space-y-4">
            <div>
              <label className="accesly-label" htmlFor="password">
                Tu contraseña de Cognito
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="accesly-input"
                placeholder="••••••••"
                disabled={phase !== 'idle'}
              />
              <p className="accesly-hint mt-1.5 text-xs">
                Mínimo 12 caracteres. Nunca sale del navegador en plano — solo
                se usa para derivar la <code>recoveryKey</code> que cifra F3.
              </p>
            </div>
            <ErrorMessage message={error} />
            <Button type="submit" loading={phase === 'creating'} className="w-full">
              {phase === 'creating' ? 'Registrando passkey + creando wallet…' : 'Crear o recuperar wallet'}
            </Button>
          </form>
        )}

        {phase === 'success' && walletStatus.walletAddress && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-accesly-ink">Wallet creada</div>
                <div className="accesly-hint text-xs mt-0.5">
                  Esperando confirmación on-chain del Smart Account…
                </div>
              </div>
              <WalletStatusBadge status={walletStatus.status === 'no-wallet' ? 'unknown' : walletStatus.status} />
            </div>

            <code className="block font-mono text-xs break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {walletStatus.walletAddress}
            </code>

            {walletStatus.status === 'on-chain' && (
              <p className="accesly-hint text-xs text-center">Redirigiendo a tu wallet…</p>
            )}
          </div>
        )}
      </div>

      {phase !== 'success' && (
        <div className="mt-6">
          <InfoNote tone="info" title="No-custodial guarantee">
            Tu seed se genera client-side, se splittea con Shamir 2-of-3, F1 vive
            en este device cifrado con tu passkey via PRF; F2 + F3 viajan al
            backend cifrados con keys que solo vos podés re-derivar. El backend
            nunca tiene material para firmar como tu Smart Account.
          </InfoNote>
        </div>
      )}
    </div>
  );
}
