import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // Exports and QA HTML are artifacts, not app entry points. Watching them
    // reloads the active editor as soon as an HTML download is saved locally.
    watch: { ignored: ['**/private/**', '**/tmp/**', '**/output/**', '**/dist-demo/**', '**/vendor/**', '**/test-results/**', '**/playwright-report/**'] },
    fs: { strict: true, deny: ['**/.env*', '**/private/**', '**/vendor/**', '**/tmp/**', '**/output/**', '**/test-results/**', '**/playwright-report/**', '**/*.sqlite*'] },
  },
  build: { outDir: 'dist', sourcemap: false },
});
