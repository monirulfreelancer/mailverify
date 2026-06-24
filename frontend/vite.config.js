import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite + React setup.
// The API base URL is read from VITE_API_URL at build/dev time (see src/api.js).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // expose on the network for device testing
  },
  preview: {
    port: 4173,
    host: true,
  },
});
