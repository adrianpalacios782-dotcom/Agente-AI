import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8001',
      '/apps': 'http://127.0.0.1:8001',
      '/dev': 'http://127.0.0.1:8001',
      '/debug': 'http://127.0.0.1:8001',
      '/list-apps': 'http://127.0.0.1:8001',
      '/run': 'http://127.0.0.1:8001',
      '/run_sse': 'http://127.0.0.1:8001',
      '/health': 'http://127.0.0.1:8001',
      '/version': 'http://127.0.0.1:8001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
