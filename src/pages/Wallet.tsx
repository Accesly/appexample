import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccesly,
  useBalance,
  useWalletHistory,
  useWalletStatus,
} from '@accesly/react';
import type { WalletHistoryItem } from '@accesly/core';
import { formatError, shortAddress, stroopsToXlm, walletExplorerUrl } from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { WalletStatusBadge } from '../components/WalletStatusBadge';

/**
 * /wallet — todo event-driven via SSE.
 *
 * `useWalletStatus`, `useBalance`, `useWalletActivity` comparten 1 sola
 * conexión SSE (multiplexada por wallet address). Sin setInterval, sin
 * polling — el backend push-ea cambios en tiempo real.
 *
 * Las activities ya vienen filtradas + tipadas por el backend; no hay que
 * decodear XDR ni adivinar qué es cada evento.
 */
type ActivateState =
  | { kind: 'idle' }
  | { kind: 'unlocking' }
  | { kind: 'activating' }
  | { kind: 'success'; txHash: string };

export function Wallet() {
  const { auth, wallet } = useAccesly();
  const navigate = useNavigate();
  const status = useWalletStatus();
  const balance = useBalance(status.walletAddress);
  const activity = useWalletHistory(status.walletAddress);
  const [activate, setActivate] = useState<ActivateState>({ kind: 'idle' });
  const [activateError, setActivateError] = useState<string | null>(null);

  async function handleActivateUsdc() {
    if (!auth.username) {
      setActivateError('No hay sesión activa.');
      return;
    }
    setActivateError(null);
    let material;
    try {
      setActivate({ kind: 'unlocking' });
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setActivate({ kind: 'idle' });
      setActivateError(formatError(err));
      return;
    }
    try {
      setActivate({ kind: 'activating' });
      const result = await wallet.activateAsset({
        asset: 'USDC',
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });
      setActivate({ kind: 'success', txHash: result.txHash });
    } catch (err) {
      setActivate({ kind: 'idle' });
      setActivateError(formatError(err));
    }
  }

  if (status.status === 'no-wallet') {
    return (
      <div className="max-w-xl mx-auto accesly-card p-6 text-center space-y-4">
        <h1 className="text-xl font-semibold">No tenés wallet todavía</h1>
        <p className="accesly-hint">Creala con tu passkey desde la pantalla anterior.</p>
        <Button onClick={() => navigate('/create-wallet')}>Crear wallet</Button>
      </div>
    );
  }

  if (!status.walletAddress) {
    return <div className="text-center text-accesly-subtle py-12">Cargando wallet…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tu wallet</h1>
          <p className="accesly-hint mt-1">
            Smart Account en Stellar testnet · status push-eado vía SSE
          </p>
        </div>
        <WalletStatusBadge status={status.status === 'no-wallet' ? 'unknown' : status.status} />
      </header>

      <div className="accesly-card p-6 space-y-5">
        <div>
          <div className="accesly-label">Dirección del Smart Account</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 font-mono text-xs sm:text-sm break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {status.walletAddress}
            </code>
            <a
              href={walletExplorerUrl(status.walletAddress, 'testnet')}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-lg bg-white border border-accesly-border text-sm font-medium hover:border-accesly-ink transition"
            >
              Ver en explorer
            </a>
          </div>
          <p className="text-xs text-accesly-subtle mt-2">
            {shortAddress(status.walletAddress)}
            {status.isStale && ' · status sin confirmar > 60s'}
          </p>
        </div>

        <div className="border-t border-accesly-border pt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <div className="accesly-label">Balance XLM</div>
            <div className="text-2xl font-semibold">
              {balance.isLoading ? '…' : balance.xlm ?? '0'}{' '}
              <span className="text-sm font-normal text-accesly-subtle">XLM</span>
            </div>
          </div>
          <div>
            <div className="accesly-label flex items-center gap-1.5">
              Balance USDC
              <span className="text-[10px] uppercase tracking-wide text-accesly-subtle bg-accesly-bg px-1.5 py-0.5 rounded">SAC</span>
            </div>
            <div className="text-2xl font-semibold">
              {balance.isLoading ? '…' : balance.usdc ?? '0'}{' '}
              <span className="text-sm font-normal text-accesly-subtle">USDC</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (status.walletAddress) {
                  void navigator.clipboard.writeText(status.walletAddress);
                }
              }}
              className="text-xs text-blue-700 hover:underline mt-1"
            >
              Copiar dirección para recibir USDC
            </button>
          </div>
          {balance.error && (
            <p className="text-xs text-accesly-danger sm:col-span-2">No se pudo cargar el balance.</p>
          )}
        </div>
      </div>

      <div className="accesly-card p-6 space-y-3">
        <h2 className="font-semibold">Acciones</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            onClick={() => navigate('/send')}
            disabled={status.status !== 'on-chain'}
            className="w-full"
          >
            Enviar pago
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/swap')}
            disabled={status.status !== 'on-chain'}
            className="w-full"
          >
            Swap XLM ↔ USDC
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/fiat')}
            disabled={status.status !== 'on-chain'}
            className="w-full"
          >
            Fiat ⇄ USDC (Etherfuse)
          </Button>
          <Button
            variant="secondary"
            onClick={() => void wallet.fundTestnet(status.walletAddress!)}
            className="w-full"
          >
            Fondear (friendbot)
          </Button>
          <Button
            variant="secondary"
            onClick={handleActivateUsdc}
            loading={activate.kind === 'unlocking' || activate.kind === 'activating'}
            disabled={status.status !== 'on-chain' || activate.kind !== 'idle'}
            className="w-full sm:col-span-2"
          >
            {activate.kind === 'unlocking'
              ? 'Desbloqueando passkey…'
              : activate.kind === 'activating'
              ? 'Activando USDC en el Smart Account…'
              : activate.kind === 'success'
              ? 'USDC activado ✓'
              : 'Activar USDC en esta wallet'}
          </Button>
        </div>
        <ErrorMessage message={activateError} />
        {activate.kind === 'success' && (
          <p className="text-xs text-accesly-subtle">
            Rule biometric-tx para USDC_SAC agregado vía admin-cfg. Ya podés enviar USDC desde
            "Enviar pago". <a
              href={walletExplorerUrl(activate.txHash, 'testnet').replace('/contract/', '/tx/')}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700"
            >
              ver tx →
            </a>
          </p>
        )}
      </div>

      <div className="accesly-card p-6">
        <h2 className="font-semibold mb-3">Actividad reciente</h2>
        {activity.isLoading && activity.events.length === 0 ? (
          <div className="text-sm text-accesly-subtle">Esperando primer evento…</div>
        ) : activity.events.length === 0 ? (
          <div className="text-sm text-accesly-subtle">Aún no hay actividad on-chain.</div>
        ) : (
          <ul className="space-y-3">
            {activity.events.map((e) => (
              <ActivityRow key={`${e.txHash}:${e.ledger}`} event={e} />
            ))}
          </ul>
        )}
      </div>

      <InfoNote tone="info" title="Real-time via SSE">
        Status, balance y actividad se sirven via Server-Sent Events desde el
        Lambda <code>wallet-stream</code>. Una sola conexión TCP multiplexa los
        3 streams. Cero polling — el backend push-ea cambios cuando los detecta.
      </InfoNote>
    </div>
  );
}

