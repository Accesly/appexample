import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { describeError } from '../lib/errors';

export function Recover() {
  const { auth } = useAccesly();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.recover(email);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Recuperar cuenta</h1>
      <p className="accesly-hint mb-6">
        Demuestra que controlas tu email y obtén F2+F3 para reconstruir tu
        wallet en este dispositivo.
      </p>

      <InfoNote tone="warning" title="Aún no disponible">
        El flow de recovery depende del circuito ZK groth16 (Track C),
        actualmente en desarrollo. El backend tiene <code>sep30Handler</code>{' '}
        diferido hasta que el verifier on-chain esté desplegado.{' '}
        <a
          href="https://github.com/Accesly/SDKAccesly/blob/main/docs/Handoff_Fase7.md"
          target="_blank"
          rel="noreferrer"
          className="accesly-link"
        >
          Más info
        </a>
        .
      </InfoNote>

      <form onSubmit={handleRecover} className="accesly-card p-6 space-y-4 mt-6">
        <div>
          <label className="accesly-label" htmlFor="email">
            Email registrado
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
        <ErrorMessage message={error} />
        <Button type="submit" loading={loading} className="w-full">
          Iniciar recovery
        </Button>
        <p className="accesly-hint text-xs">
          Al presionar verás un error explicando que la funcionalidad aún no
          está activa. El UI está listo para conectarse cuando Track C
          aterrice.
        </p>
      </form>

      <p className="mt-6 text-sm text-center text-accesly-subtle">
        <Link to="/" className="accesly-link">
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}
