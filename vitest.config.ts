import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/vitest.setup.ts'],
    include: ['src/**/*.spec.ts', 'server/src/**/*.spec.ts'],
    server: {
      deps: {
        inline: ['@ionic/angular', '@ionic/core'],
      },
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/app',
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
