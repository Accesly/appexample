/**
 * Convierte errores arbitrarios (incluidos los del SDK) en mensajes humanos.
 *
 * Los errores del SDK son tipados — `RecoveryNotAvailableError`,
 * `NotImplementedYetError`, `AuthError`, `NetworkError`, `ValidationError`, etc.
 * El `.name` y `.message` son legibles; aquí los mejoramos para la UI.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name ?? '';
    const msg = err.message ?? '';

    if (name === 'RecoveryNotAvailableError') {
      return (
        'Recovery aún no disponible. Requiere el circuito ZK groth16 ' +
        '(Track C, en desarrollo). Volverá a estar habilitado cuando se ' +
        'despliegue el verificador on-chain.'
      );
    }
    if (name === 'NotImplementedYetError') {
      return 'Esta funcionalidad aún no está implementada en el SDK actual.';
    }
    if (name === 'AuthError' || /unauthor/i.test(msg)) {
      return 'Sesión inválida o expirada. Vuelve a iniciar sesión.';
    }
    if (name === 'NetworkError' || /fetch/i.test(msg)) {
      return 'No se pudo contactar al backend. Verifica tu conexión.';
    }
    if (name === 'ValidationError') {
      return `Datos inválidos: ${msg}`;
    }
    if (/passkey|webauthn/i.test(msg) || name === 'NotAllowedError') {
      return (
        'No se completó la verificación biométrica. Asegúrate de tener ' +
        'un passkey (Touch ID, Face ID, Windows Hello, o llave de seguridad).'
      );
    }
    if (/no local CredentialRecord/i.test(msg)) {
      return (
        'Este dispositivo no tiene los shards de tu wallet — probablemente ' +
        'la creaste antes de la SDK 0.2 (que persiste credentialId + prfSalt). ' +
        'Para reintentar deploy necesitás el passkey original de otro device, ' +
        'o usar SEP-30 recovery (pendiente de Track C ZK). Como demo, podés ' +
        'limpiar IndexedDB y crear una wallet nueva con email distinto.'
      );
    }
    return msg || 'Ocurrió un error inesperado.';
  }
  return String(err);
}
