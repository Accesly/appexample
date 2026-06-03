import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { WalletStatusBadge } from '../components/WalletStatusBadge';
import { describeError } from '../lib/errors';
import {
  deleteCredential,
  getCredential,
  saveCredential,
  type LocalCredential,
} from '../lib/credentialStore';
import { explorerUrlForContract, shortAddress } from '../lib/explorer';
import type { WalletStatus } from '../lib/walletFlow';

export function Wallet() {
  const { auth, wallet, kyc } = useAccesly();
  const [cred, setCred] = useState<LocalCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [status, setStatus] = useState<WalletStatus>('unknown');
  const [retrying, setRetrying] = useState(false);
  const [noLocalShards, setNoLocalShards] = useState(false);
  const [testnetFunded, setTestnetFunded] = useState<boolean | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  // 1. Carga inicial: lee credencial local + status cacheado, luego pide
  //    status fresco al backend en background.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!auth.username) return;
      try {
        const local = await getCredential(auth.username);
        if (!alive) return;
        setCred(local);
        if (local?.lastKnownStatus) setStatus(local.lastKnownStatus);

        // Lee el CredentialRecord de la SDK — trae `testnetFunded` desde core 0.5.0.
        const sdkRecord = await wallet.getStoredCredential(auth.username);
        if (alive && sdkRecord) {
          const funded = (sdkRecord as { testnetFunded?: boolean })
            .testnetFunded;
          setTestnetFunded(Boolean(funded));
        }

        // Refresh status desde el backend
        const remote = await wallet.fetchRemote();
        if (!alive) return;
        if (remote) {
          const next: WalletStatus = remote.onChain
            ? 'on-chain'
            : 'pending-deploy';
          setStatus(next);
          if (local) {
            await saveCredential({
              ...local,
              lastKnownStatus: next,
              lastStatusCheck: Date.now(),
            });
          }
        }
      } catch (err) {
        if (alive) setError(describeError(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [auth.username, wallet]);

  // 2. Polling automático mientras no esté on-chain
  useEffect(() => {
    if (status === 'on-chain') return;
    if (!auth.username) return;

    const id = setInterval(async () => {
      try {
        const remote = await wallet.fetchRemote();
        if (!remote) return;
        const next: WalletStatus = remote.onChain
          ? 'on-chain'
          : 'pending-deploy';
        setStatus(next);
        if (cred) {
          await saveCredential({
            ...cred,
            lastKnownStatus: next,
            lastStatusCheck: Date.now(),
          });
        }
      } catch {
        // ignorar errores transitorios
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [status, auth.username, wallet, cred]);

  async function handleCopy() {
    if (!cred) return;
    try {
      await navigator.clipboard.writeText(cred.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard puede fallar en algunos contextos sin user gesture
    }
  }

  async function handleStartKyc() {
    setKycLoading(true);
    setError(null);
    try {
      const result = await kyc.start();
      setKycStatus(
        typeof result === 'object' && result && 'status' in result
          ? String((result as { status: unknown }).status)
          : JSON.stringify(result),
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setKycLoading(false);
    }
  }

  async function handleRetryDeploy() {
    if (!auth.username) return;
    setRetrying(true);
    setError(null);
    setNoLocalShards(false);
    try {
      const result = await wallet.retryDeploy(auth.username);
      setStatus(result.status);
      if (cred) {
        await saveCredential({
          ...cred,
          lastKnownStatus: result.status,
          lastStatusCheck: Date.now(),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no local CredentialRecord/i.test(msg)) {
        setNoLocalShards(true);
      }
      setError(describeError(err));
    } finally {
      setRetrying(false);
    }
  }

  async function handleFundTestnet() {
    if (!cred) return;
    if (status !== 'on-chain') {
      setFundMessage(
        'La wallet aún no está on-chain. Friendbot necesita la cuenta desplegada.',
      );
      return;
    }
    setFunding(true);
    setFundMessage(null);
    setError(null);
    try {
      // Cast (via unknown) hasta que core/react@0.5.0 estén instalados y los tipos lo expongan.
      const fundFn = (
        wallet as unknown as {
          fundTestnet: (
            addr: string,
          ) => Promise<{
            funded: boolean;
            alreadyFunded: boolean;
            reason?: string;
          }>;
        }
      ).fundTestnet;
      const result = await fundFn(cred.walletAddress);
      if (result.funded) {
        setTestnetFunded(true);
        setFundMessage('✓ ~10,000 XLM testnet acreditados.');
      } else if (result.alreadyFunded) {
        setTestnetFunded(true);
        setFundMessage('Esta wallet ya estaba fondeada.');
      } else if ('reason' in result) {
        setFundMessage(
          `No se pudo fondear: ${String((result as { reason: unknown }).reason)}`,
        );
      } else {
        setFundMessage('Friendbot respondió pero sin confirmación de fondo.');
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setFunding(false);
    }
  }

  async function handleResetLocal() {
    if (!auth.username) return;
    if (
      !window.confirm(
        'Esto borrará la metadata local del wallet en este browser. ' +
          'La wallet on-chain queda intacta — pero perdés referencia a ella ' +
          'desde este device. ¿Continuar?',
      )
    ) {
      return;
    }
    await deleteCredential(auth.username);
    try {
      await wallet.clearStoredCredential(auth.username);
    } catch {
      // Si la SDK no tiene record local, el clear puede tirar — ignoramos
    }
    window.location.href = '/';
  }

  if (loading) {
    return (
      <div className="text-center text-accesly-subtle py-12">
        Cargando wallet…
      </div>
    );
  }

  if (!cred) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="accesly-card p-6 text-center space-y-4">
          <h1 className="text-xl font-semibold">No encontramos tu wallet</h1>
          <p className="accesly-hint">
            Parece que tu dispositivo no tiene una credencial guardada para
            esta cuenta. Crea una nueva wallet o recupera desde otro
            dispositivo.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/create-wallet"
              className="px-4 py-2 rounded-lg bg-accesly-ink text-white text-sm font-medium hover:bg-black transition"
            >
              Crear o recuperar
            </Link>
            <Link
              to="/recover"
              className="px-4 py-2 rounded-lg bg-white border border-accesly-border text-sm font-medium hover:border-accesly-ink transition"
            >
              SEP-30 recovery
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const explorerUrl = explorerUrlForContract(cred.walletAddress, 'testnet');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tu wallet</h1>
          <p className="accesly-hint mt-1">
            Smart Account en Stellar testnet · controlado por tu passkey
          </p>
        </div>
        <WalletStatusBadge status={status} />
      </header>

      {status === 'pending-deploy' && !noLocalShards && (
        <InfoNote tone="warning" title="Deploy on-chain pendiente">
          Tus shards están seguros en el backend y en este dispositivo, pero
          la confirmación on-chain todavía no llega. La página re-verifica
          cada 30s; también podés forzar un reintento abajo.
        </InfoNote>
      )}

      {noLocalShards && (
        <div className="space-y-3">
          <InfoNote tone="warning" title="No hay shards locales en este device">
            La wallet existe on-chain (verificada) pero los shards encriptados
            no están en este browser. Probablemente la creaste con una versión
            anterior de la SDK (pre-0.2 no persistía credentialId + prfSalt).
            Sin shards locales no podés firmar transacciones ni hacer{' '}
            <code>retryDeploy</code>. Opciones: usar el device original donde
            la creaste, esperar a SEP-30 recovery (Track C ZK), o para el
            demo, borrar metadata local y crear una wallet nueva.
          </InfoNote>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleResetLocal}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-white border border-accesly-border text-accesly-danger hover:border-accesly-danger transition"
            >
              Borrar metadata local
            </button>
          </div>
        </div>
      )}

      <div className="accesly-card p-6 space-y-5">
        <div>
          <div className="accesly-label">Dirección del Smart Account</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 font-mono text-xs sm:text-sm break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {cred.walletAddress}
            </code>
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </Button>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-lg bg-white border border-accesly-border text-sm font-medium hover:border-accesly-ink transition flex items-center gap-2"
            >
              Ver en explorer
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 L17 7 M8 7 H17 V16" />
              </svg>
            </a>
          </div>
          <p className="text-xs text-accesly-subtle mt-2">
            {shortAddress(cred.walletAddress)} · guardado el{' '}
            {new Date(cred.createdAt).toLocaleString()}
            {cred.lastStatusCheck && (
              <>
                {' · status verificado '}
                {new Date(cred.lastStatusCheck).toLocaleTimeString()}
              </>
            )}
          </p>
        </div>

        <div className="border-t border-accesly-border pt-5">
          <div className="accesly-label">Public key del signer (ed25519)</div>
          <code className="block font-mono text-xs break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
            {cred.publicKey}
          </code>
        </div>
      </div>

      <div className="accesly-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Acciones</h2>
          <span className="text-xs text-accesly-subtle">demo</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <ActionCard
            title={
              testnetFunded
                ? '✓ Fondeada con XLM testnet'
                : 'Fondear (Friendbot)'
            }
            desc={
              fundMessage ??
              (testnetFunded
                ? 'La wallet ya recibió XLM de la SDF (idempotente).'
                : status === 'on-chain'
                  ? 'Llama wallet.fundTestnet() — auto si ensureWallet ya lo hizo.'
                  : 'Disponible cuando el Smart Account esté on-chain.')
            }
            onClick={handleFundTestnet}
            loading={funding}
            disabled={testnetFunded === true || status !== 'on-chain'}
          />
          <ActionCard
            title="Iniciar KYC (Etherfuse)"
            desc={
              kycStatus
                ? `Estado: ${kycStatus}`
                : 'Stub adapter en backend dev — devuelve mocks.'
            }
            onClick={handleStartKyc}
            loading={kycLoading}
          />
          {status === 'pending-deploy' ? (
            <ActionCard
              title="Reintentar deploy"
              desc="Vuelve a empujar el deploy al Relayer usando los shards persistidos."
              onClick={handleRetryDeploy}
              loading={retrying}
            />
          ) : (
            <ActionCard
              title="Enviar pago"
              desc="Manda XLM a otra address Stellar. Te pedirá tu passkey para firmar."
              href="/send"
              disabled={status !== 'on-chain'}
            />
          )}
          <ActionCard
            title="Crear session key"
            desc="Pendiente: bloqueado por dashboard de developers (Fase 7)."
            disabled
          />
        </div>

        <ErrorMessage message={error} className="mt-2" />
      </div>

      <InfoNote tone="info" title="Garantías no-custodial">
        El backend nunca vio tu llave maestra. Tu seed fue generada en este
        navegador, dividida en 3 fragmentos con Shamir, F2 y F3 viajaron
        cifrados, y la seed plana fue zeroizada de memoria tras el deploy.
        Aunque el deploy on-chain falle, los shards persisten en el backend
        cifrados y en este dispositivo bajo passkey — ningún operador de
        Accesly puede mover tus fondos.
      </InfoNote>
    </div>
  );
}

interface ActionCardProps {
  title: string;
  desc: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

function ActionCard({
  title,
  desc,
  href,
  external,
  onClick,
  disabled,
  loading,
}: ActionCardProps) {
  const base =
    'text-left rounded-xl border p-4 transition flex flex-col gap-1.5';
  const interactive =
    'border-accesly-border bg-white hover:border-accesly-ink cursor-pointer';
  const dim = 'border-accesly-border bg-accesly-bg/60 opacity-70 cursor-default';

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className={`${base} ${interactive}`}
      >
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-accesly-subtle leading-relaxed">
          {desc}
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${disabled ? dim : interactive}`}
    >
      <span className="font-medium text-sm flex items-center gap-2">
        {title}
        {loading && (
          <svg
            className="animate-spin w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M21 12 a9 9 0 0 0 -9 -9" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="text-xs text-accesly-subtle leading-relaxed">
        {desc}
      </span>
    </button>
  );
}
