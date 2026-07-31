import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787';

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Browser calls /api/* → API server (strips /api prefix)
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Split vendor into cacheable groups so no single chunk dominates the
      // download and the framework layer caches across app deploys (plan D2).
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // Framework core only — react-router/history stay in vendor so the
            // dependency edge is one-directional (vendor → react-vendor), no cycle.
            if (/[\\/](?:react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
            /* ICONS ARE DELIBERATELY NOT A MANUAL CHUNK (ALIVE/MARKETING P0).
             *
             * They used to be: `return 'icons'`. That forced all 162 lucide icons
             * the app imports into ONE chunk which `check-bundle.mjs` counts as
             * always-loaded — so an icon used only by MarketMap was downloaded and
             * parsed by every operator on every page.
             *
             * Returning undefined lets Rollup place each icon with whoever
             * actually imports it: shell icons land in `index`, page-only icons
             * ride along in that page's lazy chunk. Measured on this app:
             *
             *   initial   850KB → 825KB   (25KB less JS before first paint)
             *   index-      385 → 423KB   (it absorbed the shell's own icons)
             *   lazy chunks  109 → 138
             *
             * The initial saving is the one an operator feels. The `index` growth
             * is why MAX_CHUNK_KB moved 400 → 440 in check-bundle.mjs — see the
             * reasoning recorded there; 423KB is still far from the 500KB monolith
             * that guard was written to prevent.
             *
             * NOTE the catch-all below: `return 'vendor'` would swallow lucide
             * right back into an always-loaded chunk, so this early return has to
             * stay ABOVE it. Deleting this line does not restore the old
             * behaviour — it silently makes things worse than the old behaviour. */
            if (/[\\/]lucide-react[\\/]/.test(id)) return undefined;
            return 'vendor';
          },
        },
      },
    },
  };
});
