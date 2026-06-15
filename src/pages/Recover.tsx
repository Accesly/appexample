/**
 * /recover — Recovery v2 wizard (Fase 1, 2026-06-15).
 *
 * 3 pasos:
 *   1. Email → llama `recovery.requestOtp({ email })` (rate-limit del backend
 *      protege contra abuse).
 *   2. Código (6 dígitos) + password de Cognito → llama
 *      `recovery.verifyOtp({ email, code })` para obtener el `recoveryJwt`.
 *   3. Orchestrator de finalize. La parte de descifrar F3 + reconstruir seed
 *      + registrar new passkey + firmar `rotate_signer` requiere que la SDK
 *      también guarde F2 cifrado con la `recoveryKey` (actualmente solo F3
 *      lo está). Esa pieza llega en `@accesly/core@1.0.0-pre.2`. Por ahora
 *      el wizard muestra el progreso hasta ese punto + un mensaje claro.
 *
 * Garantía no-custodial: el password de Cognito NUNCA viaja al backend
 * (Cognito usa SRP). El SDK lo usará para derivar `recoveryKey` y descifrar
 * F3 cuando el orchestrator esté completo.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { describeError } from '../lib/errors';

type Step = 'email' | 'otp' | 'finalize';
type FinalizeState =
  | { phase: 'idle' }
  | { phase: 'running'; message: string }
  | { phase: 'partial'; recoveryJwt: string; message: string }
  | { phase: 'success'; walletAddress: string; txHash: string }
  | { phase: 'error'; reason: string };

export function Recover() {
  const { recovery } = useAccesly();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalize, setFinalize] = useState<FinalizeState>({ phase: 'idle' });

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Email requerido.');
      return;
    }
    try {
      const res = await recovery.requestOtp({ email: trimmed });
      setCooldown(res.cooldownSeconds);
      setEmail(trimmed);
      setStep('otp');
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('El código debe tener 6 dígitos.');
      return;
    }
    if (password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    try {
      const res = await recovery.verifyOtp({ email, code });
      setStep('finalize');
      setFinalize({
        phase: 'partial',
        recoveryJwt: res.recoveryJwt,
        message:
          'OTP verificado y `recoveryJwt` emitido. El orchestrator del finalize ' +
          '(descifrar F3 con tu contraseña, descifrar F2, reconstruir la seed, ' +
          'registrar nuevo passkey y firmar rotate_signer) llega en ' +
          '@accesly/core@1.0.0-pre.2. Tu wallet está intacto on-chain.',
      });
    } catch (err) {
      setError(describeError(err));
    }
  }

  function reset() {
    setStep('email');
    setEmail('');
    setCode('');
    setPassword('');
    setCooldown(null);
    setError(null);
    setFinalize({ phase: 'idle' });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h2 className="text-3xl font-bold text-accesly-ink mb-2">
        Recuperar wallet
      </h2>
      <p className="text-sm text-accesly-subtle mb-8">
        OTP por email + contraseña de Cognito. El backend nunca puede descifrar
        F3 sin tu contraseña.
      </p>

      {/* Stepper visual */}
      <div className="flex items-center gap-2 mb-8 text-xs">
        <StepDot active={step === 'email'} done={step !== 'email'} label="1. Email" />
        <span className="flex-1 h-px bg-accesly-border" />
        <StepDot
          active={step === 'otp'}
          done={step === 'finalize'}
          label="2. Código + contraseña"
        />
        <span className="flex-1 h-px bg-accesly-border" />
        <StepDot active={step === 'finalize'} done={false} label="3. Rotación" />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div>
            <label className="accesly-label" htmlFor="email">
              Email asociado a tu wallet
            </label>
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
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-accesly-subtle">
            Enviamos un código a <span className="font-medium">{email}</span>
            {cooldown ? ` · espera ${cooldown}s antes de pedir otro` : ''}.
          </p>
          <div>
            <label className="accesly-label" htmlFor="otp-code">
              Código (6 dígitos)
            </label>
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
            <label className="accesly-label" htmlFor="recover-password">
              Tu contraseña de Cognito (mínimo 12 caracteres)
            </label>
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
              Nunca se envía al servidor. El SDK la usa solo en este dispositivo
              para descifrar tu F3.
            </p>
          </div>
          <button type="submit" className="accesly-btn-primary w-full">
            Verificar y continuar
          </button>
          <button type="button" onClick={reset} className="text-xs text-accesly-subtle">
            Volver
          </button>
        </form>
      )}

      {step === 'finalize' && (
        <div className="space-y-4">
          {finalize.phase === 'running' && (
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm font-medium text-blue-900">
                {finalize.message}
              </div>
            </div>
          )}

          {finalize.phase === 'partial' && (
            <div className="px-4 py-4 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-sm font-semibold text-amber-900 mb-2">
                ✓ OTP verificado · token recovery emitido
              </div>
              <div className="text-xs text-amber-800 leading-relaxed">
                {finalize.message}
              </div>
              <code className="block mt-3 text-[10px] text-amber-900 break-all font-mono">
                recoveryJwt: {finalize.recoveryJwt.slice(0, 32)}…
              </code>
            </div>
          )}

          {finalize.phase === 'success' && (
            <div className="px-4 py-4 rounded-lg bg-green-50 border border-green-200">
              <div className="text-sm font-semibold text-green-900 mb-2">
                ✓ Wallet recuperada
              </div>
              <div className="text-xs text-green-800">
                Address: <code>{finalize.walletAddress}</code>
                <br />
                txHash: <code>{finalize.txHash}</code>
              </div>
            </div>
          )}

          {finalize.phase === 'error' && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <div className="text-sm font-medium text-red-900">
                {finalize.reason}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Link to="/" className="accesly-btn-secondary flex-1 text-center">
              Inicio
            </Link>
            <button type="button" onClick={reset} className="accesly-btn-secondary flex-1">
              Reiniciar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  const ringClass = done
    ? 'bg-accesly-green text-white'
    : active
      ? 'bg-accesly-ink text-white'
      : 'bg-accesly-border text-accesly-subtle';
  return (
    <div className="flex items-center gap-2">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${ringClass}`}>
        {done ? '✓' : label.slice(0, 1)}
      </span>
      <span className="text-[11px] text-accesly-subtle hidden sm:inline">{label}</span>
    </div>
  );
}
