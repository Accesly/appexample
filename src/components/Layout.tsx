import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { auth } = useAccesly();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await auth.signOut();
    } finally {
      navigate('/');
    }
  }

  const authed = auth.status === 'authenticated';

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-accesly-border bg-white">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-accesly-ink flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="none"
                stroke="#5b6cff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 18 L12 6 L18 18 M8.5 14 H15.5" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-accesly-ink group-hover:text-accesly-accent transition">
                Accesly
              </span>
              <span className="text-[10px] uppercase tracking-wider text-accesly-subtle">
                Example · testnet
              </span>
            </div>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <span className="accesly-pill bg-accesly-bg text-accesly-subtle border border-accesly-border">
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  authed
                    ? 'bg-accesly-success'
                    : auth.status === 'expired'
                      ? 'bg-accesly-warning'
                      : 'bg-accesly-subtle'
                }`}
              />
              {auth.status}
            </span>
            {authed && (
              <>
                <span className="hidden sm:inline text-accesly-subtle">
                  {auth.username}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm text-accesly-subtle hover:text-accesly-danger transition"
                >
                  Salir
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-10">
        {children}
      </main>
      <footer className="border-t border-accesly-border bg-white">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-accesly-subtle">
          <span>
            Demo no-custodial · backend{' '}
            <code className="font-mono text-accesly-ink">dev</code> · Stellar
            testnet
          </span>
          <a
            href="https://github.com/Accesly/SDKAccesly"
            target="_blank"
            rel="noreferrer"
            className="accesly-link"
          >
            @accesly/sdk
          </a>
        </div>
      </footer>
    </div>
  );
}
