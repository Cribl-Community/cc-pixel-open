import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts so tests don't boot the Cribl live-preview plugins.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
