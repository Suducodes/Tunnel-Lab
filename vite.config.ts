import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5193 },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    chunkSizeWarningLimit: 800,
  },
});
