import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'billcheck-web-assets': path.resolve(import.meta.dirname, 'src/local/web-assets.stub.ts')
    }
  }
});
