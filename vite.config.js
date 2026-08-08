import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const buildDir = path.resolve(process.cwd(), '../Gratulationsdienst/docker/src/mitgliederverwaltung');
const generatedAssetPattern = /^index-[\w-]+\.(css|js)$/;
const legacyVendorFiles = [
  'ag-grid-community.min.js',
  'ag-grid.css',
  'ag-theme-quartz.css',
  'bootstrap.bundle.min.js',
  'bootstrap.min.css',
  'chart.umd.min.js',
];

const cleanGeneratedAssets = () => {
  const assetsDir = path.join(buildDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    fs.readdirSync(assetsDir)
      .filter(fileName => generatedAssetPattern.test(fileName))
      .forEach(fileName => fs.rmSync(path.join(assetsDir, fileName), { force: true }));
  }

  const vendorDir = path.join(buildDir, 'vendor');
  legacyVendorFiles.forEach(fileName => fs.rmSync(path.join(vendorDir, fileName), { force: true }));
};

export default defineConfig({
  plugins: [{ name: 'clean-generated-assets', apply: 'build', buildStart: cleanGeneratedAssets }],
  base: '/mitgliederverwaltung/',
  build: {
    outDir: '../Gratulationsdienst/docker/src/mitgliederverwaltung',
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
