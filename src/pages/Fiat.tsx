import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { formatError } from '@accesly/core';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoNote } from '../components/InfoNote';

/**
 * /fiat — onboarding fiat-cripto vía Etherfuse.
 *
 * Flow (single-page wizard):
 *   1. Start KYC → user completa identidad/docs en hosted form
 *   2. Registrar bank account (CLABE) → permite offramp
 *   3. Quote + submit onramp MXN→USDC
 *   4. Quote + submit offramp USDC→MXN
 */

type KycInfo = {
  status: 'not_started' | 'pending' | 'approved' | 'rejected';
  hostedUrl: string | null;
  customerId: string | null;
};

type BankAccount = {
  bankAccountId: string;
  status: 'pending' | 'approved' | 'rejected';
  label?: string;
  clabeLast4: string;
};

type OnrampState =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'quoted'; quoteId: string; amountUsdc: string; fxRate: string; expiresAt: string }
  | { kind: 'submitting' }
  | { kind: 'submitted'; orderId: string; status: string };

type OfframpState =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'quoted'; quoteId: string; amountMxn: string; fxRate: string }
  | { kind: 'submitting' }
  | { kind: 'submitted'; orderId: string; status: string };

export function Fiat() {
  const { auth, wallet, fiat, _internal } = useAccesly();
  const [kyc, setKyc] = useState<KycInfo>({ status: 'not_started', hostedUrl: null, customerId: null });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bridgePhase, setBridgePhase] = useState<'idle' | 'checking' | 'unlocking' | 'creating'>('idle');

  // KYC status al mount
  useEffect(() => {
    void refreshKyc();
  }, []);

  async function refreshKyc() {
    try {
      const s = await fiat.kycStatus();
      setKyc({
        status: (s.status as KycInfo['status']) ?? 'not_started',
        hostedUrl: s.hostedUrl ?? null,
        customerId: s.customerId ?? null,
      });
      // El record DDB también trae bankAccounts si el lambda los devuelve.
      const anyS = s as unknown as { bankAccounts?: BankAccount[] };
      if (Array.isArray(anyS.bankAccounts)) setBankAccounts(anyS.bankAccounts);
    } catch (err) {
      setError(formatError(err));
    }
  }

  /**
   * Fase II (1.10+): Etherfuse necesita una G-address con trustline USDC.
   * Antes de cualquier interacción con su API, asegurar que el bridge esté
   * bootstrapped. Idempotente: si ya está, retorna sin pedir passkey.
   */
  async function ensureBridgeReady(): Promise<void> {
    setBridgePhase('checking');
    const sim = await _internal.endpoints.bootstrapGSimulate();
    if (sim.alreadyBootstrapped) {
      setBridgePhase('idle');
      return;
    }
    if (!auth.username) throw new Error('No hay sesión activa.');
    setBridgePhase('unlocking');
    const material = await wallet.unlockForSigning(auth.username);
    setBridgePhase('creating');
    await wallet.bootstrapG({
      fragmentF1Plain: material.fragmentF1Plain,
      fragmentF2Key: material.fragmentF2Key,
      ownerPubkey: material.ownerPubkey,
    });
    setBridgePhase('idle');
  }

  async function handleStartKyc() {
    setError(null);
    try {
      await ensureBridgeReady();
      const res = await fiat.startKyc();
      setKyc({
        status: (res.status as KycInfo['status']) ?? 'pending',
        hostedUrl: res.hostedUrl ?? null,
        customerId: res.customerId,
      });
      if (res.hostedUrl) window.open(res.hostedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setBridgePhase('idle');
      setError(formatError(err));
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Fiat ⇄ USDC</h1>
        <p className="accesly-hint mt-1">
          Onramp MXN→USDC y offramp USDC→MXN vía SPEI. Vos completás KYC + registrás CLABE en
          Etherfuse; tu llave nunca toca su backend.
        </p>
      </header>

      <ErrorMessage message={error} />
      {info && <InfoNote tone="info" title="OK">{info}</InfoNote>}

      <KycCard kyc={kyc} bridgePhase={bridgePhase} onStart={handleStartKyc} onRefresh={refreshKyc} />

      {kyc.status !== 'not_started' && (
        <BankAccountsCard
          bankAccounts={bankAccounts}
          onRegistered={(b) => {
            setBankAccounts((prev) => [...prev, b]);
            setInfo(`Cuenta ...${b.clabeLast4} registrada (${b.status})`);
          }}
          onError={setError}
        />
      )}

      {kyc.status === 'approved' && (
        <OnrampCard onError={setError} />
      )}

      {kyc.status === 'approved' && bankAccounts.some((b) => b.status === 'approved') && (
        <OfframpCard bankAccounts={bankAccounts.filter((b) => b.status === 'approved')} onError={setError} />
      )}

      <p className="text-xs text-accesly-subtle">
        <Link to="/wallet" className="text-blue-700 hover:underline">← Volver a la wallet</Link>
      </p>
    </div>
  );
}

function KycCard({
  kyc,
  bridgePhase,
  onStart,
  onRefresh,
}: {
  kyc: KycInfo;
  bridgePhase: 'idle' | 'checking' | 'unlocking' | 'creating';
  onStart: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const bridgeMsg =
    bridgePhase === 'checking'
      ? 'Revisando cuenta bridge…'
      : bridgePhase === 'unlocking'
      ? 'Desbloqueando passkey…'
      : bridgePhase === 'creating'
      ? 'Creando G-address on-chain (sponsored)…'
      : null;
  const busy = bridgePhase !== 'idle';
  const statusLabel = {
    not_started: 'Sin iniciar',
    pending: 'Pendiente de revisión',
    approved: 'Aprobado',
    rejected: 'Rechazado',
  }[kyc.status];
  const statusColor =
    kyc.status === 'approved'
      ? 'text-accesly-success'
      : kyc.status === 'rejected'
      ? 'text-accesly-danger'
      : 'text-accesly-subtle';

  return (
    <div className="accesly-card p-6 space-y-3">
      <div className="flex justify-between items-baseline">
        <h2 className="font-semibold">KYC</h2>
        <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
      </div>
      {kyc.status === 'not_started' ? (
        <>
          <p className="text-sm text-accesly-subtle">
            Necesitás completar verificación de identidad (INE + comprobante) en Etherfuse antes
            de poder cambiar de fiat a USDC o viceversa.
          </p>
          {bridgeMsg && <p className="text-xs text-accesly-subtle">{bridgeMsg}</p>}
          <Button onClick={onStart} loading={busy} disabled={busy}>
            {busy ? 'Preparando…' : 'Empezar KYC'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">
            customerId: <code className="font-mono text-xs">{kyc.customerId}</code>
          </p>
          {kyc.status === 'pending' && kyc.hostedUrl && (
            <a
              href={kyc.hostedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-700 hover:underline"
            >
              Reanudar formulario de Etherfuse →
            </a>
          )}
          {kyc.status === 'pending' && !kyc.hostedUrl && (
            <Button onClick={onStart}>
              Reanudar KYC en Etherfuse
            </Button>
          )}
          <Button variant="ghost" onClick={onRefresh}>
            Refrescar status
          </Button>
        </>
      )}
    </div>
  );
}

function BankAccountsCard({
  bankAccounts,
  onRegistered,
  onError,
}: {
  bankAccounts: BankAccount[];
  onRegistered: (b: BankAccount) => void;
  onError: (msg: string) => void;
}) {
  const { fiat } = useAccesly();
  const [open, setOpen] = useState(false);
  const [clabe, setClabe] = useState('');
  const [firstName, setFirstName] = useState('');
  const [paternalLastName, setPaternalLastName] = useState('');
  const [maternalLastName, setMaternalLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [holderRfc, setHolderRfc] = useState('');
  const [holderCurp, setHolderCurp] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fiat.registerBankAccount({
        clabe,
        firstName,
        paternalLastName,
        maternalLastName,
        birthDate,
        holderRfc,
        holderCurp,
        ...(label ? { label } : {}),
      });
      onRegistered({
        bankAccountId: res.bankAccountId,
        status: res.status,
        clabeLast4: res.clabeLast4,
        ...(res.label ? { label: res.label } : {}),
      });
      setOpen(false);
      setClabe('');
      setFirstName('');
      setPaternalLastName('');
      setMaternalLastName('');
      setBirthDate('');
      setHolderRfc('');
      setHolderCurp('');
      setLabel('');
    } catch (err) {
      onError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="accesly-card p-6 space-y-3">
      <div className="flex justify-between items-baseline">
        <h2 className="font-semibold">Cuentas bancarias</h2>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancelar' : '+ Agregar CLABE'}
        </Button>
      </div>
      {bankAccounts.length === 0 ? (
        <p className="text-sm text-accesly-subtle">
          Aún no registraste ninguna CLABE. La necesitás para offramp (USDC→MXN).
        </p>
      ) : (
        <ul className="text-sm space-y-1">
          {bankAccounts.map((b) => (
            <li key={b.bankAccountId} className="flex justify-between border-b border-accesly-border pb-1 last:border-b-0">
              <span>
                {b.label ?? 'Cuenta'} · ···{b.clabeLast4}
              </span>
              <span
                className={
                  b.status === 'approved'
                    ? 'text-accesly-success text-xs'
                    : b.status === 'rejected'
                    ? 'text-accesly-danger text-xs'
                    : 'text-accesly-subtle text-xs'
                }
              >
                {b.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form onSubmit={onSubmit} className="space-y-3 pt-3 border-t border-accesly-border">
          <div>
            <label className="accesly-label">CLABE (18 dígitos)</label>
            <input
              required
              pattern="\d{18}"
              value={clabe}
              onChange={(e) => setClabe(e.target.value)}
              placeholder="012345678901234567"
              className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="accesly-label">Nombre(s)</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Juan"
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
            <div>
              <label className="accesly-label">Apellido paterno</label>
              <input
                required
                value={paternalLastName}
                onChange={(e) => setPaternalLastName(e.target.value)}
                placeholder="Pérez"
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
            <div>
              <label className="accesly-label">Apellido materno</label>
              <input
                required
                value={maternalLastName}
                onChange={(e) => setMaternalLastName(e.target.value)}
                placeholder="García"
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="accesly-label">Fecha de nacimiento</label>
              <input
                required
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
            <div>
              <label className="accesly-label">RFC</label>
              <input
                required
                value={holderRfc}
                onChange={(e) => setHolderRfc(e.target.value.toUpperCase())}
                placeholder="XEXX010101000 en sandbox"
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
            <div>
              <label className="accesly-label">CURP</label>
              <input
                required
                value={holderCurp}
                onChange={(e) => setHolderCurp(e.target.value.toUpperCase())}
                placeholder="PEPG800101HDFRRR01"
                maxLength={18}
                className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="accesly-label">Label (opcional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Banamex personal"
              className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
            />
          </div>
          <Button type="submit" loading={submitting} disabled={submitting}>
            Registrar cuenta
          </Button>
        </form>
      )}
    </div>
  );
}

function OnrampCard({ onError }: { onError: (msg: string) => void }) {
  const { fiat } = useAccesly();
  const [amountMxn, setAmountMxn] = useState('');
  const [state, setState] = useState<OnrampState>({ kind: 'idle' });

  async function onQuote(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'quoting' });
    try {
      const q = await fiat.quoteOnramp({ amountMxn });
      setState({
        kind: 'quoted',
        quoteId: q.quoteId ?? '',
        amountUsdc: q.amount,
        fxRate: q.fxRate ?? '',
        expiresAt: q.expiresAt ?? '',
      });
    } catch (err) {
      onError(formatError(err));
      setState({ kind: 'idle' });
    }
  }

  async function onSubmit() {
    if (state.kind !== 'quoted') return;
    setState({ kind: 'submitting' });
    try {
      const o = await fiat.submitOnramp({ quoteId: state.quoteId });
      setState({ kind: 'submitted', orderId: o.orderId ?? '', status: o.status });
    } catch (err) {
      onError(formatError(err));
      setState({ kind: 'idle' });
    }
  }

  return (
    <div className="accesly-card p-6 space-y-3">
      <h2 className="font-semibold">Onramp MXN → USDC</h2>
      <form onSubmit={onQuote} className="space-y-3">
        <div>
          <label className="accesly-label">Monto (MXN)</label>
          <input
            type="number"
            min={1}
            required
            value={amountMxn}
            onChange={(e) => setAmountMxn(e.target.value)}
            placeholder="1000"
            className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
          />
        </div>
        <Button type="submit" disabled={state.kind !== 'idle'}>
          {state.kind === 'quoting' ? 'Cotizando…' : 'Cotizar'}
        </Button>
      </form>
      {state.kind === 'quoted' && (
        <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-sm space-y-1">
          <div>Recibirás: <span className="font-mono">{state.amountUsdc} USDC</span></div>
          <div>FX rate: <span className="font-mono">{state.fxRate}</span></div>
          <div className="text-xs text-accesly-subtle">Quote ID: {state.quoteId}</div>
          <Button onClick={onSubmit} className="mt-2">
            Confirmar onramp
          </Button>
        </div>
      )}
      {state.kind === 'submitted' && (
        <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-sm">
          <div className="text-accesly-success">✓ Orden creada</div>
          <div className="text-xs">Order ID: {state.orderId}</div>
          <div className="text-xs">Status: {state.status}</div>
          <p className="text-xs text-accesly-subtle mt-2">
            Etherfuse te va a indicar una CLABE para transferir SPEI. Cuando llegue el dinero,
            los USDC se mueven al Smart Account.
          </p>
        </div>
      )}
    </div>
  );
}

function OfframpCard({
  bankAccounts,
  onError,
}: {
  bankAccounts: BankAccount[];
  onError: (msg: string) => void;
}) {
  const { fiat } = useAccesly();
  const [amountUsdc, setAmountUsdc] = useState('');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.bankAccountId ?? '');
  const [state, setState] = useState<OfframpState>({ kind: 'idle' });

  async function onQuote(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'quoting' });
    try {
      const q = await fiat.quoteOfframp({ amountUsdc, bankAccountId });
      setState({
        kind: 'quoted',
        quoteId: q.quoteId ?? '',
        amountMxn: q.amount,
        fxRate: q.fxRate ?? '',
      });
    } catch (err) {
      onError(formatError(err));
      setState({ kind: 'idle' });
    }
  }

  async function onSubmit() {
    if (state.kind !== 'quoted') return;
    setState({ kind: 'submitting' });
    try {
      const o = await fiat.submitOfframp({ quoteId: state.quoteId });
      setState({ kind: 'submitted', orderId: o.orderId ?? '', status: o.status });
    } catch (err) {
      onError(formatError(err));
      setState({ kind: 'idle' });
    }
  }

  return (
    <div className="accesly-card p-6 space-y-3">
      <h2 className="font-semibold">Offramp USDC → MXN</h2>
      <form onSubmit={onQuote} className="space-y-3">
        <div>
          <label className="accesly-label">Cuenta destino</label>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
          >
            {bankAccounts.map((b) => (
              <option key={b.bankAccountId} value={b.bankAccountId}>
                {b.label ?? 'Cuenta'} · ···{b.clabeLast4}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="accesly-label">Monto (USDC)</label>
          <input
            type="number"
            min={0.0001}
            step={0.0001}
            required
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            placeholder="100"
            className="w-full text-sm px-3 py-2 rounded-lg bg-white border border-accesly-border focus:border-accesly-ink focus:outline-none transition"
          />
        </div>
        <Button type="submit" disabled={state.kind !== 'idle'}>
          {state.kind === 'quoting' ? 'Cotizando…' : 'Cotizar'}
        </Button>
      </form>
      {state.kind === 'quoted' && (
        <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-sm space-y-1">
          <div>Recibirás: <span className="font-mono">{state.amountMxn} MXN</span></div>
          <div>FX rate: <span className="font-mono">{state.fxRate}</span></div>
          <div className="text-xs text-accesly-subtle">Quote ID: {state.quoteId}</div>
          <Button onClick={onSubmit} className="mt-2">
            Confirmar offramp
          </Button>
        </div>
      )}
      {state.kind === 'submitted' && (
        <div className="rounded-lg bg-accesly-bg border border-accesly-border px-3 py-2 text-sm">
          <div className="text-accesly-success">✓ Orden creada</div>
          <div className="text-xs">Order ID: {state.orderId}</div>
          <div className="text-xs">Status: {state.status}</div>
        </div>
      )}
    </div>
  );
}
