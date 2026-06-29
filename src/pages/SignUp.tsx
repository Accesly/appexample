import { useNavigate } from 'react-router-dom';
import { AuthForm } from '@accesly/react/kit';

export function SignUp() {
  const navigate = useNavigate();
  // Tras sign-up + confirmación, el AuthForm hace signIn automático y
  // dispara onSuccess. Llevamos al user a /create-wallet para el bootstrap.
  return (
    <div className="flex flex-col items-center py-12">
      <AuthForm mode="sign-up" onSuccess={() => navigate('/create-wallet')} />
    </div>
  );
}
