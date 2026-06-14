import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly, ENVIRONMENT_DEFAULTS } from '@accesly/react';
import type {
  RecoverStep,
  RecoverWalletResult,
  ZkEmailProverHandleForRecovery,
} from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';
import { describeError } from '../lib/errors';

/**
 * Real recovery (flow B). PUBLIC route — no sign-in required.
 *
 * Asks the user for the metadata they exported at onboarding (or remember),
 * walks them through generating a new passkey + DKIM-signed email, and runs
 * the orchestrator end-to-end. Designed as a single-page wizard with a
 * progress stepper so the 30-90s ZK proof generation is visible.
 *
 * MVP scope (testnet):
 *  - Passkey: we generate placeholder pseudo-random bytes. Real WebAuthn
 *    registration of a new passkey is out of scope for this iteration —
 *    landing in a follow-up alongside the device persistence wiring.
 *  - DKIM modulus: pasted by the user as a decimal string. Future:
 *    auto-extract from the .eml via dkim-signer header.
 *  - Email salt: pasted by the user. They should have stored it locally
 *    (or in a password manager) at onboarding.
 *
 * The orchestrator does the rest: Shamir split, ZK proof gen, SA rule
 * query, multi-op envelope, ZK AuthPayload, POST /recover.
 */

interface RecoveryFormState {
  email: string;
  walletAddress: string;
  emailSaltBase64: string;
  rsaModulusDecimal: string;
  domainHashHex: string;
  emlText: string;
  zkVerifierAddress: string;
  ed25519VerifierAddress: string;
  secp256r1VerifierAddress: string;
}

const EMPTY: RecoveryFormState = {
  email: '',
  walletAddress: '',
  emailSaltBase64: '',
  rsaModulusDecimal: '',
  domainHashHex: '',
  emlText: '',
  zkVerifierAddress: '',
  ed25519VerifierAddress: '',
  secp256r1VerifierAddress: '',
};

const STEP_LABELS: Record<RecoverStep, string> = {
  shamir_split: '1/5 generando nueva master key',
  generating_proof: '2/5 generando proof ZK (puede tardar 30-90s)',
  querying_rules: '3/5 consultando rules del Smart Account',
  building_envelope: '4/5 armando envelope con rotaciones',
  submitting: '5/5 enviando al backend',
  persisting_local: 'guardando F1 local',
};

