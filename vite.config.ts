/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1800 },
  worker: { format: 'es' },
  optimizeDeps: { include: ['maplibre-gl', 'react-map-gl/maplibre'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
