import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The platform app runs on the owner's own machine, like the admin app used to
 * (:5174) — it is the one place that can let a gym in or suspend one, so it is
 * deliberately not on the internet. Port 5175 keeps all three runnable at once.
 */
export default defineConfig({
  plugins: [react()],
  // 5175 when run by hand (`npm run dev`); the port a launcher hands over in PORT
  // otherwise, so starting it from the app while a terminal copy holds 5175 opens
  // a second copy instead of failing.
  server: { port: Number(process.env.PORT) || 5175, strictPort: true },
});
