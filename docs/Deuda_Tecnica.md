# Deuda técnica de accesly-example

**Última actualización:** 2026-06-04

Items conocidos para llevar la app de demo a producción. Ordenados por severidad.

---

## 1. Críticos (no es demo si no se cierran)

### 1.1 Tokens en localStorage exponen a XSS

**Severidad:** Critical para producción, Medium para demo en localhost.

**Descripción:**
`BrowserSessionStorage` persiste el IdToken Cognito en `localStorage`. Un XSS en la app puede leerlo y llamar endpoints Cognito auth de solo lectura (`GET /wallets`, `POST /tx/simulate`).

**Mitigación parcial existente:** WebAuthn user verification (PIN / biometría) bloquea firma sin gesture del user. XSS no puede simular eso. Por eso un atacante con el token no puede firmar txs aunque puede leer metadata.

**Fix sugerido para producción:**
- httpOnly cookies + backend session.
- O sessionStorage (clears en tab close, menor exposición temporal).
- O Web Workers + structured clone para aislar tokens del scope JS.

**Trade off:** la app es una demo en localhost, no producción. Para hoy es aceptable.

**Criterio de cierre:** decisión de arquitectura tomada antes de mainnet. Por ahora documentado en `src/lib/sessionStorage.ts`.

### 1.2 Recovery no funciona

**Severidad:** Critical para producción.

**Descripción:**
`/recover` es stub. `auth.recover()` del SDK tira `RecoveryNotAvailableError`. Sin esto, "olvidé mi passkey" = pérdida total.

**Bloqueo:** Track C del backend (circuito ZK groth16 + `sep30Handler` Lambda). ETA 6 a 10 semanas. No hay mucho que hacer del lado app hasta que el backend ship.

**Mientras tanto:** el banner de Recover.tsx debería explicar el ETA y dar alternativa (recovery manual con auditor externo, si Accesly establece partnership).

---

## 2. Altos (importante para release pública)

### 2.1 Wallets viejas quedan huérfanas tras backend cleanup

**Descripción:**
Cuando el backend hace cleanup (cambio de invariantes del Smart Account, cleanup de testnet, etc), wallets pre cleanup quedan on chain pero sin record en backend. La app detecta y muestra el banner `backendMissing` pero el user pierde el XLM que tenía la wallet vieja (queda orphan).

**Fix sugerido:**
- App detecta el caso y ofrece "drenar wallet vieja antes de recrear":
  1. Reconstruir seed con los shards locales (si todavía existen).
  2. Sign + submit transfer de todo el balance a la wallet nueva tras crearla.
  3. Cleanup metadata.
- En testnet es aceptable perder los XLM friendbot, en mainnet es inaceptable.

**Estimación:** 2 a 4 sesiones (requiere flow custom de drain).

### 2.2 Mobile no probado

**Descripción:**
El passkey flow asume desktop. iOS Safari + Android Chrome no testeados. WebAuthn responde distinto en cada uno:
- iOS Safari: PRF support varía por versión (18+).
- Android Chrome: passkey UV via Google Password Manager + screen lock.
- In app browsers (Twitter, Instagram, etc.) tienen WebViews customizadas que pueden romper WebAuthn entero.

**Fix:** sesión dedicada con devices físicos, documentar compatibility matrix actualizada.

### 2.3 No hay session timeout warning

**Descripción:**
Cognito IdToken expira a la hora. Cuando expira, el siguiente request al backend devuelve 401. La app no avisa antes, simplemente falla silenciosamente.

**Fix:**
- Decoder del JWT client side, lee `exp`.
- Banner top "Tu sesión expira en X minutos" cuando faltan <5 min.
- Botón "Renovar" que hace refresh con RefreshToken.

**Estimación:** 1 sesión.

### 2.4 Hard reload requirements no documentados en UX

**Descripción:**
Cuando el SDK se actualiza, la app necesita hard refresh (`Ctrl + Shift + R`) para tirar Vite cache + ServiceWorker (si hubiera). Hoy el user no sabe que tiene que hacerlo, ve UX rota.

