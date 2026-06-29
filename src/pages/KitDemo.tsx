import { Component, type ReactNode } from 'react';
import { useAppConfig, useAuthProviders, useBranding, useKycPolicy, useSpendingPolicy } from '@accesly/react';
import { AuthForm } from '@accesly/react/kit';

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <pre className="text-xs text-red-600 whitespace-pre-wrap break-all p-3 bg-red-50 rounded">
          {this.state.err.message}
          {'\n\n'}
          {this.state.err.stack?.slice(0, 1200)}
        </pre>
      );
    }
    return this.props.children;
  }
}

/**
 * Demo page para validar que las configuraciones del dashboard
 * (dev.accesly.xyz / app_d_prueba1_7ut6h) se propagan al runtime del SDK.
 *
 * No requiere login — todo lo que renderiza es público (appConfig).
 * Refetch automático cada 60s vía useAppConfig — cambia algo en el dashboard
 * y vuelve a esta page dentro del minuto.
 */
export function KitDemo() {
  const { config, isLoading, error } = useAppConfig();
  const branding = useBranding();
  const auth = useAuthProviders();
  const spending = useSpendingPolicy();
  const kyc = useKycPolicy();

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-neutral-900">Kit demo · live config</h1>
          <p className="text-sm text-neutral-600 mt-1">
            App ID:{' '}
            <code className="font-mono bg-neutral-200 px-1 rounded">
              {config?.appId ?? '(loading)'}
            </code>
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error.message}
          </div>
        )}

        <section className="grid sm:grid-cols-2 gap-4">
          <Card title="Branding">
            <Row label="hasBranding" value={String(branding.hasBranding)} />
            <Row label="displayName" value={branding.displayName ?? '(none)'} />
            <Row label="logoUrl" value={branding.logoUrl ?? '(none)'} />
            <Row label="--accesly-primary" value="see CSS var" />
            <div
              className="mt-3 h-12 rounded-lg border border-neutral-200 flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: 'var(--accesly-primary, #888)' }}
            >
              primary preview
            </div>
          </Card>

          <Card title="Auth providers">
            <Row label="providers" value={auth.providers.join(', ')} />
            <Row label="phoneRegion" value={auth.phoneRegion ?? '(none)'} />
            <Row label="webauthnEnabled" value={String(auth.webauthnEnabled)} />
          </Card>

          <Card title="Spending policy">
            <Row label="perTxStroops" value={spending.perTxStroops ?? '(no cap)'} />
            <Row label="perTxAsset" value={spending.perTxAsset ?? '(no cap)'} />
            <Row label="txPerDayCount" value={String(spending.txPerDayCount ?? '(none)')} />
            <Row label="blacklist (count)" value={String(spending.blacklist.length)} />
          </Card>

          <Card title="KYC policy">
            <Row label="enabled" value={String(kyc.enabled)} />
            <Row label="requiredFor" value={kyc.requiredFor.join(', ') || '(none)'} />
            <Row label="thresholdUsd" value={String(kyc.thresholdUsd ?? '(none)')} />
            <Row label="minLevel" value={kyc.minLevel ?? '(none)'} />
          </Card>

          <Card title="Trustlines (read)" wide>
            {config?.trustlines?.map((t) => (
              <Row
                key={t.code}
                label={t.code}
                value={`${t.enabled ? '✅ enabled' : '❌ disabled'}${t.displayName ? ' · ' + t.displayName : ''}`}
              />
            )) ?? '(loading...)'}
          </Card>

          <Card title="Wallet upgrade policy" wide>
            <Row label="targetVersion" value={config?.wallet?.targetVersion ?? '(none)'} />
            <Row label="rolloutStrategy" value={config?.wallet?.rolloutStrategy ?? '(none)'} />
            <Row label="rolloutCohort" value={config?.wallet?.rolloutCohort ?? '(none)'} />
          </Card>

          <Card title="Webhooks (read)" wide>
            {(config?.webhooks ?? []).length === 0 ? (
              <p className="text-xs text-neutral-500">(no webhooks configured)</p>
            ) : (
              config?.webhooks?.map((w) => (
                <Row key={w.event} label={w.event} value={w.url} />
              ))
            )}
          </Card>
        </section>

        <section className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h2 className="font-semibold mb-3 text-neutral-900">{'<AuthForm>'} live render</h2>
          <p className="text-xs text-neutral-500 mb-4">
            El AuthForm del kit lee <code>useAuthProviders()</code> y muestra solo los providers
            habilitados. Toggle uno en el dashboard y dentro de 60s desaparece de aquí.
          </p>
          <div className="bg-neutral-50 rounded-xl p-6 flex justify-center">
            <ErrorBoundary>
              <AuthForm />
            </ErrorBoundary>
          </div>
        </section>

        {isLoading && (
          <p className="text-xs text-neutral-400 text-center">
            (loading initial config…)
          </p>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-neutral-200 p-5 ${wide ? 'sm:col-span-2' : ''}`}
    >
      <h3 className="font-semibold text-sm mb-3 text-neutral-900">{title}</h3>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="text-neutral-500 font-mono uppercase tracking-wider">{label}</dt>
      <dd className="font-mono text-neutral-900 break-all text-right">{value}</dd>
    </div>
  );
}
