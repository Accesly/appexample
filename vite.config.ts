import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// WebAuthn requiere "secure context": HTTPS o http://localhost.
// El dev server por defecto sirve en http://localhost:5173 — eso funciona.
// Si necesitas probar desde otro device o un dominio custom, instala
// `vite-plugin-mkcert` y descomenta las dos líneas marcadas.
//
// import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [
    react(),
    // `amazon-cognito-identity-js` (dep transitiva de @accesly/core) arrastra
    // el polyfill viejo de `buffer` y `process`. Sin esto, el bundle hace
    // referencia a `global` que no existe en navegadores y la pantalla
    // queda en blanco con `ReferenceError: global is not defined`.
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    // mkcert(),
  ],
  server: {
    // https: true, // requiere mkcert
    port: 5173,
  },
  // Re-pre-bundle del SDK para que esbuild aplique los polyfills al pre-bundle.
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
});
