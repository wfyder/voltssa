/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content-Security-Policy for production builds: scripts only from this origin and network
 * access only to the map, terrain and routing services the app uses. (The dev server needs
 * inline scripts for hot reload, so the policy is injected at build time only.)
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://s3.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org https://s3.amazonaws.com https://router.project-osrm.org",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'voltssa-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), productionCsp()],
  // localhost only; `npm run dev:lan` exposes it on the network when testing on a phone.
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1800 },
  worker: { format: 'es' },
  optimizeDeps: { include: ['maplibre-gl', 'react-map-gl/maplibre'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
