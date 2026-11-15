import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Server bezi na :3001. Obrazky karet (/cards) a websocket jdou pres proxy,
// takze klient mluvi vzdy jen se svou adresou (funguje i po LAN).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/cards': 'http://localhost:3001',
    },
  },
});
