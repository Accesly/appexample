import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccesly, useBranding } from '@accesly/react';

/**
 * Shell minimal: top bar con brand (vía useBranding del dashboard) +
 * nav (Wallet / Swap / Historial) cuando hay sesión.
 */
export function Layout({ children }: { children: ReactNode }) {
  const { auth } = useAccesly();
  const branding = useBranding();
  const location = useLocation();
  const navigate = useNavigate();

  const authed = auth.status === 'authenticated';

  async function handleSignOut() {
    try {
      await auth.signOut();
    } finally {
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to={authed ? '/wallet' : '/'} className="flex items-center gap-2.5">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-lg" />
            ) : (
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: 'var(--accesly-primary, #8B6CE7)' }}
              >
                {(branding.displayName ?? 'A').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="flex flex-col leading-tight">
              <span className="font-semibold">{branding.displayName ?? 'Accesly'}</span>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                example · testnet
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            {authed && (
              <>
                <NavLink to="/wallet" active={location.pathname === '/wallet'}>
                  Wallet
                </NavLink>
                <NavLink to="/swap" active={location.pathname === '/swap'}>
                  Swap
                </NavLink>
                <NavLink to="/history" active={location.pathname === '/history'}>
                  Historial
                </NavLink>
              </>
            )}
            {authed ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs text-neutral-500 hover:text-red-500 ml-2"
              >
                Salir
              </button>
            ) : (
              <Link
                to="/signin"
                className="text-xs px-3 py-1.5 rounded-lg text-white"
                style={{ background: 'var(--accesly-primary, #8B6CE7)' }}
              >
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-10">{children}</main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>Demo no-custodial · backend dev · Stellar testnet</span>
          <a
            href="https://github.com/Accesly/SDKAccesly"
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-600"
          >
            @accesly/react v1.22.0
          </a>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`px-2 py-1 rounded transition ${
        active ? 'text-neutral-900 font-medium' : 'text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {children}
    </Link>
  );
}
