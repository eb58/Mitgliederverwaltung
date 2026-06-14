import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mitgliederverwaltung/',
  build: {
    outDir: '../../Documents/docker-container/src/mitgliederverwaltung',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/mitgliederverwaltung/php-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
