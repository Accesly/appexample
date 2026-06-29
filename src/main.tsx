import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AcceslyProvider } from '@accesly/react';
import { IndexedDbDeviceStore } from '@accesly/core';
import { App } from './App';
import './index.css';

// Safety net: en dev, cuando Vite re-pre-bundlea deps (típicamente porque
// instalaste/borraste algo o porque el SDK hizo discovery tardío de stellar-sdk),
// la pestaña abierta queda apuntando a chunks con hash viejo y los dynamic
// imports tiran `Failed to fetch dynamically imported module`. Auto-reload
// una sola vez para que el browser pida los chunks con el hash nuevo.
if (import.meta.env.DEV) {
  const RELOAD_FLAG = 'accesly:vite-chunk-reload';
  window.addEventListener('error', (e) => {
    const msg = String(e.message || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
      }
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e.reason?.message || e.reason || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
      }
    }
  });
  window.addEventListener('load', () => sessionStorage.removeItem(RELOAD_FLAG));
}

// El SDK ya defaultea a LocalStorageSessionStorage en browsers — sin BrowserSessionStorage
// custom. Solo overrideamos deviceStore para usar IndexedDB en vez de InMemory.
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root container');

// appId puede venir de VITE_ACCESLY_APP_ID para probar contra apps reales del
// dashboard (ej. `app_d_prueba1_7ut6h`). Default mantiene el legacy.
const appId = import.meta.env.VITE_ACCESLY_APP_ID ?? 'accesly-example';

createRoot(root).render(
  <StrictMode>
    <AcceslyProvider
      appId={appId}
      env="dev"
      overrides={{ deviceStore: new IndexedDbDeviceStore() }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AcceslyProvider>
  </StrictMode>,
);
