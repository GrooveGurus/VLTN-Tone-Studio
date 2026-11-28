import { StrictMode } from "react";
import { I18nProvider } from "@lingui/react";
import { i18n, initI18n, useLocale } from "./i18n";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./app/App";
import { AudienceView } from "./screens/audience/AudienceView";
import { logUncaughtErrors } from "./state/session-log";
import { watchSongs } from "./song/analysis/song-runner-app";

logUncaughtErrors();

// The audience display is a second window that loads this same bundle with ?view=audience (spec 43). It shows only the audience view.
const audience = new URLSearchParams(window.location.search).get("view") === "audience";

/**
 * The app, remounted when the language changes: text marked with t`…` is read while rendering, so every screen draws
 * again in the new language. The pedal connection and the stores live outside React and stay as they are; launch
 * parameters run once per page (AppShell).
 */
function Localized() {
  const locale = useLocale((s) => s.locale);
  return <App key={locale} />;
}

// The language is chosen before the first render (the saved one, or the computer's), so nothing flashes in English.
void initI18n().then(() => {
  // A split or an import, and a song that opens without a current analysis, are analysed here, whichever screen is
  // showing (spec 80). After the language is chosen: its status lines are messages.
  if (window.location.search.indexOf("view=audience") === -1) watchSongs();
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      {audience ? (
        <AudienceView />
      ) : (
        <StrictMode>
          <Localized />
        </StrictMode>
      )}
    </I18nProvider>,
  );
});
