import { Link, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { useEffect } from 'react';

export function Landing() {
  const { auth } = useAccesly();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.status === 'authenticated') {
      navigate('/wallet', { replace: true });
    }
  }, [auth.status, navigate]);

  return (
    <div className="grid lg:grid-cols-2 gap-10 items-center">
      <div className="space-y-6">
        <span className="accesly-pill bg-accesly-ink text-white">
          Stellar testnet · demo no-custodial
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
          Wallet Stellar con biométrico,
          <br />
          sin frase semilla.
        </h1>
        <p className="text-lg text-accesly-subtle leading-relaxed max-w-lg">
          App de ejemplo end-to-end de{' '}
          <code className="font-mono text-accesly-ink">@accesly/sdk</code>.
          Crea un Smart Account en Stellar testnet usando passkey + MPC Shamir
          2-of-3. La llave maestra nunca toca el servidor.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/signup"
            className="px-5 py-3 rounded-lg bg-accesly-ink text-white font-medium hover:bg-black transition"
          >
            Crear cuenta nueva
          </Link>
          <Link
            to="/signin"
            className="px-5 py-3 rounded-lg bg-white border border-accesly-border text-accesly-ink font-medium hover:border-accesly-ink transition"
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="text-sm text-accesly-subtle">
          ¿Perdiste tu dispositivo?{' '}
          <Link to="/recover" className="accesly-link">
            Recuperar cuenta
          </Link>
        </p>
      </div>

      <div className="accesly-card p-6 sm:p-8 space-y-5">
        <h2 className="text-lg font-semibold">Qué demuestra este ejemplo</h2>
        <ul className="space-y-3 text-sm">
          {[
            ['Sign-up real', 'AWS Cognito + email de verificación vía SES'],
            [
              'Passkey + PRF',
              'WebAuthn registra y deriva las llaves de cifrado',
            ],
            [
              'MPC Shamir 2-of-3',
              'El SDK splits client-side; F2/F3 viajan cifrados',
            ],
            [
              'Smart Account on-chain',
              'Deploy real en Stellar testnet vía OZ Relayer',
            ],
            [
              'Backend dev',
              <code key="code" className="font-mono text-xs">
                3fki7eiio5.execute-api.us-east-1.amazonaws.com/dev
              </code>,
            ],
          ].map(([label, desc], idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-accesly-accent/10 text-accesly-accent text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <div>
                <span className="font-medium">{label}: </span>
                <span className="text-accesly-subtle">{desc}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="pt-3 border-t border-accesly-border text-xs text-accesly-subtle leading-relaxed">
          <strong className="text-accesly-ink">Requisitos:</strong> Chrome 116+,
          Edge 116+ o Safari 18+ (passkey con PRF). Funciona en{' '}
          <code className="font-mono">http://localhost</code>; para otros
          dominios necesitas HTTPS.
        </div>
      </div>
    </div>
  );
}
