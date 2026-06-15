import { Link } from 'react-router-dom';

/**
 * Placeholder mientras el nuevo flujo de recovery (Fase 1) llega con
 * `@accesly/core@1.0.0` final. Recovery v1 (ZK email + SEP-30) salió del
 * scope el 2026-06-15.
 */
export function RecoverPlaceholder() {
  return (
    <div className="card">
      <h2>Recuperación temporalmente deshabilitada</h2>
      <p>
        Estamos cambiando el sistema de recuperación a uno más simple — código por
        email + tu contraseña. Vuelve pronto.
      </p>
      <p>
        Si perdiste tu dispositivo y necesitas acceso urgente, contáctanos en{' '}
        <a href="mailto:soporte@accesly.xyz">soporte@accesly.xyz</a>.
      </p>
      <Link to="/" className="btn-secondary" style={{ marginTop: 16 }}>
        Volver al inicio
      </Link>
    </div>
  );
}
