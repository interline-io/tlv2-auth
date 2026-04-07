import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  test: {
    projects: [
      {
        root,
        test: {
          name: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
