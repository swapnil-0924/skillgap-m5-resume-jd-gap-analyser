import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          // Strip unreferenced debug screenshots copied from public/assets/aistudio/
          const debugAssetsDir = path.resolve(distDir, 'assets/aistudio');
          if (fs.existsSync(debugAssetsDir)) {
            fs.rmSync(debugAssetsDir, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                priority: 30,
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: 'firebase-vendor',
                priority: 25,
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
              },
              {
                name: 'icons-vendor',
                priority: 25,
                test: /node_modules[\\/]lucide-react[\\/]/,
              },
              {
                name: 'charts-vendor',
                priority: 15,
                test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|delaunator|robust-predicates|@reduxjs[\\/]toolkit|react-redux|redux|immer|reselect|es-toolkit|eventemitter3|decimal\.js-light|react-is|use-sync-external-store)[\\/]/,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
