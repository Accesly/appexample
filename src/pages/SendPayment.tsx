import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { formatError, isValidStellarAddress, xlmToStroops } from '@accesly/core';

import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';

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
    const trimmed = destination.trim();
    if (!trimmed) return 'Destinatario requerido.';
    if (!isValidStellarAddress(trimmed)) {
      return 'El destinatario debe ser una G-address o C-address de 56 caracteres.';
    }
    try {
      xlmToStroops(amount.trim());
    } catch (e) {
      return e instanceof Error ? e.message : 'Monto inválido.';
    }
    return null;
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
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(formatError(err));
      return;
    }

    try {
      setPhase({ kind: 'signing' });
      queueMicrotask(() => setPhase({ kind: 'submitting' }));

      const result = await tx.send({
        destinationAddress: destination.trim(),
        amountStroops: xlmToStroops(amount.trim()),
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });

      setPhase({ kind: 'success', txHash: result.txHash, explorerUrl: result.explorerUrl });
    } catch (err) {
      setPhase({ kind: 'idle' });
      setError(formatError(err));
    }
  }

  const busy = phase.kind === 'unlocking' || phase.kind === 'signing' || phase.kind === 'submitting';

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Enviar pago</h1>
        <p className="accesly-hint mt-1">
          Manda XLM desde tu Smart Account. El backend paga el fee — vos solo
          autorizás con tu passkey.
        </p>
      </header>

      {phase.kind === 'success' ? (
        <div className="accesly-card p-6 space-y-4">
          <div className="text-accesly-success font-semibold">✓ Transacción enviada</div>
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
            <Button variant="secondary" onClick={() => { setPhase({ kind: 'idle' }); setDestination(''); setAmount(''); }}>
              Mandar otra
            </Button>
            <Button variant="ghost" onClick={() => navigate('/wallet')}>
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="accesly-card p-6 space-y-4">
          <div>
            <label htmlFor="destination" className="accesly-label">Destinatario</label>
            <input
              id="destination"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={busy}
              placeholder="GA… o CA…"
              className="w-full font-mono text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="amount" className="accesly-label">Monto (XLM)</label>
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

          <ErrorMessage message={error} />

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              {phaseLabel[phase.kind]}
            </Button>
            <Link to="/wallet" className="text-sm text-accesly-subtle hover:text-accesly-ink transition">
              Cancelar
            </Link>
          </div>
        </form>
      )}

      <InfoNote tone="info" title="Cómo se firma">
        El SDK abre tu passkey (PRF), re-deriva las AES keys con HKDF, descifra
        F1 localmente, pide F2 al backend vía ECDH, reconstruye la seed con
        Shamir y firma el <code>auth_digest</code>. Ningún server vio tu seed.
      </InfoNote>
    </div>
  );
}
