import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El mismo alias que en tsconfig: TypeScript lo resuelve para el tipado y Vite
  // para el bundle. Si solo estuviera en uno, compilaria y reventaria en runtime.
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Puente COOP de MSAL v5: segunda entrada HTML, servida en /redirect.html
        redirect: resolve(__dirname, 'redirect.html'),
      },
    },
  },
});
