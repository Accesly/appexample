# Flujos de usuario en accesly-example

Walkthrough paso a paso de cada flow visible al usuario.

---

## Sign up + verify

1. User va a `/signup`.
2. Llena email + password.
3. Click "Crear cuenta".
4. `auth.signUp(email, password)` del SDK llama a Cognito.
5. Cognito acepta y envía email de verificación vía SES con código de 6 dígitos.
6. Pantalla cambia a "Ingresá el código que te llegó".
7. User pega el código.
8. `auth.confirmSignUp(email, code)`.
9. Cognito marca el user como confirmed.
10. Navega a `/signin`.

Si el código no llega en 5 min, botón "Reenviar código" llama `auth.resendConfirmation(email)`.

Casos de error visibles al user:
- email ya existe → mensaje claro.
- password no cumple policy → lista de requisitos.
- código inválido → "Código incorrecto o expirado".
- SES en sandbox no entrega a destino no verificado → silent fail, hay que sumarlo a la deuda.

---

## Sign in

1. User va a `/signin`.
2. Llena email + password.
3. Click "Iniciar sesión".
4. `auth.signIn(email, password)` del SDK ejecuta USER_SRP_AUTH contra Cognito.
5. Si OK, Cognito devuelve `{ IdToken, AccessToken, RefreshToken }`.
6. SDK persiste en `BrowserSessionStorage` (localStorage).
7. `auth.status` cambia a `'authenticated'`.
8. Navega a `/wallet`.
9. Wallet.tsx ejecuta su `useEffect` de carga.

Si el user no completó CreateWallet antes, `fetchRemote` devuelve null, banner backendMissing aparece.

---

## Create wallet (primera vez)

1. User llega a `/create-wallet` desde signup o desde el banner "no encontramos tu wallet".
2. Llena password (necesaria para derivar F3 vía PBKDF2 sobre `email::password`).
3. Click "Crear wallet con passkey".
4. `ensureWalletWithPasskey({ email, password, walletApi: wallet })`:
   - `registerPasskey(...)` con extensión PRF. Browser muestra prompt nativo "¿Querés crear un passkey?". User confirma con biometría / PIN del device.
   - Si Firefox o cualquier authenticator sin PRF, throw inmediato con mensaje "Usa Chrome 116+, Safari 18+, Edge 116+".
   - Deriva `f1Key`, `f2Key`, `f3Key`.
   - `wallet.ensureWallet({ encryptionKeys, ... })`:
     - GET /wallets → 404.
     - Genera keypair ed25519 client side.
     - Shamir split.
     - Cifra y persiste `CredentialRecord` en IndexedDB del SDK.
     - POST /wallets.
     - Backend deploya el Smart Account en Soroban.
   - `saveCredential(LocalCredential)` en IndexedDB de la app.
5. Status inicial: probablemente `'unknown'` (POST OK, Soroban tarda 5 a 10s en confirmar).
6. Auto fund testnet via friendbot dispara fire and forget con retries.
7. Si `createdNow=true`, redirige a `/wallet` después de 1.5s.

Tiempo total esperado: 8 a 15 segundos.

Casos de error:
- Browser sin PRF support → mensaje claro.
- POST /wallets falla → shards quedan persistidos local, se puede reintentar con `wallet.retryDeploy`.
- Soroban rechaza deploy (footprint exceeded por ejemplo) → status `'pending-deploy'`, mostrar opción de retry.

---

## Wallet view

1. Component monta, lee `LocalCredential` de la app DB.
2. Si existe `local.lastKnownStatus`, lo muestra como status inicial (cached).
3. En paralelo:
   - `wallet.getStoredCredential(email)` del SDK store. Si null pero hay LocalCredential, setea `noLocalShards: true`.
   - `wallet.fetchRemote()` GET /wallets. Si null, setea `backendMissing: true`. Si tiene, actualiza `status` con `onChain` mirror.
4. Renderiza:
   - Header con address + status badge.
   - Banner por estados degradados (backendMissing, noLocalShards, pending-deploy).
   - Card de address + copy + link al explorer.
   - Card de "Acciones" con 4 ActionCards:
     - "Fondear (Friendbot)" disabled si testnetFunded o si no on chain.
     - "Iniciar KYC (Etherfuse)" stub.
     - "Enviar pago" o "Reintentar deploy" según status.
     - "Crear session key" disabled (Fase 7).
