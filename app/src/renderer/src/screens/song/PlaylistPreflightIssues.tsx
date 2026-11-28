import type { PlaylistCheck } from "@/song/performance/playlist-preflight";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Put every entry's errors before advisory performance warnings, without reordering the playlist. */
export function PlaylistPreflightIssues({ report }: { report: readonly PlaylistCheck[] }) {
  const issues = (["errors", "warnings"] as const).flatMap((kind) => report.flatMap((entry) => entry[kind].map((text) => ({ entry, kind, text }))));
  return (
    <section aria-label={t`Playback and MIDI issues`} className="space-y-2 rounded border border-seam p-3">
      <h3 className="font-medium"><Trans>Playback and MIDI issues</Trans></h3>
      {issues.length ? (
        <ul className="max-h-64 list-disc overflow-auto pl-5">
          {issues.map(({ entry, kind, text }, index) => (
            <li key={index} className={kind === "errors" ? "text-red-400" : undefined}>
              <strong>
                {kind === "errors" ? t`Error` : t`Warning`} · {entry.entry}. {entry.title}:
              </strong>{" "}
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <p><Trans>No static playback or MIDI issues found. Arrangement advice is listed separately below.</Trans></p>
      )}
    </section>
  );
}
