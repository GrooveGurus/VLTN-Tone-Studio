import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSongLibrary } from "@/song/library";
import { changeOf, draftOf, isDirty, type PlaylistDraft } from "@/song/playlist-draft";
import type { Playlist } from "@shared/song-library";
import { SetEditor } from "./SetEditor";
import { SmartPlaylistEditor } from "./SmartPlaylistEditor";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

const field = "rounded border border-seam bg-transparent p-2";

/**
 * The edits to the open static playlist, held until they are saved or discarded. `base` is the saved draft they began from, so the panel
 * can tell whether the saved playlist has changed underneath them.
 */
interface Edits {
  playlistId: string;
  base: PlaylistDraft;
  value: PlaylistDraft;
}

/** Playlists: regular playlists as headed sets, and smart playlists defined by rules. Creating, renaming and deleting are here too. */
export function PlaylistsPanel() {
  const library = useSongLibrary();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"static" | "smart">("static");
  const [selected, setSelected] = useState("");
  const [confirm, setConfirm] = useState("");
  const [edits, setEdits] = useState<Edits | null>(null);
  const [problem, setProblem] = useState("");
  // The playlist the user chose while the open one had unsaved edits. The leave dialog asks before it opens.
  const [pending, setPending] = useState("");
  const playlist = library.index.playlists.find((p) => p.id === selected);
  const songs = library.index.songs;
  const saved = playlist && !playlist.smart ? draftOf(playlist) : null;
  const dirty = !!saved && !!edits && edits.playlistId === playlist?.id && isDirty(edits.value, edits.base);
  const draft = dirty && edits ? edits.value : saved;
  // The saved playlist changed while the edits were open. The user's version is kept until they save or discard it.
  const changedElsewhere = dirty && !!saved && !!edits && isDirty(saved, edits.base);
  const open = (id: string) => {
    setEdits(null);
    setProblem("");
    setSelected(id);
    setConfirm("");
  };
  // A playlist made elsewhere, such as from the Library browser, opens here once it is saved.
  useEffect(() => {
    if (!library.focusPlaylistId) return;
    open(library.focusPlaylistId);
    library.focusPlaylist(null);
    // open and focusPlaylist only set state, so only a new request matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.focusPlaylistId]);
  const create = () => {
    if (!name.trim() || library.busy) return;
    const id = crypto.randomUUID();
    const next: Playlist =
      kind === "smart"
        ? { id, name: name.trim(), songs: [], smart: { match: "all", rules: [], sort: "title" } }
        : { id, name: name.trim(), songs: [], sets: [] };
    void library.addPlaylist(next);
    setName("");
  };
  const choose = (id: string) => {
    if (dirty) return setPending(id);
    open(id);
  };
  const edit = (next: PlaylistDraft) => {
    if (!playlist || !saved) return;
    setProblem("");
    setEdits({ playlistId: playlist.id, base: dirty && edits ? edits.base : saved, value: next });
  };
  const save = async (): Promise<boolean> => {
    if (!playlist || !draft || !dirty) return true;
    if (!draft.name.trim() || draft.sets.some((set) => !set.name.trim())) {
      setProblem(draft.name.trim() ? t`Name every set, or remove its heading.` : t`Name the playlist first.`);
      return false;
    }
    const value = draft;
    const ok = await library.updatePlaylist(playlist.id, changeOf(value));
    // Edits made while the save was in flight are not in `value`, so they stay open.
    if (ok) setEdits((current) => (current?.value === value ? null : current));
    return ok;
  };
  const leave = async (action: "save" | "discard") => {
    const target = pending;
    setPending("");
    if (action === "save" && !(await save())) return;
    open(target);
  };
  return (
    <section
      aria-label={t`Playlists`}
      className="space-y-3 rounded border border-seam p-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && dirty) {
          e.preventDefault();
          if (!library.busy) void save();
        }
      }}
    >
      <h2 className="font-semibold"><Trans>Playlists / live sets</Trans></h2>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={t`New playlist name`}
          placeholder={t`New playlist name`}
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <select aria-label={t`New playlist kind`} className={field} value={kind} onChange={(e) => setKind(e.target.value as "static" | "smart")}>
          <option value="static"><Trans>Playlist</Trans></option>
          <option value="smart"><Trans>Smart playlist (by rules)</Trans></option>
        </select>
        <Button disabled={!name.trim() || library.busy} onClick={create}>
          <Trans>Create playlist</Trans>
        </Button>
      </div>
      <select aria-label={t`Playlist`} className={field + " w-full"} value={selected} onChange={(e) => choose(e.target.value)}>
        <option value=""><Trans>Select a playlist…</Trans></option>
        {library.index.playlists.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name} ({p.smart ? t`smart` : p.songs.length})
          </option>
        ))}
      </select>
      {playlist && (
        <>
          <div className="flex flex-wrap gap-2">
            {playlist.smart ? (
              <input
                aria-label={t`Playlist name`}
                key={playlist.id + playlist.name}
                defaultValue={playlist.name}
                className={field}
                disabled={library.busy}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== playlist.name) void library.updatePlaylist(playlist.id, { name: next });
                }}
              />
            ) : (
              draft && (
                <input
                  aria-label={t`Playlist name`}
                  value={draft.name}
                  className={field}
                  disabled={library.busy}
                  onChange={(e) => edit({ ...draft, name: e.target.value })}
                />
              )
            )}
            <Button variant="outline" disabled={library.busy} onClick={() => setConfirm("playlist:" + playlist.id)}>
              <Trans>Delete playlist…</Trans>
            </Button>
          </div>
          {confirm === "playlist:" + playlist.id && (
            <div>
              <Trans>Keep the songs and delete this playlist?{" "}</Trans>
              <Button
                disabled={library.busy}
                onClick={() => {
                  void library.deletePlaylist(playlist.id);
                  setSelected("");
                  setEdits(null);
                  setConfirm("");
                }}
              >
                <Trans>Confirm delete playlist</Trans>
              </Button>
              <Button variant="outline" onClick={() => setConfirm("")}>
                <Trans>Keep playlist</Trans>
              </Button>
            </div>
          )}
          {playlist.smart ? (
            <SmartPlaylistEditor key={playlist.id} playlist={playlist} />
          ) : (
            draft && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={!dirty || library.busy} onClick={() => void save()}>
                    <Trans>Save playlist</Trans>
                  </Button>
                  <Button variant="outline" disabled={!dirty} onClick={() => setEdits(null)}>
                    <Trans>Discard changes</Trans>
                  </Button>
                  <span className="text-sm">{dirty ? t`Unsaved changes` : t`Saved`}</span>
                </div>
                {changedElsewhere && <p className="text-sm"><Trans>This playlist was changed elsewhere. Save to keep your version, or Discard to load the new one.</Trans></p>}
                {problem && (
                  <p role="alert" className="text-sm text-red-400">
                    {problem}
                  </p>
                )}
                <SetEditor key={playlist.id} playlist={playlist} songs={songs} draft={draft} dirty={dirty} onChange={edit} />
              </>
            )
          )}
        </>
      )}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>Save changes to</Trans> {playlist?.name ?? t`this playlist`}?</AlertDialogTitle>
            <AlertDialogDescription><Trans>Your edits have not been saved yet.</Trans></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
            <Button variant="outline" onClick={() => void leave("discard")}>
              <Trans>Don&apos;t save</Trans>
            </Button>
            <AlertDialogAction onClick={() => void leave("save")}><Trans>Save</Trans></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
