import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.API_URL ?? 'http://localhost:8787';
// Every build gets an id. The app compares it with version.json (written next to the
// build) and reloads itself when a newer build is out – see src/lib/update.js.
const BUILD_ID = (process.env.GITHUB_SHA ?? '').slice(0, 12) || String(Date.now());
const versionFile = {
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  }
};

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; locally and on the server it is /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), versionFile],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
    proxy: { '/api': api, '/images': api }
  }
});
