/**
 * Convierte errores arbitrarios (incluidos los del SDK) en mensajes humanos.
 *
 * Los errores del SDK son tipados — `NotImplementedYetError`, `AuthError`,
 * `NetworkError`, `ValidationError`, etc. El `.name` y `.message` son
 * legibles; aquí los mejoramos para la UI.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name ?? '';
    const msg = err.message ?? '';

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
        'Este dispositivo no tiene los shards de tu wallet. La recuperación' +
        ' (OTP por email + tu contraseña) estará disponible en la siguiente' +
        ' release del SDK. Mientras tanto, limpia IndexedDB y crea una wallet' +
        ' nueva con un email distinto si es solo una demo.'
      );
    }
    return msg || 'Ocurrió un error inesperado.';
  }
  return String(err);
}
