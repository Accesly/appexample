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
├── main.tsx                # AcceslyProvider + BrowserRouter
├── App.tsx                 # Rutas
├── components/
│   ├── Layout.tsx          # Header + footer con estado de auth reactivo
│   ├── AuthGuard.tsx       # Redirige a /signin si no autenticado
│   ├── Button.tsx
│   ├── ErrorMessage.tsx
│   └── InfoNote.tsx
├── lib/
│   ├── credentialStore.ts  # IndexedDB para credentialId + prfSalt + walletAddress
│   ├── walletFlow.ts       # WebAuthn PRF + HKDF + PBKDF2 + wallet.createWallet
│   ├── errors.ts           # Traduce errores del SDK a mensajes humanos
│   ├── explorer.ts         # URLs a stellar.expert
│   └── sha256.ts           # Wrapper de WebCrypto
└── pages/
    ├── Landing.tsx
    ├── SignUp.tsx          # 2 pasos: form → confirm code
    ├── SignIn.tsx
    ├── CreateWallet.tsx    # Composición WebAuthn + createWallet
    ├── Wallet.tsx          # Address + link explorer + KYC + acciones stub
    └── Recover.tsx         # UI lista; throwea RecoveryNotAvailableError
```

---

## Flow técnico (resumen)

### Creación de wallet (CreateWallet.tsx → lib/walletFlow.ts)

1. `registerPasskey()` con PRF extension del SDK → obtiene `secp256r1Pubkey` y `prfOutput` (32 bytes deterministas).
2. Deriva 3 llaves AES-256:
   - **F1key** = `HKDF(prfOutput, salt, "accesly-f1-encryption", 32)`
   - **F2key** = `HKDF(prfOutput, salt, "accesly-f2-encryption", 32)`
   - **F3key** = `PBKDF2(email + password, salt, 600k iter, 32)` ← para recovery
3. `wallet.createWallet({ encryptionKeys: [F1key, F2key, F3key], secp256r1Pubkey, ... })` del SDK internamente:
   - Genera keypair ed25519 client-side
   - Splits Shamir 2-of-3
   - Cifra cada fragmento con su key
   - POST `/wallets` al backend con F2 y F3 cifrados
   - Backend deploya el Smart Account en Stellar testnet vía OZ Relayer
   - Devuelve `{ walletAddress, publicKey }`
4. Guardamos `credentialId + prfSalt + walletAddress + publicKey` en IndexedDB (no la seed, no los fragmentos en plano).

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

---

## Recursos

- **SDK source:** https://github.com/Accesly/SDKAccesly
- **`@accesly/core` npm:** https://www.npmjs.com/package/@accesly/core
- **`@accesly/react` npm:** https://www.npmjs.com/package/@accesly/react
- **Stellar testnet explorer:** https://stellar.expert/explorer/testnet
- **Friendbot:** https://friendbot.stellar.org
