import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import type { RecoveryConfigResponse } from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { describeError } from '../lib/errors';
import { getCredential } from '../lib/credentialStore';
import { shortAddress } from '../lib/explorer';

/**
 * Phase 6 demo — SEP-30 backend integration.
 *
 * Three sections:
 *  1. Configurar — POST /sep30/accounts/{address}
 *  2. Estado    — GET, PUT (mock auth), DELETE
 *  3. Recuperar (ZK proof) — placeholder hasta que Track C/Phase 4 cierre el
 *     deploy del verifier real on-chain.
 *
 * Las acciones se ejecutan contra el backend desplegado en el env actual
 * (RECOVERY_VERIFIER_MODE=mock) — no afectan al ledger Soroban. Útil para
 * probar el contrato API y los audit logs antes de cablear el verifier real.
 */

const DEFAULT_EMAIL_HASH_PLACEHOLDER =
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const DEMO_SIGNER_ARN =
  'arn:aws:kms:us-east-1:000000000000:key/00000000-demo-demo-demo-000000000000';

export function Recover() {
  const { auth, recovery } = useAccesly();

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [emailHash, setEmailHash] = useState(DEFAULT_EMAIL_HASH_PLACEHOLDER);
  const [signerKey, setSignerKey] = useState('');
  const [config, setConfig] = useState<RecoveryConfigResponse | null>(null);
  const [signResult, setSignResult] = useState<string | null>(null);

  const [configuring, setConfiguring] = useState(false);
  const [reading, setReading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga la walletAddress del LocalCredential del user signed-in.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!auth.username) return;
      const local = await getCredential(auth.username);
      if (!alive) return;
      if (local?.walletAddress) {
        setWalletAddress(local.walletAddress);
        // Pre-cargamos el signer con un placeholder G… derivado de la wallet
        // (en producción el backend devolvería sus propios signers KMS-backed).
        if (!signerKey) {
          setSignerKey('G' + local.walletAddress.slice(1, 56));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [auth.username, signerKey]);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    setReading(true);
    setError(null);
    try {
      const got = await recovery.get(walletAddress);
      setConfig(got);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setReading(false);
    }
  }, [recovery, walletAddress]);

  // Auto-fetch config la primera vez que conocemos la walletAddress.
  useEffect(() => {
    if (walletAddress) void refresh();
  }, [walletAddress, refresh]);

  async function handleConfigure(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) return;
    setError(null);
    setSignResult(null);
    setConfiguring(true);
    try {
      const next = await recovery.configure(walletAddress, {
        identities: [
          {
            role: 'sender',
            authentication_methods: [
              { type: 'accesly_zk_email', value: emailHash.trim() },
            ],
          },
        ],
        signers: [{ key: signerKey.trim(), kmsKeyArn: DEMO_SIGNER_ARN }],
      });
      setConfig(next);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setConfiguring(false);
    }
  }

  async function handleRequestSignature() {
    if (!walletAddress || !config) return;
    setError(null);
    setSignResult(null);
    setSigning(true);
    try {
      const firstSigner = config.signers[0];
      const firstMethod = config.identities[0]?.authentication_methods[0];
      if (!firstSigner || !firstMethod) {
        throw new Error('config sin signer/identity registrados');
      }
      const res = await recovery.requestSignature(
        walletAddress,
        firstSigner.key,
        {
          transaction: 'AAAAAgAAAA==',
          identity: { type: firstMethod.type, value: firstMethod.value },
        },
      );
      setSignResult(
        `authorized=${res.authorized} verifierMode=${res.verifierMode}`,
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSigning(false);
    }
  }

  async function handleDelete() {
    if (!walletAddress) return;
    setError(null);
    setSignResult(null);
    setDeleting(true);
    try {
      await recovery.remove(walletAddress);
      setConfig(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Recuperar cuenta</h1>
        <p className="accesly-hint">
          Configura los métodos SEP-30 que autorizan recovery de tu Smart
          Account. El verifier on-chain (ZK email) corre en modo{' '}
          <code>mock</code> mientras Track C aterriza.
        </p>
      </header>

      {!auth.username && (
        <InfoNote tone="warning" title="Inicia sesión primero">
          Necesitas estar autenticado para asociar el recovery a tu wallet.{' '}
          <Link to="/signin" className="accesly-link">
            Ir a sign-in
          </Link>
          .
        </InfoNote>
      )}

      {auth.username && !walletAddress && (
        <InfoNote tone="warning" title="Sin wallet local">
          No encontramos un <code>walletAddress</code> en este dispositivo.
          Crea una wallet primero en{' '}
          <Link to="/create-wallet" className="accesly-link">
            /create-wallet
          </Link>
          .
        </InfoNote>
      )}

      {walletAddress && (
        <>
          <section className="accesly-card p-6">
            <h2 className="font-semibold mb-2">Wallet</h2>
            <p className="font-mono text-sm break-all">{walletAddress}</p>
            <p className="accesly-hint text-xs mt-1">
              {shortAddress(walletAddress)}
            </p>
          </section>

          <form onSubmit={handleConfigure} className="accesly-card p-6 space-y-4">
            <h2 className="font-semibold">1. Configurar recovery</h2>
            <div>
              <label className="accesly-label" htmlFor="emailHash">
                Email hash (sha256 hex)
              </label>
              <input
                id="emailHash"
                value={emailHash}
                onChange={(e) => setEmailHash(e.target.value)}
                className="accesly-input font-mono text-xs"
                placeholder={DEFAULT_EMAIL_HASH_PLACEHOLDER}
                required
                minLength={64}
                maxLength={64}
              />
              <p className="accesly-hint text-xs mt-1">
                En producción se deriva del circuito ZK (
                <code>recipient_email_hash</code>).
              </p>
            </div>
            <div>
              <label className="accesly-label" htmlFor="signerKey">
                Signer Stellar address (G…)
              </label>
              <input
                id="signerKey"
                value={signerKey}
                onChange={(e) => setSignerKey(e.target.value)}
                className="accesly-input font-mono text-xs"
                placeholder="GXXX..."
                required
                minLength={56}
                maxLength={56}
              />
              <p className="accesly-hint text-xs mt-1">
                Demo only — en producción el backend expone direcciones
                KMS-backed propias.
              </p>
            </div>
            <ErrorMessage message={error} />
            <Button type="submit" loading={configuring} className="w-full">
              Guardar config
            </Button>
          </form>

          <section className="accesly-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">2. Estado actual</h2>
              <button
                type="button"
                onClick={refresh}
                disabled={reading}
                className="accesly-link text-sm"
              >
                {reading ? 'Cargando…' : 'Refrescar'}
              </button>
            </div>
            {config ? (
              <>
                <dl className="text-sm space-y-1">
                  <div className="flex gap-2">
                    <dt className="text-accesly-subtle">Modo verifier:</dt>
                    <dd>
                      <code>{config.verifier_mode}</code>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-accesly-subtle">Identities:</dt>
                    <dd>{config.identities.length}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-accesly-subtle">Signers:</dt>
                    <dd>{config.signers.length}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-accesly-subtle">Actualizado:</dt>
                    <dd>{new Date(config.updated_at).toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={handleRequestSignature}
                    loading={signing}
                  >
                    Simular firma (mock)
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDelete}
                    loading={deleting}
                    variant="danger"
                  >
                    Eliminar
                  </Button>
                </div>
                {signResult && (
                  <InfoNote tone="info" title="Respuesta del backend">
                    <code>{signResult}</code>
                  </InfoNote>
                )}
              </>
            ) : (
              <p className="accesly-hint text-sm">
                No hay config registrada todavía para esta wallet.
              </p>
            )}
          </section>

          <InfoNote tone="info" title="Siguiente paso (Track C / Phase 4)">
            Cuando el verifier on-chain real esté desplegado, el flow agrega:
            generar la proof Groth16 client-side (
            <code>@accesly/zkemail</code>), llamar al verifier para emitir el
            evento <code>RecoveryAuthorized</code>, y el backend pasa a modo{' '}
            <code>real</code> sin cambios en este UI.
          </InfoNote>
        </>
      )}

      <p className="text-sm text-center text-accesly-subtle">
        <Link to="/" className="accesly-link">
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}
