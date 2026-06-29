import { useNavigate } from 'react-router-dom';
import { AuthForm } from '@accesly/react/kit';

export function SignIn() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center py-12">
      <AuthForm mode="sign-in" onSuccess={() => navigate('/wallet')} />
    </div>
  );
}
