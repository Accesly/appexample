import { useNavigate } from 'react-router-dom';
import { RecoveryFlow } from '@accesly/react/kit';

export function Recover() {
  const navigate = useNavigate();
  return (
    <div className="flex justify-center py-12">
      <RecoveryFlow
        onDone={() => navigate('/wallet')}
        onCancel={() => navigate('/signin')}
      />
    </div>
  );
}
