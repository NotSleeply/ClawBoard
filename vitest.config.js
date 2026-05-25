import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'text-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/LRUCache.js',
        'src/utils/SecureUtils.js',
        'src/utils/TextFormatter.js',
        'src/utils/PasteModeManager.js',
        'src/core/clipboard/ClipboardWatcher.js'
      ],
      exclude: ['src/**/__tests__/**'],
      thresholds: {
        branches: 40,
        functions: 65,
        lines: 55,
        statements: 55
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