**Fix:**
- Versioning de assets en el build (ya lo hace Vite con hash en filename).
- Service Worker registration / unregistration explícito si se introduce uno futuro.

### 2.5 Errores genéricos en `describeError`

**Descripción:**
`describeError` tiene fallback "Algo salió mal" cuando no matchea ningún caso conocido. Para producción, mensajes accionables por categoría.

---

## 3. Medios (mejoras de calidad)

### 3.1 Lazy load del stellar-sdk

**Descripción:**
Bundle production del example es 380 KB main + 940 KB stellar-sdk. El stellar-sdk solo se necesita cuando se firma una tx. Para Landing / SignIn / SignUp es overhead.

**Fix:** dynamic import del SDK solo en `tx.send` y `wallet.createWallet`.

**Estimación:** 1 sesión.

### 3.2 i18n

**Descripción:**
Hoy todo en español. La app está pensada para audiencia latam pero developers integradores hablan inglés.

**Fix:** introducir react-i18next con archivos `es.json` y `en.json`.

### 3.3 Accessibility audit

**Descripción:**
No corrimos un audit a11y formal. Probables issues:
- Color contrast en estados disabled.
- Focus management en modals / banners dinámicos.
- ARIA labels en ActionCards.

**Fix:** axe DevTools + Lighthouse audit + remediation pass.

### 3.4 Tests E2E

**Descripción:**
La app no tiene tests E2E (Cypress, Playwright). Cualquier regression en flows críticos se detecta solo manualmente.

**Fix:** Playwright con tests para los 3 flows críticos:
- Sign up + verify + create wallet.
- Sign in + send XLM.
- Sign out + sign in de nuevo + ver wallet.

**Estimación:** 2 a 3 sesiones.

### 3.5 No funciona offline

**Descripción:**
La app requiere conexión a backend + Soroban RPC + Friendbot para cualquier flow. Sin Service Worker / cache strategy, offline es pantalla blanca.

**Fix:** PWA setup con Vite plugin, cachear assets + LocalCredential read offline para mostrar wallet sin re render dinámico.

---

## 4. Bajos / mejoras visuales

- Skeleton loaders en lugar del texto "Cargando wallet..."
- Animaciones transitorias entre phases del SendPayment.
- Dark mode.
- Custom favicon (hoy es default Vite).

---

## 5. Acciones operativas pendientes (no es código)

### 5.1 Subir a GitHub Pages o Vercel

La app construye limpio. Falta una URL pública para que developers puedan ver el demo sin clonar.

Opciones:
- Vercel (gratis para proyectos open source).
- Netlify.
- GitHub Pages con Vite plugin.

### 5.2 Video demo

Falta un video de 3 a 5 minutos del flow end to end. Útil para:
- Submission al SCF.
- Docs públicas.
- Pitch a integradores potenciales.

### 5.3 README público para developers integradores

El README de la raíz del repo es básico. Falta:
- Quickstart para developers que quieren integrar `@accesly/react` en su app.
- Lista de gotchas comunes (los que detectamos esta semana).
- Link a `accesly-example` como referencia funcional.

---

## 6. Historial de cerrados

### 2026-06-03 / 04

- `tx.signPayment` removido, reemplazado por `tx.send` con flow simulate + ECDH + sign + submit (Increment 1 del backend).
- `BrowserSessionStorage` persiste tokens Cognito en localStorage (sobrevive reload).
- `IndexedDbDeviceStore` enchufado en provider, persiste `CredentialRecord` con shards.
- `AuthGuard` con ventana de 200 ms para evitar race contra bootstrap del provider.
- Banners de degradación `backendMissing` y `noLocalShards` en `/wallet`.
- `SendPayment.tsx` con form + UX states + success card.
- Fixes de tipos pre existentes (`sha256.ts`, `walletFlow.ts`).
- Auto fund testnet via friendbot con retries cuando `ensureWallet` regresa con status `unknown` (race POST → on chain).
