import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The platform app runs on the owner's own machine, like the admin app used to
 * (:5174) — it is the one place that can let a gym in or suspend one, so it is
 * deliberately not on the internet. Port 5175 keeps all three runnable at once.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
});
