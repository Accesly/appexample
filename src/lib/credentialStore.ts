/**
 * Almacén local de credenciales del dispositivo.
 *
 * Guarda lo que la app necesita en el dispositivo del usuario para reconocerlo
 * en visitas futuras: walletAddress, credentialId del passkey, prfSalt para
 * re-derivar las llaves de cifrado en el unlock, y la pubkey secp256r1.
 *
 * NO almacena la seed master ni los fragmentos en plano. Esos viven sólo en
 * memoria durante el flujo de firma (el SDK lo garantiza vía withZeroize).
 */

const DB_NAME = 'accesly-example';
const DB_VERSION = 1;
const STORE = 'devices';

export interface LocalCredential {
  /** Email del usuario — clave primaria. */
  email: string;
  /** Address C... del Smart Account en Stellar testnet. */
  walletAddress: string;
  /** Public key ed25519 que firma (hex). */
  publicKey: string;
  /** Credential ID del passkey (base64url) — para `navigator.credentials.get`. */
  credentialId: string;
  /** Pubkey secp256r1 uncompressed (hex) — para SEP-10. */
  secp256r1Pubkey: string;
  /** Salt usado en la extensión PRF al registrar — re-usar en cada unlock. */
  prfSalt: string;
  /** Salt usado al derivar las llaves de cifrado vía HKDF. */
  encryptionSalt: string;
  /** Timestamp de creación. */
  createdAt: number;
  /** Último status conocido reportado por la SDK (cached para display rápido). */
  lastKnownStatus?: 'on-chain' | 'pending-deploy' | 'unknown';
  /** Timestamp de la última vez que se refrescó el status. */
  lastStatusCheck?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'email' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCredential(cred: LocalCredential): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(cred);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCredential(
  email: string,
): Promise<LocalCredential | null> {
  const db = await openDb();
  const result = await new Promise<LocalCredential | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(email);
      req.onsuccess = () => resolve(req.result as LocalCredential | undefined);
      req.onerror = () => reject(req.error);
    },
  );
  db.close();
  return result ?? null;
}

export async function listCredentials(): Promise<LocalCredential[]> {
  const db = await openDb();
  const result = await new Promise<LocalCredential[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as LocalCredential[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteCredential(email: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(email);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ──────────────────────────────────────────────────────────────────────────
// Codecs Uint8Array ↔ string para guardar en IndexedDB.

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string with odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
