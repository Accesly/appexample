import { Link } from 'react-router-dom';
import { useBranding } from '@accesly/react';

export function Landing() {
  const branding = useBranding();
  return (
    <div className="grid sm:grid-cols-[1.2fr_1fr] gap-10 items-center">
      <div className="space-y-5">
        <span className="inline-block text-[10px] uppercase tracking-wider bg-neutral-900 text-white rounded-full px-3 py-1">
          Stellar testnet · demo no-custodial
        </span>
        <h1 className="text-4xl font-bold leading-tight">
          Wallet Stellar con biométrico,
          <br />
          sin frase semilla.
        </h1>
        <p className="text-neutral-600">
          App de ejemplo end-to-end de <code className="font-mono bg-neutral-100 px-1 rounded">@accesly/react</code>.
          Crea un Smart Account on-chain usando passkey + MPC Shamir 2-of-3. La llave maestra
          nunca toca el servidor.
        </p>
        <div className="flex gap-3">
          <Link
            to="/signup"
            className="px-5 py-3 rounded-xl text-white font-medium"
            style={{ background: 'var(--accesly-primary, #8B6CE7)' }}
          >
            Crear cuenta
          </Link>
          <Link
            to="/signin"
            className="px-5 py-3 rounded-xl border border-neutral-200 font-medium"
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="text-xs text-neutral-500">
          ¿Cambiaste de dispositivo? <Link to="/recover" className="underline">Recupera tu wallet</Link>
        </p>
      </div>

      <aside className="rounded-2xl bg-white border border-neutral-200 p-6 space-y-3 text-sm">
        <h3 className="font-semibold">Qué demuestra este ejemplo</h3>
        <Step n="1" title="Sign-up real">AWS Cognito + email verification SES</Step>
        <Step n="2" title="Passkey + PRF">WebAuthn registra y deriva llaves AES</Step>
        <Step n="3" title="MPC Shamir 2-of-3">F1 + F2 en device, F3 en server, ninguno tiene la seed</Step>
        <Step n="4" title="Smart Account on-chain">Deploy real en Stellar testnet vía channels-fund</Step>
        <Step n="5" title="Live config">
          Branding y policies vienen del dashboard ({branding.displayName ?? '—'})
        </Step>
      </aside>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 text-xs font-mono flex items-center justify-center shrink-0">
        {n}
      </span>
      <div className="text-xs">
        <div className="font-medium">{title}</div>
        <div className="text-neutral-500">{children}</div>
      </div>
    </div>
  );
}