function ActivityRow({ event }: { event: WalletHistoryItem }) {
  const ts = event.timestamp ? new Date(event.timestamp).toLocaleString() : `ledger ${event.ledger}`;
  // El backend ya nos arma el URL con el formato canónico tx/<txToid>#<eventToid>.
  const explorerHref = event.explorerUrl;

  if (event.type === 'wallet-created') {
    return (
      <li className="border-b border-accesly-border pb-2 last:border-b-0">
        <div className="flex justify-between items-baseline">
          <span className="font-medium text-sm">✨ Wallet creada</span>
          <span className="text-xs text-accesly-subtle">{ts}</span>
        </div>
        {explorerHref && (
          <a href={explorerHref} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700">
            ver contrato →
          </a>
        )}
      </li>
    );
  }

  if (event.type === 'signer-rotated') {
    return (
      <li className="border-b border-accesly-border pb-2 last:border-b-0">
        <div className="flex justify-between items-baseline">
          <span className="font-medium text-sm">🔑 Rotación de signer</span>
          <span className="text-xs text-accesly-subtle">{ts}</span>
        </div>
        <a href={explorerHref} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700">
          ver tx →
        </a>
      </li>
    );
  }

  // Default a XLM cuando el backend no manda asset (audits pre-1.4).
  const asset = event.asset ?? 'XLM';

  if (event.type === 'transfer-in') {
    return (
      <li className="border-b border-accesly-border pb-2 last:border-b-0">
        <div className="flex justify-between items-baseline">
          <span className="font-medium text-sm text-accesly-success">
            ↓ Recibiste {stroopsToXlm(event.amountStroops ?? '0')} {asset}
          </span>
          <span className="text-xs text-accesly-subtle">{ts}</span>
        </div>
        <div className="text-xs font-mono text-accesly-subtle mt-1">
          De: {shortAddress(event.from ?? '')}
        </div>
        <a href={explorerHref} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700">
          ver tx →
        </a>
      </li>
    );
  }

  if (event.type === 'transfer-out') {
    return (
      <li className="border-b border-accesly-border pb-2 last:border-b-0">
        <div className="flex justify-between items-baseline">
          <span className="font-medium text-sm">
            ↑ Mandaste {stroopsToXlm(event.amountStroops ?? '0')} {asset}
          </span>
          <span className="text-xs text-accesly-subtle">{ts}</span>
        </div>
        <div className="text-xs font-mono text-accesly-subtle mt-1">
          A: {shortAddress(event.to ?? '')}
        </div>
        <a href={explorerHref} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700">
          ver tx →
        </a>
      </li>
    );
  }

  return null;
}
