import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSongLibrary } from "@/song/library";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";
const RECENT = 12;

/** The latest plays, the history clearing, and a playlist made from the plays since a date. */
export function PlayHistory() {
  const library = useSongLibrary();
  const [since, setSince] = useState(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const titles = new Map(library.index.songs.map((song) => [song.id, song.title]));
  const setNames = new Map(library.index.playlists.flatMap((playlist) => (playlist.sets ?? []).map((set) => [set.id, `${playlist.name} › ${set.name}`])));
  const plays = library.index.history;
  const recent = plays.slice(-RECENT).reverse();
  return (
    <section aria-label={t`Play history`} className="space-y-3 rounded border border-seam p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold"><Trans>History</Trans></h2>
        <p className="text-sm text-silkscreen-3"><Trans>{plays.length} plays kept</Trans></p>
      </div>
      {!recent.length && <p className="text-sm"><Trans>Songs are added here once they have played to their halfway point.</Trans></p>}
      <ol className="space-y-1 text-sm">
        {recent.map((entry, i) => {
          const setName = entry.setId ? setNames.get(entry.setId) : undefined;
          return (
            <li key={`${entry.at}-${i}`}>
              {titles.get(entry.songId) ?? t`Removed song`}{" "}
              <span className="text-silkscreen-3">
                · {setName && `${setName} · `}
                {new Date(entry.at).toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label={t`History since`} className={field} value={since} onChange={(e) => setSince(e.target.value)} />
        <input aria-label={t`History playlist name`} placeholder={t`Playlist name`} className={field} value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="outline"
          disabled={!name.trim() || !since || !plays.length || library.busy}
          onClick={() => void library.playlistFromHistory(name, new Date(`${since}T00:00:00`).toISOString()).then(() => setName(""))}
        >
          <Trans>Create playlist from history</Trans>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <span><Trans>Clear all {plays.length} plays?</Trans></span>
            <Button
              disabled={library.busy}
              onClick={() => {
                setConfirm(false);
                void library.clearHistory();
              }}
            >
              <Trans>Confirm clear</Trans>
            </Button>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              <Trans>Keep history</Trans>
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={!plays.length || library.busy} onClick={() => setConfirm(true)}>
            <Trans>Clear history…</Trans>
          </Button>
        )}
      </div>
    </section>
  );
}
