// vite.config.ts
import { defineConfig } from "file:///C:/Users/danie/Desktop/MyProjects/Web3/accesly-example/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/danie/Desktop/MyProjects/Web3/accesly-example/node_modules/@vitejs/plugin-react/dist/index.js";
import { nodePolyfills } from "file:///C:/Users/danie/Desktop/MyProjects/Web3/accesly-example/node_modules/vite-plugin-node-polyfills/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    // `amazon-cognito-identity-js` (dep transitiva de @accesly/core) arrastra
    // el polyfill viejo de `buffer` y `process`. Sin esto, el bundle hace
    // referencia a `global` que no existe en navegadores y la pantalla
    // queda en blanco con `ReferenceError: global is not defined`.
    nodePolyfills({
      include: ["buffer", "process", "util", "stream", "crypto"],
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      protocolImports: true
    })
    // mkcert(),
  ],
  server: {
    // https: true, // requiere mkcert
    port: 5173
  },
  // Re-pre-bundle del SDK para que esbuild aplique los polyfills al pre-bundle.
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis"
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkYW5pZVxcXFxEZXNrdG9wXFxcXE15UHJvamVjdHNcXFxcV2ViM1xcXFxhY2Nlc2x5LWV4YW1wbGVcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGRhbmllXFxcXERlc2t0b3BcXFxcTXlQcm9qZWN0c1xcXFxXZWIzXFxcXGFjY2VzbHktZXhhbXBsZVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvZGFuaWUvRGVza3RvcC9NeVByb2plY3RzL1dlYjMvYWNjZXNseS1leGFtcGxlL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgbm9kZVBvbHlmaWxscyB9IGZyb20gJ3ZpdGUtcGx1Z2luLW5vZGUtcG9seWZpbGxzJztcblxuLy8gV2ViQXV0aG4gcmVxdWllcmUgXCJzZWN1cmUgY29udGV4dFwiOiBIVFRQUyBvIGh0dHA6Ly9sb2NhbGhvc3QuXG4vLyBFbCBkZXYgc2VydmVyIHBvciBkZWZlY3RvIHNpcnZlIGVuIGh0dHA6Ly9sb2NhbGhvc3Q6NTE3MyBcdTIwMTQgZXNvIGZ1bmNpb25hLlxuLy8gU2kgbmVjZXNpdGFzIHByb2JhciBkZXNkZSBvdHJvIGRldmljZSBvIHVuIGRvbWluaW8gY3VzdG9tLCBpbnN0YWxhXG4vLyBgdml0ZS1wbHVnaW4tbWtjZXJ0YCB5IGRlc2NvbWVudGEgbGFzIGRvcyBsXHUwMEVEbmVhcyBtYXJjYWRhcy5cbi8vXG4vLyBpbXBvcnQgbWtjZXJ0IGZyb20gJ3ZpdGUtcGx1Z2luLW1rY2VydCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIC8vIGBhbWF6b24tY29nbml0by1pZGVudGl0eS1qc2AgKGRlcCB0cmFuc2l0aXZhIGRlIEBhY2Nlc2x5L2NvcmUpIGFycmFzdHJhXG4gICAgLy8gZWwgcG9seWZpbGwgdmllam8gZGUgYGJ1ZmZlcmAgeSBgcHJvY2Vzc2AuIFNpbiBlc3RvLCBlbCBidW5kbGUgaGFjZVxuICAgIC8vIHJlZmVyZW5jaWEgYSBgZ2xvYmFsYCBxdWUgbm8gZXhpc3RlIGVuIG5hdmVnYWRvcmVzIHkgbGEgcGFudGFsbGFcbiAgICAvLyBxdWVkYSBlbiBibGFuY28gY29uIGBSZWZlcmVuY2VFcnJvcjogZ2xvYmFsIGlzIG5vdCBkZWZpbmVkYC5cbiAgICBub2RlUG9seWZpbGxzKHtcbiAgICAgIGluY2x1ZGU6IFsnYnVmZmVyJywgJ3Byb2Nlc3MnLCAndXRpbCcsICdzdHJlYW0nLCAnY3J5cHRvJ10sXG4gICAgICBnbG9iYWxzOiB7XG4gICAgICAgIEJ1ZmZlcjogdHJ1ZSxcbiAgICAgICAgZ2xvYmFsOiB0cnVlLFxuICAgICAgICBwcm9jZXNzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHByb3RvY29sSW1wb3J0czogdHJ1ZSxcbiAgICB9KSxcbiAgICAvLyBta2NlcnQoKSxcbiAgXSxcbiAgc2VydmVyOiB7XG4gICAgLy8gaHR0cHM6IHRydWUsIC8vIHJlcXVpZXJlIG1rY2VydFxuICAgIHBvcnQ6IDUxNzMsXG4gIH0sXG4gIC8vIFJlLXByZS1idW5kbGUgZGVsIFNESyBwYXJhIHF1ZSBlc2J1aWxkIGFwbGlxdWUgbG9zIHBvbHlmaWxscyBhbCBwcmUtYnVuZGxlLlxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBlc2J1aWxkT3B0aW9uczoge1xuICAgICAgZGVmaW5lOiB7XG4gICAgICAgIGdsb2JhbDogJ2dsb2JhbFRoaXMnLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWtXLFNBQVMsb0JBQW9CO0FBQy9YLE9BQU8sV0FBVztBQUNsQixTQUFTLHFCQUFxQjtBQVM5QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtOLGNBQWM7QUFBQSxNQUNaLFNBQVMsQ0FBQyxVQUFVLFdBQVcsUUFBUSxVQUFVLFFBQVE7QUFBQSxNQUN6RCxTQUFTO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDWDtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsSUFDbkIsQ0FBQztBQUFBO0FBQUEsRUFFSDtBQUFBLEVBQ0EsUUFBUTtBQUFBO0FBQUEsSUFFTixNQUFNO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFFQSxjQUFjO0FBQUEsSUFDWixnQkFBZ0I7QUFBQSxNQUNkLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
