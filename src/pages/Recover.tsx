/**
 * /recover — Recovery v2 wizard (Fase 1, 2026-06-15).
 *
 * 3 pasos:
 *   1. Email → `recovery.requestOtp({ email })`.
 *   2. Código 6 dígitos + password de Cognito → `recovery.verifyOtp` →
 *      recoveryJwt.
 *   3. Password + recoveryJwt → `recovery.reconstructSeed`.
 *      Trae F2_recovery + F3 del backend, descifra ambos con la
 *      `recoveryKey` derivada del password, y reconstruye la seed via
 *      Shamir 2-de-3.
 *
 * Tras `reconstructSeed` el cliente tiene la seed ed25519 reconstruida +
 * la recoveryKey. Falta el último paso: construir + firmar la tx
 * `rotate_signer` y enviarla al backend con `submitFinalize`. Eso requiere
 * un endpoint backend `simulate-tx` para `rotate_signer` (no para
 * `XLM_SAC.transfer` como el existente) — llega en `@accesly/core@1.0.0-pre.3`.
 *
 * Lo que sí está validado end-to-end ahora:
 *  - Backend cifra-bind F2 + F3 con recoveryKey en createWallet.
 *  - Backend devuelve F2_recovery + F3 en GET /fragments/3.
 *  - SDK descifra ambos con recoveryKey + reconstruye seed via Shamir.
 *
 * Garantía no-custodial demostrada: el backend NUNCA tuvo el password,
 * NUNCA descifró F2 ni F3. El seed se reconstruye exclusivamente en el
 * cliente.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { describeError } from '../lib/errors';

type Step = 'email' | 'otp' | 'reconstruct';
type ReconstructState =
  | { phase: 'idle' }
  | { phase: 'running'; message: string }
  | {
      phase: 'success';
      publicKeyHex: string;
      walletAddressHint: string;
    }
  | { phase: 'error'; reason: string };

function hex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function Recover() {
  const { recovery } = useAccesly();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryJwt, setRecoveryJwt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconstruct, setReconstruct] = useState<ReconstructState>({ phase: 'idle' });

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

  async function handleVerifyAndReconstruct(e: React.FormEvent) {
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

    setStep('reconstruct');
    setReconstruct({ phase: 'running', message: 'Verificando OTP…' });

    try {
      const verify = await recovery.verifyOtp({ email, code });
      setRecoveryJwt(verify.recoveryJwt);

      setReconstruct({
        phase: 'running',
        message: 'Descifrando F2 + F3 + reconstruyendo seed via Shamir…',
      });

      const cognitoPassword = new TextEncoder().encode(password);
      try {
        const seedResult = await recovery.reconstructSeed({
          cognitoPassword,
          recoveryJwt: verify.recoveryJwt,
        });

        const publicKeyHex = hex(seedResult.publicKey);

        // Zeroize sensitive material.
        for (let i = 0; i < seedResult.privateSeed.length; i += 1) {
          seedResult.privateSeed[i] = 0;
        }
        for (let i = 0; i < seedResult.recoveryKey.length; i += 1) {
          seedResult.recoveryKey[i] = 0;
        }

        setReconstruct({
          phase: 'success',
          publicKeyHex,
          walletAddressHint:
            'La seed reconstruida deriva esta pubkey ed25519. Te corresponde con el owner del Smart Account; ' +
            'el address (C…) del contrato es deterministic por deployer + salt y se queda igual tras la rotación.',
        });
      } finally {
        for (let i = 0; i < cognitoPassword.length; i += 1) cognitoPassword[i] = 0;
      }
    } catch (err) {
      setReconstruct({ phase: 'error', reason: describeError(err) });
    }
  }

  function reset() {
    setStep('email');
    setEmail('');
    setCode('');
    setPassword('');
    setRecoveryJwt(null);
    setCooldown(null);
    setError(null);
    setReconstruct({ phase: 'idle' });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h2 className="text-3xl font-bold text-accesly-ink mb-2">Recuperar wallet</h2>
      <p className="text-sm text-accesly-subtle mb-8">
        OTP por email + contraseña de Cognito. El backend nunca puede descifrar F3
        sin tu contraseña.
      </p>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8 text-xs">
        <StepDot active={step === 'email'} done={step !== 'email'} label="1. Email" />
        <span className="flex-1 h-px bg-accesly-border" />
        <StepDot
          active={step === 'otp'}
          done={step === 'reconstruct'}
          label="2. Código + contraseña"
        />
        <span className="flex-1 h-px bg-accesly-border" />
        <StepDot
          active={step === 'reconstruct'}
          done={reconstruct.phase === 'success'}
          label="3. Reconstrucción"
        />
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
        <form onSubmit={handleVerifyAndReconstruct} className="space-y-4">
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
              para descifrar tu F2 y F3.
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

      {step === 'reconstruct' && (
        <div className="space-y-4">
          {reconstruct.phase === 'running' && (
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-blue-700 border-r-transparent rounded-full animate-spin" />
                {reconstruct.message}
              </div>
            </div>
          )}

          {reconstruct.phase === 'success' && (
            <>
              <div className="px-4 py-4 rounded-lg bg-green-50 border border-green-200">
                <div className="text-sm font-semibold text-green-900 mb-2">
                  ✓ Seed reconstruida en este dispositivo
                </div>
                <div className="text-xs text-green-800 mb-2 leading-relaxed">
                  El backend devolvió F2_recovery + F3 cifrados con tu password. El SDK
                  los descifró localmente y reconstruyó la seed via Shamir 2-de-3.
                  El backend NUNCA tuvo el password ni vio las shares en plano.
                </div>
                <div className="text-[10px] font-mono text-green-900 break-all mt-3">
                  Owner ed25519 pubkey:
                  <br />
                  {reconstruct.publicKeyHex}
                </div>
              </div>
              <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-800 leading-relaxed">
                  <strong>Próximo paso (1.0.0-pre.3):</strong> firmar la tx{' '}
                  <code>rotate_signer</code> con la seed reconstruida + nuevo passkey,
                  y enviarla al backend (<code>recovery.submitFinalize</code>). Esto
                  requiere un endpoint <code>simulate-tx-rotate-signer</code> que aún
                  no está expuesto.
                </div>
                <div className="text-[10px] font-mono text-amber-900 break-all mt-2">
                  recoveryJwt:{' '}
                  {recoveryJwt ? recoveryJwt.slice(0, 32) + '…' : '(none)'}
                </div>
              </div>
            </>
          )}

          {reconstruct.phase === 'error' && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <div className="text-sm font-medium text-red-900">{reconstruct.reason}</div>
              <div className="text-xs text-red-700 mt-2">
                Causas comunes: contraseña incorrecta, OTP expirado, o la wallet fue
                creada antes de la Fase 1 (sin F2 cipher-bound a recoveryKey — no es
                recuperable por OTP).
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
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${ringClass}`}
      >
        {done ? '✓' : label.slice(0, 1)}
      </span>
      <span className="text-[11px] text-accesly-subtle hidden sm:inline">{label}</span>
    </div>
  );
}
