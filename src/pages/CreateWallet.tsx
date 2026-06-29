import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { CreateWalletFlow } from '@accesly/react/kit';

/**
 * Wrapper de `<CreateWalletFlow>` que primero pide el password (el AuthForm
 * lo descarta tras signIn por seguridad). El SDK necesita el password para
 * derivar la `recoveryKey` que cifra F3 — sin esto, recovery v2 no funciona.
 */
export function CreateWallet() {
  const navigate = useNavigate();
  const { auth } = useAccesly();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!auth.username) {
    // No deberíamos estar aquí — el AuthGuard nos manda a /signin si no hay sesión.
    return <p className="text-sm text-neutral-500">Cargando sesión…</p>;
  }

  if (!confirmed) {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (password) setConfirmed(true);
        }}
        className="w-full max-w-sm mx-auto p-6 space-y-4"
      >
        <header className="text-center">
          <h2 className="text-lg font-semibold">Confirma tu password</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Lo usamos para cifrar tu llave de recovery (PBKDF2 600k). El SDK lo zeroiza al
            terminar.
          </p>
        </header>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tu password de Cognito"
          className="w-full rounded-xl border border-neutral-200 px-4 py-3 bg-transparent"
        />
        <button
          type="submit"
          disabled={!password}
          className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-50"
          style={{ background: 'var(--accesly-primary, #8B6CE7)' }}
        >
          Continuar
        </button>
      </form>
    );
  }

  return (
    <CreateWalletFlow
      email={auth.username}
      password={password}
      onDone={() => {
        setPassword(''); // zeroize at the integrator level too
        navigate('/wallet');
      }}
    />
  );
}
