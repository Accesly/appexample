import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { auth } = useAccesly();
  const location = useLocation();

  if (auth.status !== 'authenticated') {
    return (
      <Navigate to="/signin" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}
