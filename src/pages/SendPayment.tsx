import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { describeError } from '../lib/errors';
import { unlockForSigning } from '../lib/unlockForSigning';

type Phase =
  | { kind: 'idle' }
  | { kind: 'unlocking' }
  | { kind: 'signing' }
  | { kind: 'submitting' }
  | { kind: 'success'; txHash: string; explorerUrl: string };

export function SendPayment() {
  const { auth, wallet, tx } = useAccesly();
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const phaseLabel: Record<Phase['kind'], string> = {
    idle: 'Enviar XLM',
    unlocking: 'Desbloqueando passkey…',
    signing: 'Firmando transacción…',
    submitting: 'Enviando a la red…',
    success: 'Enviado ✓',
  };

  function validate(): string | null {
    if (!destination.trim()) return 'Destinatario requerido.';
    const trimmed = destination.trim();
    if (!/^[GC][A-Z0-9]{55}$/.test(trimmed)) {
      return 'El destinatario debe ser una G-address (clásica) o C-address (contrato) de 56 caracteres.';
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return 'El monto debe ser un número mayor a 0.';
    if (amount.includes('.') && (amount.split('.')[1]?.length ?? 0) > 7) {
      return 'XLM tiene precisión máxima de 7 decimales (1 stroop = 0.0000001 XLM).';
    }
    return null;
  }

  function toStroops(xlm: string): string {
    // Multiplicación con string para evitar perdida de precisión float.
    const [whole, frac = ''] = xlm.split('.');
    const fracPadded = (frac + '0000000').slice(0, 7);
    const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '');
    return combined === '' ? '0' : combined;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!auth.username) {
      setError('No hay sesión activa.');
      return;
    }

    let material;
    try {
      setPhase({ kind: 'unlocking' });
      const sdkRecord = await wallet.getStoredCredential(auth.username);
      material = await unlockForSigning(auth.username, sdkRecord);
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(describeError(err));
      return;
    }

    try {
      setPhase({ kind: 'signing' });
      // La SDK pasa de signing → submitting internamente.
      // Para mostrar el estado intermedio "submitting" forzamos un microflip
      // antes del await.
      queueMicrotask(() => setPhase({ kind: 'submitting' }));

      const result = await tx.send({
        destinationAddress: destination.trim(),
        amountStroops: toStroops(amount.trim()),
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });

      setPhase({
        kind: 'success',
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
      });
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(describeError(err));
    }
  }

  const busy = phase.kind === 'unlocking' || phase.kind === 'signing' || phase.kind === 'submitting';

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Enviar pago</h1>
        <p className="accesly-hint mt-1">
          Manda XLM desde tu Smart Account a otra dirección Stellar (G… o C…).
          El backend paga el fee — vos solo autorizas con tu passkey.
        </p>
      </header>

      {phase.kind === 'success' ? (
        <div className="accesly-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-accesly-success font-semibold">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 L9 17 L4 12" />
            </svg>
            <span>Transacción enviada</span>
          </div>
          <div>
            <div className="accesly-label">txHash</div>
            <code className="block font-mono text-xs break-all px-3 py-2 rounded-lg bg-accesly-bg border border-accesly-border">
              {phase.txHash}
            </code>
          </div>
          <div className="flex gap-3">
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
                setDestination('');
                setAmount('');
              }}
            >
              Mandar otra
            </Button>
            <Button variant="ghost" onClick={() => navigate('/wallet')}>
              Volver a la wallet
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="accesly-card p-6 space-y-4">
          <div>
            <label htmlFor="destination" className="accesly-label">
              Destinatario (G… o C…)
            </label>
            <input
              id="destination"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={busy}
              placeholder="GA…  o  CA…"
              className="w-full font-mono text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="amount" className="accesly-label">
              Monto (XLM)
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
            <p className="text-xs text-accesly-subtle mt-1">
              7 decimales máximo. 1 XLM = 10,000,000 stroops.
            </p>
          </div>

          <ErrorMessage message={error} />

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              {phaseLabel[phase.kind]}
            </Button>
            <Link
              to="/wallet"
              className="text-sm text-accesly-subtle hover:text-accesly-ink transition"
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}

      <InfoNote tone="info" title="Cómo se firma">
        El navegador pide tu passkey, la SDK reconstruye la llave dentro de
        este browser (F1 desencriptado local + F2 recibido del backend bajo
        capa ECDH), firma el `auth_digest` del Smart Account, y manda al
        relayer para que pague el fee. Ningún server vio tu seed.
      </InfoNote>
    </div>
  );
}
