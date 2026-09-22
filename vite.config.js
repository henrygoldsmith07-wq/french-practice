import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    // Terser over the esbuild default: measurably smaller raw output on this
    // content-heavy bundle (esbuild optimises for speed, terser for bytes).
    // The total-JS budget is a product constraint (the PWA caches everything),
    // so minifier quality is part of the budget, not an implementation detail.
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2 },
      mangle: true,
      // Rollup's per-chunk top-level scope is private to the chunk (cross-chunk
      // references go through preserved exports), so top-level mangling is safe
      // and trims real bytes off this data-heavy bundle.
      toplevel: true,
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        // React in its own long-cacheable chunk → smaller app chunk, faster
        // repeat loads, parallel first download.
        manualChunks: { vendor: ['react', 'react-dom'] },
      },
    },
  },
  // Dev-server hygiene for E2E determinism: Playwright writes test-results/
  // and playwright-report/ into the project root WHILE tests run. Without
  // this ignore list every report write triggered a full page reload of the
  // app under test (observed as sudden French banners mid-journey and random
  // locator failures) — the server restarted the module graph out from under
  // the running browser. Test artifacts are never part of the app graph.
  server: {
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
});
