// The editor's language: English (the text in the code) or a translation from src/renderer/src/locales/<locale>/messages.po
// (compiled on import by @lingui/vite-plugin). Picked in Settings › Language; until then, the computer's language when
// there is a translation for it. Chosen before the first render (main.tsx), so the app never flashes in English.
import { i18n } from "@lingui/core";
import { create } from "zustand";
import { messages as englishMessages } from "../locales/en/messages.po";

// English is active from the first import: a message read before initI18n (a store built at load, the song watcher)
// shows the source text instead of failing; the chosen language replaces it before the first render.
i18n.loadAndActivate({ locale: "en", messages: englishMessages });

export const LOCALES = {
  en: "English",
  "pt-BR": "Português (Brasil)",
} as const;
export type Locale = keyof typeof LOCALES;
/** "system": follow the computer's language */
export type LocaleChoice = Locale | "system";

const STORAGE_KEY = "vltn.locale";

const isLocale = (v: unknown): v is Locale => typeof v === "string" && Object.hasOwn(LOCALES, v);

/** The translation for a browser language tag: "pt", "pt-BR" and "pt-PT" → pt-BR; anything else → English. */
export function localeFor(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("pt")) return "pt-BR";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

const systemLocale = (): Locale => localeFor(typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));

function storedChoice(): LocaleChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Each catalog is its own chunk: only the active language is downloaded. */
const catalogs: Record<Locale, () => Promise<{ messages: Record<string, unknown> }>> = {
  en: async () => ({ messages: englishMessages }),
  "pt-BR": () => import("../locales/pt-BR/messages.po"),
};

interface LocaleState {
  choice: LocaleChoice;
  /** The language shown now */
  locale: Locale;
  /** Pick a language ("system" follows the computer); the screen changes at once and the choice is remembered. */
  setChoice(choice: LocaleChoice): Promise<void>;
}

async function activate(locale: Locale) {
  const { messages } = await catalogs[locale]();
  i18n.loadAndActivate({ locale, messages: messages as Parameters<typeof i18n.load>[1] });
  document.documentElement.lang = locale;
}

export const useLocale = create<LocaleState>((set) => ({
  choice: "system",
  locale: "en",
  async setChoice(choice) {
    const locale = choice === "system" ? systemLocale() : choice;
    await activate(locale);
    try {
      if (choice === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // private mode: the choice lasts until the window closes
    }
    set({ choice, locale });
  },
}));

/** Before the first render: the remembered language, or the computer's. A missing catalog falls back to English. */
export async function initI18n(): Promise<void> {
  const choice = storedChoice();
  const locale = choice === "system" ? systemLocale() : choice;
  try {
    await activate(locale);
    useLocale.setState({ choice, locale });
  } catch {
    await activate("en");
    useLocale.setState({ choice, locale: "en" });
  }
}

export { i18n };
