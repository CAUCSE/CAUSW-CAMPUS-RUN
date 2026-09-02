import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        lobby: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        result: resolve(__dirname, 'result.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
  },
})
