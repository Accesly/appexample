# Cambios recientes en accesly-example

**Última actualización:** 2026-06-27 (noche)

Bitácora de los cambios significativos. Si querés ver detalle completo, revisar git log de cada commit referenciado.

---

## 2026-06-27 (noche) — bump SDK 1.14.1 → 1.14.2 + auto-bootstrap-G

### Mismo patrón que el auto-enroll, ahora para la G-address bridge

Después del auto-enroll de XLM/USDC (1.14.1) faltaba el caso paralelo: 5 endpoints del backend tiran 409 `G-address bridge not bootstrapped` cuando el user invoca un flujo que necesita la G classic (swap-sdex, sweep, fiat onramp/KYC) sin haberla creado primero. Hasta hoy el caller (example) tenía que orquestar el preflight manualmente.

### Backend (CloudServices-accesly)

- `swap-sdex` (×2), `sweep-g`, `etherfuse-order`, `etherfuse-kyc`: todos los `jsonError(409, 'G-address bridge not bootstrapped...')` migrados a `jsonErrorWithCode(409, msg, 'G_NOT_BOOTSTRAPPED')`. El body del error ahora incluye `code` machine-readable.

### SDK (SDKAccesly → @accesly/core@1.14.2 + @accesly/react@1.14.2)

- Nueva clase `GAddressNotBootstrappedError extends AccesslyApiError` (exportada desde `@accesly/core`). `errorForResponse` la construye cuando `status === 409 && code === 'G_NOT_BOOTSTRAPPED'`.
- **`tx.swapViaSdex`**: doble wrapper — `withAutoBootstrapG(withAutoEnroll(simulate))`. Resuelve ambas precondiciones (enroll del fromAsset + bootstrap G) en cascada.
- **`wallet.sweepGToSA`**: try/catch inline sobre el simulate. Si falta G, dispara `doBootstrapG(input)` y reintenta.
- **Refactor**: extraído `doBootstrapG` como const dentro del closure del `wallet` useMemo. `wallet.bootstrapG` y la auto-recovery en `sweepGToSA` apuntan a la misma implementación. Cero duplicación.

### Limitación documentada

`fiat.submitOnramp`, `fiat.submitOfframp` y `kyc.start()` **no** reciben material (`fragmentF1Plain`, etc.) — no podemos firmar `bootstrapG` desde ahí. Estos flujos siguen requiriendo que el caller bootstrappee explícitamente antes. La nueva clase de error está disponible para que el caller la detecte typed.

### accesly-example

- **`Swap.tsx` simplificado**: removido el bloque pre-swap `if (venue === 'sdex') { await wallet.bootstrapG(...) }` (líneas 222-237). Removida la fase `'bootstrap-g'` del state machine + sus refs en el botón y `busy`. El SDK lo cubre transparentemente.
- **`Swap.tsx` typed errors**: el preview cambió `formatError(err).includes('G-address bridge not bootstrapped')` por `err instanceof GAddressNotBootstrappedError`. Más limpio y a prueba de cambios de mensaje.
- **Mantenido en `Swap.tsx`**: el preflight `onActivateBridge` que se muestra cuando el preview detecta `needsBootstrap=true`. Permite al user pre-bootstrappear antes del primer swap si quiere evitar los ~10s extra del primer SDEX.
- **`DevTools.tsx` extendido**: nueva sección "G-address bridge bootstrap" con botón manual (preflight para QA / DX). Idempotente — si la G ya existe, simulate devuelve `alreadyBootstrapped: true` sin tocar passkey.
- Bump deps `1.14.1 → 1.14.2`.

---

## 2026-06-27 (tarde) — bump SDK 1.14.0 → 1.14.1 + UI cleanup post auto-enroll

### Bug surfaced durante QA

Al probar swap XLM→USDC contra una wallet con el constructor topado en cap de byte-write Soroban, dos fails encadenados:

1. **`/tx/swap-sdex/simulate` devolvía 409** `wallet not enrolled for XLM` — el SDK no auto-disparaba `activateAsset('XLM')` (solo para USDC). El user veía un botón "Activar XLM" en `/wallet` que tenía que clickear manualmente.
2. **Tras activar XLM y reintentar swap, `/tx/swap-sdex/submit` devolvía 502** `tx3 build failed (USDC stuck in G): BalanceError(#10)` — race entre Horizon (que confirmó tx2 SDEX) y Soroban RPC (que aún no había indexado ese ledger).

Ambos arreglados aguas arriba; el example consume el fix vía SDK 1.14.1.

### Backend (CloudServices-accesly)

- `swap-sdex/handler.ts`: nuevo `buildSacTransferInnerWithRetry` con 3 intentos × 2s backoff que reintenta solo cuando el error coincide con `BalanceError(#10) / resulting balance is not within / Error(Contract, #10)`. Otros errores se propagan sin retry.
- `swap-sdex`, `swap`, `simulate-tx`: todos los `jsonError(409, 'wallet not enrolled ...')` migrados a `jsonErrorWithCode(409, msg, 'WALLET_NOT_ENROLLED', { asset })`. El body del error ahora incluye `code` machine-readable y `asset` para que el SDK pueda detectar el caso sin parsear el mensaje.
- Nuevo helper `jsonErrorWithCode(statusCode, error, code, extra?)` en `shared/response.ts`.

### SDK (SDKAccesly → @accesly/core@1.14.1 + @accesly/react@1.14.1)

- Nueva clase `WalletNotEnrolledError extends AccesslyApiError` con `asset: 'XLM' | 'USDC'` (exportada desde `@accesly/core`). `errorForResponse` la construye cuando `status === 409 && code === 'WALLET_NOT_ENROLLED'`.
- `tx.send`, `tx.swap` y `tx.swapViaSdex` envueltos con `withAutoEnroll(material, op)`. Si la primera llamada al backend tira `WalletNotEnrolledError`, el SDK:
  1. Llama `wallet.activateAsset({ asset: err.asset, ...material })` reusando el material ya unlocked.
  2. Reintenta la operación original transparentemente.

  El user ve un solo prompt de passkey (el original); el activate ocurre en el mismo flujo sin re-prompt. Misma firma del owner contra rule `admin-cfg` — no-custodia intacta.

### accesly-example

- **`Wallet.tsx` limpio**: removidos `handleActivate`, botones "Activar XLM/USDC", state machine `ActivateState`. La acción "Fondear (friendbot)" ocupa el slot. Nuevo `InfoNote` explica que el SDK auto-enrolla y linkea a `/dev-tools` para el flujo manual.
- **`DevTools.tsx` extendido**: nueva sección "Manual asset enrollment" con `handleEnroll` parametrizado por asset + dos botones (XLM + USDC). Banner explícito de que el SDK ya hace esto automáticamente — la sección sirve para preenrollment, debug o políticas del developer.
- **Bump deps**: `@accesly/core` y `@accesly/react` `1.14.0` → `1.14.1`. Lockfile regenerado.

---

## 2026-06-27 — bump SDK 1.13.5 → 1.14.0 + 3 features nuevas

### Bump de deps

`@accesly/core` y `@accesly/react`: `1.13.5` → `1.14.0`. Publicados a npm el mismo día. El bump implicó dos breaking changes pequeños en types del SDK que se reflejaron en el example:

- `useWalletStatus().status` ahora puede ser `'no-wallet'` además de `'on-chain' | 'pending-deploy' | 'unknown'`. El early-return en `Wallet.tsx` ya lo manejaba; lo que cambió es que `<WalletStatusBadge>` ahora recibe el status narrowed directamente (sin ternario defensivo `=== 'no-wallet' ? 'unknown' : status`).
- `WalletHistoryItem` ya no expone `txHash`; usa `txToid` + `eventToid` como identificador canónico (preserva precisión > 2^53). El `key` del `<ActivityRow>` cambió a `${txToid}:${eventToid}`.

### `wallet.activateAsset('XLM')` además de `'USDC'`

`Wallet.tsx` ahora muestra **dos botones** ("Activar XLM" + "Activar USDC") en lugar de uno solo. Ambos comparten la misma máquina de estado `unlocking → activating → success` parametrizada por `asset: ActivatableAsset`.

