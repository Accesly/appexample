# Arquitectura de accesly-example

**Última actualización:** 2026-06-04

---

## Stack

| Capa | Tech | Versión | Razón |
|---|---|---|---|
| Build | Vite | 5.4 | HMR rápido, bundle dev / prod claro, soporta TS estricto |
| UI | React | 18.3 | Estandar; el SDK es `@accesly/react` |
| Router | react-router-dom | 6 | SPA tradicional, sin SSR (passkeys necesitan client side) |
| Estilos | Tailwind CSS | 3 | Setup mínimo, classnames inline |
| Tipos | TypeScript estricto | 5.5 | `strict: true`, exactOptionalPropertyTypes |
| SDK | @accesly/react + @accesly/core | 0.5.0 | El producto que estamos demostrando |
| Crypto extra | @noble (vía SDK) | n/a | El SDK trae todo, la app solo orchesta |
| Storage local | IndexedDB | nativo | LocalCredential propio + CredentialRecord del SDK |

---

## Estructura de archivos

```
src/
  App.tsx                       routing + AuthGuard envolviendo rutas privadas
  main.tsx                      bootstrap React + AcceslyProvider con overrides
  components/
    AuthGuard.tsx               protege rutas autenticadas con ventana de 200 ms
    Button.tsx                  primary / secondary / danger / ghost
    ErrorMessage.tsx            display unificado de errores
    InfoNote.tsx                banner amarillo / azul / verde
    Layout.tsx                  navbar + outlet
    PendingWalletsBanner.tsx    alerta de wallets pending deploy
    WalletStatusBadge.tsx       chip "on chain" / "pending deploy" / "unknown"
  lib/
    credentialStore.ts          IndexedDB CRUD para LocalCredential (separado del SDK)
    errors.ts                   describeError, mapea errors a mensajes amigables
    explorer.ts                 URLs de stellar.expert testnet
    sessionStorage.ts           BrowserSessionStorage (localStorage backed)
    sha256.ts                   wrapper crypto.subtle.digest
    unlockForSigning.ts         re deriva F1+F2 keys via WebAuthn PRF
    walletFlow.ts               ensureWalletWithPasskey orchestration
  pages/
    Landing.tsx
    SignUp.tsx
    SignIn.tsx
    Recover.tsx
    CreateWallet.tsx
    Wallet.tsx
    SendPayment.tsx             nueva en Increment 1, envío de XLM
```

---

## Modelo de datos local

Cada user identificado por email tiene 2 records en el browser, en 2 IndexedDB diferentes:

### LocalCredential (DB `accesly-example`, store `devices`)

Metadata operativa de la app. Schema en `src/lib/credentialStore.ts`:

```ts
interface LocalCredential {
  email: string;                  // PK
  walletAddress: string;          // C address del Smart Account
  publicKey: string;              // hex ed25519
  credentialId: string;           // base64url del WebAuthn credential
  secp256r1Pubkey: string;        // hex 65 bytes uncompressed
  prfSalt: string;                // hex 32 bytes
  encryptionSalt: string;         // hex 32 bytes, semilla para HKDF de F1Key + F2Key
  createdAt: number;
  lastKnownStatus?: 'on-chain' | 'pending-deploy' | 'unknown';
  lastStatusCheck?: number;
}
```

Esto es metadata exhibible. Sin secretos.

### CredentialRecord (DB del SDK, manejada por IndexedDbDeviceStore)

Material criptográfico. Schema en `@accesly/core/webauthn/types.ts`:

```ts
interface CredentialRecord {
  username: string;               // PK (= email)
  credentialId: Uint8Array;
  secp256r1Pubkey: Uint8Array;
  fragmentF1Encrypted: EncryptedEnvelope;    // F1 cifrado con f1Key derivada de PRF
  prfSalt: Uint8Array;
  fallbackKeyMaterial: Uint8Array;
  walletAddress: string | null;
  createdAt: number;
  publicKey?: Uint8Array;
  emailCommitment?: Uint8Array;
  fragmentF2Encrypted?: EncryptedEnvelope;
  fragmentF3Encrypted?: EncryptedEnvelope;
  onChain?: boolean | null;
  testnetFunded?: boolean;
}
```

Las dos DBs viven en paralelo a propósito. El SDK no debería conocer el schema de la app, y la app no debería tocar los shards directamente.

---

## Storages enchufadas en el provider

```ts
// src/main.tsx
const sessionStorage = new BrowserSessionStorage();      // localStorage
const deviceStore = new IndexedDbDeviceStore();          // IndexedDB del SDK

<AcceslyProvider overrides={{ sessionStorage, deviceStore }}>
```

Sin estos overrides:
- Tokens Cognito viven en memoria, se borran en cada reload.
- CredentialRecord vive en memoria, se borra en cada reload.

Después del fix: ambos sobreviven reload, sign out (limpiamos explícitamente al user request), cierre de tab.

Ver `Deuda_Tecnica.md` para los trade offs de seguridad de `localStorage` vs httpOnly cookies.

---

## Flujo de routing

