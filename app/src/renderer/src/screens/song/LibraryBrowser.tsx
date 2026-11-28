import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSongLibrary } from "@/song/library";
import { isRunning, useAnalysisJob } from "@/song/analysis/analysis-job";
import { NO_BROWSE, browseSongs, folderRows, type BrowseState } from "@/song/library-browse";
import { formatTime } from "@/song/stems/mix";
import { runningSeconds } from "@/song/performance/running-time";
import { SORT_KEYS, SORT_LABELS, type SmartRules, type SortKey } from "@shared/library-filter";
import { overridesFor } from "@shared/entry-overrides";
import type { LibraryFolder, LibrarySong } from "@shared/song-library";
import { FilterBuilder } from "./FilterBuilder";
import { SongDetails, parseKeywords } from "./SongDetails";
import { AnalyseSongsDialog } from "./AnalyseSongsDialog";
import type { BatchSong } from "@/song/analysis/batch";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";
const EMPTY_FILTER: SmartRules = { match: "all", rules: [], sort: "title" };

/**
 * The saved songs: search, folders, a filter, a sort and an A to Z index for a long list. Each song can be loaded, queued next or added to
 * the queue. Songs can be selected for a batch edit: add to a playlist, set the colour, the keywords or the folder, or delete.
 */
export function LibraryBrowser() {
  const library = useSongLibrary();
  const [view, setView] = useState<BrowseState>(NO_BROWSE);
  const [filtering, setFiltering] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState("");
  const [folderName, setFolderName] = useState("");
  const [batch, setBatch] = useState({ playlist: "", colour: "#3b82f6", keywords: "", folder: "" });
  const [message, setMessage] = useState("");
  // The name for a playlist made from the selected songs. Null while the name is not being asked for.
  const [newPlaylist, setNewPlaylist] = useState<string | null>(null);
  // Which songs the analysis dialog works on: the selection, or the whole library. Null while the dialog is closed.
  const [analysing, setAnalysing] = useState<"selected" | "all" | null>(null);
  // The status bar asks for the dialog on a running analysis. The dialog then shows that run, whichever songs it started on.
  const openRequested = useAnalysisJob((s) => s.openRequested);
  const analysisRunning = isRunning(useAnalysisJob((s) => s.phase));
  useEffect(() => {
    if (!openRequested) return;
    useAnalysisJob.getState().consumeOpenRequest();
    setAnalysing("all");
  }, [openRequested]);
  const songs = library.index.songs;
  const folders = library.index.folders;
  const result = useMemo(() => browseSongs(songs, folders, view), [songs, folders, view]);
  const tree = folderRows(folders);
  const chosen = view.folderId ? folders.find((f) => f.id === view.folderId) : undefined;
  const picked = [...selected].filter((id) => songs.some((s) => s.id === id));
  const single = picked.length === 1 ? songs.find((s) => s.id === picked[0]) : undefined;
  const playlists = library.index.playlists.filter((p) => !p.smart);
  const selectedSeconds = (id: string) => {
    const song = songs.find((s) => s.id === id);
    return song ? runningSeconds(song) : 0;
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const jump = (index: number) => document.getElementById(`library-row-${index}`)?.scrollIntoView?.({ block: "start" });
  const addFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    void library.saveFolders([...folders, { id: crypto.randomUUID(), name, ...(chosen ? { parentId: chosen.id } : {}) }]).then(() => setFolderName(""));
  };
  const deleteFolder = (folder: LibraryFolder) => {
    setMessage("");
    void library.saveFolders(folders.filter((f) => f.id !== folder.id));
    setView({ ...view, folderId: null });
  };
  const runBatch = async (change: () => Promise<void>) => {
    setMessage("");
    await change();
  };
  /** Makes a playlist of the selected songs. The Playlists panel opens it once it is saved. */
  const createFromSelected = async () => {
    const name = newPlaylist?.trim();
    if (!name) return;
    setMessage("");
    const saved = await library.addPlaylist({ id: crypto.randomUUID(), name, songs: picked, sets: [], overrides: picked.map(() => null) });
    if (saved) setNewPlaylist(null);
  };
  const deleteSelected = async () => {
    setConfirm("");
    for (const id of picked) await library.remove(id);
    setSelected(new Set());
  };
  return (
    <section aria-label={t`Saved songs`} className="space-y-3">
      <h2 className="font-semibold"><Trans>Songs · {songs.length}</Trans></h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={t`Search saved songs`}
          placeholder={t`Search title, artist, notes or keywords`}
          className={field + " min-w-0 flex-1"}
          value={view.query}
          onChange={(e) => setView({ ...view, query: e.target.value })}
        />
        <select aria-label={t`Sort songs`} className={field} value={view.sort} onChange={(e) => setView({ ...view, sort: e.target.value as SortKey })}>
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <Button variant="outline" aria-pressed={view.reverse} onClick={() => setView({ ...view, reverse: !view.reverse })}>
          <Trans>Reverse order</Trans>
        </Button>
        <Button variant="outline" aria-pressed={filtering} onClick={() => setFiltering(!filtering)}>
          {filtering ? t`Hide filter` : t`Filter the list`}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-label={t`Folders`}>
        <Button variant={view.folderId ? "outline" : "default"} onClick={() => setView({ ...view, folderId: null })}>
          <Trans>All songs</Trans>
        </Button>
        {tree.map(({ folder, depth }) => (
          <Button
            key={folder.id}
            variant={view.folderId === folder.id ? "default" : "outline"}
            style={{ marginLeft: depth * 12 }}
            onClick={() => setView({ ...view, folderId: folder.id })}
          >
            {folder.name}
          </Button>
        ))}
        <input
          aria-label={t`New folder name`}
          placeholder={chosen ? t`New folder in ${chosen.name}` : t`New folder`}
          className={field}
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
        />
        <Button variant="outline" disabled={!folderName.trim() || library.busy} onClick={addFolder}>
          <Trans>Add folder</Trans>
        </Button>
        {chosen && (
          <Button variant="outline" disabled={library.busy} onClick={() => deleteFolder(chosen)}>
            <Trans>Delete folder</Trans>
          </Button>
        )}
      </div>
      {filtering && (
        <div className="rounded border border-seam p-3">
          <FilterBuilder value={view.filter ?? EMPTY_FILTER} folders={folders} showSort={false} onChange={(filter) => setView({ ...view, filter })} />
          <Button variant="outline" className="mt-2" onClick={() => setView({ ...view, filter: null })}>
            <Trans>Clear filter</Trans>
          </Button>
        </div>
      )}
      {result.problems.map((problem) => (
        <p key={problem} role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      ))}
      <p className="text-sm text-silkscreen-3">
        <Trans>{result.songs.length} shown</Trans>{view.folderId ? t` in ${chosen?.name ?? t`this folder`}` : ""}
      </p>
      <Button variant="outline" disabled={library.busy || !songs.length} onClick={() => setAnalysing("all")}>
        {analysisRunning ? t`Analysis running…` : t`Analyse all songs…`}
      </Button>
      {result.letters.length > 0 && (
        <nav aria-label={t`Jump to letter`} className="flex flex-wrap gap-1 text-sm">
          {result.letters.map(({ letter, index }) => (
            <button key={letter} type="button" className="rounded px-1 hover:underline" onClick={() => jump(index)}>
              {letter}
            </button>
          ))}
        </nav>
      )}
      {!songs.length && <p><Trans>No saved songs. Open audio, prepare it, then save it.</Trans></p>}
      <ul className="max-h-[60vh] space-y-2 overflow-auto pr-1">
        {result.songs.map((song, index) => (
          <SongRow
            key={song.id}
            song={song}
            index={index}
            checked={selected.has(song.id)}
            onToggle={() => toggle(song.id)}
            disabled={library.busy}
            confirming={confirm === song.id}
            onConfirm={(on) => setConfirm(on ? song.id : "")}
            onDelete={() => {
              setConfirm("");
              void library.remove(song.id);
            }}
            onLoad={() => void library.load(song.id)}
            onNext={() => setMessage(library.playNextSong(song.id) ?? t`${song.title} plays next.`)}
            onQueue={() => setMessage(library.addToQueue([song.id]) ?? t`${song.title} added to the queue.`)}
          />
        ))}
      </ul>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {single && <SongDetails key={single.id} song={single} />}
      {picked.length > 0 && (
        <section aria-label={t`Batch edit`} className="space-y-2 rounded border border-seam p-3">
          <p className="text-sm">
            <Trans>{picked.length} selected · {formatTime(picked.reduce((sum, id) => sum + selectedSeconds(id), 0))}</Trans>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t`Add selected to playlist`}
              className={field}
              value={batch.playlist}
              onChange={(e) => setBatch({ ...batch, playlist: e.target.value })}
            >
              <option value=""><Trans>Choose a playlist…</Trans></option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={!batch.playlist || library.busy}
              onClick={() =>
                void runBatch(async () => {
                  const target = playlists.find((p) => p.id === batch.playlist);
                  if (target) {
                    await library.updatePlaylist(target.id, {
                      songs: [...target.songs, ...picked],
                      overrides: [...overridesFor(target.songs.length, target.overrides), ...picked.map(() => null)],
                    });
                  }
                  setMessage(t`Added ${picked.length} songs to ${target?.name ?? t`the playlist`}.`);
                })
              }
            >
              <Trans>Add to playlist</Trans>
            </Button>
            {newPlaylist === null ? (
              <Button variant="outline" disabled={library.busy} onClick={() => setNewPlaylist("")}>
                <Trans>New playlist from selected…</Trans>
              </Button>
            ) : (
              <>
                <input
                  aria-label={t`Name for the new playlist`}
                  placeholder={t`New playlist name`}
                  className={field}
                  value={newPlaylist}
                  onChange={(e) => setNewPlaylist(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPlaylist.trim()) void createFromSelected();
                  }}
                />
                <Button disabled={!newPlaylist.trim() || library.busy} onClick={() => void createFromSelected()}>
                  <Trans>Create playlist</Trans>
                </Button>
                <Button variant="outline" onClick={() => setNewPlaylist(null)}>
                  <Trans>Cancel</Trans>
                </Button>
              </>
            )}
            <input aria-label={t`Colour for selected`} type="color" value={batch.colour} onChange={(e) => setBatch({ ...batch, colour: e.target.value })} />
            <Button variant="outline" disabled={library.busy} onClick={() => void library.organiseSongs(picked, { color: batch.colour })}>
              <Trans>Set colour</Trans>
            </Button>
            <input
              aria-label={t`Keywords for selected`}
              placeholder={t`Replace keywords, comma separated`}
              className={field}
              value={batch.keywords}
              onChange={(e) => setBatch({ ...batch, keywords: e.target.value })}
            />
            <Button variant="outline" disabled={library.busy} onClick={() => void library.organiseSongs(picked, { keywords: parseKeywords(batch.keywords) })}>
              <Trans>Set keywords</Trans>
            </Button>
            <select
              aria-label={t`Move selected to folder`}
              className={field}
              value={batch.folder}
              onChange={(e) => setBatch({ ...batch, folder: e.target.value })}
            >
              <option value=""><Trans>Choose a folder…</Trans></option>
              <option value="none"><Trans>Library root</Trans></option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={!batch.folder || library.busy}
              onClick={() => void library.organiseSongs(picked, { folderId: batch.folder === "none" ? null : batch.folder })}
            >
              <Trans>Move to folder</Trans>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={library.busy} onClick={() => setAnalysing("selected")}>
              {analysisRunning ? t`Analysis running…` : t`Analyse selected…`}
            </Button>
            <Button variant="outline" onClick={() => setSelected(new Set())}>
              <Trans>Clear selection</Trans>
            </Button>
            {confirm === "batch" ? (
              <>
                <span><Trans>Delete {picked.length} songs and remove them from all playlists?</Trans></span>
                <Button disabled={library.busy} onClick={() => void deleteSelected()}>
                  <Trans>Confirm delete</Trans>
                </Button>
                <Button variant="outline" onClick={() => setConfirm("")}>
                  <Trans>Keep songs</Trans>
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled={library.busy} onClick={() => setConfirm("batch")}>
                <Trans>Delete selected…</Trans>
              </Button>
            )}
          </div>
        </section>
      )}
      <AnalyseSongsDialog
        open={analysing !== null}
        onOpenChange={(open) => !open && setAnalysing(null)}
        songs={batchSongs(analysing === "all" ? songs : songs.filter((song) => selected.has(song.id)))}
      />
    </section>
  );
}

