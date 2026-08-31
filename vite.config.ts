import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relatieve base zodat de build zowel op een GitHub Pages project-URL
// (/<repo>/) als op een eigen domein werkt. De app gebruikt hash-routing,
// dus er is geen server-side rewrite nodig.
export default defineConfig({
  base: './',
  plugins: [react()],
})
