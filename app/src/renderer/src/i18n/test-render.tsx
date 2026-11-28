// Tests import "@testing-library/react" as usual; vitest.config.ts points it here so every render sits inside the
// I18nProvider the app has (<Trans> needs it). Re-exports the library's "pure" build and cleans up after each test, as
// the default entry does.
import type { ReactNode } from "react";
import { afterEach } from "vitest";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import * as pure from "@testing-library/react/pure";

afterEach(() => pure.cleanup());

type Wrapper = (props: { children: ReactNode }) => ReactNode;

/** The caller's wrapper (if any) inside the I18nProvider. */
function withI18n(Inner?: Wrapper): Wrapper {
  return function I18nWrapper({ children }) {
    return <I18nProvider i18n={i18n}>{Inner ? <Inner>{children}</Inner> : children}</I18nProvider>;
  };
}

export * from "@testing-library/react/pure";

export const render: typeof pure.render = ((ui: Parameters<typeof pure.render>[0], options?: Parameters<typeof pure.render>[1]) =>
  pure.render(ui, { ...options, wrapper: withI18n(options?.wrapper as Wrapper | undefined) })) as typeof pure.render;

export const renderHook: typeof pure.renderHook = ((cb: never, options?: { wrapper?: Wrapper }) =>
  pure.renderHook(cb, { ...options, wrapper: withI18n(options?.wrapper) })) as typeof pure.renderHook;
