import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./dotenv.ts'],
    fileParallelism: false,
  },
});
