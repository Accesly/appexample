import { useState } from 'react';
import { useAccesly, useWalletStatus } from '@accesly/react';
import { formatError, walletExplorerUrl, type ActivatableAsset } from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';

/**
 * /dev-tools — playground de flujos que NO van en la UI del end-user.
 *
 * `wallet.upgrade(targetVersion)` cambia el WASM del Smart Account. La
 * decisión de "qué versión correr" pertenece al **developer integrador**,
 * no al usuario final: el developer define una política en su backend
 * ("todos mis users deben migrar a v3.2") y el SDK detecta el mismatch +
 * dispara el upgrade con la firma del owner.
 *
 * Esta página existe solo para QA local del flujo end-to-end. En producción,
 * el targetVersion vendría de un endpoint tipo `GET /upgrade-recommendation`
 * (decidido por el developer en su dashboard), no de un input visible.
 *
 * No-custodia: el upgrade requiere firma del owner (rule `admin-cfg`), el
 * backend no puede forzarlo. Reutiliza `wallet.unlockForSigning` igual que
 * `activateAsset` y `send`.
 */
type UpgradeState =
  | { kind: 'idle' }
  | { kind: 'unlocking' }
  | { kind: 'upgrading' }
  | {
      kind: 'success';
      txHash: string;
      version: string;
      status: string;
      explorerUrl: string;
    };

type EnrollState =
  | { kind: 'idle' }
  | { kind: 'unlocking'; asset: ActivatableAsset }
  | { kind: 'activating'; asset: ActivatableAsset }
  | { kind: 'success'; asset: ActivatableAsset; txHash: string };

type BootstrapGState =
  | { kind: 'idle' }
  | { kind: 'unlocking' }
  | { kind: 'bootstrapping' }
  | { kind: 'success'; gAddress: string; txHash: string | null; alreadyBootstrapped: boolean };

