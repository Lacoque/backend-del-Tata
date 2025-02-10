import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/examples/**'],
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: [
        '**/examples/**',
        '**/lib/**',
        'src/index.ts',
        'src/types',
        'src/types.ts',
        'src/websocket.ts',
      ],
    },
    environment: 'jsdom',
  },
})
