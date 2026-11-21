import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const pages = ['index.html', 'grade-10/index.html', 'grade-11/index.html', 'grade-12/index.html']

export default defineConfig({
  appType: 'mpa',
  plugins: [tailwindcss()],
  build: {
    rollupOptions: { input: pages.map(page => fileURLToPath(new URL(page, import.meta.url))) },
  },
})
