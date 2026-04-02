import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [],
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      // Pick up all *.test.ts files as type-only tests
      include: ['**/*.test.ts'],
    },
  },
})
