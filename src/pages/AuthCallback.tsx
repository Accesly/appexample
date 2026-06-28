import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { formatError } from '@accesly/core';
import { ErrorMessage } from '../components/ErrorMessage';

/**
 * `/auth/callback` — landing post-Google.
 *
 * Cognito Hosted UI redirige aquí con `?code=xxx` tras el OAuth. Llamamos
 * `auth.handleAuthCallback(code)` que intercambia el code por tokens y los
 * persiste. Una vez `auth.status === 'authenticated'`, navegamos a `/wallet`.
 *
 * StrictMode dispara el effect dos veces en dev — usamos `processedRef` para
 * que el code se canjee una sola vez (Cognito invalida codes ya redimidos).
 */
export function AuthCallback() {
  const { auth } = useAccesly();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  const code = params.get('code');
  const oauthError = params.get('error');
  const oauthErrorDescription = params.get('error_description');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    if (oauthError) {
      setError(oauthErrorDescription ?? oauthError);
      return;
    }
    if (!code) {
      setError('Falta el parámetro ?code en la URL de callback.');
      return;
    }

    auth
      .handleAuthCallback(code)
      .then(() => navigate('/wallet', { replace: true }))
      .catch((err) => setError(formatError(err)));
  }, [auth, code, oauthError, oauthErrorDescription, navigate]);

  return (
    <div className="max-w-md mx-auto accesly-card p-6 text-center space-y-4">
      <h1 className="text-xl font-semibold">Completando sesión con Google…</h1>
      {error ? (
        <>
          <ErrorMessage message={error} />
          <button
            type="button"
            onClick={() => navigate('/signin', { replace: true })}
            className="accesly-link text-sm"
          >
            ← Volver a inicio de sesión
          </button>
        </>
      ) : (
        <p className="accesly-hint">
          Intercambiando el código de autorización por tokens Cognito…
        </p>
      )}
    </div>
  );
}
