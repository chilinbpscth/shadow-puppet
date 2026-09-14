import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        color: resolve(__dirname, 'color.html'),
        stage: resolve(__dirname, 'stage.html'),
        legacyColor: resolve(__dirname, 'legacy-color.html'),
        print: resolve(__dirname, 'print.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
