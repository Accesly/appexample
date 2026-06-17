import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { formatError, txExplorerUrl } from '@accesly/core';

/**
 * /recover — Recovery v2 (1.1.0).
 *
 * 3 pasos visibles:
 *   1. Email → recovery.requestOtp.
 *   2. OTP + password → recovery.verifyOtp → recoveryJwt.
 *   3. password + recoveryJwt → recovery.finalize.
 *
 * Todo lo crypto (reconstructSeed + registerPasskey + HKDF + Shamir + sign +
 * submit + persistir CredentialRecord nuevo) vive dentro de
 * `recovery.finalize` — el integrador solo provee email + password.
 */

type Step = 'email' | 'otp' | 'finalizing';
type FinalizeState =
  | { phase: 'idle' }
  | { phase: 'running'; message: string }
  | { phase: 'success'; walletAddress: string; txHash: string; explorerUrl: string }
  | { phase: 'error'; reason: string };

export function Recover() {
  const { recovery } = useAccesly();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FinalizeState>({ phase: 'idle' });

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await recovery.requestOtp({ email: email.trim().toLowerCase() });
      setStep('otp');
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('El código debe tener 6 dígitos.');
    if (password.length < 12) return setError('La contraseña debe tener al menos 12 caracteres.');

    setStep('finalizing');
    setState({ phase: 'running', message: 'Verificando OTP…' });

    try {
      const verify = await recovery.verifyOtp({ email, code });

      setState({
        phase: 'running',
        message: 'Reconstruyendo seed + registrando nuevo passkey + rotando signer on-chain…',
      });

      const result = await recovery.finalize({
        email,
        password,
        recoveryJwt: verify.recoveryJwt,
      });

      setState({
        phase: 'success',
        walletAddress: result.walletAddress,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl ?? txExplorerUrl(result.txHash),
      });
    } catch (err) {
      setState({ phase: 'error', reason: formatError(err) });
    }
  }

  function reset() {
    setStep('email');
    setEmail('');
    setCode('');
    setPassword('');
    setError(null);
    setState({ phase: 'idle' });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h2 className="text-3xl font-bold text-accesly-ink mb-2">Recuperar wallet</h2>
      <p className="text-sm text-accesly-subtle mb-8">
        OTP por email + contraseña de Cognito. El backend nunca puede descifrar
        F3 sin tu contraseña.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div>
            <label className="accesly-label" htmlFor="email">Email asociado a tu wallet</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="accesly-input"
            />
            <p className="text-xs text-accesly-subtle mt-2">
              Te enviaremos un código de 6 dígitos. Vence en 10 minutos.
            </p>
          </div>
          <button type="submit" className="accesly-btn-primary w-full">
            Enviar código
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleFinalize} className="space-y-4">
          <p className="text-sm text-accesly-subtle">
            Enviamos un código a <span className="font-medium">{email}</span>.
          </p>
          <div>
            <label className="accesly-label" htmlFor="otp-code">Código (6 dígitos)</label>
            <input
              id="otp-code"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              className="accesly-input tracking-widest text-center text-lg"
            />
          </div>
          <div>
            <label className="accesly-label" htmlFor="recover-password">Tu contraseña</label>
            <input
              id="recover-password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="accesly-input"
            />
            <p className="text-xs text-accesly-subtle mt-2">
              Nunca se envía al server. El SDK la usa solo en este dispositivo
              para descifrar F2 y F3.
            </p>
          </div>
          <button type="submit" className="accesly-btn-primary w-full">
            Verificar y reconstruir
          </button>
          <button type="button" onClick={reset} className="text-xs text-accesly-subtle">
            Volver
          </button>
        </form>
      )}

      {step === 'finalizing' && (
        <div className="space-y-4">
          {state.phase === 'running' && (
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-blue-700 border-r-transparent rounded-full animate-spin" />
                {state.message}
              </div>
            </div>
          )}

          {state.phase === 'success' && (
            <div className="px-4 py-4 rounded-lg bg-green-50 border border-green-200 space-y-3">
              <div className="text-sm font-semibold text-green-900">
                ✓ Wallet rotada exitosamente
              </div>
              <div className="text-xs text-green-800">
                El Smart Account ahora autoriza con tu nuevo passkey + contraseña.
                El viejo ya NO firma.
              </div>
              <div className="text-[10px] font-mono text-green-900 break-all">
                Smart Account: {state.walletAddress}
              </div>
              <a
                href={state.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-700 underline"
              >
                Ver tx rotate_signer →
              </a>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
              {state.reason}
            </div>
          )}

          <div className="flex gap-2">
            <Link to="/" className="accesly-btn-secondary flex-1 text-center">Inicio</Link>
            <button type="button" onClick={reset} className="accesly-btn-secondary flex-1">
              Reiniciar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
