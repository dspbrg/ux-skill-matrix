import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Bouwt de werkbank tot één los bundeltje, los van de echte app.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // de werkbank importeert App dynamisch met top-level await
    target: 'esnext',
    outDir: 'dist-voorbeeld',
    emptyOutDir: true,
    rollupOptions: { input: 'voorbeeld.html', output: { inlineDynamicImports: true } },
  },
})