```mermaid
flowchart LR
  L[/] -->|new user| SU[/signup]
  L -->|existing| SI[/signin]
  SU -->|verify code| CW[/create-wallet]
  SI -->|authenticated| W[/wallet]
  CW -->|wallet deployed| W
  W -->|on chain + shards ok| SEND[/send]
  W -->|backend 404| CW
  W -->|no shards locales| CW
  REC[/recover] -.->|track C TBD| W
```

`AuthGuard` protege `/create-wallet`, `/wallet`, `/send`. Tira a `/signin` si el `auth.status !== 'authenticated'`, con ventana de 200 ms para tolerar el bootstrap async del provider.

---

## Flujo de creación de wallet (CreateWallet.tsx + walletFlow.ts)

1. `registerPasskey` con extensión PRF, genera passkey en el authenticator.
2. Deriva 3 llaves:
   - `f1Key = HKDF(prfOutput, salt=encryptionSalt, info="accesly-f1-encryption")`
   - `f2Key = HKDF(prfOutput, salt=encryptionSalt, info="accesly-f2-encryption")`
   - `f3Key = PBKDF2(email::password, salt=encryptionSalt, 600_000 iter)`
3. `wallet.ensureWallet({ email, encryptionKeys: [f1Key, f2Key, f3Key], ... })` del SDK:
   - `GET /wallets`. Si existe, return. Si 404, fallthrough.
   - Genera keypair ed25519.
   - Shamir split → F1, F2, F3.
   - Cifra cada uno con su key.
   - Persiste `CredentialRecord` con F1+F2+F3 encrypted en IndexedDB del SDK.
   - `POST /wallets` con pubkey + F2+F3 cipher + emailCommitment + secp256r1Pubkey.
   - Backend deploya el Smart Account en Soroban.
4. La app guarda `LocalCredential` con el `walletAddress` resultado y los salts.

---

## Flujo de envío de XLM (SendPayment.tsx + unlockForSigning.ts)

1. User llena destination + amount.
2. `unlockForSigning(email, sdkRecord)`:
   - Lee `LocalCredential` de la IndexedDB de la app, saca `prfSalt`, `encryptionSalt`, `credentialId`, `publicKey`.
   - Lee `CredentialRecord` del SDK store, saca `fragmentF1Encrypted`.
   - `unlockPasskey` del SDK con prfSalt, obtiene `prfOutput`.
   - Re deriva `f1Key` y `fragmentF2Key` con HKDF, idéntica receta a CreateWallet.
   - Desencripta `fragmentF1Encrypted` con `f1Key` → `fragmentF1Plain`.
   - Zero iza `f1Key` y `prfOutput`.
   - Devuelve `{ fragmentF1Plain, fragmentF2Key, ownerPubkey, walletAddress }`.
3. `tx.send({ destinationAddress, amountStroops, fragmentF1Plain, fragmentF2Key, ownerPubkey })`:
   - Backend simulate.
   - ECDH X25519 + `getFragment2` para recuperar F2.
   - Reconstruct seed.
   - Firma `auth_digest = sha256(signature_payload || rule_ids_xdr)`.
   - Backend submit con KMS fund.
   - Devuelve `{ txHash, status, explorerUrl }`.
4. Success card con link al explorer.

---

## Componentes de UX importantes

### Wallet.tsx, detección de estados degradados

3 flags que se setean al cargar:

- `backendMissing`: `GET /wallets` devolvió 404 pero hay LocalCredential. Banner amarillo + botón "Limpiar metadata + Recrear wallet".
- `noLocalShards`: hay LocalCredential pero el SDK no tiene `CredentialRecord` con shards. Banner + 2 botones (recrear o solo borrar metadata).
- `status: 'pending-deploy'`: deploy on chain todavía no confirma. Polling cada 30s + botón "Reintentar deploy".

Cada estado bloquea las acciones que no aplican (por ejemplo, "Enviar pago" disabled si `status !== 'on-chain'` o si `noLocalShards`).

### AuthGuard.tsx, ventana de bootstrap

El provider del SDK arranca con `status: 'anonymous'` aunque el `BrowserSessionStorage` tenga tokens válidos. El `refreshStatus` corre en un effect después del mount. Mientras tanto, AuthGuard veía `status !== 'authenticated'` y redireccionaba a `/signin`.

Fix: AuthGuard mantiene un flag `bootstrapped`. Espera hasta 200 ms (tiempo típico del primer refreshStatus) antes de decidir si redirigir o no. Si tras 200 ms sigue anonymous, redirige. Si en ese tiempo pasó a authenticated, renderiza.

---

## Build production

```bash
pnpm build
```

Vite genera:
- `dist/index.html` ~0.6 KB
- `dist/assets/index-*.css` ~17 KB gzip 4 KB
- `dist/assets/index-*.js` ~380 KB gzip 121 KB (app + SDK + tailwind)
- `dist/assets/stellar-sdk.min-*.js` ~940 KB gzip 257 KB (Stellar SDK separado)

El chunk de stellar-sdk es grande porque Stellar SDK trae el XDR completo. Para producción real considerar lazy load (solo cargar cuando se va a firmar una tx).

---

## Referencias cruzadas

- `SDKAccesly/docs/Resumen_Hito_7_tx_send.md` cambios del SDK que la app consume.
- `Flujos.md` walkthrough usuario por usuario.
- `Deuda_Tecnica.md` items abiertos.
