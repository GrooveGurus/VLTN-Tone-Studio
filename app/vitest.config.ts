import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";

export default defineConfig({
  plugins: [react(), lingui({ macroTransform: true })],
  resolve: {
    alias: [
      { find: "@", replacement: resolve("src/renderer/src") },
      { find: "@shared", replacement: resolve("src/shared") },
      // every render inside the app's I18nProvider (src/renderer/src/i18n/test-render.tsx); "/pure" stays the library
      { find: /^@testing-library\/react$/, replacement: resolve("src/renderer/src/i18n/test-render.tsx") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/renderer/src/i18n/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // Node 25+ has its own global localStorage, which hides jsdom's and breaks every test that stores something.
    execArgv: ["--no-experimental-webstorage"],
  },
});
