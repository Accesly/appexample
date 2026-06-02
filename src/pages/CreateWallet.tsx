import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { WalletStatusBadge } from '../components/WalletStatusBadge';
import { describeError } from '../lib/errors';
import { getCredential, saveCredential } from '../lib/credentialStore';
import {
  ensureWalletWithPasskey,
  type WalletStatus,
} from '../lib/walletFlow';

type Phase = 'idle' | 'creating' | 'success';

export function CreateWallet() {
  const { auth, wallet } = useAccesly();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [createdNow, setCreatedNow] = useState<boolean>(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!auth.username) return;
    void (async () => {
      const cred = await getCredential(auth.username!);
      if (cred) navigate('/wallet', { replace: true });
    })();
  }, [auth.username, navigate]);

  async function persistStatusUpdate(newStatus: WalletStatus) {
    if (!auth.username) return;
    const cred = await getCredential(auth.username);
    if (cred) {
      await saveCredential({
        ...cred,
        lastKnownStatus: newStatus,
        lastStatusCheck: Date.now(),
      });
    }
  }

  async function handleEnsure(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.username) {
      setError('No hay sesión activa. Inicia sesión de nuevo.');
      return;
    }
    setError(null);
    setPhase('creating');
    try {
      const result = await ensureWalletWithPasskey({
        email: auth.username,
        password,
        walletApi: wallet,
      });
      setWalletAddress(result.walletAddress);
      setStatus(result.status);
      setCreatedNow(result.createdNow);
      await persistStatusUpdate(result.status);
      setPhase('success');
      setPassword('');
      // Si está on-chain, redirige rápido. Si pending, deja al usuario verlo.
      if (result.status === 'on-chain') {
        setTimeout(() => navigate('/wallet'), 1500);
      }
    } catch (err) {
      setError(describeError(err));
      setPhase('idle');
    }
  }

  async function handleRetry() {
    if (!auth.username) return;
    setRetrying(true);
    setError(null);
    try {
      // `wallet.retryDeploy` reintentará el deploy on-chain sin generar nuevo
      // keypair ni pedir passkey — usa los shards ya persistidos en IndexedDB.
      const result = await wallet.retryDeploy(auth.username);
      setStatus(result.status);
      setWalletAddress(result.walletAddress);
      await persistStatusUpdate(result.status);
      if (result.status === 'on-chain') {
        setTimeout(() => navigate('/wallet'), 1200);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRetrying(false);
    }
  }

  // Polling automático mientras estemos en pending-deploy / unknown.
  useEffect(() => {
    if (phase !== 'success') return;
    if (status === 'on-chain' || status == null) return;
    if (!auth.username) return;

    const interval = setInterval(async () => {
      try {
        const remote = await wallet.fetchRemote();
        if (!remote) return;
        const nextStatus: WalletStatus = remote.onChain
          ? 'on-chain'
          : 'pending-deploy';
        setStatus(nextStatus);
        await persistStatusUpdate(nextStatus);
        if (nextStatus === 'on-chain') {
          clearInterval(interval);
          setTimeout(() => navigate('/wallet'), 1000);
        }
      } catch {
        // Silenciar errores transitorios del polling
      }
    }, 30_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, status, auth.username]);

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Crea tu wallet Stellar</h1>
      <p className="accesly-hint mb-6">
        Vas a registrar un passkey y desplegar (o recuperar) un Smart Account
        en Stellar testnet. Si ya existe una wallet asociada a tu cuenta, la
        recuperamos sin re-deployar.
      </p>

      <div className="accesly-card p-6 space-y-5">
        {phase !== 'success' && (
          <ol className="space-y-3 text-sm">
            {[
              'Consultamos al backend si ya tienes una wallet (GET /wallets)',
              'Si existe → la recuperamos sin re-deployar y sin gastar fees',
              'Si no existe → registramos un passkey y splits Shamir 2-of-3 client-side',
              'F2 y F3 se cifran con AES-256-GCM antes de salir del navegador',
              'POST /wallets con crash-safety: shards persistidos antes del network call',
            ].map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-accesly-accent text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-accesly-subtle">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {phase !== 'success' && (
          <form onSubmit={handleEnsure} className="space-y-4 pt-2">
            <div>
              <label className="accesly-label" htmlFor="password">
                Tu contraseña (re-confirmamos para derivar F3)
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="accesly-input"
                placeholder="••••••••"
                disabled={phase !== 'idle'}
              />
              <p className="accesly-hint mt-1.5 text-xs">
                F3 se cifra con PBKDF2(email + contraseña) para que la
                recuperación pueda re-derivarlo desde otro dispositivo (cuando
                Track C ZK esté activo).
              </p>
            </div>
            <ErrorMessage message={error} />
            <Button
              type="submit"
              loading={phase === 'creating'}
              className="w-full"
            >
              {phase === 'creating'
                ? 'Verificando con backend…'
                : 'Crear o recuperar wallet'}
            </Button>
          </form>
        )}

        {phase === 'success' && walletAddress && status && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-accesly-ink">
                  {createdNow ? 'Wallet creada' : 'Wallet recuperada'}
                </div>
                <div className="accesly-hint text-xs mt-0.5">
                  {createdNow
                    ? 'POST /wallets aceptado, shards persistidos localmente.'
                    : 'Ya tenías wallet asociada a este email — sin re-deploy.'}
                </div>
              </div>
              <WalletStatusBadge status={status} />
            </div>

            <code className="block font-mono text-xs break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {walletAddress}
            </code>

            {status === 'pending-deploy' && (
              <>
                <InfoNote tone="warning" title="Deploy on-chain pendiente">
                  Tus shards están seguros en el backend pero la confirmación
                  on-chain todavía no llega. Esto es normal mientras Phase 1
                  esté bloqueada. Podés esperar (se re-verifica solo cada 30s)
                  o forzar un reintento.
                </InfoNote>
                <ErrorMessage message={error} />
                <Button
                  variant="secondary"
                  loading={retrying}
                  onClick={handleRetry}
                  className="w-full"
                >
                  Reintentar deploy
                </Button>
              </>
            )}

            {status === 'unknown' && (
              <InfoNote tone="info" title="Verificando status">
                Esperando confirmación del backend. La página se actualiza
                automáticamente cada 30s.
              </InfoNote>
            )}

            {status === 'on-chain' && (
              <p className="accesly-hint text-xs text-center">
                Redirigiendo a tu wallet…
              </p>
            )}
          </div>
        )}
      </div>

      {phase !== 'success' && (
        <div className="mt-6">
          <InfoNote tone="info" title="Crash-safety en 0.2.0+">
            La SDK persiste credentialId + prfSalt + F1 cifrado en IndexedDB
            ANTES de hacer el POST. Si la red se cae justo entre la persistencia
            local y la confirmación del deploy, los shards sobreviven —
            siguiente sesión, ensureWallet recupera el address del backend y el
            record local sigue intacto. Si el deploy on-chain falla, podés
            invocar <code>wallet.retryDeploy(email)</code> sin perder nada.
          </InfoNote>
        </div>
      )}
    </div>
  );
}
