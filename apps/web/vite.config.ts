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
            if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons';
            return 'vendor';
          },
        },
      },
    },
  };
});
