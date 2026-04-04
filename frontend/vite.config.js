import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/tg/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/telegram': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/telegram/, '/api'),
      },
    },
  },
});
