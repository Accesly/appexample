# accesly-example, documentación

Este folder contiene la documentación de la app de ejemplo de Accesly. La app demuestra el flow end to end de `@accesly/react` contra el backend `dev` desplegado en AWS y los smart contracts de Phase 1 desplegados en Stellar testnet.

**Repo público:** https://github.com/Accesly/appexample
**Stack:** Vite + React 18 + TypeScript + Tailwind + react-router-dom
**SDK integrado:** `@accesly/react` 0.5.0 (provisional, target 0.6.0 cuando publique)
**Backend:** Accesly dev en AWS us-east-1
**Red Stellar:** testnet

---

## Archivos en esta carpeta

- `README.md` (este) índice de la documentación.
- `Arquitectura.md` cómo está armada la app por dentro: rutas, componentes, IndexedDB local, integración con la SDK.
- `Flujos.md` walkthrough de cada flow del usuario: sign up, login, crear wallet, enviar XLM, recovery.
- `Deuda_Tecnica.md` items conocidos pendientes para llegar de demo a producción.
- `Cambios_Recientes.md` cosas que cambiaron en la última semana (post Increment 1 del backend).

---

## Qué tiene la app hoy

| Pantalla | Ruta | Estado |
|---|---|---|
| Landing | `/` | implementada |
| Sign up | `/signup` | implementada, Cognito real |
| Sign in | `/signin` | implementada, USER_SRP_AUTH |
| Recover | `/recover` | stub, bloqueado por Track C |
| Create wallet | `/create-wallet` | implementada, WebAuthn PRF + Shamir + deploy on chain |
| Wallet | `/wallet` | implementada, métricas + acciones |
| Send payment | `/send` | implementada con Increment 1, XLM only |

---

## Cómo arrancar local

```bash
pnpm install
pnpm dev
```

Vite levanta en `http://localhost:5173`. Acepta el cert de mkcert si te lo pide (passkey requiere HTTPS o localhost).

Endpoints que la app pega:
- `https://3fki7eiio5.execute-api.us-east-1.amazonaws.com/dev` API backend.
- `https://horizon-testnet.stellar.org` para queries de balance.
- `https://soroban-testnet.stellar.org` para queries de contrato.
- `https://friendbot.stellar.org` para fondear el Smart Account con XLM testnet.

---

## Premisa no custodial

El backend nunca ve la llave maestra. La app:
1. Registra un passkey con extensión PRF en el browser.
2. Deriva 3 llaves AES vía PRF + HKDF + PBKDF2.
3. Genera un keypair ed25519 client side.
4. Divide la seed en 3 fragments con Shamir 2 de 3.
5. Cifra F2 y F3 con sus llaves correspondientes y los manda al backend.
6. Persiste el `CredentialRecord` con F1 cifrado en IndexedDB local (vía `IndexedDbDeviceStore` de `@accesly/core`).
7. Al firmar, desbloquea con WebAuthn PRF, reconstruye en memoria, firma, zero iza.

Ver `Trust_Model_SDK.md` del repo SDKAccesly para la versión line by line.

---

## Provider config

La app override dos storages que el SDK por default deja en memoria. Sin esto, el reload de página borra los tokens y los shards:

```tsx
import { IndexedDbDeviceStore } from '@accesly/core';
import { BrowserSessionStorage } from './lib/sessionStorage';

const sessionStorage = new BrowserSessionStorage();
const deviceStore = new IndexedDbDeviceStore();

<AcceslyProvider
  appId="accesly-example"
  env="dev"
  overrides={{ sessionStorage, deviceStore }}
>
  ...
</AcceslyProvider>
```

`BrowserSessionStorage` persiste el JWT en `localStorage`. Trade off documentado: XSS expone tokens, pero WebAuthn UV bloquea firma sin gesture del user. Ver `Deuda_Tecnica.md` para los riesgos detallados.

---

## Limitaciones conocidas

- WebAuthn PRF requiere Chrome 116+, Safari 18+, Edge 116+. Firefox no soporta. La app tira error claro si lo detecta.
- Solo testnet por ahora. `env='prod'` está placeholder en `@accesly/react`.
- Recovery (SEP-30 ZK) bloqueado por Track C, ver doc del SDK.
- Session keys + KYC real bloqueados por Fase 7 dashboard de developers.

---

## Referencias cruzadas

- `SDKAccesly/docs/Resumen_Hito_7_tx_send.md` cambios del SDK que la app consume.
- `SDKAccesly/docs/Trust_Model_SDK.md` premisa no custodial.
- `CloudServices-accesly/docs/Architecture_AWS.md` infra del backend.
- `accesly-contracts/docs/SmartContracts Desplegados.md` direcciones on chain.