**Por qué XLM también necesita activación:** wallets cuyo constructor topó con el cap de byte-write Soroban no instalaron la rule `biometric-tx` de XLM. Wallets post-Fase Q ya la traen pre-instalada. Si tu wallet es anterior, hay que activar XLM antes del primer pago.

### Google OAuth — `auth.signInWithGoogle` + `/auth/callback`

Tres archivos nuevos:

- `src/components/GoogleSignInButton.tsx` — botón "Continuar con Google" reutilizable. Llama `auth.signInWithGoogle()` que dispara redirect a Cognito Hosted UI con scope `openid email profile` y el IdP Google.
- `src/pages/AuthCallback.tsx` — landing en `/auth/callback?code=xxx`. Extrae el code del query string, llama `auth.handleAuthCallback(code)` que lo intercambia por tokens Cognito vía `/oauth2/token`, persiste vía el token manager, refresca `auth.status`. Navega a `/wallet` cuando termina. Usa `processedRef` para que StrictMode no canjee el code dos veces (Cognito invalida codes redimidos).
- Wire en `App.tsx`: ruta `/auth/callback` registrada antes del `<AuthGuard>` (debe ser pública para recibir el redirect).

Botón visible en **SignIn.tsx** y **SignUp.tsx** (modo form), separado del email/password con un divider "o con email".

**Config requerida en Cognito (ya está en env `dev` del SDK):** `hostedUiDomain: https://accesly-dev.auth.us-east-1.amazoncognito.com`, callback URL `http://localhost:5173/auth/callback` registrado en el App Client.

### `/dev-tools` — wallet.upgrade como flujo del dashboard del developer

Nueva página `src/pages/DevTools.tsx`, ruta `/dev-tools` bajo `AuthGuard`. Pingback discreto desde el footer de `/wallet`.

**Decisión de producto:** `wallet.upgrade(targetVersion)` NO se le muestra al end-user. La decisión de "qué versión del Smart Account WASM correr" pertenece al **developer integrador** (su política de seguridad/compliance), no al usuario final. En producción:

1. El developer marca una versión recomendada/forzada en su dashboard.
2. El backend la sirve via algún endpoint tipo `GET /upgrade-recommendation`.
3. El SDK detecta el mismatch en `useWalletStatus` y dispara un prompt mínimo: "Tu wallet tiene una actualización de seguridad disponible — Actualizar".
4. El user firma con passkey, listo.

En el example exponemos el flujo con un **input libre de `targetVersion`** únicamente para QA local — con un `<InfoNote tone="warning">` explícito de que esto no va en producción.

**Premisa no-custodial intacta:** el upgrade requiere firma del owner contra la rule `admin-cfg`. El backend no puede forzar upgrades — solo el dueño autoriza. Mismo patrón `unlockForSigning` que `activateAsset`.

---

## 2026-06-03 / 04 (esta semana, post Increment 1 del backend)

### SendPayment.tsx, nueva pantalla

Nuevo archivo `src/pages/SendPayment.tsx` que implementa el flow de envío de XLM desde el Smart Account. Form con destination + monto, validación, prompts de WebAuthn unlock, estados visuales `idle / unlocking / signing / submitting / success`. Success card con txHash + link al explorer + botones de "Mandar otra" / "Volver a wallet".

Wire en `App.tsx`:
- Ruta `/send` bajo `AuthGuard`.
- ActionCard "Enviar pago" en `Wallet.tsx` ahora navega con `navigate('/send')` (sin page reload).

### unlockForSigning helper

Nuevo `src/lib/unlockForSigning.ts`. Es la pieza que re deriva `f1Key + f2Key` via WebAuthn PRF + HKDF (idéntica receta que CreateWallet) y desencripta `fragmentF1Encrypted` del CredentialRecord del SDK. Output:
```ts
{ fragmentF1Plain, fragmentF2Key, ownerPubkey, walletAddress }
```
Esto es lo que `tx.send` del SDK necesita para reconstruir la seed.

Zero iza `f1Key` y `prfOutput` al salir.

### BrowserSessionStorage, persistencia de tokens

