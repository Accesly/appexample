import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AcceslyProvider } from '@accesly/react';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root container');

createRoot(root).render(
  <StrictMode>
    <AcceslyProvider appId="accesly-example" env="dev">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AcceslyProvider>
  </StrictMode>,
);
