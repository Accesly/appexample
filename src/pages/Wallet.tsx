import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { WalletHome } from '@accesly/react/kit';

/**
 * Si el user ya tiene wallet en este device → renderea <WalletHome>.
 * Si no → manda a /create-wallet (post-recovery o nuevo signup que se saltó).
 */
export function Wallet() {
  const navigate = useNavigate();
  const { wallet, auth } = useAccesly();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    void (async () => {
      const stored = await wallet.getStoredCredential(auth.username!).catch(() => null);
      if (cancelled) return;
      if (!stored?.walletAddress) {
        navigate('/create-wallet');
      } else {
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.username, wallet, navigate]);

  if (!checked) {
    return (
      <div className="text-center py-12 text-sm text-neutral-500">Cargando wallet…</div>
    );
  }

  return <WalletHome />;
}
