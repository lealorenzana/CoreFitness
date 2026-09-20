import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** The public site. :5176 keeps all four apps runnable at once. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5176, strictPort: true },
});
