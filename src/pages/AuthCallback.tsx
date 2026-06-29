import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { AuthCallback as KitAuthCallback } from '@accesly/react/kit';

export function AuthCallback() {
  const navigate = useNavigate();
  const { wallet, _internal } = useAccesly();
  return (
    <div className="flex justify-center py-12">
      <KitAuthCallback
        onSuccess={async () => {
          // Post-Google sign-in: si el user ya tiene wallet, vamos a /wallet,
          // si no, a /create-wallet.
          const username = _internal.username;
          if (!username) {
            navigate('/wallet');
            return;
          }
          const stored = await wallet.getStoredCredential(username).catch(() => null);
          navigate(stored?.walletAddress ? '/wallet' : '/create-wallet');
        }}
        onError={() => navigate('/signin')}
      />
    </div>
  );
}
