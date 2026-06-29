import { MovementsList } from '@accesly/react/kit';

export function History() {
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <header>
        <h2 className="text-xl font-bold">Historial</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Actividad on-chain de tu wallet — refrescado en tiempo real vía SSE.
        </p>
      </header>
      <div className="rounded-2xl bg-white border border-neutral-200 p-4">
        <MovementsList limit={50} />
      </div>
    </div>
  );
}
