import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'

const isElectron = process.env.TARGET === 'electron'

export default defineConfig({
  plugins: [
    react(),
    ...(isElectron ? [
      electron([
        {
          // Processo principal
          entry: 'electron/main.ts',
          vite: { build: { outDir: 'dist/electron', sourcemap: true } },
        },
        {
          // Preload — recarrega o renderer ao salvar
          entry: 'electron/preload.ts',
          onstart: (opts) => opts.reload(),
          vite: { build: { outDir: 'dist/electron', sourcemap: true } },
        },
      ])
    ] : []),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Em modo Electron, redireciona import 'obsidian' para o shim local
      ...(isElectron ? {
        'obsidian': path.resolve(__dirname, 'electron/shim/index.ts'),
      } : {}),
    },
  },

  define: {
    // Flag disponível em todo o código do renderer
    __IS_ELECTRON__: JSON.stringify(isElectron),
  },

  build: {
    outDir: isElectron ? 'dist/renderer' : 'dist/web',
    sourcemap: true,
  },

  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5174', changeOrigin: false },
    },
  },
})
