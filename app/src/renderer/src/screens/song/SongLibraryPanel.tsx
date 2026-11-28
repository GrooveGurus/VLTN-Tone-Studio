import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSong } from "@/song/store";
import { useSongLibrary } from "@/song/library";
import { isRunning, jobLine, useAnalysisJob, useJobClock } from "@/song/analysis/analysis-job";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { host } from "@/host";
import { LibraryBrowser } from "./LibraryBrowser";
import { QueuePanel } from "./QueuePanel";
import { PlayHistory } from "./PlayHistory";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";
export function SongLibraryPanel({ onPick }: { onPick(): void }) {
  const library = useSongLibrary(),
    source = useSong((s) => s.source),
    status = useSong((s) => s.status);
  const saved = library.index.songs.find((s) => s.id === source?.libraryId);
  const [title, setTitle] = useState(saved?.title ?? source?.name.replace(/\.[^.]+$/, "") ?? "");
  const [artist, setArtist] = useState(saved?.artist ?? "");
  // A batch analysis (spec 77) keeps going on any screen; this line shows it here too, with a way back to its dialog.
  const job = useAnalysisJob();
  const jobNow = useJobClock(isRunning(job.phase));
  useEffect(() => {
    if (host.song.library) void library.refresh();
  }, []);
  useEffect(() => {
    setTitle(saved?.title ?? source?.name.replace(/\.[^.]+$/, "") ?? "");
    setArtist(saved?.artist ?? "");
  }, [source, saved?.title, saved?.artist]);
  if (!host.song.library) return <p><Trans>Use the desktop app to save songs and audio for offline performances.</Trans></p>;
  return (
    <section aria-label={t`Saved songs and playlists`} className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-2">
      <div className="rounded border border-seam p-4">
        <h2 className="font-semibold"><Trans>Save the current song</Trans></h2>
        <p className="text-sm text-silkscreen-3">
          <Trans>Stores a local copy of the audio and stems, lyrics, chord chart, MIDI cues and performance settings. Save again after making changes. Load song starts
          paused; Play playlist runs the whole set in order.</Trans>
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input aria-label={t`Song title`} placeholder={t`Song title`} className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input aria-label={t`Song artist`} placeholder={t`Artist`} className={field} value={artist} onChange={(e) => setArtist(e.target.value)} />
          <Button
            disabled={!source || !title.trim() || library.busy || ["splitting", "model", "decoding"].includes(status.kind)}
            onClick={() => void library.save(title, artist)}
          >
            {saved ? t`Save song changes` : t`Save song to library`}
          </Button>
          <Button variant="outline" disabled={library.busy} onClick={onPick}>
            <Trans>Import audio…</Trans>
          </Button>
        </div>
      </div>
      <section aria-label={t`Portable library backup`} className="space-y-3 rounded border border-seam p-4">
        <h2 className="font-semibold"><Trans>Portable library backup</Trans></h2>
        <p className="text-sm text-silkscreen-3">
          <Trans>Export all saved songs, source audio, stems, charts, lyrics, key/mix settings and playlists into one compressed archive. Save the current song first
          to include new audio or stems. Current edits to an already-saved song are included automatically.</Trans>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={library.busy || !library.index.songs.length || ["splitting", "model", "decoding"].includes(status.kind)}
            onClick={() => void library.exportBackup()}
          >
            <Trans>Export library backup…</Trans>
          </Button>
          <Button
            variant="outline"
            disabled={library.busy || ["splitting", "model", "decoding"].includes(status.kind)}
            onClick={() => void library.restoreBackup()}
          >
            <Trans>Restore backup…</Trans>
          </Button>
        </div>
        <p className="text-xs text-silkscreen-3">
          <Trans>Restore adds songs and playlists and keeps your existing library. If some songs are already saved, you can skip them or import copies. MIDI ports, cue
          arming and account settings are not included.</Trans>
        </p>
      </section>
      <Dialog open={!!library.backupPreview} onOpenChange={(open) => !open && void library.finishRestore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Trans>Some songs are already in your library</Trans></DialogTitle>
            <DialogDescription>
              <Trans>{library.backupPreview?.fileName} holds {library.backupPreview?.songs} songs and {library.backupPreview?.playlists} playlists.{" "}
              {library.backupPreview?.duplicates} of the songs match audio you have already saved.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void library.finishRestore("copy")}>
              <Trans>Import as copies</Trans>
            </Button>
            <Button onClick={() => void library.finishRestore("skip")}><Trans>Skip songs already in the library ({library.backupPreview?.duplicates})</Trans></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {library.busy && <p role="status">{library.saveStep ? t`Saving… ${library.saveStep}` : library.transfer || t`Working with saved songs…`}</p>}
      {isRunning(job.phase) && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status">{jobLine(job, jobNow)}</p>
          <Button variant="outline" size="sm" onClick={() => job.requestOpen()}>
            <Trans>Show</Trans>
          </Button>
        </div>
      )}
      {library.busy && library.playlistPlaying && (
        <Button variant="outline" onClick={() => library.pausePlaylist()}>
          <Trans>Stop playlist</Trans>
        </Button>
      )}
      {library.notice && <p role="status">{library.notice}</p>}
      {library.error && (
        <p role="alert" className="text-red-400">
          {library.error}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <LibraryBrowser />
        <div className="space-y-5">
          <QueuePanel />
          <PlaylistsPanel />
          <PlayHistory />
        </div>
      </div>
    </section>
  );
}
