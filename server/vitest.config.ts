import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 直读 tsconfig paths（与 web/vite.config.ts 同款），不手写 alias
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['test/**/*.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 15_000,
  },
});
