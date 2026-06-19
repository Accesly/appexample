import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly, useBalance, useWalletStatus } from '@accesly/react';
import {
  formatError,
  stroopsToXlm,
  xlmToStroops,
  type TransferAsset,
} from '@accesly/core';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';

type QuotePreview = {
  amountOut: string;
  /** Min stroops aceptables — para Soroswap viene como `minAmountOut`, para SDEX como `destMinStroops`. UI los unifica. */
  minAmountOut: string;
  priceImpactPct: string;
  platform: string;
  /** 'soroswap' (default) o 'sdex' — controla qué endpoint se usa en submit. */
  venue: 'soroswap' | 'sdex';
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'unlocking' }
  | { kind: 'bootstrap-g' }
  | { kind: 'submitting' }
  | { kind: 'success'; txHash: string; explorerUrl: string; received: string; toAsset: TransferAsset; venue: 'soroswap' | 'sdex' };

const QUOTE_DEBOUNCE_MS = 600;

export function Swap() {
  const { auth, wallet, tx, _internal } = useAccesly();
  const navigate = useNavigate();
  const status = useWalletStatus();
  const balance = useBalance(status.walletAddress);

  const [fromAsset, setFromAsset] = useState<TransferAsset>('XLM');
  const [toAsset, setToAsset] = useState<TransferAsset>('USDC');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Quote en vivo con debounce. Primero prueba Soroswap; si no hay path (422 o
  // similar — typical en testnet sin pools), reintenta contra SDEX classic.
  useEffect(() => {
    if (!amount.trim() || phase.kind !== 'idle') {
      setPreview(null);
      setQuoting(false);
      setQuoteError(null);
      return undefined;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    const timer = setTimeout(async () => {
      let amountIn: string;
      try {
        amountIn = xlmToStroops(amount.trim());
      } catch {
        if (!cancelled) {
          setPreview(null);
          setQuoting(false);
        }
        return;
      }
      try {
        const sim = await _internal.endpoints.swapSimulate({
          fromAsset,
          toAsset,
          amountIn,
          slippageBps,
        });
        if (!cancelled) {
          setPreview({
            amountOut: sim.quote.amountOut,
            minAmountOut: sim.quote.minAmountOut,
            priceImpactPct: sim.quote.priceImpactPct,
            platform: sim.quote.platform,
            venue: 'soroswap',
          });
          setQuoting(false);
        }
      } catch {
        // Soroswap no tiene path → probar SDEX classic.
        try {
          const simSdex = await _internal.endpoints.swapSdexSimulate({
            fromAsset,
            toAsset,
            amountIn,
            slippageBps,
          });
          if (!cancelled) {
            setPreview({
              amountOut: simSdex.quote.amountOut,
              minAmountOut: simSdex.quote.destMinStroops,
              priceImpactPct: simSdex.quote.priceImpactPct,
              platform: simSdex.quote.platform,
              venue: 'sdex',
            });
            setQuoting(false);
          }
        } catch (err) {
          if (!cancelled) {
            setPreview(null);
            setQuoting(false);
            setQuoteError(formatError(err));
          }
        }
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount, fromAsset, toAsset, slippageBps, phase.kind, _internal.endpoints]);

  function flip() {
    setFromAsset((prev) => (prev === 'XLM' ? 'USDC' : 'XLM'));
    setToAsset((prev) => (prev === 'XLM' ? 'USDC' : 'XLM'));
    setPreview(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!auth.username) {
      setError('No hay sesión activa.');
      return;
    }
    if (fromAsset === toAsset) {
      setError('fromAsset y toAsset deben ser distintos.');
      return;
    }
    if (quoting) {
      setError('Esperá a que termine la cotización.');
      return;
    }
    if (!preview) {
      setError(
        quoteError ??
          'No hay cotización disponible para este monto. Probá un valor distinto.',
      );
      return;
    }
    let amountIn: string;
    try {
      amountIn = xlmToStroops(amount.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monto inválido.');
      return;
    }

    let material;
    try {
      setPhase({ kind: 'unlocking' });
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(formatError(err));
      return;
    }

    const venue = preview.venue;
    const swapInput = {
      fromAsset,
      toAsset,
      amountIn,
      slippageBps,
      fragmentF1Plain: material.fragmentF1Plain,
      fragmentF2Key: material.fragmentF2Key,
      ownerPubkey: material.ownerPubkey,
    };

    // Fase IV: swapViaSdex requiere que la G-address bridge esté bootstrapped.
    // Es idempotente — si ya está, retorna sin tocar nada.
    if (venue === 'sdex') {
      try {
        setPhase({ kind: 'bootstrap-g' });
        await wallet.bootstrapG({
          fragmentF1Plain: material.fragmentF1Plain,
          fragmentF2Key: material.fragmentF2Key,
          ownerPubkey: material.ownerPubkey,
        });
      } catch (err) {
        setPhase({ kind: 'idle' });
        setError(formatError(err));
        return;
      }
    }

    try {
      setPhase({ kind: 'submitting' });
      const result =
        venue === 'sdex'
          ? await tx.swapViaSdex(swapInput)
          : await tx.swap(swapInput);
      const received = stroopsToXlm(result.quote.amountOut);
      setPhase({
        kind: 'success',
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        received,
        toAsset,
        venue,
      });
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(formatError(err));
    }
  }

  const busy =
    phase.kind === 'quoting' ||
    phase.kind === 'unlocking' ||
    phase.kind === 'bootstrap-g' ||
    phase.kind === 'submitting';
  const availableFrom = fromAsset === 'USDC' ? balance.usdc : balance.xlm;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Swap</h1>
        <p className="accesly-hint mt-1">
          Intercambia XLM ↔ USDC dentro de tu Smart Account. La cotización viene
          del aggregator Soroswap; el backend paga el fee.
        </p>
      </header>

      {phase.kind === 'success' ? (
        <div className="accesly-card p-6 space-y-4">
          <div className="text-accesly-success font-semibold">
            ✓ Swap ejecutado vía {phase.venue === 'sdex' ? 'SDEX classic' : 'Soroswap'}
          </div>
          <div className="text-sm">
            Recibiste <span className="font-mono">{phase.received}</span> {phase.toAsset}
          </div>
          <div>
            <div className="accesly-label">txHash</div>
            <code className="block font-mono text-xs break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {phase.txHash}
            </code>
          </div>
          <div className="flex gap-3 flex-wrap">
            <a
              href={phase.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-lg bg-accesly-ink text-white text-sm font-medium hover:bg-black transition"
            >
              Ver en explorer
            </a>
            <Button
              variant="secondary"
              onClick={() => {
                setPhase({ kind: 'idle' });
                setAmount('');
                setPreview(null);
              }}
            >
              Hacer otro swap
            </Button>
            <Button variant="ghost" onClick={() => navigate('/wallet')}>
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="accesly-card p-6 space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="accesly-label" htmlFor="fromAsset">
                Desde
              </label>
              <select
                id="fromAsset"
                value={fromAsset}
                onChange={(e) => {
                  const v = e.target.value as TransferAsset;
                  setFromAsset(v);
                  if (v === toAsset) setToAsset(v === 'XLM' ? 'USDC' : 'XLM');
                  setPreview(null);
                }}
                disabled={busy}
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
              <p className="text-xs text-accesly-subtle mt-1">
                Disponible: {availableFrom ?? '0'} {fromAsset}
              </p>
            </div>
            <button
              type="button"
              onClick={flip}
              disabled={busy}
              title="Invertir"
              className="px-2 py-1 rounded-md border border-accesly-border hover:bg-accesly-bg text-base disabled:opacity-60"
            >
              ↔
            </button>
            <div>
              <label className="accesly-label" htmlFor="toAsset">
                Hacia
              </label>
              <select
                id="toAsset"
                value={toAsset}
                onChange={(e) => {
                  const v = e.target.value as TransferAsset;
                  setToAsset(v);
                  if (v === fromAsset) setFromAsset(v === 'XLM' ? 'USDC' : 'XLM');
                  setPreview(null);
                }}
                disabled={busy}
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>

          <div>
            <label className="accesly-label" htmlFor="amount">
              Monto ({fromAsset})
            </label>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.0"
              className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
            />
            <p className="text-xs text-accesly-subtle mt-1">7 decimales máximo.</p>
          </div>

          <div>
            <label className="accesly-label" htmlFor="slippage">
              Slippage tolerance
            </label>
            <div className="flex items-center gap-2">
              <input
                id="slippage"
                type="number"
                min={1}
                max={5000}
                step={1}
                value={slippageBps}
                onChange={(e) => setSlippageBps(Number(e.target.value) || 50)}
                disabled={busy}
                className="w-24 text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
              />
              <span className="text-xs text-accesly-subtle">
                bps ({(slippageBps / 100).toFixed(2)}%)
              </span>
            </div>
          </div>

          {quoting && (
            <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-xs text-accesly-subtle">
              Calculando cotización…
            </div>
          )}

          {!quoting && !preview && quoteError && amount.trim() && (
            <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-xs text-accesly-danger">
              No hay liquidez disponible: {quoteError}
            </div>
          )}

          {preview && (
            <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-accesly-subtle">Recibirás (aprox)</span>
                <span className="font-mono">
                  {stroopsToXlm(preview.amountOut)} {toAsset}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-accesly-subtle">Mínimo aceptado</span>
                <span className="font-mono">
                  {stroopsToXlm(preview.minAmountOut)} {toAsset}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-accesly-subtle">Price impact</span>
                <span className="font-mono">{preview.priceImpactPct}%</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-accesly-subtle">Vía</span>
                <span className="font-mono">{preview.platform}</span>
              </div>
            </div>
          )}

          <ErrorMessage message={error} />

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              variant="primary"
              loading={busy || quoting}
              disabled={busy || quoting || !preview}
            >
              {phase.kind === 'unlocking'
                ? 'Desbloqueando passkey…'
                : phase.kind === 'bootstrap-g'
                ? 'Preparando bridge G-address…'
                : phase.kind === 'submitting'
                ? 'Swap en curso…'
                : quoting
                ? 'Calculando…'
                : `Swap ${fromAsset} → ${toAsset}`}
            </Button>
            <Link to="/wallet" className="text-sm text-accesly-subtle hover:text-accesly-ink transition">
              Cancelar
            </Link>
          </div>
        </form>
      )}

      <InfoNote tone="info" title="Cómo funciona el swap">
        El backend pide cotización a Soroswap Aggregator, arma el XDR del swap
        con el SA como source/destino, y el SDK firma la auth entry con el mismo
        passkey biométrico que usás para transfers. El fee siempre lo paga{' '}
        <code>channels-fund</code> — vos no necesitás XLM extra para gas.
      </InfoNote>
    </div>
  );
}
