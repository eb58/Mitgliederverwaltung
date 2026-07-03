import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mitgliederverwaltung/',
  build: {
    outDir: '../Gratulationsdienst Reinickendorf/docker/src/mitgliederverwaltung',
    emptyOutDir: false,
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
