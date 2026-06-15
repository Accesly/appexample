# Cambios recientes en accesly-example

**Última actualización:** 2026-06-04

Bitácora de los cambios significativos. Si querés ver detalle completo, revisar git log de cada commit referenciado.

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