5. Si `status !== 'on-chain'`, polling a fetchRemote cada 30 s.

Las acciones tienen UX patterns:
- Disabled state explica por qué (tooltip texto en `desc`).
- Loading state durante calls async.
- Mensajes inline para success / error.

---

## Send payment (Increment 1, nuevo)

1. User en `/wallet` con status `'on-chain'` y shards locales presentes.
2. Click ActionCard "Enviar pago". Navega via `navigate('/send')` (sin page reload).
3. SendPayment.tsx renderiza form: destination + monto en XLM.
4. Validación inline:
   - Destination matchea regex `^[GC][A-Z0-9]{55}$`.
   - Monto > 0, máx 7 decimales.
5. Click "Enviar XLM":
   - Phase `unlocking`: `unlockForSigning(email, sdkRecord)`. Browser muestra WebAuthn prompt. User confirma con biometría / PIN.
   - Si rechaza prompt, abort con error claro.
   - Si confirma, helper devuelve `{ fragmentF1Plain, fragmentF2Key, ownerPubkey, walletAddress }`.
   - Phase `signing → submitting`: `tx.send(...)` del SDK. Internamente hace simulate, ECDH F2, reconstruct seed, sign auth digest, submit.
6. Resultado:
   - Si OK, success card con txHash + link al explorer + botones "Mandar otra" / "Volver a la wallet".
   - Si error, mensaje inline + form sigue editable.

Tiempo total esperado para tx exitosa: 6 a 12 segundos.

Casos de error:
- WebAuthn no devuelve PRF → mensaje "¿usaste el mismo browser donde creaste la wallet?".
- Backend simulate falla (ej. wallet sin XLM para el transfer) → error del backend pasado tal cual.
- Submit falla (resource limit, nonce reused, etc.) → mensaje + log.

---

## Recovery (SEP-30, hoy stub)

`/recover` muestra una pantalla explicativa: "esta función requiere Track C (circuito ZK email) y backend sep30Handler, ninguno desplegado todavía".

El SDK `auth.recover()` tira `RecoveryNotAvailableError` con mensaje útil. La UI lo cazará y mostrará el mismo texto.

Bloqueado por 6 a 10 semanas más, Track C es desarrollo paralelo.

---

## Reset de estado (UI degradada)

Cuando algo se desincroniza entre LocalCredential, CredentialRecord del SDK y backend, los flows de reset son:

### Caso A, "wallet no existe en backend"
- Trigger: `GET /wallets` 404 pero hay LocalCredential.
- Banner amarillo: "La wallet ya no existe en el backend".
- Botón "Limpiar metadata + Recrear wallet":
  1. `deleteCredential(email)` borra LocalCredential.
  2. `wallet.clearStoredCredential(email)` borra CredentialRecord.
  3. `navigate('/create-wallet')` para flow fresco.

### Caso B, "no hay shards locales en este device"
- Trigger: hay LocalCredential pero `wallet.getStoredCredential` returns null.
- Banner amarillo + 2 botones: recrear, o solo borrar metadata (si el user planea probar en otro device).

### Caso C, sign out manual
- Header → "Salir".
- `auth.signOut()` revoca tokens en Cognito + clear local.
- `BrowserSessionStorage.clear()` borra el JWT del localStorage.
- Navega a `/`.

**Importante:** sign out NO borra el `CredentialRecord` ni el `LocalCredential`. Esos persisten para que el próximo login pueda firmar sin re crear. Para reset completo hay que ir al caso A o B.

---

## Casos de error globales

`describeError` en `src/lib/errors.ts` traduce errores comunes:

- Network errors → "No se pudo contactar al backend".
- 401 / authorization errors → "Tu sesión expiró, iniciá sesión de nuevo".
- 404 → "Recurso no encontrado".
- WebAuthn `NotAllowedError` → "Cancelaste el prompt del passkey".
- `RecoveryNotAvailableError` → mensaje del error tal cual.

`ErrorMessage` component los renderiza con tone="danger".
