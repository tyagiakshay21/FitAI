import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-1234567890',
      JWT_REFRESH_SECRET: 'test-refresh-secret-1234567890',
    },
  },
});
