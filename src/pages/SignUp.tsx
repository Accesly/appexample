import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { formatError } from '@accesly/core';

type Step = 'form' | 'confirm';

export function SignUp() {
  const { auth } = useAccesly();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.signUp(email, password);
      setStep('confirm');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.confirmSignUp(email, code);
      // Auto sign-in tras confirmar.
      await auth.signIn(email, password);
      navigate('/create-wallet', { replace: true });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    try {
      await auth.resendConfirmation(email);
      setResent(true);
    } catch (err) {
      setError(formatError(err));
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">
        {step === 'form' ? 'Crea tu cuenta' : 'Verifica tu email'}
      </h1>
      <p className="accesly-hint mb-6">
        {step === 'form'
          ? 'Email + contraseña. Cognito te enviará un código de verificación.'
          : `Te enviamos un código a ${email}. Ingrésalo abajo.`}
      </p>

      <div className="accesly-card p-6 space-y-4">
        {step === 'form' && (
          <>
            <GoogleSignInButton onError={setError} />
            <div className="flex items-center gap-3 text-xs text-accesly-subtle">
              <span className="flex-1 border-t border-accesly-border" />
              o con email
              <span className="flex-1 border-t border-accesly-border" />
            </div>
            <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="accesly-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                className="accesly-input"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="accesly-label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="accesly-input"
                placeholder="Mínimo 8 caracteres"
              />
              <p className="accesly-hint mt-1.5 text-xs">
                Cognito requiere mayúsculas, minúsculas, número y símbolo.
              </p>
            </div>
            <ErrorMessage message={error} />
            <Button type="submit" loading={loading} className="w-full">
              Continuar
            </Button>
            </form>
          </>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="accesly-label" htmlFor="code">
                Código de verificación
              </label>
              <input
                id="code"
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="accesly-input font-mono tracking-widest text-center text-lg"
                placeholder="123456"
              />
            </div>
            <ErrorMessage message={error} />
            {resent && (
              <InfoNote tone="info">
                Reenviamos el código. Revisa tu bandeja.
              </InfoNote>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Verificar y continuar
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                className="accesly-link"
              >
                Reenviar código
              </button>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="text-accesly-subtle hover:text-accesly-ink"
              >
                ← Cambiar email
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-6 text-sm text-center text-accesly-subtle">
        ¿Ya tienes cuenta?{' '}
        <Link to="/signin" className="accesly-link">
          Inicia sesión
        </Link>
      </p>

      {step === 'form' && (
        <div className="mt-6">
          <InfoNote tone="info" title="Backend en sandbox">
            El backend dev usa SES en modo sandbox: el email debe estar
            pre-verificado por AWS para recibir el código. Si vas a usar un
            email distinto a <code>acceslyoficial@gmail.com</code>, pide al
            equipo que lo añada a la lista verificada.
          </InfoNote>
        </div>
      )}
    </div>
  );
}