export function DevTools() {
  const { auth, wallet } = useAccesly();
  const status = useWalletStatus();
  const [targetVersion, setTargetVersion] = useState('');
  const [state, setState] = useState<UpgradeState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>({ kind: 'idle' });
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [bootstrapG, setBootstrapG] = useState<BootstrapGState>({ kind: 'idle' });
  const [bootstrapGError, setBootstrapGError] = useState<string | null>(null);

  async function handleBootstrapG() {
    if (!auth.username) {
      setBootstrapGError('No hay sesión activa.');
      return;
    }
    setBootstrapGError(null);
    let material;
    try {
      setBootstrapG({ kind: 'unlocking' });
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setBootstrapG({ kind: 'idle' });
      setBootstrapGError(formatError(err));
      return;
    }
    try {
      setBootstrapG({ kind: 'bootstrapping' });
      const result = await wallet.bootstrapG({
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });
      setBootstrapG({
        kind: 'success',
        gAddress: result.gAddress,
        txHash: result.txHash,
        alreadyBootstrapped: result.alreadyBootstrapped,
      });
    } catch (err) {
      setBootstrapG({ kind: 'idle' });
      setBootstrapGError(formatError(err));
    }
  }

  async function handleEnroll(asset: ActivatableAsset) {
    if (!auth.username) {
      setEnrollError('No hay sesión activa.');
      return;
    }
    setEnrollError(null);
    let material;
    try {
      setEnroll({ kind: 'unlocking', asset });
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setEnroll({ kind: 'idle' });
      setEnrollError(formatError(err));
      return;
    }
    try {
      setEnroll({ kind: 'activating', asset });
      const result = await wallet.activateAsset({
        asset,
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });
      setEnroll({ kind: 'success', asset, txHash: result.txHash });
    } catch (err) {
      setEnroll({ kind: 'idle' });
      setEnrollError(formatError(err));
    }
  }

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.username) {
      setError('No hay sesión activa.');
      return;
    }
    if (!targetVersion.trim()) {
      setError('Indica una versión target (ej. v3.1.0).');
      return;
    }
    setError(null);

    let material;
    try {
      setState({ kind: 'unlocking' });
      material = await wallet.unlockForSigning(auth.username);
    } catch (err) {
      setState({ kind: 'idle' });
      setError(formatError(err));
      return;
    }
    try {
      setState({ kind: 'upgrading' });
      const result = await wallet.upgrade({
        targetVersion: targetVersion.trim(),
        fragmentF1Plain: material.fragmentF1Plain,
        fragmentF2Key: material.fragmentF2Key,
        ownerPubkey: material.ownerPubkey,
      });
      setState({
        kind: 'success',
        txHash: result.txHash,
        version: result.version,
        status: result.status,
        explorerUrl: result.explorerUrl,
      });
    } catch (err) {
      setState({ kind: 'idle' });
      setError(formatError(err));
    }
  }

  const busy = state.kind === 'unlocking' || state.kind === 'upgrading';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <div className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 mb-2">
          Developer dashboard
        </div>
        <h1 className="text-2xl font-bold">Dev tools</h1>
        <p className="accesly-hint mt-1">
          Flujos que en producción viven en el dashboard del developer integrador, no en
          la UI del end-user. Expuestos aquí solo para QA local.
        </p>
      </header>

      <div className="accesly-card p-6 space-y-5">
        <div>
          <h2 className="font-semibold">Wallet upgrade</h2>
          <p className="accesly-hint text-sm mt-1">
            Cambia el WASM del Smart Account a una versión registrada en{' '}
            <code>contract_versions</code>. Preserva address, signers, context rules y
            balances de tokens. Requiere firma del owner contra la rule{' '}
            <code>admin-cfg</code> (premisa no-custodial intacta — el backend no puede
            forzar upgrades).
          </p>
        </div>

        <InfoNote tone="warning" title="En producción, esto NO se le muestra al end-user">
          El developer decide en su dashboard qué versión debe correr cada cohorte de
          users. El SDK detecta el mismatch y dispara el upgrade con un solo prompt de
          passkey. Aquí lo exponemos como input libre solo para testear contra el
          backend dev.
        </InfoNote>

        <form onSubmit={handleUpgrade} className="space-y-4">
          <div>
            <label className="accesly-label" htmlFor="targetVersion">
              Versión target
            </label>
            <input
              id="targetVersion"
              type="text"
              value={targetVersion}
              onChange={(e) => setTargetVersion(e.target.value)}
              disabled={busy}
              className="accesly-input font-mono"
              placeholder="v3.1.0"
              autoComplete="off"
            />
            <p className="accesly-hint text-xs mt-1.5">
              Debe estar en <code>contract_versions</code> con status{' '}
              <code>uploaded</code>, <code>canary</code> o <code>stable</code>. El
              backend devuelve 409 si está <code>deprecated</code>/<code>rolled-back</code>.
            </p>
          </div>
          <ErrorMessage message={error} />
          <Button
            type="submit"
            loading={busy}
            disabled={status.status !== 'on-chain' || busy}
            className="w-full"
          >
            {state.kind === 'unlocking'
              ? 'Desbloqueando passkey…'
              : state.kind === 'upgrading'
              ? 'Upgradeando WASM on-chain…'
              : 'Upgrade wallet'}
          </Button>
        </form>

        {state.kind === 'success' && (
          <div className="border-t border-accesly-border pt-4 space-y-2">
            <div className="text-sm font-medium text-accesly-success">
              ✓ Upgrade a {state.version} submiteado
            </div>
            <div className="text-xs accesly-hint">
              Status: <code>{state.status}</code> — el hook <code>useWalletStatus</code>{' '}
              confirma el cambio on-chain cuando el ledger lo settlea.
            </div>
            <a
              href={state.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-700"
            >
              ver tx en explorer →
            </a>
          </div>
        )}
      </div>

      <div className="accesly-card p-6 space-y-5">
        <div>
          <h2 className="font-semibold">Manual asset enrollment</h2>
          <p className="accesly-hint text-sm mt-1">
            Agrega la rule <code>biometric-tx</code> para XLM o USDC al Smart Account.
            Desde SDK 1.14.1, <code>tx.send</code> / <code>tx.swap</code> auto-disparan
            esto en el primer uso, así que el end-user nunca lo ve. Quedó acá como
            herramienta del developer (preenrollment, debug, audits).
          </p>
        </div>

        <InfoNote tone="info">
          En la UI principal (<code>/wallet</code>) ya no exponemos estos botones — el
          SDK auto-enroll-a transparentemente cuando hace falta.
        </InfoNote>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={() => handleEnroll('XLM')}
            loading={
              (enroll.kind === 'unlocking' || enroll.kind === 'activating') &&
              enroll.asset === 'XLM'
            }
            disabled={status.status !== 'on-chain' || enroll.kind !== 'idle'}
            className="w-full"
          >
            {enroll.kind !== 'idle' && enroll.asset === 'XLM'
              ? enroll.kind === 'unlocking'
                ? 'Desbloqueando…'
                : enroll.kind === 'activating'
                  ? 'Activando XLM…'
                  : 'XLM activado ✓'
              : 'Activar XLM'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleEnroll('USDC')}
            loading={
              (enroll.kind === 'unlocking' || enroll.kind === 'activating') &&
              enroll.asset === 'USDC'
            }
            disabled={status.status !== 'on-chain' || enroll.kind !== 'idle'}
            className="w-full"
          >
            {enroll.kind !== 'idle' && enroll.asset === 'USDC'
              ? enroll.kind === 'unlocking'
                ? 'Desbloqueando…'
                : enroll.kind === 'activating'
                  ? 'Activando USDC…'
                  : 'USDC activado ✓'
              : 'Activar USDC'}
          </Button>
        </div>

        <ErrorMessage message={enrollError} />

        {enroll.kind === 'success' && (
          <p className="text-xs text-accesly-subtle">
            Rule biometric-tx para {enroll.asset}_SAC agregado vía admin-cfg.{' '}
            <a
              href={walletExplorerUrl(enroll.txHash, 'testnet').replace('/contract/', '/tx/')}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700"
            >
              ver tx →
            </a>
          </p>
        )}
      </div>

      <div className="accesly-card p-6 space-y-5">
        <div>
          <h2 className="font-semibold">G-address bridge bootstrap</h2>
          <p className="accesly-hint text-sm mt-1">
            Crea la G-address classic del user (sponsor + CreateAccount + ChangeTrust USDC
            + EndSponsoring) — necesaria para swap-sdex, fiat onramp y sweep post-onramp.
            Desde SDK 1.14.2, <code>tx.swapViaSdex</code> y <code>wallet.sweepGToSA</code>{' '}
            la auto-disparan si hace falta. Acá queda como preflight manual para QA o
            para que el primer swap del user no pague los ~10s extra.
          </p>
        </div>

        <InfoNote tone="info">
          Idempotente — si la G ya existe on-chain, el simulate del backend devuelve{' '}
          <code>alreadyBootstrapped: true</code> y no toca passkey.
        </InfoNote>

        <Button
          variant="secondary"
          onClick={handleBootstrapG}
          loading={bootstrapG.kind === 'unlocking' || bootstrapG.kind === 'bootstrapping'}
          disabled={status.status !== 'on-chain' || bootstrapG.kind !== 'idle'}
          className="w-full"
        >
          {bootstrapG.kind === 'unlocking'
            ? 'Desbloqueando passkey…'
            : bootstrapG.kind === 'bootstrapping'
              ? 'Bootstrappeando G on-chain…'
              : bootstrapG.kind === 'success'
                ? 'G lista ✓'
                : 'Bootstrap G-address'}
        </Button>

        <ErrorMessage message={bootstrapGError} />

        {bootstrapG.kind === 'success' && (
          <div className="border-t border-accesly-border pt-4 space-y-2 text-xs">
            <div className="text-accesly-success font-medium">
              {bootstrapG.alreadyBootstrapped ? '✓ G ya estaba on-chain' : '✓ G creada'}
            </div>
            <div className="font-mono text-accesly-subtle break-all">
              {bootstrapG.gAddress}
            </div>
            {bootstrapG.txHash && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${bootstrapG.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700"
              >
                ver tx en explorer →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
