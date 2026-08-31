import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // better-sqlite3 is a native C++ addon — it must NOT be bundled
      // by Vite. Mark it as external so Node.js loads it at runtime.
      external: ['better-sqlite3'],
    },
  },
});
