import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Defiende rutas autenticadas y maneja la carrera de status:
 *
 * - El provider arranca con `status: 'anonymous'` cuando el SessionStorage
 *   es async (lee desde IndexedDB / localStorage en un effect). Durante esa
 *   ventana redirigir a /signin sería incorrecto. Esperamos un tick
 *   (50ms) — suficiente para que el `refreshStatus()` inicial corra y
 *   actualice el estado real antes de tomar decisión.
 * - Si tras el tick sigue `'anonymous'` → no hay sesión, redirige.
 * - Si está `'authenticated'` → renderiza children.
 * - Si está `'expired'` → trata como no autenticado (el TokenManager debe
 *   refrescar; mientras tanto vamos a /signin).
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { auth } = useAccesly();
  const location = useLocation();
  const [bootstrapped, setBootstrapped] = useState(auth.status === 'authenticated');
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (auth.status === 'authenticated') {
      setBootstrapped(true);
      return;
    }
    // Si todavía estamos dentro de la ventana de bootstrap, dale tiempo al
    // provider a que termine el primer refreshStatus.
    const elapsed = Date.now() - startedAtRef.current;
    const REMAINING = 200 - elapsed;
    if (REMAINING <= 0) {
      setBootstrapped(true);
      return;
    }
    const id = setTimeout(() => setBootstrapped(true), REMAINING);
    return () => clearTimeout(id);
  }, [auth.status]);

  if (!bootstrapped) {
    return (
      <div className="flex items-center justify-center py-12 text-accesly-subtle text-sm">
        Verificando sesión…
      </div>
    );
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
