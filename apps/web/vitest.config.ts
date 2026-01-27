import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/__mocks__/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/App.tsx',
        'src/pages/**',
        'src/components/layout/**',
        'src/components/ui/Button.tsx',
        'src/components/ui/MetricCard.tsx',
        'src/components/ui/StatusBadge.tsx',
        'src/lib/utils.ts',
      ],
      thresholds: {
        // Coverage for hooks, stores, and tested components
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
})
