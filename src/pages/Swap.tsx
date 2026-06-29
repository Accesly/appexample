import { useNavigate } from 'react-router-dom';
import { SwapFlow } from '@accesly/react/kit';

export function Swap() {
  const navigate = useNavigate();
  return (
    <div className="flex justify-center py-6">
      <SwapFlow onCancel={() => navigate('/wallet')} onSuccess={() => navigate('/history')} />
    </div>
  );
}
