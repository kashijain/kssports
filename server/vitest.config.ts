import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/lekha_test',
      JWT_SECRET: 'test-secret-key',
      EXPOSE_RESET_LINK: 'true',
      SEED_DEMO: 'false',
      COOKIE_SECURE: 'false',
    },
  },
});
