// Lingui (i18n): the English text in the code is the message; `npm run i18n:extract` collects every t`…`, <Trans> and
// msg`…` of the renderer into one .po catalog per language. A message without a translation shows in English.
import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "pt-BR"],
  catalogs: [
    {
      path: "<rootDir>/src/renderer/src/locales/{locale}/messages",
      include: ["<rootDir>/src/renderer/src"],
      exclude: ["**/*.test.*", "**/*.d.ts", "**/*.d.mts", "**/node_modules/**"],
    },
  ],
});