export function RecoverFlow() {
  const { recovery, _internal } = useAccesly();

  const [form, setForm] = useState<RecoveryFormState>(() => prefillFromEnv(_internal.env));
  const [step, setStep] = useState<RecoverStep | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecoverWalletResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prover = useMemo<ZkEmailProverHandleForRecovery | null>(
    () => _internal.zkEmailProver as ZkEmailProverHandleForRecovery | null,
    [_internal.zkEmailProver],
  );

  const update = (k: keyof RecoveryFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!prover) {
      setError(
        'No hay un ZkEmailProver configurado en <AcceslyProvider>. ' +
          'Para correr recovery real instalar @accesly/zkemail y pasar la instancia.',
      );
      return;
    }
    setLoading(true);
    try {
      const emailSalt = base64ToBytes(form.emailSaltBase64.trim());
      const domainHash = hexToBytes(form.domainHashHex.trim());
      const rsaModulus = BigInt(form.rsaModulusDecimal.trim());

      const newPasskey = generatePlaceholderPasskey();
      const newEncryptionKeys = [
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
      ] as const;

      const res = await recovery.run(
        {
          walletAddress: form.walletAddress.trim(),
          email: form.email.trim(),
          eml: form.emlText,
          rsaModulus,
          newPasskeyPubkey: newPasskey,
          emailSalt,
          newEncryptionKeys: newEncryptionKeys as unknown as readonly [Uint8Array, Uint8Array, Uint8Array],
          ed25519VerifierAddress: form.ed25519VerifierAddress.trim(),
          secp256r1VerifierAddress: form.secp256r1VerifierAddress.trim(),
          zkEmailVerifierAddress: form.zkVerifierAddress.trim(),
          dkimDomainHash: domainHash,
          prover,
        },
        setStep,
      );
      setResult(res);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Recuperar acceso (flow real)</h1>
        <p className="accesly-hint">
          Demuestra que controlas tu email vía proof ZK. El Smart Account rota
          la passkey + master key sin pedir contraseña vieja. No requiere
          haber iniciado sesión.
        </p>
      </header>

      {!prover && (
        <InfoNote tone="warning" title="ZkEmailProver no configurado">
          Esta página requiere que la app pase un <code>zkEmailProver</code> al{' '}
          <code>&lt;AcceslyProvider&gt;</code>. Instalar <code>@accesly/zkemail</code>{' '}
          y configurarlo con la URL del CDN de artefactos. Documentación:{' '}
          <a
            href="https://github.com/Accesly/SDKAccesly/blob/main/docs/Handoff_Fase7.md"
            target="_blank"
            rel="noreferrer"
            className="accesly-link"
          >
            Handoff_Fase7.md
          </a>
          .
        </InfoNote>
      )}

      <form onSubmit={handleSubmit} className="accesly-card p-6 space-y-4">
        <Field label="Email registrado" value={form.email} onChange={update('email')} type="email" required />
        <Field
          label="Wallet address (C…)"
          value={form.walletAddress}
          onChange={update('walletAddress')}
          required
          minLength={56}
          maxLength={56}
        />
        <Field
          label="Email salt (base64, guardado al onboarding)"
          value={form.emailSaltBase64}
          onChange={update('emailSaltBase64')}
          required
        />
        <Field
          label="Domain hash (sha256(domain), hex 32 bytes)"
          value={form.domainHashHex}
          onChange={update('domainHashHex')}
          required
          minLength={64}
          maxLength={64}
        />
        <Field
          label="RSA modulus del DKIM key (decimal)"
          value={form.rsaModulusDecimal}
          onChange={update('rsaModulusDecimal')}
          required
          longInput
        />
        <Field
          label="ZK Email Verifier contract address"
          value={form.zkVerifierAddress}
          onChange={update('zkVerifierAddress')}
          required
        />
        <Field
          label="ed25519 verifier contract address"
          value={form.ed25519VerifierAddress}
          onChange={update('ed25519VerifierAddress')}
          required
        />
        <Field
          label="secp256r1 verifier contract address"
          value={form.secp256r1VerifierAddress}
          onChange={update('secp256r1VerifierAddress')}
          required
        />

        <div>
          <label className="accesly-label" htmlFor="eml">
            Email completo (.eml) — Gmail "Mostrar original"
          </label>
          <textarea
            id="eml"
            value={form.emlText}
            onChange={update('emlText')}
            required
            rows={8}
            className="accesly-input font-mono text-xs"
            placeholder="Return-Path: ...\nDKIM-Signature: ...\nFrom: ...\nSubject: Accesly Recovery: C... -> 04..."
          />
        </div>

        {step && (
          <div className="bg-accesly-card-elevated p-3 rounded text-sm">
            <span className="accesly-hint">{STEP_LABELS[step]}…</span>
          </div>
        )}

        <ErrorMessage message={error} />

        <Button type="submit" loading={loading} disabled={!prover} className="w-full">
          Iniciar recovery
        </Button>
      </form>

      {result && (
        <InfoNote tone="info" title="Recovery exitoso">
          <div className="space-y-1 text-sm">
            <div>
              <strong>txHash:</strong> <code className="break-all">{result.txHash}</code>
            </div>
            <div>
              <strong>status:</strong> {result.status}
            </div>
            <div>
              <strong>nueva owner pubkey:</strong>{' '}
              <code className="break-all">{bytesToHex(result.newOwnerPubkey)}</code>
            </div>
            <div className="accesly-hint">
              total: {Math.round(result.elapsedMs)}ms — proof {Math.round(result.stepTimings.proofMs)}ms,
              rules {Math.round(result.stepTimings.queryRulesMs)}ms, submit{' '}
              {Math.round(result.stepTimings.submitMs)}ms
            </div>
            <div className="accesly-hint mt-2">
              <strong>Pendiente del lado del SDK:</strong> persistir F1 en el DeviceStore local
              y rebuildear el SDK context para que la próxima sesión use la nueva wallet.
              Lo agrega un follow-up.
            </div>
          </div>
        </InfoNote>
      )}

      <p className="text-sm text-center text-accesly-subtle">
        <Link to="/" className="accesly-link">
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  longInput?: boolean;
}

function Field({ label, value, onChange, type, required, minLength, maxLength, longInput }: FieldProps) {
  return (
    <div>
      <label className="accesly-label">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={onChange}
        className={`accesly-input ${longInput ? 'font-mono text-xs' : ''}`}
        required={required}
        {...(minLength !== undefined ? { minLength } : {})}
        {...(maxLength !== undefined ? { maxLength } : {})}
      />
    </div>
  );
}

function prefillFromEnv(env: 'dev' | 'staging' | 'prod'): RecoveryFormState {
  // Pre-fill with the example app's deployed Soroban verifier addresses so
  // the user only has to provide the per-user fields (email, wallet, salt,
  // .eml, RSA modulus, domain hash). Concrete addresses live in
  // ENVIRONMENT_DEFAULTS — this saves the user from copy/pasting them.
  const cfg = ENVIRONMENT_DEFAULTS[env].stellar;
  return {
    ...EMPTY,
    ed25519VerifierAddress: (cfg as { ed25519VerifierAddress?: string }).ed25519VerifierAddress ?? '',
    secp256r1VerifierAddress: (cfg as { secp256r1VerifierAddress?: string }).secp256r1VerifierAddress ?? '',
    zkVerifierAddress: (cfg as { zkEmailVerifierAddress?: string }).zkEmailVerifierAddress ?? '',
  };
}

function generatePlaceholderPasskey(): Uint8Array {
  // Real implementation: navigator.credentials.create() + extract the
  // raw secp256r1 pubkey from the attestation. Out of scope for this
  // iteration. For now we return pseudo-random bytes so the orchestrator
  // can run end-to-end against a stub.
  const out = new Uint8Array(65);
  crypto.getRandomValues(out);
  out[0] = 0x04; // uncompressed prefix
  return out;
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`hex length must be even: got ${clean.length}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 1) out += (b[i] ?? 0).toString(16).padStart(2, '0');
  return out;
}