Nuevo `src/lib/sessionStorage.ts`. Implementa `SessionStorage` del SDK usando `localStorage`. Fix de UX crítica: el SDK por default usa `InMemorySessionStorage` y cualquier reload tira la sesión y manda al user a `/signin`.

Trade off documentado en el comentario del archivo: XSS expone tokens. Mitigado por WebAuthn UV que bloquea firma sin gesture del user.

### IndexedDbDeviceStore enchufado

`src/main.tsx` ahora pasa `new IndexedDbDeviceStore()` al provider via `overrides`. Sin esto, el `CredentialRecord` con shards F1/F2/F3 cifrados vive en memoria y se pierde en reload. Mismo patrón que session storage.

### AuthGuard, ventana de bootstrap

`src/components/AuthGuard.tsx` antes redireccionaba a `/signin` apenas montaba si `status !== 'authenticated'`. Problema: el provider arranca con `'anonymous'` y un effect async lo actualiza al status real ~50 ms después. La race causaba redirects falsos a `/signin`.

Fix: estado `bootstrapped` que espera hasta 200 ms antes de decidir. Mientras tanto muestra "Verificando sesión...". Si tras 200 ms sigue anonymous, redirige. Si pasó a authenticated, renderiza children.

### Banners de degradación en Wallet.tsx

Detección automática en el load inicial de dos estados degradados:

1. **`backendMissing`** GET /wallets devuelve 404 pero existe LocalCredential. Banner + botón "Limpiar metadata + Recrear wallet".
2. **`noLocalShards`** existe LocalCredential pero `wallet.getStoredCredential` retorna null. Banner + 2 botones (recrear o solo borrar metadata).

En ambos casos, "Enviar pago" se deshabilita con desc explicativo.

### Fix de tipos pre existentes

Limpieza colateral para que el `pnpm typecheck` quede limpio:
- `src/lib/sha256.ts` lib.dom v2 compatibility (`new Uint8Array(...)` para satisfacer BufferSource).
- `src/lib/walletFlow.ts` firma actualizada de `pbkdf2Sha256` (era 4 args, ahora 3 con options object).
- `src/lib/walletFlow.ts` `publicKey` ahora es `?: Uint8Array` con conversion a hex.

---

## Backend dependencies

Los cambios anteriores asumen que el backend tiene los 2 endpoints nuevos del Increment 1:
- `POST /tx/simulate`
- `POST /tx/submit`

Si vas a probar contra otra branch del backend, asegurate que estén deployados. Ver `CloudServices-accesly/docs/Architecture_AWS.md`.

---

## Limpieza operacional (no es código del repo)

Como parte del Increment 1 se ejecutó `scripts/delete-testnet-wallets.ts --yes` del backend, que wipeó las wallets antiguas de testnet. Wallets pre 0.6.0 quedaron huérfanas on chain. Users con LocalCredential de wallets antiguas verán el banner `backendMissing` la próxima vez que entren a `/wallet` y deberán recrear.

Si el user todavía no recreó después de eso, hay un caso adicional: incluso después de recrear, la SDK no tendrá el `CredentialRecord` con shards porque la versión vieja del provider usaba `InMemoryDeviceStore`. Solución: el banner `noLocalShards` también lo cubre.

---

## Compatibilidad con versiones anteriores

- Wallets creadas pre 0.6.0 (sin `IndexedDbDeviceStore` enchufado) no tienen shards persistidos. Banner las detecta y guía a recrear.
- LocalCredentials de versiones antiguas (sin `encryptionSalt`) no son compatibles. CreateWallet flow detecta y rechaza.
- JWTs en localStorage pueden quedar de versiones anteriores (cuando se introdujo BrowserSessionStorage). El SDK `tokenManager.getValidIdToken()` los valida contra `expiresAt` y los descarta si no aplican.

---

## Próximos cambios planeados

Ver `Deuda_Tecnica.md`.

Highlights:
- Mobile testing (iOS Safari, Android Chrome).
- Sample integration en el repo demostrando como un developer integrador haría override del provider.
- Tutorial en video del flow end to end.
- Doc de qué hacer cuando el backend hace cleanup (UX hoy depende del user leer el banner y entender).
