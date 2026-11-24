import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    // Never slide to the next port: a second copy landed on 5175, and the platform's desktop icon opened it (2026-11-25).
    strictPort: true,
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
    },
  },
});
