import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const buildDir = path.resolve(process.cwd(), '../Gratulationsdienst Reinickendorf/docker/src/mitgliederverwaltung');
const generatedAssetPattern = /^index-[\w-]+\.(css|js)$/;

const cleanGeneratedAssets = () => {
  const assetsDir = path.join(buildDir, 'assets');
  if (!fs.existsSync(assetsDir)) return;
  fs.readdirSync(assetsDir)
    .filter(fileName => generatedAssetPattern.test(fileName))
    .forEach(fileName => fs.rmSync(path.join(assetsDir, fileName), { force: true }));
};

export default defineConfig({
  plugins: [{ name: 'clean-generated-assets', buildStart: cleanGeneratedAssets }],
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
