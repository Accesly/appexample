import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

/**
 * Banner que sale en el header cuando la SDK detecta wallets locales que no
 * pudieron confirmar deploy on-chain (`wallet.getPendingWallets()`). Le da
 * visibilidad al usuario y un link rápido para reintentar.
 */
export function PendingWalletsBanner() {
  const { auth, wallet } = useAccesly();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      setPendingCount(0);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const list = await wallet.getPendingWallets();
        if (alive) setPendingCount(list?.length ?? 0);
      } catch {
        // Silenciar errores transitorios
      }
    })();
    return () => {
      alive = false;
    };
  }, [auth.status, wallet]);

  if (pendingCount === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-amber-900">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Tenés <strong>{pendingCount}</strong>{' '}
            {pendingCount === 1 ? 'wallet pendiente' : 'wallets pendientes'} de
            confirmar deploy on-chain.
          </span>
        </div>
        <Link
          to="/wallet"
          className="text-amber-900 hover:text-amber-700 font-medium underline-offset-2 hover:underline"
        >
          Revisar →
        </Link>
      </div>
    </div>
  );
}
