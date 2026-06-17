# accesly-example

App de ejemplo end-to-end de [`@accesly/sdk`](https://github.com/Accesly/SDKAccesly) contra el backend `dev` (Stellar testnet).

Demuestra:

- Sign-up + email verification (Cognito real + SES sandbox)
- Sign-in vía USER_SRP_AUTH
- Registro de passkey con WebAuthn PRF extension
- Creación de wallet Stellar (MPC Shamir 2-of-3 client-side, deploy del Smart Account on-chain)
- Visualización de la dirección con link al explorer
- KYC stub (Etherfuse adapter)
- Recovery con disclaimer (Track C ZK pendiente)

**La llave maestra nunca toca el backend.** Generada, dividida con Shamir y firmada client-side; los fragmentos F2 y F3 viajan ya cifrados con AES-256-GCM.

---

## Requisitos

| Cosa | Versión |
|---|---|
| Node | 18+ (recomendado 20) |
| Navegador | Chrome 116+, Edge 116+ o Safari 18+ (passkey con PRF) |
| Package manager | pnpm o npm |

WebAuthn requiere un *secure context*: HTTPS o `http://localhost`. El dev server por defecto sirve en `http://localhost:5173`, que cuenta como localhost → no necesitas HTTPS para desarrollar.

Si vas a probar desde otro device en tu LAN, instala `vite-plugin-mkcert` y descomenta las dos líneas marcadas en `vite.config.ts`.

---

## Instalar y correr

```bash
pnpm install
pnpm dev
```

(o `npm install && npm run dev`)

Abre `http://localhost:5173` y sigue el flow: **Crear cuenta nueva** → confirma email → contraseña → **Crear wallet con passkey** → autoriza biometría → listo.

> **Importante sobre el email:** el backend dev tiene SES en modo sandbox. Sólo `acceslyoficial@gmail.com` está pre-verificado. Si quieres usar otro email, pide al equipo que lo verifique en AWS SES console.

---

## Estructura

```
src/
├── main.tsx                # AcceslyProvider + BrowserRouter + safety net Vite chunk-reload
├── App.tsx                 # Rutas
├── components/
│   ├── Layout.tsx          # Header + footer con estado de auth reactivo
│   ├── AuthGuard.tsx       # Redirige a /signin si no autenticado
│   ├── Button.tsx
│   ├── ErrorMessage.tsx
│   ├── InfoNote.tsx
│   └── WalletStatusBadge.tsx
└── pages/
    ├── Landing.tsx
    ├── SignUp.tsx          # 2 pasos: form → confirm code
    ├── SignIn.tsx
    ├── CreateWallet.tsx    # 1 llamada: wallet.bootstrap({ email, password })
    ├── Wallet.tsx          # useWalletStatus + useBalance + useWalletHistory
    ├── SendPayment.tsx     # tx.send({ to, amountStroops })
    └── Recover.tsx         # auth.recover(email) — Recovery v2 (SEP-30 backend)
```

Sin carpeta `src/lib/`. Todo el plumbing histórico (WebAuthn PRF, derivación HKDF/PBKDF2, IndexedDB store, `unlockForSigning`, mapping de errores, URLs de explorer) lo absorbió el SDK 1.3.x — el example ahora son **solo páginas** que consumen el hook.

---

## Flow técnico (resumen)

### Creación de wallet — 1 llamada

```tsx
const { wallet, auth } = useAccesly();
await wallet.bootstrap({ email: auth.username!, password });
```

`wallet.bootstrap(...)` internamente hace todo lo que antes el example escribía a mano:

1. `registerPasskey()` con PRF extension → 32 bytes deterministas
2. Deriva 3 llaves AES-256 (HKDF para F1/F2, PBKDF2 para F3 password-bound)
3. Genera keypair ed25519 + Shamir split 2-of-3 + cifrado de fragmentos
4. POST `/wallets` con F2 y F3 cifrados → backend deploya el Smart Account
5. Friendbot auto-fund en testnet
6. Persiste `CredentialRecord` (credentialId + prfSalt + encryptionSalt + walletAddress) en IndexedDB

### Status, balance e historia — hooks reactivos

```tsx
const { status, walletAddress } = useWalletStatus(); // SSE-first, polling fallback
const { xlm } = useBalance();                        // cache 5s + SSE push
const { items } = useWalletHistory();                // cache 12h + cross-tab sync
```

`useWalletStatus` y `useBalance` consumen el `wallet-stream` Lambda vía Server-Sent Events — cero `setInterval`, cero polling cuando la tab está oculta.

### Premisa no-custodial

El SDK enforça 6 tests CI-blocking que garantizan:
- El seed jamás aparece en payloads de red ni en `console`
- Los fragmentos viajan cifrados antes de salir del browser
- Los buffers sensibles se zeroizan tras la operación
- No se almacena nada criptográfico en `localStorage`/`sessionStorage`

Ver [`Trust_Model_SDK.md`](https://github.com/Accesly/SDKAccesly/blob/main/docs/Trust_Model_SDK.md).

---

## Lo que NO está implementado en esta demo

| Feature | Status | Bloqueado por |
|---|---|---|
| Enviar pago firmado | Stub UI | Falta composer unlock WebAuthn + GET `/fragments/2` + `tx.signPayment` + submit |
| Session keys (auth temporal) | — | Bloqueado por Fase 7 dashboard |
| Multi-device | — | Bloqueado por Fase 7 dashboard |
| Yield CETES | — | Etherfuse API key no activado |
| Recovery real | UI con disclaimer | Track C ZK en desarrollo |

Cada uno está documentado en el [Handoff Fase 7](https://github.com/Accesly/SDKAccesly/blob/main/docs/Handoff_Fase7.md) del SDK.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| "WebAuthn no soporta PRF" | Firefox o autenticador viejo | Usar Chrome 116+ / Safari 18+ |
| Email de verificación no llega | SES sandbox, email no verificado | Usar `acceslyoficial@gmail.com` o pedir verificación |
| `AuthError 401` al firmar | JWT expirado, refresh falló | Hacer sign-out y sign-in de nuevo |
| `NetworkError` | Backend dev caído | `curl https://3fki7eiio5.execute-api.us-east-1.amazonaws.com/dev/health` |
| `NotAllowedError` en WebAuthn | Usuario canceló el prompt | Reintentar |
| `TypeError: Failed to fetch dynamically imported module: …stellar-sdk.min-XXX.js` | Vite re-pre-bundleó y el browser tiene el hash viejo | El listener de `main.tsx` hace `location.reload()` una vez. Si persiste: `Remove-Item -Recurse -Force node_modules\.vite; pnpm dev` |

### Por qué el fix de Vite

`@accesly/core` hace `import('@stellar/stellar-sdk')` dinámico para que el bundle inicial no pague el costo si la app solo autentica. Vite descubre la dep cuando se ejecuta el `import()`, la pre-bundlea, y si la pestaña ya estaba abierta el hash queda desactualizado. Mitigamos con dos capas:

1. **`optimizeDeps.include` en `vite.config.ts`** — fuerza el pre-bundle al startup así nunca hay descubrimiento tardío.
2. **Listener en `main.tsx`** — captura `Failed to fetch dynamically imported module` y hace `location.reload()` una sola vez (flag en `sessionStorage` evita loops). Solo activo en `import.meta.env.DEV`.

---

## Recursos

- **SDK source:** https://github.com/Accesly/SDKAccesly
- **`@accesly/core` npm:** https://www.npmjs.com/package/@accesly/core
- **`@accesly/react` npm:** https://www.npmjs.com/package/@accesly/react
- **Stellar testnet explorer:** https://stellar.expert/explorer/testnet
- **Friendbot:** https://friendbot.stellar.org
