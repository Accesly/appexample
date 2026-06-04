import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AcceslyProvider } from '@accesly/react';
import { IndexedDbDeviceStore } from '@accesly/core';
import { App } from './App';
import { BrowserSessionStorage } from './lib/sessionStorage';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root container');

// Una sola instancia persistente — sobrevive page reloads para no patear
// al user a /signin cada vez que se navega con un anchor o se refresca.
const sessionStorage = new BrowserSessionStorage();

// CredentialRecord con shards F1/F2/F3 cifrados + metadata del passkey.
// IndexedDB es la única opción que sobrevive sign-out / reload / cierre del
// tab. Sin esto, intentar firmar después de un refresh tira
// "La SDK no tiene CredentialRecord para este user".
const deviceStore = new IndexedDbDeviceStore();

createRoot(root).render(
  <StrictMode>
    <AcceslyProvider
      appId="accesly-example"
      env="dev"
      overrides={{ sessionStorage, deviceStore }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AcceslyProvider>
  </StrictMode>,
);
