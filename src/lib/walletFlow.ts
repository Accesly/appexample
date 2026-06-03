import { registerPasskey } from '@accesly/core/webauthn';
import {
  getRandomBytes,
  hkdfSha256,
  pbkdf2Sha256,
} from '@accesly/core/crypto';
import {
  bytesToBase64Url,
  bytesToHex,
  saveCredential,
} from './credentialStore';
import { sha256 } from './sha256';

/**
 * Status reportado por la SDK 0.3.0 sobre el estado de la wallet en cadena.
 *   - `on-chain`        Smart Account desplegado y confirmado en testnet
 *   - `pending-deploy`  Persistido en backend pero el deploy aún no confirma
 *                       (incluye casos en que Phase 1 del backend está bloqueada)
 *   - `unknown`         La SDK no pudo determinar el estado (race / red flaky)
 */
export type WalletStatus = 'on-chain' | 'pending-deploy' | 'unknown';

/**
 * Resultado del flow de creación / recuperación de wallet.
 */
export interface EnsureWalletFlowResult {
  walletAddress: string;
  publicKey: string;
  status: WalletStatus;
  /**
   * `true` si la wallet se creó en ESTA llamada (POST a /wallets ocurrió ahora).
   * `false` si ya existía en el backend para este usuario y la SDK la recuperó
   * vía `GET /wallets` sin generar keypair ni hacer prompt de passkey.
   */
  createdNow: boolean;
}

interface WalletApiV3 {
  ensureWallet(req: {
    email: string;
    emailSalt: Uint8Array;
    encryptionKeys: readonly [Uint8Array, Uint8Array, Uint8Array];
    secp256r1Pubkey: Uint8Array;
    credentialId: Uint8Array;
    prfSalt: Uint8Array;
  }): Promise<{
    walletAddress: string;
    /** Cuando createdNow es true, publicKey viene del flow de creación (Uint8Array). */
    publicKey?: Uint8Array;
    status: WalletStatus;
    createdNow: boolean;
  }>;
}

/**
 * Crea (o recupera) la wallet Accesly del usuario actual.
 *
 *   1. Registra un passkey con PRF extension (`navigator.credentials.create`).
 *   2. Deriva 3 llaves de cifrado AES-256 (F1, F2 vía HKDF de PRF output, F3 vía PBKDF2(email+password)).
 *   3. Llama al SDK `wallet.ensureWallet` que internamente:
 *        - Hace `GET /wallets` primero — si existe wallet para este usuario,
 *          devuelve { createdNow: false } sin generar keypair ni deployar nada
 *        - Si 404, ejecuta el flujo completo: genera keypair → splits Shamir →
 *          cifra fragmentos → POST /wallets → deploy on-chain del Smart Account
 *        - Antes del POST, persiste credentialId + prfSalt + F1 cifrado en
 *          IndexedDB del SDK para crash-safety (si la red se cae después de la
 *          persistencia local, la próxima sesión sigue pudiendo firmar)
 *   4. Guarda nuestra propia copia metadata (address + pubkey + credentialId)
 *      en IndexedDB para que la página /wallet pueda mostrarla rápido sin
 *      hacer otro round-trip al backend.
 */
export async function ensureWalletWithPasskey(opts: {
  email: string;
  password: string;
  walletApi: WalletApiV3;
}): Promise<EnsureWalletFlowResult> {
  const { email, password, walletApi } = opts;

  // 1. Registrar passkey con PRF
  const userId = await sha256(new TextEncoder().encode(email));
  const prfSalt = getRandomBytes(32);

  const passkey = await registerPasskey({
    rpId: window.location.hostname,
    rpName: 'Accesly Example',
    userId,
    userName: email,
    prfSalt,
  });

  if (!passkey.prfSupported || !passkey.prfOutput) {
    throw new Error(
      'Tu navegador o autenticador no soporta la extensión WebAuthn PRF. ' +
        'Usa Chrome 116+, Edge 116+ o Safari 18+ con un passkey nativo del SO.',
    );
  }

  // 2. Derivar las 3 llaves de cifrado
  const encryptionSalt = getRandomBytes(32);
  const enc = new TextEncoder();

  const f1Key = hkdfSha256(
    passkey.prfOutput,
    encryptionSalt,
    enc.encode('accesly-f1-encryption'),
    32,
  );
  const f2Key = hkdfSha256(
    passkey.prfOutput,
    encryptionSalt,
    enc.encode('accesly-f2-encryption'),
    32,
  );
  const f3Key = pbkdf2Sha256(
    enc.encode(`${email}::${password}`),
    encryptionSalt,
    { iterations: 600_000, length: 32 },
  );

  // 3. ensureWallet — get-or-create idempotente con crash-safety + status
  const emailSalt = getRandomBytes(32);
  const ensureRes = await walletApi.ensureWallet({
    email,
    emailSalt,
    encryptionKeys: [f1Key, f2Key, f3Key] as const,
    secp256r1Pubkey: passkey.secp256r1Pubkey,
    credentialId: passkey.credentialId,
    prfSalt,
  });
  const { walletAddress, status, createdNow } = ensureRes;
  // `publicKey` solo viene cuando createdNow=true. Para wallet pre-existente
  // lo leemos del CredentialRecord en SDK store (que sí lo tiene) o caemos
  // a "(unknown)" — el dispatcher se encarga.
  const publicKey = ensureRes.publicKey ? bytesToHex(ensureRes.publicKey) : '';

  // 4. Guardar metadata local para display rápido en /wallet
  await saveCredential({
    email,
    walletAddress,
    publicKey,
    credentialId: bytesToBase64Url(passkey.credentialId),
    secp256r1Pubkey: bytesToHex(passkey.secp256r1Pubkey),
    prfSalt: bytesToHex(prfSalt),
    encryptionSalt: bytesToHex(encryptionSalt),
    createdAt: Date.now(),
  });

  return { walletAddress, publicKey, status, createdNow };
}
