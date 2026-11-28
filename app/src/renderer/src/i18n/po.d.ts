// A .po catalog imported through @lingui/vite-plugin: compiled to Lingui messages on import.
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
