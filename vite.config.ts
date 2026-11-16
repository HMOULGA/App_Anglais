import { defineConfig } from 'vite'

// COOP/COEP : active SharedArrayBuffer → llama.cpp multi-thread (beaucoup plus rapide)
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base: './',
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@wllama/wllama', '@huggingface/transformers'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
})
