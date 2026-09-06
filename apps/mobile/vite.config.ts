import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The client talks to the API and never simulates anything itself.
      '/api': { target: process.env.API_URL ?? 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
