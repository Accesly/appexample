import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { describeError } from '../lib/errors';
import { getCredential } from '../lib/credentialStore';

interface LocationState {
  from?: string;
}

export function SignIn() {
  const { auth } = useAccesly();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as LocationState | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'authenticated') {
      navigate(fromPath ?? '/wallet', { replace: true });
    }
  }, [auth.status, fromPath, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.signIn(email, password);
      // ¿Ya tiene wallet local? Si sí, va a /wallet. Si no, a /create-wallet.
      const local = await getCredential(email);
      navigate(local ? '/wallet' : '/create-wallet', { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Inicia sesión</h1>
      <p className="accesly-hint mb-6">
        Cognito autentica con USER_SRP_AUTH — tu contraseña jamás sale del
        navegador en plano.
      </p>

      <div className="accesly-card p-6">
        <form onSubmit={handleSignIn} className="space-y-4">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="accesly-input"
              placeholder="••••••••"
            />
          </div>
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/signup" className="accesly-link">
          Crear cuenta nueva
        </Link>
        <Link to="/recover" className="text-accesly-subtle hover:text-accesly-ink">
          ¿Perdiste tu dispositivo?
        </Link>
      </div>
    </div>
  );
}