function batchSongs(list: readonly LibrarySong[]): BatchSong[] {
  return list.map((song) => ({ id: song.id, title: song.title, settings: song.settings }));
}

function SongRow(props: {
  song: LibrarySong;
  index: number;
  checked: boolean;
  onToggle(): void;
  disabled: boolean;
  confirming: boolean;
  onConfirm(on: boolean): void;
  onDelete(): void;
  onLoad(): void;
  onNext(): void;
  onQueue(): void;
}) {
  const { song, index, checked, disabled, confirming } = props;
  return (
    <li id={`library-row-${index}`} className="rounded border border-seam p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="checkbox" aria-label={t`Select ${song.title}`} checked={checked} onChange={props.onToggle} />
        {song.color && <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: song.color }} />}
        <strong className="flex-1">{song.title}</strong>
        <span className="text-sm text-silkscreen-3">
          {[song.artist, song.key, song.bpm ? `${Math.round(song.bpm)} BPM` : "", song.year ? String(song.year) : ""].filter(Boolean).join(" · ")}
        </span>
      </div>
      <p className="text-sm">
        {formatTime(song.duration)} · {song.playCount ?? 0} <Trans>plays</Trans>{song.keywords?.length ? ` · ${song.keywords.join(", ")}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={props.onLoad}>
          <Trans>Load song</Trans>
        </Button>
        <Button variant="outline" disabled={disabled} onClick={props.onNext}>
          <Trans>Play next</Trans>
        </Button>
        <Button variant="outline" disabled={disabled} onClick={props.onQueue}>
          <Trans>Add to queue</Trans>
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => props.onConfirm(true)}>
          <Trans>Delete song…</Trans>
        </Button>
        {confirming && (
          <>
            <span><Trans>Delete saved audio and remove from all playlists?</Trans></span>
            <Button disabled={disabled} onClick={props.onDelete}>
              <Trans>Confirm delete</Trans>
            </Button>
            <Button variant="outline" onClick={() => props.onConfirm(false)}>
              <Trans>Keep song</Trans>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
