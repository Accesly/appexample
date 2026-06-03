/**
 * Re-deriva el material necesario para firmar transacciones desde la wallet:
 *   - `fragmentF1Plain` — el share F1 reconstruido (sin Shamir todavía, eso
 *     lo hace la SDK al combinar con F2).
 *   - `fragmentF2Key` — la llave AES con la que la SDK descifra el envelope
 *     F2 que viene del backend (`POST /fragments/2`).
 *   - `ownerPubkey` — la pubkey ed25519 que el AuthPayload del Smart Account
 *     necesita para construir `Signer::External(verifier, pubkey)`.
 *
 * Pasos:
 *   1. Lee `LocalCredential` del IndexedDB (tiene credentialId + prfSalt +
 *      encryptionSalt + publicKey, todo guardado al crear la wallet).
 *   2. WebAuthn unlock con el mismo prfSalt → recupera el `prfOutput`.
 *   3. HKDF(prfOutput, encryptionSalt, "accesly-f1-encryption") → f1Key.
 *   4. HKDF(prfOutput, encryptionSalt, "accesly-f2-encryption") → f2Key.
 *   5. Lee el `CredentialRecord` de la SDK (tiene fragmentF1Encrypted como
 *      EncryptedEnvelope), desencripta con f1Key → F1 plain.
 *   6. Devuelve los 3 materials. f1Key + prfOutput se zero-izan internamente.
 *
 * NOTA: este helper solo aplica al device donde la wallet se creó (porque ahí
 * vive el passkey con esa credentialId). Para flows multi-device hay que
 * pasar por SEP-30 recovery (Track C — bloqueado por circuito ZK).
 */

import { decryptAesGcm, zeroize } from '@accesly/core';
import { hkdfSha256 } from '@accesly/core/crypto';
import { unlockPasskey } from '@accesly/core/webauthn';
import type { CredentialRecord } from '@accesly/core';

import {
  base64UrlToBytes,
  getCredential,
  hexToBytes,
  type LocalCredential,
} from './credentialStore';

const enc = new TextEncoder();
const F1_INFO = enc.encode('accesly-f1-encryption');
const F2_INFO = enc.encode('accesly-f2-encryption');

export interface UnlockedMaterial {
  /** Plain F1 share — listo para pasar a `tx.send` (la SDK lo zero-iza). */
  readonly fragmentF1Plain: Uint8Array;
  /** Llave AES-256 que descifra el envelope F2 que devuelve el backend. */
  readonly fragmentF2Key: Uint8Array;
  /** Pubkey ed25519 raw 32 bytes del owner del Smart Account. */
  readonly ownerPubkey: Uint8Array;
  /** Address C… del Smart Account (útil para mostrar en UI). */
  readonly walletAddress: string;
}

export async function unlockForSigning(
  email: string,
  sdkRecord: CredentialRecord | null,
): Promise<UnlockedMaterial> {
  const local: LocalCredential | null = await getCredential(email);
  if (!local) {
    throw new Error(
      'No hay credencial local en este browser. Crea la wallet primero o cambia al device original.',
    );
  }
  if (!sdkRecord) {
    throw new Error(
      'La SDK no tiene CredentialRecord para este user. Probablemente fue creada con una versión vieja sin persistencia de F1 cifrado.',
    );
  }

  const credentialId = base64UrlToBytes(local.credentialId);
  const prfSalt = hexToBytes(local.prfSalt);
  const encryptionSalt = hexToBytes(local.encryptionSalt);

  // 32-byte challenge aleatorio — no se valida server-side (passkey lo firma
  // pero como solo queremos PRF, el challenge da freshness al unlock).
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const unlock = await unlockPasskey({
    rpId: window.location.hostname,
    credentialId,
    challenge,
    prfSalt,
  });

  if (!unlock.prfOutput) {
    throw new Error(
      'El authenticator no devolvió PRF — ¿usaste el mismo browser/dispositivo donde creaste la wallet?',
    );
  }

  const f1Key = hkdfSha256(unlock.prfOutput, encryptionSalt, F1_INFO, 32);
  const fragmentF2Key = hkdfSha256(unlock.prfOutput, encryptionSalt, F2_INFO, 32);

  // El prfOutput ya derivó todo lo necesario.
  zeroize(unlock.prfOutput);

  let fragmentF1Plain: Uint8Array;
  try {
    fragmentF1Plain = decryptAesGcm(sdkRecord.fragmentF1Encrypted, f1Key);
  } finally {
    zeroize(f1Key);
  }

  return {
    fragmentF1Plain,
    fragmentF2Key,
    ownerPubkey: hexToBytes(local.publicKey),
    walletAddress: local.walletAddress,
  };
}
